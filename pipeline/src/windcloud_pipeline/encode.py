"""Rejillas GFS → PNG + meta.json para el navegador (T-32, RF-2/3/4, diseño §4.1).

- **Viento** (10 m, 850 y 500 hPa): PNG RGBA con R = u y G = v escalados a 0–255 con el mínimo
  y máximo de cada imagen en `meta.json` (técnica de webgl-wind). A = 0 donde no hay dato.
- **Escalares** (ráfagas, nubosidad, lluvia): PNG gris + alfa con un rango FIJO por variable
  (igual en todos los pasos, para colorear siempre igual con `raster-color` de MapLibre). La
  lluvia va en escala raíz cuadrada para distinguir lloviznas.
- **Proyección:** las filas se remuestrean a espaciado uniforme en Web Mercator. Pegar una imagen
  lat/lon por sus esquinas la desplazaría hasta ~42 km en latitud (región −20…25°), más que una
  celda de 28 km.
- **Ráfagas:** se guarda máx(GUST, viento a 10 m). GFS a veces da GUST menor que el viento medio,
  lo que no tiene sentido físico (Bogotá f072: 4,4 vs 4,9 km/h).

Uso:  uv run python -m windcloud_pipeline.encode --entrada out/gfs/AAAAMMDDHH
          [--salida out/web/data]
Decodificar (navegador): valor = mín + (píxel / 255) · (máx − mín). Con transform "sqrt" los
mín/máx están en raíz cuadrada y el resultado se eleva al cuadrado.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import contourpy
import numpy as np
import shapely
from PIL import Image

from . import grids

SCHEMA = 1
MODEL_LABEL = {"gfs": "GFS 0,25° (NOAA)"}

#: Niveles de viento: clave de salida → (campo u, campo v, etiqueta)
WIND_LEVELS: dict[str, tuple[str, str, str]] = {
    "10m": ("u10", "v10", "10 m"),
    "850": ("u850", "v850", "850 hPa (~1,5 km)"),
    "500": ("u500", "v500", "500 hPa (~5,5 km)"),
}


@dataclass(frozen=True)
class ScalarSpec:
    label: str
    units: str
    vmin: float
    vmax: float
    transform: str  # "linear" | "sqrt"
    note: str = ""


SCALARS: dict[str, ScalarSpec] = {
    "gust": ScalarSpec("Ráfagas", "km/h", 0, 150, "linear", "máx(GUST, viento a 10 m)"),
    "tcc": ScalarSpec("Nubosidad total", "%", 0, 100, "linear"),
    "prate": ScalarSpec("Lluvia (tasa instantánea)", "mm/h", 0, 50, "sqrt"),
    "t2m": ScalarSpec("Temperatura a 2 m", "°C", -10, 40, "linear"),
}

#: En el trópico los gradientes de presión son suaves: cada 4 hPa casi no habría líneas.
ISOBAR_STEP_HPA = 2
ISOBAR_SMOOTH_PASSES = 3  # filtro binomial 5×5; ~1,5 celdas de radio efectivo
ISOBAR_SIMPLIFY_DEG = 0.05  # un quinto de celda (0,25°): invisible a escala regional


# ------------------------------------------------------------------------------------ proyección
def merc_y(lat_deg: np.ndarray | float) -> np.ndarray:
    lat = np.radians(np.clip(lat_deg, -85.05112878, 85.05112878))
    return np.log(np.tan(np.pi / 4 + lat / 2))


def merc_lat(y: np.ndarray) -> np.ndarray:
    return np.degrees(2 * np.arctan(np.exp(y)) - np.pi / 2)


def mercator_lats(north: float, south: float, width: int, west: float, east: float) -> np.ndarray:
    """Latitudes (norte → sur) de filas equiespaciadas en Mercator, con píxeles ~cuadrados."""
    span_x = math.radians(east - west)
    span_y = float(merc_y(north) - merc_y(south))
    height = max(2, round((width - 1) * span_y / span_x) + 1)
    return merc_lat(np.linspace(merc_y(north), merc_y(south), height))


def resample_rows(field: np.ndarray, src_lats: np.ndarray, dst_lats: np.ndarray) -> np.ndarray:
    """Interpolación lineal por filas (norte → sur) a otras latitudes; NaN se propaga."""
    asc = src_lats[::-1]  # np.interp/searchsorted necesitan orden creciente
    idx = np.clip(np.searchsorted(asc, dst_lats), 1, len(asc) - 1)
    lo, hi = asc[idx - 1], asc[idx]
    w = ((dst_lats - lo) / (hi - lo))[:, None]
    rows = field[::-1]
    return (rows[idx - 1] * (1 - w) + rows[idx] * w).astype(np.float32)


# ------------------------------------------------------------------------------------ codificación
def to_byte(x: np.ndarray, vmin: float, vmax: float) -> np.ndarray:
    span = vmax - vmin or 1.0
    return np.clip(np.rint((x - vmin) / span * 255), 0, 255).astype(np.uint8)


def encode_wind(u: np.ndarray, v: np.ndarray) -> tuple[np.ndarray, dict[str, float]]:
    """RGBA: R = u, G = v (m/s) con su mín/máx; A = 0 donde falta dato."""
    valid = ~(np.isnan(u) | np.isnan(v))
    if not valid.any():
        raise ValueError("Campo de viento sin datos")
    rng = {
        "uMin": float(np.nanmin(u)),
        "uMax": float(np.nanmax(u)),
        "vMin": float(np.nanmin(v)),
        "vMax": float(np.nanmax(v)),
    }
    rgba = np.zeros((*u.shape, 4), dtype=np.uint8)
    rgba[..., 0] = to_byte(np.nan_to_num(u, nan=rng["uMin"]), rng["uMin"], rng["uMax"])
    rgba[..., 1] = to_byte(np.nan_to_num(v, nan=rng["vMin"]), rng["vMin"], rng["vMax"])
    rgba[..., 3] = np.where(valid, 255, 0)
    return rgba, {k: round(val, 3) for k, val in rng.items()}


def scale_bounds(spec: ScalarSpec) -> tuple[float, float]:
    if spec.transform == "sqrt":
        return math.sqrt(spec.vmin), math.sqrt(spec.vmax)
    return spec.vmin, spec.vmax


def encode_scalar(x: np.ndarray, spec: ScalarSpec) -> np.ndarray:
    """Gris + alfa con rango fijo; valores fuera de rango se recortan; A = 0 donde falta dato."""
    valid = ~np.isnan(x)
    y = np.nan_to_num(x, nan=spec.vmin)
    if spec.transform == "sqrt":
        y = np.sqrt(np.clip(y, 0, None))
    lo, hi = scale_bounds(spec)
    la = np.zeros((*x.shape, 2), dtype=np.uint8)
    la[..., 0] = to_byte(y, lo, hi)
    la[..., 1] = np.where(valid, 255, 0)
    return la


def decode_scalar(pixel: np.ndarray, spec: ScalarSpec) -> np.ndarray:
    """Inverso de encode_scalar (el navegador hace lo mismo)."""
    lo, hi = scale_bounds(spec)
    y = lo + pixel.astype(np.float64) / 255 * (hi - lo)
    return y**2 if spec.transform == "sqrt" else y


def scalar_fields(step: grids.GridStep) -> dict[str, np.ndarray]:
    """Escalares en unidades de presentación (km/h, %, mm/h)."""
    f = step.fields
    speed10 = grids.wind_speed(f["u10"], f["v10"])
    out: dict[str, np.ndarray] = {"gust": np.fmax(f["gust"], speed10) * grids.MS_TO_KMH}
    out["tcc"] = f["tcc"]
    if "prate" in f:
        out["prate"] = f["prate"] * grids.KGM2S_TO_MMH
    if "t2m" in f:
        out["t2m"] = f["t2m"] - 273.15
    return out


def smooth(field: np.ndarray, passes: int) -> np.ndarray:
    """Suavizado binomial separable [1, 4, 6, 4, 1]/16, `passes` veces (bordes reflejados)."""
    k = np.array([1, 4, 6, 4, 1], dtype=np.float64) / 16
    out = field.astype(np.float64)
    for _ in range(passes):
        for axis in (0, 1):
            pad = [(2, 2) if a == axis else (0, 0) for a in range(2)]
            p = np.pad(out, pad, mode="reflect")
            n = out.shape[axis]
            out = sum(k[i] * np.take(p, range(i, i + n), axis=axis) for i in range(5))
    return out


def isobars(step: grids.GridStep, every_hpa: int = ISOBAR_STEP_HPA) -> dict:
    """Isobaras (GeoJSON de líneas lon/lat) cada `every_hpa` hPa, sobre la rejilla en grados.

    La presión está reducida al nivel del mar: sobre los Andes es una extrapolación que amplifica el
    ruido (líneas apretadas siguiendo la cordillera). Como en los mapas sinópticos, se suaviza antes
    de trazar; se aclara en Metodología.
    """
    hpa = smooth(step.fields["prmsl"] / 100.0, ISOBAR_SMOOTH_PASSES)
    gen = contourpy.contour_generator(x=step.lons, y=step.lats, z=hpa, line_type="Separate")
    lo = int(np.floor(np.nanmin(hpa) / every_hpa) * every_hpa)
    hi = int(np.ceil(np.nanmax(hpa) / every_hpa) * every_hpa)
    features = []
    for level in range(lo, hi + 1, every_hpa):
        for line in gen.lines(level):
            if len(line) < 2:
                continue
            # Simplificar y redondear a 0,01°: a escala regional se ve igual y pesa mucho menos.
            simple = shapely.LineString(line).simplify(ISOBAR_SIMPLIFY_DEG)
            coords = [[round(float(x), 2), round(float(y), 2)] for x, y in simple.coords]
            if len(coords) < 2:
                continue
            features.append(
                {
                    "type": "Feature",
                    "properties": {"hpa": level},
                    "geometry": {"type": "LineString", "coordinates": coords},
                }
            )
    return {"type": "FeatureCollection", "features": features}


def save_png(array: np.ndarray, path: Path) -> int:
    mode = {4: "RGBA", 2: "LA"}[array.shape[-1]]
    Image.fromarray(array, mode).save(path, optimize=True)
    return path.stat().st_size


# ------------------------------------------------------------------------------------------- run
def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def encode_run(run_dir: Path, out_root: Path, model: str = "gfs") -> Path:
    """Codifica los fHHH.grib2 de `run_dir` en `out_root/<model>/<run>/` (escritura atómica)."""
    paths = sorted(run_dir.glob("f*.grib2"), key=lambda p: int(p.stem[1:]))
    if not paths:
        raise FileNotFoundError(f"Sin GRIB2 en {run_dir}")
    steps = [grids.read_step(p) for p in paths]
    first = steps[0]
    west, east = float(first.lons[0]), float(first.lons[-1])
    north, south = float(first.lats[0]), float(first.lats[-1])
    dst_lats = mercator_lats(north, south, len(first.lons), west, east)

    final = out_root / model / grids.run_id(first.run)
    tmp = final.with_name(final.name + ".tmp")
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True)

    frames: dict[str, list[dict[str, float | int]]] = {lvl: [] for lvl in WIND_LEVELS}
    scalar_steps: dict[str, list[int]] = {name: [] for name in SCALARS}
    isobar_steps: list[int] = []
    total = 0
    for st in steps:
        f = {k: resample_rows(v, st.lats, dst_lats) for k, v in st.fields.items()}
        for lvl, (uk, vk, _) in WIND_LEVELS.items():
            rgba, rng = encode_wind(f[uk], f[vk])
            total += save_png(rgba, tmp / f"wind_{lvl}_{st.step:03d}.png")
            frames[lvl].append({"step": st.step, **rng})
        resampled = grids.GridStep(st.run, st.step, dst_lats, st.lons, f)
        for name, values in scalar_fields(resampled).items():
            total += save_png(
                encode_scalar(values, SCALARS[name]), tmp / f"{name}_{st.step:03d}.png"
            )
            scalar_steps[name].append(st.step)
        if "prmsl" in st.fields:  # en grados, sin remuestrear: GeoJSON ya es lon/lat
            iso_path = tmp / f"isobars_{st.step:03d}.geojson"
            iso_path.write_text(json.dumps(isobars(st), separators=(",", ":")), encoding="utf-8")
            total += iso_path.stat().st_size
            isobar_steps.append(st.step)

    meta = {
        "schema": SCHEMA,
        "model": model,
        "modelLabel": MODEL_LABEL.get(model, model),
        "source": grids.SOURCE,
        "run": iso(first.run),
        "generatedAt": iso(datetime.now(UTC)),
        "bounds": {"west": west, "east": east, "north": north, "south": south},
        "projection": "mercator-rows",
        "width": len(first.lons),
        "height": len(dst_lats),
        "steps": [st.step for st in steps],
        "validTimes": [iso(st.valid) for st in steps],
        "wind": {
            "units": "m/s",
            "file": "wind_{level}_{step}.png",
            "levels": {
                lvl: {"label": lab, "frames": frames[lvl]}
                for lvl, (_, _, lab) in WIND_LEVELS.items()
            },
        },
        "scalars": {
            name: {
                "label": s.label,
                "units": s.units,
                "min": s.vmin,
                "max": s.vmax,
                "transform": s.transform,
                "note": s.note,
                "file": f"{name}_{{step}}.png",
                "steps": scalar_steps[name],
            }
            for name, s in SCALARS.items()
        },
        "isobars": {
            "units": "hPa",
            "every": ISOBAR_STEP_HPA,
            "file": "isobars_{step}.geojson",
            "steps": isobar_steps,
            "note": "Presión reducida al nivel del mar (extrapolada sobre montañas)",
        },
        "bytes": total,
    }
    (tmp / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    if final.exists():
        shutil.rmtree(final)
    tmp.replace(final)
    write_latest(out_root / model, first.run)
    return final


def write_latest(model_dir: Path, run: datetime) -> Path:
    """`latest.json` apunta al run más reciente (el navegador lo lee primero). Escritura atómica."""
    latest = model_dir / "latest.json"
    current = json.loads(latest.read_text(encoding="utf-8")) if latest.exists() else None
    if current and current.get("run", "") > iso(run):
        return latest  # nunca retroceder a un run más viejo
    tmp = latest.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps({"run": iso(run), "meta": f"{grids.run_id(run)}/meta.json"}, indent=1),
        encoding="utf-8",
    )
    tmp.replace(latest)
    return latest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--entrada", type=Path, required=True, help="carpeta out/gfs/AAAAMMDDHH")
    parser.add_argument(
        "--salida", type=Path, default=Path(__file__).resolve().parents[2] / "out/web/data"
    )
    parser.add_argument("--modelo", default="gfs")
    args = parser.parse_args(argv)
    out = encode_run(args.entrada, args.salida, args.modelo)
    meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    n = len(list(out.glob("*.png")))
    print(f"✓ {n} PNG ({meta['bytes'] / 1e6:.1f} MB) · {meta['width']}×{meta['height']} → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
