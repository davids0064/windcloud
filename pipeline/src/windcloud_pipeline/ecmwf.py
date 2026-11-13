"""ECMWF Open Data (IFS 0,25°) como segundo modelo para las capas del mapa (T-31, RF-2).

Hallazgos con el servicio real (2026-11-13, https://data.ecmwf.int/forecasts):
- Un GRIB2 global de ~101 MB por paso, con un índice `.index` (una línea JSON por campo con
  `_offset` y `_length`) y rangos HTTP: se bajan solo los campos necesarios (~6 MB por paso,
  ~155 MB por run).
- Runs 00/06/12/18 en `oper`; el 00Z tuvo su f072 a las 07:34 UTC (~7,5 h, más tarde que GFS).
- Diferencias con GFS que se normalizan aquí: nubosidad en fracción 0–1 (→ %), nivel
  `entireAtmosphere`; ráfaga `10fg` = máxima de la última hora (`stepType` "max"), nula en f000
  (se omite); precipitación como tasa instantánea `tprate` (igual que GFS); rejilla global que se
  recorta a la región.
Licencia: CC BY 4.0, atribuir «© ECMWF».
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Iterable
from datetime import datetime, timedelta
from pathlib import Path

from . import grids

BASE = "https://data.ecmwf.int/forecasts"
SOURCE = "ECMWF Open Data (IFS 0,25°)"

#: (param, levtype, levelist) del índice → campo de salida
INDEX_PARAMS: dict[tuple[str, str, str | None], str] = {
    ("10u", "sfc", None): "u10",
    ("10v", "sfc", None): "v10",
    ("u", "pl", "850"): "u850",
    ("v", "pl", "850"): "v850",
    ("u", "pl", "500"): "u500",
    ("v", "pl", "500"): "v500",
    ("10fg", "sfc", None): "gust",
    ("tcc", "sfc", None): "tcc",
    ("tprate", "sfc", None): "prate",
    ("2t", "sfc", None): "t2m",
    ("msl", "sfc", None): "prmsl",
}

#: Lectura de los mensajes (nombres de eccodes vistos en el GRIB real)
FIELDS: dict[str, grids.FieldSpec] = {
    "u10": ("10u", "heightAboveGround", 10, "instant"),
    "v10": ("10v", "heightAboveGround", 10, "instant"),
    "u850": ("u", "isobaricInhPa", 850, "instant"),
    "v850": ("v", "isobaricInhPa", 850, "instant"),
    "u500": ("u", "isobaricInhPa", 500, "instant"),
    "v500": ("v", "isobaricInhPa", 500, "instant"),
    "gust": ("10fg", "heightAboveGround", 10, "max"),
    "tcc": ("tcc", "entireAtmosphere", 0, "instant"),
    "prate": ("tprate", "surface", 0, "instant"),
    "t2m": ("2t", "heightAboveGround", 2, "instant"),
    "prmsl": ("msl", "meanSea", 0, "instant"),
}


def file_url(run: datetime, step: int, ext: str) -> str:
    d, h = run.strftime("%Y%m%d"), run.strftime("%H")
    return f"{BASE}/{d}/{h}z/ifs/0p25/oper/{d}{h}0000-{step}h-oper-fc.{ext}"


def latest_complete_run(
    now: datetime, last_step: int, exists: Callable[[str], bool], max_back: int = 4
) -> datetime | None:
    """Run más reciente cuyo último paso necesario ya tiene índice publicado."""
    run = grids.cycle_floor(now)
    for _ in range(max_back):
        if exists(file_url(run, last_step, "index")):
            return run
        run -= timedelta(hours=6)
    return None


def select_messages(index_lines: Iterable[str]) -> list[dict]:
    """Entradas del índice que corresponden a INDEX_PARAMS (orden del archivo)."""
    out = []
    for line in index_lines:
        line = line.strip()
        if not line:
            continue
        r = json.loads(line)
        key = (r.get("param"), r.get("levtype"), r.get("levelist"))
        if key in INDEX_PARAMS or (key[0], key[1], None) in INDEX_PARAMS and key[1] == "sfc":
            out.append(r)
    return out


def http_range(url: str, start: int, length: int, timeout: float = 120.0) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"Range": f"bytes={start}-{start + length - 1}", "User-Agent": grids.USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=timeout, context=grids._ssl()) as resp:  # noqa: S310
        data = resp.read()
    if len(data) != length:
        raise grids.DownloadError(f"Rango incompleto: {len(data)} de {length} bytes")
    return data


def fetch_message(
    url: str,
    entry: dict,
    get_range: Callable[[str, int, int], bytes] = http_range,
    sleep: Callable[[float], None] = time.sleep,
    waits: Iterable[float] = grids.RETRY_WAITS_S,
) -> bytes:
    last: Exception | None = None
    for wait in (0.0, *waits):
        if wait:
            sleep(wait)
        try:
            data = get_range(url, entry["_offset"], entry["_length"])
        except (urllib.error.URLError, TimeoutError, ConnectionError, grids.DownloadError) as e:
            last = e
            continue
        if not grids.is_grib(data):
            last = grids.DownloadError(f"El rango no es GRIB: {data[:40]!r}")
            continue
        return data
    raise grids.DownloadError(f"Falló tras reintentos: {url} @ {entry['_offset']}") from last


def download_run(
    run: datetime,
    out_dir: Path,
    steps: Iterable[int] = grids.DEFAULT_STEPS,
    region: str = "colombia",  # la rejilla de ECMWF es global: se recorta al leer (ver reader)
    get_text: Callable[[str], bytes] = grids.http_get,
    get_range: Callable[[str, int, int], bytes] = http_range,
    sleep: Callable[[float], None] = time.sleep,
    log: Callable[[str], None] = print,
) -> grids.DownloadResult:
    """Baja por rangos solo los campos necesarios de cada paso a `out_dir/<run>/fHHH.grib2`."""
    run_dir = out_dir / grids.run_id(run)
    run_dir.mkdir(parents=True, exist_ok=True)
    result = grids.DownloadResult(run=run, region=region)
    for step in steps:
        path = run_dir / f"f{step:03d}.grib2"
        if not (path.exists() and grids.is_grib(path.read_bytes()[:4])):
            entries = select_messages(get_text(file_url(run, step, "index")).decode().splitlines())
            missing = set(INDEX_PARAMS.values()) - {
                INDEX_PARAMS.get((e["param"], e["levtype"], e.get("levelist")))
                or INDEX_PARAMS.get((e["param"], e["levtype"], None))
                for e in entries
            }
            if missing - {"gust"}:  # la ráfaga puede faltar en f000
                raise grids.DownloadError(f"f{step:03d}: el índice no trae {sorted(missing)}")
            url = file_url(run, step, "grib2")
            parts = []
            for e in entries:
                parts.append(fetch_message(url, e, get_range=get_range, sleep=sleep))
                sleep(0.2)  # cortesía con el servidor de ECMWF
            tmp = path.with_suffix(".part")
            tmp.write_bytes(b"".join(parts))
            tmp.replace(path)
            log(f"  f{step:03d} {path.stat().st_size / 1e6:.1f} MB ({len(entries)} campos)")
        result.files[step] = path
        result.bytes += path.stat().st_size
    (run_dir / "download.json").write_text(
        json.dumps(
            {
                "source": SOURCE,
                "run": run.isoformat().replace("+00:00", "Z"),
                "steps": sorted(result.files),
                "bytes": result.bytes,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return result


def normalize(step: grids.GridStep) -> grids.GridStep:
    """Convenciones de GFS: nubosidad en %, sin ráfaga en f000 (máximo de un intervalo vacío)."""
    f = dict(step.fields)
    if "tcc" in f:
        f["tcc"] = f["tcc"] * 100.0
    if step.step == 0:
        f.pop("gust", None)
    return grids.GridStep(step.run, step.step, step.lats, step.lons, f)


def make_reader(region: str = "colombia") -> Callable[[Path], grids.GridStep]:
    bbox = grids.REGIONS[region]

    def reader(path: Path) -> grids.GridStep:
        return normalize(grids.crop(grids.read_step(path, FIELDS), bbox))

    return reader
