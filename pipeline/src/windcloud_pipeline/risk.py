"""Riesgo meteorológico sobre Colombia (T-50, RF-10, diseño §7).

Indicador propio, no una alerta oficial.

Por celda de la rejilla GFS 0,25° y por paso (0–72 h cada 3 h):
- **Incendio:** índice de Fosberg (FFWI, Fosberg 1978) con la humedad de equilibrio del
  combustible de Simard (1968). Solo usa el tiempo del momento (T, HR, viento): no sabe cuánto
  lleva sin llover ni qué tan seco está el combustible.
- **Viento fuerte:** ráfagas > 60 km/h (máx. de GUST y del viento a 10 m, como la capa del mapa).
- **Lluvia intensa:** > 20 mm en las 3 h que terminan en el paso.
- **Calor:** temperatura a 2 m > 35 °C.

Lluvia en 3 h: GFS da el promedio de PRATE desde el último reinicio (cada 6 h: f003 = 0–3 h,
f006 = 0–6 h, f009 = 6–9 h…). Si la ventana mide 3 h es directa; si mide 6 h se resta el paso
anterior.
El paso 0 no tiene lluvia acumulada (sin dato, no cero).

Salida: `risk.json` junto a las texturas del run (`gfs/<run>/risk.json`), solo celdas sobre
Colombia.
Se descartó H3 (diseño original): remuestrear 0,25° a hexágonos de ~250 km² inventa resolución y
sumaría `h3` y `h3-js`; la web dibuja las celdas de la propia rejilla.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import shapely
import shapely.geometry

from . import grids

SCHEMA = 1
SOURCE = "WindCloud (indicador propio) con NOAA/NCEP GFS 0,25°"
OFFICIAL_ALERTS = "https://www.ideam.gov.co/"

GUST_KMH = 60.0
RAIN_MM_3H = 20.0
HEAT_C = 35.0

#: Clases del FFWI (umbrales propios; el índice va de 0 a 100).
FFWI_CLASSES = ((0, "bajo"), (25, "moderado"), (50, "alto"), (75, "muy alto"))

#: Bits del campo `peligros`.
HAZARD_BITS = {"viento": 1, "lluvia": 2, "calor": 4}

#: Celdas cuyo centro cae a menos de esta distancia (grados) del territorio (costas, fronteras).
COAST_BUFFER_DEG = 0.125

MS_TO_MPH = 2.236936


# ----------------------------------------------------------------------------------------- índices
def equilibrium_moisture(t_c: np.ndarray, rh: np.ndarray) -> np.ndarray:
    """Humedad de equilibrio del combustible (%) de Simard (1968); T en °F dentro de la fórmula."""
    t_f = np.asarray(t_c, dtype=np.float64) * 9 / 5 + 32
    h = np.clip(np.asarray(rh, dtype=np.float64), 0, 100)
    low = 0.03229 + 0.281073 * h - 0.000578 * h * t_f
    mid = 2.22749 + 0.160107 * h - 0.01478 * t_f
    high = 21.0606 + 0.005565 * h**2 - 0.00035 * h * t_f - 0.483199 * h
    return np.where(h < 10, low, np.where(h <= 50, mid, high))


def fosberg(t_c: np.ndarray, rh: np.ndarray, wind_kmh: np.ndarray) -> np.ndarray:
    """FFWI 0–100.

    `η = 1 − 2(m/30) + 1,5(m/30)² − 0,5(m/30)³`, `FFWI = η·√(1+U²)/0,3002` (U en mph).
    """
    m = np.clip(equilibrium_moisture(t_c, rh), 0, 30) / 30
    eta = 1 - 2 * m + 1.5 * m**2 - 0.5 * m**3
    u_mph = np.asarray(wind_kmh, dtype=np.float64) / 3.6 * MS_TO_MPH
    return np.clip(eta * np.sqrt(1 + u_mph**2) / 0.3002, 0, 100)


def ffwi_class(value: float) -> str:
    label = FFWI_CLASSES[0][1]
    for lower, name in FFWI_CLASSES:
        if value >= lower:
            label = name
    return label


def rain_3h(steps: list[grids.GridStep]) -> list[np.ndarray | None]:
    """Lluvia (mm) en las 3 h que terminan en cada paso, desde `prate_avg`; None si no se puede."""
    out: list[np.ndarray | None] = []
    acc: dict[int, tuple[tuple[int, int], np.ndarray]] = {}
    for st in steps:
        win = st.windows.get("prate_avg")
        avg = st.fields.get("prate_avg")
        if win is None or avg is None:
            out.append(None)
            continue
        a, b = win
        total = avg.astype(np.float64) * (b - a) * grids.KGM2S_TO_MMH  # mm en la ventana
        acc[st.step] = (win, total)
        if b - a == 3:
            out.append(total)
        elif b - a == 6 and (prev := acc.get(st.step - 3)) and prev[0] == (a, b - 3):
            out.append(np.maximum(total - prev[1], 0))  # redondeo del GRIB: nunca negativo
        else:
            out.append(None)
    return out


# ----------------------------------------------------------------------------------------- rejilla
def colombia_cells(
    lats: np.ndarray, lons: np.ndarray, colombia, buffer: float = COAST_BUFFER_DEG
) -> tuple[np.ndarray, np.ndarray]:
    """Índices (fila, columna) de las celdas sobre Colombia, en orden de imagen."""
    area = colombia.buffer(buffer)
    west, south, east, north = area.bounds
    rows = np.flatnonzero((lats >= south) & (lats <= north))
    cols = np.flatnonzero((lons >= west) & (lons <= east))
    rr, cc = np.meshgrid(rows, cols, indexing="ij")
    rr, cc = rr.ravel(), cc.ravel()
    inside = shapely.contains_xy(area, lons[cc], lats[rr])
    return rr[inside], cc[inside]


def _ints(values: np.ndarray) -> list[int | None]:
    return [None if not np.isfinite(v) else int(round(float(v))) for v in values]


def _tenths(values: np.ndarray) -> list[float | None]:
    return [None if not np.isfinite(v) else round(float(v), 1) for v in values]


def compute(steps: list[grids.GridStep], colombia, departments: dict | None = None) -> dict:
    """Riesgo por celda y paso. Requiere t2m, rh2m, u10, v10 y gust (prate_avg para la lluvia)."""
    first = steps[0]
    rows, cols = colombia_cells(first.lats, first.lons, colombia)
    rains = rain_3h(steps)
    frames = []
    counts = {"incendio_alto": 0, **{k: 0 for k in HAZARD_BITS}}
    for st, rain in zip(steps, rains, strict=True):
        f = st.fields
        pick = lambda a: a[rows, cols].astype(np.float64)  # noqa: E731
        t = pick(f["t2m"]) - 273.15
        rh = pick(f["rh2m"])
        wind = np.hypot(pick(f["u10"]), pick(f["v10"])) * grids.MS_TO_KMH
        gust = np.fmax(pick(f["gust"]), wind / grids.MS_TO_KMH) * grids.MS_TO_KMH
        ffwi = fosberg(t, rh, wind)
        ffwi = np.where(np.isfinite(t) & np.isfinite(rh) & np.isfinite(wind), ffwi, np.nan)
        r3 = pick(rain) if rain is not None else np.full(len(rows), np.nan)
        flags = (
            (gust > GUST_KMH) * HAZARD_BITS["viento"]
            + (np.nan_to_num(r3) > RAIN_MM_3H) * HAZARD_BITS["lluvia"]
            + (t > HEAT_C) * HAZARD_BITS["calor"]
        ).astype(int)
        counts["incendio_alto"] = max(counts["incendio_alto"], int(np.sum(ffwi >= 50)))
        for name, bit in HAZARD_BITS.items():
            counts[name] = max(counts[name], int(np.sum((flags & bit) > 0)))
        frames.append(
            {
                "step": st.step,
                "valid": iso(st.valid),
                "ffwi": _ints(ffwi),
                "peligros": flags.tolist(),
                "rafaga": _ints(gust),
                "lluvia3h": _tenths(r3) if rain is not None else None,
                "t": _ints(t),
                "hr": _ints(rh),
            }
        )
    axis = first.lats if len(first.lats) > 1 else first.lons
    res = float(abs(axis[1] - axis[0]))
    return {
        "schema": SCHEMA,
        "source": SOURCE,
        "model": grids.SOURCE,
        "run": iso(first.run),
        "generatedAt": iso(datetime.now(UTC)),
        "oficial": OFFICIAL_ALERTS,
        "umbrales": {
            "rafaga_kmh": GUST_KMH,
            "lluvia_mm_3h": RAIN_MM_3H,
            "calor_c": HEAT_C,
            "ffwi_clases": [{"desde": lo, "clase": name} for lo, name in FFWI_CLASSES],
            "bits": HAZARD_BITS,
        },
        "rejilla": {"resolucion": res},
        # centros de celda [lat, lon]; cada arreglo de `pasos` va en este orden
        "celdas": [
            [round(float(first.lats[r]), 3), round(float(first.lons[c]), 3)]
            for r, c in zip(rows, cols, strict=True)
        ],
        **_departments(first, rows, cols, departments),
        "max_celdas": counts,
        "pasos": frames,
    }


def _departments(first: grids.GridStep, rows, cols, fc: dict | None) -> dict:
    """`departamentos` (nombres) y `celda_depto` (índice por celda; en costa, el más cercano)."""
    if not fc:
        return {}
    names = [f["properties"]["nombre"] for f in fc["features"]]
    shapes = [shapely.geometry.shape(f["geometry"]) for f in fc["features"]]
    for g in shapes:
        shapely.prepare(g)
    lons, lats = first.lons[cols], first.lats[rows]
    idx = np.full(len(rows), -1)
    for k, g in enumerate(shapes):
        hit = (idx < 0) & shapely.contains_xy(g, lons, lats)
        idx[hit] = k
    if (idx < 0).any():  # costa o frontera: el departamento más cercano
        for i in np.flatnonzero(idx < 0):
            pt = shapely.Point(lons[i], lats[i])
            idx[i] = int(np.argmin([g.distance(pt) for g in shapes]))
    return {"departamentos": names, "celda_depto": idx.tolist()}


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def can_compute(steps: list[grids.GridStep]) -> bool:
    need = {"t2m", "rh2m", "u10", "v10", "gust"}
    return all(need <= st.fields.keys() for st in steps)


def write(
    steps: list[grids.GridStep], out_dir: Path, colombia, departments: dict | None = None
) -> Path:
    path = out_dir / "risk.json"
    data = compute(steps, colombia, departments)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return path
