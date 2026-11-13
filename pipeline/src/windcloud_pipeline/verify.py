"""Pares observación–pronóstico de un día UTC (T-41, RF-9, diseño §6).

Para cada estación de `data/stations.json` y cada hora del día:
- **Observado (METAR):** temperatura y viento del METAR de rutina más cercano a la hora (± 20 min);
  lluvia sí/no en la hora que termina (algún METAR/SPECI de esa hora con precipitación, o el reporte
  de la hora con precipitación reciente RE…). Sin METAR de rutina a esa hora → hora sin dato.
- **Pronosticado (Open-Meteo Previous Runs API):** `_previous_day1` y `_previous_day2` de los 8
  modelos (pronóstico emitido ~24 y ~48 h antes). Se pasa la altitud de la estación
  (`elevation=`) para que Open-Meteo corrija la temperatura por altura, como con un usuario.

Salida: `out/verify/pares/AAAA-MM-DD.csv.gz` (largo por variable; una columna por modelo×lead).
Las métricas (MAE, sesgo, POD, FAR…) son T-42; el histórico y la automatización, T-43.

Uso: uv run python -m windcloud_pipeline.verify [--fecha AAAA-MM-DD] [--red METAR|IDEAM|todas]
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import time
from collections import defaultdict
from collections.abc import Callable, Iterable
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from . import grids, metar

ROOT = Path(__file__).resolve().parents[3]
STATIONS = ROOT / "pipeline/data/stations.json"
#: listas de estaciones por red (T-40 METAR, T-47 IDEAM)
STATION_FILES = {"METAR": STATIONS, "IDEAM": ROOT / "pipeline/data/stations-ideam.json"}
#: días de retraso con que cada red tiene completo el día UTC (IDEAM publica el día local siguiente)
NETWORK_LAG_DAYS = {"METAR": 1, "IDEAM": 2}
OUT = ROOT / "pipeline/out/verify/pares"
PREVIOUS_RUNS = "https://previous-runs-api.open-meteo.com/v1/forecast"
FORECAST_SOURCE = "Open-Meteo Previous Runs API (CC BY 4.0)"

#: mismos modelos que el panel de punto (`web/src/core/models.ts`; una prueba los mantiene iguales)
MODELS = (
    "ecmwf_ifs",
    "ecmwf_aifs025_single",
    "gfs_seamless",
    "icon_seamless",
    "gem_seamless",
    "jma_seamless",
    "meteofrance_seamless",
    "ukmo_seamless",
)
LEADS = (1, 2)  # días
#: variable propia → variable de Open-Meteo
VARIABLES = {"temperatura": "temperature_2m", "viento": "wind_speed_10m", "lluvia": "precipitation"}
#: rangos físicos para descartar observaciones imposibles (control de calidad mínimo)
QC_RANGE = {"temperatura": (-30.0, 50.0), "viento": (0.0, 200.0)}
MATCH_MIN = 20
LOCATIONS_PER_CALL = 10
#: Open-Meteo gratis: 600/min, 5 000/h y 10 000/día en llamadas PONDERADAS (cada ubicación cuenta
#: (variables × modelos) / 10). Medido el 13/11/2026: sin pausa suficiente responde 429.
OPEN_METEO_PER_MINUTE = 500  # margen bajo 600


def call_weight(n_locations: int) -> float:
    """Llamadas que cuenta Open-Meteo por una petición de Previous Runs con `n_locations`."""
    per_location = len(VARIABLES) * len(LEADS) * len(MODELS) / 10
    return n_locations * max(1.0, per_location)


Getter = Callable[[str], bytes]


def forecast_columns() -> list[str]:
    return [f"{m}_d{d}" for m in MODELS for d in LEADS]


# ---------- observaciones ----------


def hourly_observations(reports: Iterable[dict], day: date) -> dict[str, dict[datetime, dict]]:
    """{icao: {hora UTC: {temperatura, viento, lluvia}}} para las 24 horas de `day`."""
    by_station: dict[str, list[dict]] = defaultdict(list)
    for r in reports:
        by_station[r["icaoId"]].append(r)
    start = datetime(day.year, day.month, day.day, tzinfo=UTC)
    out: dict[str, dict[datetime, dict]] = {}
    for icao, rows in by_station.items():
        rows.sort(key=lambda r: r["obsTime"])
        hours: dict[datetime, dict] = {}
        for h in range(24):
            t = start + timedelta(hours=h)
            ts = t.timestamp()
            routine = [
                r
                for r in rows
                if r.get("metarType") == "METAR" and abs(r["obsTime"] - ts) <= MATCH_MIN * 60
            ]
            if not routine:
                continue
            m = min(routine, key=lambda r: abs(r["obsTime"] - ts))
            in_hour = [r for r in rows if ts - 3600 < r["obsTime"] <= m["obsTime"]]
            rain = any(metar.precip_now(r.get("wxString")) for r in in_hour) or metar.precip_recent(
                m.get("rawOb", "")
            )
            hours[t] = {
                "temperatura": qc("temperatura", m.get("temp")),
                "viento": qc("viento", metar.wind_kmh(m)),
                "lluvia": 1 if rain else 0,
            }
        out[icao] = hours
    return out


def qc(var: str, value) -> float | None:
    if value is None:
        return None
    lo, hi = QC_RANGE[var]
    v = float(value)
    return v if lo <= v <= hi else None


# ---------- pronósticos ----------


def previous_runs_url(stations: list[dict], day: date) -> str:
    hourly = ",".join(f"{v}_previous_day{d}" for v in VARIABLES.values() for d in LEADS)
    lat = ",".join(str(s["lat"]) for s in stations)
    lon = ",".join(str(s["lon"]) for s in stations)
    elev = ",".join(str(s["elev_m"] if s.get("elev_m") is not None else "nan") for s in stations)
    return (
        f"{PREVIOUS_RUNS}?latitude={lat}&longitude={lon}&elevation={elev}&hourly={hourly}"
        f"&models={','.join(MODELS)}&start_date={day}&end_date={day}&timezone=GMT"
    )


def parse_forecast(doc: dict) -> dict[datetime, dict[str, dict[str, float | None]]]:
    """{hora: {variable propia: {modelo_dN: valor}}} de una ubicación."""
    hourly = doc["hourly"]
    out: dict[datetime, dict[str, dict[str, float | None]]] = {}
    for i, t in enumerate(hourly["time"]):
        when = datetime.fromisoformat(t).replace(tzinfo=UTC)
        out[when] = {
            name: {
                f"{m}_d{d}": hourly.get(f"{api}_previous_day{d}_{m}", [None] * (i + 1))[i]
                for m in MODELS
                for d in LEADS
            }
            for name, api in VARIABLES.items()
        }
    return out


def fetch_forecasts(
    stations: list[dict], day: date, get: Getter = grids.http_get, sleep=time.sleep
) -> dict[str, dict]:
    out = {}
    for i in range(0, len(stations), LOCATIONS_PER_CALL):
        group = stations[i : i + LOCATIONS_PER_CALL]
        docs = metar.fetch_json(previous_runs_url(group, day), get=get, sleep=sleep)
        if isinstance(docs, dict):  # una sola ubicación → objeto, no lista
            docs = [docs]
        for s, doc in zip(group, docs, strict=True):
            out[s["icao"]] = parse_forecast(doc)
        sleep(call_weight(len(group)) * 60 / OPEN_METEO_PER_MINUTE)  # ritmo bajo el límite/min
    return out


# ---------- pares ----------


def build_pairs(stations: list[dict], obs: dict, fc: dict) -> list[dict]:
    rows = []
    for s in stations:
        for t, values in sorted(obs.get(s["icao"], {}).items()):
            forecast = fc.get(s["icao"], {}).get(t)
            if forecast is None:
                continue
            for var in VARIABLES:
                if values[var] is None:
                    continue
                rows.append(
                    {
                        "hora_utc": t.strftime("%Y-%m-%dT%H:%MZ"),
                        "icao": s["icao"],
                        "red": s.get("red", "METAR"),
                        "variable": var,
                        "obs": values[var],
                        **forecast[var],
                    }
                )
    return rows


def write_pairs(rows: list[dict], path: Path) -> None:
    """CSV comprimido y reproducible (gzip sin fecha): mismo contenido → mismos bytes en git."""
    path.parent.mkdir(parents=True, exist_ok=True)
    cols = ["hora_utc", "icao", "red", "variable", "obs", *forecast_columns()]
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    path.write_bytes(gzip.compress(buf.getvalue().encode("utf-8"), mtime=0))


def read_pairs(path: Path) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def load_stations(files: dict[str, Path] = STATION_FILES) -> list[dict]:
    """Estaciones de todas las redes con lista generada (cada una con su campo `red`)."""
    out: list[dict] = []
    for network, path in files.items():
        if path.exists():
            for s in json.loads(path.read_text(encoding="utf-8"))["stations"]:
                out.append({**s, "red": s.get("red", network)})
    return out


def pairs_path(out_dir: Path, day: date, network: str = "METAR") -> Path:
    return out_dir / network.lower() / f"{day}.csv.gz"


def observe(
    network: str, day: date, stations: list[dict], get: Getter, sleep
) -> dict[str, dict[datetime, dict]]:
    """Observaciones horarias de una red para el día UTC `day`."""
    if network == "METAR":
        # 25 h: incluye la hora previa a las 00Z para la lluvia de esa primera hora
        reports = metar.fetch_metars(
            [s["icao"] for s in stations],
            hours=25,
            date=f"{day:%Y%m%d}_2359",
            get=get,
            sleep=sleep,
        )
        return hourly_observations(reports, day)
    if network == "IDEAM":
        from .sources import ideam

        return ideam.hourly_observations(day, stations, get=get, sleep=sleep)
    raise ValueError(f"Red desconocida: {network}")


def verify_day(
    day: date,
    stations: list[dict],
    out_dir: Path = OUT,
    get: Getter = grids.http_get,
    sleep=time.sleep,
    network: str = "METAR",
) -> Path:
    stations = [s for s in stations if s.get("red", "METAR") == network]
    obs = observe(network, day, stations, get, sleep)
    fc = fetch_forecasts(stations, day, get=get, sleep=sleep)
    rows = build_pairs(stations, obs, fc)
    path = pairs_path(out_dir, day, network)
    write_pairs(rows, path)
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--fecha", type=date.fromisoformat)
    parser.add_argument("--salida", type=Path, default=OUT)
    parser.add_argument("--red", choices=[*NETWORK_LAG_DAYS, "todas"], default="METAR")
    args = parser.parse_args(argv)
    stations = load_stations()
    networks = list(NETWORK_LAG_DAYS) if args.red == "todas" else [args.red]
    for network in networks:
        lag = NETWORK_LAG_DAYS[network]
        day = args.fecha or (datetime.now(UTC).date() - timedelta(days=lag))
        path = verify_day(day, stations, args.salida, network=network)
        n = len(read_pairs(path))
        n_st = sum(1 for s in stations if s["red"] == network)
        print(f"✓ {network} {day}: {n} pares de {n_st} estaciones → {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
