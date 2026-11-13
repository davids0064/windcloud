"""Rejillas de pronóstico GFS 0,25° para las capas del mapa (T-30, RF-2, diseño §4.1).

Descarga con el filtro de NOMADS solo lo necesario: viento u/v a 10 m, 850 y 500 hPa,
ráfagas (GUST), nubosidad total (TCDC, atmósfera completa) y tasa de precipitación (PRATE),
pasos 0–72 h cada 3 h.

Hallazgos con el servicio real (2026-11-13):
- Región por defecto "colombia" (lon −100…−50, lat −20…25): ~570 KB por paso (≈ 14 MB por run)
  frente a 8,6 MB por paso global (≈ 216 MB). Misma resolución 0,25°; configurable.
- El filtro combina todas las variables con todos los niveles pedidos (llega también TCDC a
  500/850 hPa): se eligen los mensajes por (nombre, tipo de nivel, nivel, tipo de paso).
- PRATE y TCDC llegan dos veces desde f003: valor instantáneo y promedio del intervalo previo. Los
  promedios de GFS se reinician cada 6 h (f006 = 0–6 h, f009 = 6–9 h): mezclarían ventanas
  de 3 y 6 h. Se usa siempre el **instantáneo**: igual definición en todos los pasos y existe
  también en f000.
- La rejilla puede venir de sur a norte (jScansPositively): se normaliza a norte → sur.
- Si el archivo aún no existe, NOMADS responde 404 con HTML: se valida que empiece por b"GRIB".

Uso:  uv run python -m windcloud_pipeline.grids [--run AAAAMMDDHH]
          [--region colombia|global] [--salida DIR]
Fuente: NOAA/NCEP GFS (dominio público).
"""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

import certifi
import eccodes
import numpy as np

NOMADS = "https://nomads.ncep.noaa.gov"
FILTER_URL = f"{NOMADS}/cgi-bin/filter_gfs_0p25.pl"
PROD_URL = f"{NOMADS}/pub/data/nccf/com/gfs/prod"
SOURCE = "NOAA/NCEP GFS 0,25° (NOMADS)"
USER_AGENT = "WindCloud-pipeline (observatorio abierto)"

#: Regiones (oeste, este, sur, norte) en grados. "colombia" = Colombia ampliada
#: (Centroamérica, Caribe, norte de Sudamérica): basta para las capas sobre el país y pesa
#: 15 veces menos que la global.
REGIONS: dict[str, tuple[float, float, float, float] | None] = {
    "colombia": (-100.0, -50.0, -20.0, 25.0),
    "global": None,
}

VARIABLES = ("UGRD", "VGRD", "GUST", "TCDC", "PRATE")
LEVELS = ("10_m_above_ground", "850_mb", "500_mb", "surface", "entire_atmosphere")

#: Campo de salida ← (shortName de eccodes, typeOfLevel, level). Siempre stepType "instant".
FIELDS: dict[str, tuple[str, str, int]] = {
    "u10": ("10u", "heightAboveGround", 10),
    "v10": ("10v", "heightAboveGround", 10),
    "u850": ("u", "isobaricInhPa", 850),
    "v850": ("v", "isobaricInhPa", 850),
    "u500": ("u", "isobaricInhPa", 500),
    "v500": ("v", "isobaricInhPa", 500),
    "gust": ("gust", "surface", 0),
    "tcc": ("tcc", "atmosphere", 0),
    "prate": ("prate", "surface", 0),
}
STEP_TYPE = "instant"

DEFAULT_STEPS = tuple(range(0, 73, 3))  # 0–72 h cada 3 h = 25 pasos (diseño §4.1)
POLITE_DELAY_S = 1.0  # NOMADS bloquea temporalmente a quien hace demasiadas peticiones por minuto
RETRY_WAITS_S = (5.0, 15.0, 45.0)


# --------------------------------------------------------------------------------------------- run
def cycle_floor(now: datetime) -> datetime:
    """Inicio del ciclo de 6 h en curso (00, 06, 12, 18 UTC)."""
    now = now.astimezone(UTC)
    return now.replace(hour=now.hour - now.hour % 6, minute=0, second=0, microsecond=0)


def run_id(run: datetime) -> str:
    return run.strftime("%Y%m%d%H")


def parse_run_id(value: str) -> datetime:
    run = datetime.strptime(value, "%Y%m%d%H").replace(tzinfo=UTC)
    if run.hour % 6:
        raise ValueError(f"El run debe ser 00, 06, 12 o 18 UTC: {value}")
    return run


def idx_url(run: datetime, step: int) -> str:
    d, h = run.strftime("%Y%m%d"), run.strftime("%H")
    return f"{PROD_URL}/gfs.{d}/{h}/atmos/gfs.t{h}z.pgrb2.0p25.f{step:03d}.idx"


def latest_complete_run(
    now: datetime,
    last_step: int,
    exists: Callable[[str], bool],
    max_back: int = 4,
) -> datetime | None:
    """Run más reciente cuyo último paso necesario ya está publicado (se prueba su .idx)."""
    run = cycle_floor(now)
    for _ in range(max_back):
        if exists(idx_url(run, last_step)):
            return run
        run -= timedelta(hours=6)
    return None


# --------------------------------------------------------------------------------------- descarga
def filter_url(run: datetime, step: int, region: str = "colombia") -> str:
    d, h = run.strftime("%Y%m%d"), run.strftime("%H")
    params: list[tuple[str, str]] = [
        ("dir", f"/gfs.{d}/{h}/atmos"),
        ("file", f"gfs.t{h}z.pgrb2.0p25.f{step:03d}"),
    ]
    params += [(f"var_{v}", "on") for v in VARIABLES]
    params += [(f"lev_{lev}", "on") for lev in LEVELS]
    bbox = REGIONS[region]
    if bbox:
        west, east, south, north = bbox
        params += [
            ("subregion", ""),
            ("leftlon", f"{west:g}"),
            ("rightlon", f"{east:g}"),
            ("toplat", f"{north:g}"),
            ("bottomlat", f"{south:g}"),
        ]
    return f"{FILTER_URL}?{urllib.parse.urlencode(params)}"


class DownloadError(RuntimeError):
    pass


def is_grib(data: bytes) -> bool:
    return data[:4] == b"GRIB"


def _ssl() -> ssl.SSLContext:
    # Certificados de certifi: el Python de python.org en macOS no trae CA del sistema.
    return ssl.create_default_context(cafile=certifi.where())


def http_get(url: str, timeout: float = 90.0) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl()) as resp:  # noqa: S310
        return resp.read()


def http_exists(url: str) -> bool:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30, context=_ssl()) as resp:  # noqa: S310
            return resp.status == 200
    except urllib.error.HTTPError:
        return False


def fetch_grib(
    url: str,
    get: Callable[[str], bytes] = http_get,
    sleep: Callable[[float], None] = time.sleep,
    waits: Iterable[float] = RETRY_WAITS_S,
) -> bytes:
    """Descarga un GRIB2 con reintentos ante fallos de red, 429 o 5xx. Un 404 no se reintenta."""
    last: Exception | None = None
    for wait in (0.0, *waits):
        if wait:
            sleep(wait)
        try:
            data = get(url)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise DownloadError(f"No publicado aún (404): {url}") from e
            last = e
            continue
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = e
            continue
        if not is_grib(data):
            last = DownloadError(f"La respuesta no es GRIB2 ({len(data)} bytes): {data[:80]!r}")
            continue
        return data
    raise DownloadError(f"Falló tras reintentos: {url}") from last


@dataclass
class DownloadResult:
    run: datetime
    region: str
    files: dict[int, Path] = field(default_factory=dict)
    bytes: int = 0


def download_run(
    run: datetime,
    out_dir: Path,
    steps: Iterable[int] = DEFAULT_STEPS,
    region: str = "colombia",
    get: Callable[[str], bytes] = http_get,
    sleep: Callable[[float], None] = time.sleep,
    log: Callable[[str], None] = print,
) -> DownloadResult:
    """Descarga los pasos a `out_dir/<run>/fHHH.grib2`; reanuda sin repetir los ya válidos."""
    run_dir = out_dir / run_id(run)
    run_dir.mkdir(parents=True, exist_ok=True)
    result = DownloadResult(run=run, region=region)
    first = True
    for step in steps:
        path = run_dir / f"f{step:03d}.grib2"
        if path.exists() and is_grib(path.read_bytes()[:4]):
            log(f"  f{step:03d} ya descargado")
        else:
            if not first:
                sleep(POLITE_DELAY_S)
            data = fetch_grib(filter_url(run, step, region), get=get, sleep=sleep)
            tmp = path.with_suffix(".part")
            tmp.write_bytes(data)
            tmp.replace(path)  # atómico: nunca queda un GRIB a medias con el nombre final
            log(f"  f{step:03d} {len(data) / 1024:.0f} KB")
            first = False
        result.files[step] = path
        result.bytes += path.stat().st_size

    manifest = {
        "source": SOURCE,
        "run": run.isoformat().replace("+00:00", "Z"),
        "region": region,
        "bbox": REGIONS[region],
        "steps": sorted(result.files),
        "bytes": result.bytes,
        "downloaded_at": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
    }
    (run_dir / "download.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return result


# ------------------------------------------------------------------------------------------ lectura
@dataclass
class GridStep:
    """Campos de un paso, en filas norte → sur y columnas oeste → este (orden de imagen)."""

    run: datetime
    step: int
    lats: np.ndarray  # decrecientes
    lons: np.ndarray  # crecientes, en −180…180
    fields: dict[str, np.ndarray]

    @property
    def valid(self) -> datetime:
        return self.run + timedelta(hours=self.step)


def read_step(path: Path) -> GridStep:
    """Lee un GRIB2 del filtro y devuelve los campos de FIELDS (valores instantáneos)."""
    wanted = {key: name for name, key in FIELDS.items()}
    fields: dict[str, np.ndarray] = {}
    lats = lons = None
    run: datetime | None = None
    step = 0
    with path.open("rb") as f:
        while (h := eccodes.codes_grib_new_from_file(f)) is not None:
            try:
                key = (
                    eccodes.codes_get(h, "shortName"),
                    eccodes.codes_get(h, "typeOfLevel"),
                    int(eccodes.codes_get(h, "level")),
                )
                name = wanted.get(key)
                if name is None or eccodes.codes_get(h, "stepType") != STEP_TYPE:
                    continue  # TCDC a 500/850 hPa (sobrante del filtro) o promedios de intervalo
                ni, nj = eccodes.codes_get(h, "Ni"), eccodes.codes_get(h, "Nj")
                values = eccodes.codes_get_values(h).reshape(nj, ni)
                la = np.asarray(eccodes.codes_get_array(h, "distinctLatitudes"), dtype=float)
                lo = np.asarray(eccodes.codes_get_array(h, "distinctLongitudes"), dtype=float)
                if eccodes.codes_get(h, "jScansPositively"):  # filas sur → norte
                    values = values[::-1]
                la = np.sort(la)[::-1]
                lo = np.where(lo > 180, lo - 360, lo)
                order = np.argsort(lo)
                values, lo = values[:, order], lo[order]
                missing = eccodes.codes_get(h, "missingValue")
                values = np.where(values == missing, np.nan, values).astype(np.float32)
                fields[name] = values
                lats, lons = la, lo
                if run is None:
                    date = eccodes.codes_get(h, "dataDate")
                    hhmm = eccodes.codes_get(h, "dataTime")
                    run = datetime.strptime(f"{date}{hhmm:04d}", "%Y%m%d%H%M").replace(tzinfo=UTC)
                    step = int(str(eccodes.codes_get(h, "stepRange")).split("-")[-1])
            finally:
                eccodes.codes_release(h)
    if run is None or lats is None or lons is None:
        raise ValueError(f"Sin campos reconocibles en {path}")
    return GridStep(run=run, step=step, lats=lats, lons=lons, fields=fields)


def wind_speed(u: np.ndarray, v: np.ndarray) -> np.ndarray:
    return np.hypot(u, v)


MS_TO_KMH = 3.6
KGM2S_TO_MMH = 3600.0  # 1 kg/m² = 1 mm de agua


# ---------------------------------------------------------------------------------------------- CLI
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--run", help="AAAAMMDDHH (por defecto: el más reciente completo)")
    parser.add_argument("--region", choices=sorted(REGIONS), default="colombia")
    parser.add_argument("--max-step", type=int, default=72)
    parser.add_argument("--cada", type=int, default=3, help="horas entre pasos")
    parser.add_argument(
        "--salida", type=Path, default=Path(__file__).resolve().parents[2] / "out/gfs"
    )
    args = parser.parse_args(argv)

    steps = list(range(0, args.max_step + 1, args.cada))
    if args.run:
        run = parse_run_id(args.run)
    else:
        found = latest_complete_run(datetime.now(UTC), steps[-1], http_exists)
        if found is None:
            print("✗ Ningún run reciente tiene publicados todos los pasos", file=sys.stderr)
            return 1
        run = found
    print(f"GFS run {run_id(run)} · región {args.region} · {len(steps)} pasos → {args.salida}")
    result = download_run(run, args.salida, steps, args.region)
    print(f"✓ {len(result.files)} pasos, {result.bytes / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
