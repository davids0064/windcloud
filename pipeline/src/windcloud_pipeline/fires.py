"""Focos de calor de NASA FIRMS sobre Colombia (T-52, RF-11).

Consulta la API de área de FIRMS (CSV) para los sensores en tiempo casi real y publica
`fires.json` con los focos de las últimas 48 h que caen en Colombia (o a menos de ~10 km
de su borde).

Hallazgos con la API real (2026-11-14):
- `mapkey_status`: 5 000 transacciones cada 10 min; esta consulta usa 3 por corrida.
- `VIIRS_SNPP_NRT` dejó de publicar el 2026-11-02 (`data_availability`): se usan NOAA-20,
  NOAA-21 y MODIS.
- Confianza: VIIRS trae `l`/`n`/`h`; MODIS un número 0–100 → se unifica en baja/nominal/alta.
- `acq_time` es HHMM en UTC.

La clave (`FIRMS_MAP_KEY`) sale del entorno y **nunca** se escribe en registros ni en archivos
publicados (va dentro de la URL de FIRMS: los mensajes de error la ocultan).

Uso:  FIRMS_MAP_KEY=… uv run python -m windcloud_pipeline.fires [--salida DIR] [--dias 2]
Fuente: NASA FIRMS (LANCE). Datos de uso libre con atribución.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sys
import time
import urllib.error
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import shapely
import shapely.geometry

from . import grids

API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
SOURCE = "NASA FIRMS (LANCE): VIIRS NOAA-20/NOAA-21 y MODIS, tiempo casi real"
SENSORS = ("VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT")
SENSOR_LABEL = {
    "VIIRS_NOAA20_NRT": "VIIRS NOAA-20",
    "VIIRS_NOAA21_NRT": "VIIRS NOAA-21",
    "MODIS_NRT": "MODIS",
}
#: Colombia ampliada (oeste, sur, este, norte); el recorte fino es con el polígono del país.
BBOX = (-79.2, -4.4, -66.7, 13.6)
BUFFER_DEG = 0.1  # ~10 km: focos en la frontera o la costa
DAYS = 2
KEY_ENV = "FIRMS_MAP_KEY"

Getter = Callable[[str], bytes]


def area_url(key: str, sensor: str, days: int = DAYS, bbox=BBOX) -> str:
    return f"{API}/{key}/{sensor}/{','.join(f'{x:g}' for x in bbox)}/{days}"


def redact(text: str, key: str) -> str:
    return text.replace(key, "***") if key else text


def fetch_csv(url: str, key: str, get: Getter = grids.http_get, sleep=time.sleep) -> list[dict]:
    """GET con 3 intentos. Si la clave o la consulta fallan, FIRMS responde texto plano (no CSV)."""
    last = ""
    for wait in (0.0, 5.0, 20.0):
        if wait:
            sleep(wait)
        try:
            text = get(url).decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = redact(str(e), key)
            continue
        if not text.startswith("latitude,"):
            last = redact(text.strip()[:200], key) or "respuesta vacía"
            if "Invalid" in text or "invalid" in text:
                break  # clave o parámetros inválidos: reintentar no sirve
            continue
        return list(csv.DictReader(io.StringIO(text)))
    raise RuntimeError(f"FIRMS no respondió bien: {last}")


def confidence(row: dict) -> str:
    c = (row.get("confidence") or "").strip().lower()
    if c in ("l", "n", "h"):
        return {"l": "baja", "n": "nominal", "h": "alta"}[c]
    try:
        v = float(c)
    except ValueError:
        return "nominal"
    return "baja" if v < 30 else "alta" if v >= 80 else "nominal"


def acquired(row: dict) -> datetime:
    hhmm = f"{int(row['acq_time']):04d}"
    return datetime.strptime(f"{row['acq_date']}{hhmm}", "%Y-%m-%d%H%M").replace(tzinfo=UTC)


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def normalize(rows: list[dict], sensor: str) -> list[dict]:
    out = []
    for r in rows:
        try:
            lat, lon = float(r["latitude"]), float(r["longitude"])
            when = acquired(r)
        except (KeyError, ValueError):
            continue
        frp = r.get("frp")
        out.append(
            {
                "lat": round(lat, 4),
                "lon": round(lon, 4),
                "hora": iso(when),
                "sensor": SENSOR_LABEL.get(sensor, sensor),
                "confianza": confidence(r),
                "frp": round(float(frp), 1) if frp not in (None, "") else None,
                "dia": r.get("daynight") == "D",
            }
        )
    return out


def in_colombia(fires: list[dict], colombia, fc: dict | None) -> list[dict]:
    """Solo focos en Colombia (+ margen); con `fc`, el departamento de cada uno."""
    if not fires:
        return []
    area = colombia.buffer(BUFFER_DEG)
    lons = np.array([f["lon"] for f in fires])
    lats = np.array([f["lat"] for f in fires])
    keep = shapely.contains_xy(area, lons, lats)
    kept = [f for f, k in zip(fires, keep, strict=True) if k]
    if fc:
        shapes = [shapely.geometry.shape(f["geometry"]) for f in fc["features"]]
        names = [f["properties"]["nombre"] for f in fc["features"]]
        for f in kept:
            pt = shapely.Point(f["lon"], f["lat"])
            f["departamento"] = names[int(np.argmin([g.distance(pt) for g in shapes]))]
    return kept


def collect(
    key: str,
    colombia,
    fc: dict | None = None,
    *,
    days: int = DAYS,
    get: Getter = grids.http_get,
    sleep=time.sleep,
    now: datetime | None = None,
) -> dict:
    fires: list[dict] = []
    ok: list[str] = []
    failed: dict[str, str] = {}
    for sensor in SENSORS:
        try:
            rows = fetch_csv(area_url(key, sensor, days), key, get=get, sleep=sleep)
            fires += normalize(rows, sensor)
            ok.append(SENSOR_LABEL[sensor])
        except RuntimeError as e:
            failed[SENSOR_LABEL[sensor]] = str(e)
    if not ok:
        raise RuntimeError(f"Ningún sensor respondió: {failed}")
    kept = sorted(in_colombia(fires, colombia, fc), key=lambda f: f["hora"], reverse=True)
    return {
        "schema": 1,
        "source": SOURCE,
        "generatedAt": iso(now or datetime.now(UTC)),
        "ventana_h": days * 24,
        "sensores": ok,
        "fallidos": failed,
        "focos": kept,
    }


def write(data: dict, out_dir: Path) -> Path:
    """Escritura atómica: si falla a medias, queda el `fires.json` anterior."""
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "fires.json"
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)
    return path


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--salida", type=Path, default=root / "out/web/data")
    parser.add_argument("--dias", type=int, default=DAYS, choices=range(1, 6))
    args = parser.parse_args(argv)
    key = os.environ.get(KEY_ENV, "").strip()
    if not key:
        print(f"Falta {KEY_ENV}: se omiten los focos de calor.", file=sys.stderr)
        return 0  # sin clave no es un error del pipeline: la web dice «sin datos»
    from .stations import colombia_shape

    colombia, fc = colombia_shape()
    try:
        data = collect(key, colombia, fc, days=args.dias)
    except RuntimeError as e:
        print(redact(str(e), key), file=sys.stderr)
        return 1
    path = write(data, args.salida)
    print(
        f"{len(data['focos'])} focos en Colombia ({', '.join(data['sensores'])}) → {path}"
        + (f"; fallaron: {list(data['fallidos'])}" if data["fallidos"] else "")
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
