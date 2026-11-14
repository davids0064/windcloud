"""Rayos observados por GOES-19 GLM sobre Colombia (T-55, RF-5, diseño §4.4).

GLM (Geostationary Lightning Mapper) publica en NOAA Open Data (AWS, bucket público
`noaa-goes19`) un archivo netCDF4 cada 20 s con las descargas (*flashes*) de todo el disco. Se leen
los archivos de los últimos `MINUTES` minutos, se quedan las descargas sobre Colombia ampliada y de
calidad buena, y se publica `rayos.json`.

Hallazgos con los datos reales (2026-11-14):
- Listado sin credenciales:
  `https://noaa-goes19.s3.amazonaws.com/?list-type=2&prefix=GLM-L2-LCFA/AAAA/DDD/HH/` (DDD = día
  del año). 180 archivos por hora, ~230 KB cada uno → 15 min ≈ 45 archivos ≈ 10 MB.
- `flash_lat`/`flash_lon` en float32 sin escala; `flash_energy` int16 sin signo con escala (J);
  `flash_quality_flag` 0 = bueno. Hora de cada descarga: inicio del archivo (resolución de 20 s).
- Ejemplo: un archivo de 16:45 UTC trajo 303 descargas en el disco, 36 sobre Colombia ampliada.

Uso:  uv run python -m windcloud_pipeline.lightning [--salida DIR] [--minutos 15]
Fuente: NOAA GOES-19 GLM L2 (NOAA Open Data Dissemination), dominio público.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import time
import urllib.error
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path

import h5py
import numpy as np

from . import grids

BUCKET = "https://noaa-goes19.s3.amazonaws.com"
PRODUCT = "GLM-L2-LCFA"
SOURCE = "NOAA GOES-19 GLM (NOAA Open Data en AWS), dominio público"
MINUTES = 15
#: Colombia ampliada (oeste, sur, este, norte): tormentas de frontera y del Caribe cercano.
BBOX = (-80.0, -5.0, -66.0, 14.0)

_KEY = re.compile(r"<Key>([^<]+)</Key>")
_START = re.compile(r"_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})\d_")

Getter = Callable[[str], bytes]


def hour_prefix(t: datetime) -> str:
    return f"{PRODUCT}/{t:%Y}/{t.timetuple().tm_yday:03d}/{t:%H}/"


def list_url(prefix: str) -> str:
    return f"{BUCKET}/?list-type=2&prefix={prefix}"


def file_start(key: str) -> datetime | None:
    """Hora de inicio desde el nombre: `…_s20263181645000_…` = 2026, día 318, 16:45:00.0."""
    m = _START.search(key)
    if not m:
        return None
    y, doy, hh, mm, ss = (int(x) for x in m.groups())
    return datetime(y, 1, 1, hh, mm, ss, tzinfo=UTC) + timedelta(days=doy - 1)


def keys_in_window(
    now: datetime, minutes: int, get: Getter = grids.http_get
) -> list[tuple[datetime, str]]:
    """Archivos que empiezan en (now − minutes, now], de las horas que cubre la ventana."""
    start = now - timedelta(minutes=minutes)
    hours = {start.replace(minute=0, second=0, microsecond=0)}
    hours.add(now.replace(minute=0, second=0, microsecond=0))
    out = []
    for h in sorted(hours):
        xml = get(list_url(hour_prefix(h))).decode("utf-8", "replace")
        for key in _KEY.findall(xml):
            t = file_start(key)
            if t and start < t <= now:
                out.append((t, key))
    return sorted(out)


def _unsigned(ds) -> np.ndarray:
    raw = ds[:]
    if ds.attrs.get("_Unsigned", b"") in (b"true", "true"):
        raw = raw.view(np.uint16 if raw.dtype == np.int16 else raw.dtype)
    return raw


def scaled(ds) -> np.ndarray:
    """Valores físicos de una variable netCDF empaquetada (escala, desfase, sin signo, relleno)."""
    raw = _unsigned(ds)
    fill = ds.attrs.get("_FillValue")
    out = raw.astype(np.float64)
    if fill is not None:
        fill_raw = np.asarray(fill).astype(ds.dtype).view(raw.dtype)[0]
        out[raw == fill_raw] = np.nan
    scale = float(np.asarray(ds.attrs.get("scale_factor", 1.0)).ravel()[0])
    offset = float(np.asarray(ds.attrs.get("add_offset", 0.0)).ravel()[0])
    return out * scale + offset


def read_flashes(data: bytes, bbox=BBOX) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(lat, lon, energía en fJ) de las descargas de calidad buena dentro de `bbox`."""
    west, south, east, north = bbox
    with h5py.File(io.BytesIO(data), "r") as f:
        lat = f["flash_lat"][:].astype(np.float64)
        lon = f["flash_lon"][:].astype(np.float64)
        quality = _unsigned(f["flash_quality_flag"])
        energy = scaled(f["flash_energy"]) * 1e15  # femtojulios: números legibles
    keep = (quality == 0) & (lat >= south) & (lat <= north) & (lon >= west) & (lon <= east)
    return lat[keep], lon[keep], energy[keep]


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def collect(
    now: datetime | None = None,
    minutes: int = MINUTES,
    *,
    get: Getter = grids.http_get,
    sleep=time.sleep,
    log: Callable[[str], None] = lambda m: None,
) -> dict:
    now = now or datetime.now(UTC)
    keys = keys_in_window(now, minutes, get)
    flashes: list[list[float | int]] = []
    failed = 0
    for t, key in keys:
        data = None
        for wait in (0.0, 2.0):
            if wait:
                sleep(wait)
            try:
                data = get(f"{BUCKET}/{key}")
                break
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                continue
        if data is None:
            failed += 1
            continue
        try:
            lat, lon, energy = read_flashes(data)
        except (OSError, KeyError, ValueError):
            failed += 1
            continue
        age = int((now - t).total_seconds())
        for la, lo, e in zip(lat, lon, energy, strict=True):
            flashes.append([round(float(la), 3), round(float(lo), 3), age, round(float(e), 1)])
    log(f"{len(keys)} archivos, {failed} fallidos, {len(flashes)} descargas")
    if keys and failed == len(keys):
        raise RuntimeError("no se pudo leer ningún archivo GLM")
    return {
        "schema": 1,
        "source": SOURCE,
        "generatedAt": iso(datetime.now(UTC)),
        "hasta": iso(now),
        "minutos": minutes,
        "archivos": len(keys),
        "fallidos": failed,
        # [lat, lon, segundos antes de `hasta`, energía en fJ]
        "campos": ["lat", "lon", "edad_s", "energia_fJ"],
        "rayos": flashes,
    }


def write(data: dict, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "rayos.json"
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)
    return path


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--salida", type=Path, default=root / "out/web/data")
    parser.add_argument("--minutos", type=int, default=MINUTES)
    args = parser.parse_args(argv)
    try:
        data = collect(minutes=args.minutos, log=print)
    except (RuntimeError, urllib.error.URLError) as e:
        print(f"Rayos: {e}", file=sys.stderr)
        return 1
    if data["archivos"] == 0:
        print("Rayos: sin archivos GLM en la ventana (¿retraso de NOAA?)", file=sys.stderr)
        return 1
    print(f"→ {write(data, args.salida)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
