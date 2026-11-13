"""Adaptador IDEAM (T-47): estaciones automáticas en datos.gov.co (Socrata, CC BY-SA 4.0).

Datasets (T-46): temperatura `sbwg-7ju4`, viento `sgfv-3yp8` (m/s), precipitación `s54a-sgyg`
(mm por lectura). Trampas medidas con la API real (13/11/2026):
- `fechaobservacion` está en **hora local de Colombia (UTC−5)** sin zona → se convierte a UTC.
- Filas duplicadas → se promedian en el servidor (`avg` agrupando por estación y hora).
- El SoQL de datos.gov.co no tiene `date_trunc_ymdh` ni `date_extract_mi`: la hora en punto se
  filtra con `date_extract_mm(f) = 0`; lluvia: `date_trunc_ymd` + `date_extract_hh`.
- Datos preliminares (sin validar por IDEAM) con valores imposibles (0 °C exactos, viento de
  54 m/s) → control de calidad propio y red aparte en las métricas.
- El día local D se publica completo al día siguiente; el día UTC D acaba a las 19:00 locales
  de D → se verifica con 2 días de retraso.

Selección (`--estaciones`): temperatura, viento y lluvia en ≥ `MIN_HOURS` horas del día de
referencia; una por celda de `CELL_DEG`° (la de más horas: los modelos no distinguen estaciones
más cercanas); fuera las que están a < `MIN_KM_FROM_METAR` km de un aeropuerto (ya verificado).
Altitud del DEM de Open-Meteo (el dataset no la trae), la misma que usa el pronóstico de un punto.

Uso: uv run python -m windcloud_pipeline.sources.ideam --estaciones [--dia AAAA-MM-DD]
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import time
import urllib.parse
from collections import defaultdict
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from .. import grids, metar

SOURCE = "IDEAM, estaciones automáticas vía datos.gov.co (CC BY-SA 4.0; datos preliminares)"
API = "https://www.datos.gov.co/resource"
ELEVATION_API = "https://api.open-meteo.com/v1/elevation"
DATASETS = {"temperatura": "sbwg-7ju4", "viento": "sgfv-3yp8", "lluvia": "s54a-sgyg"}
LOCAL_OFFSET = timedelta(hours=-5)  # Colombia no tiene horario de verano
ROOT = Path(__file__).resolve().parents[4]
OUTPUT = ROOT / "pipeline/data/stations-ideam.json"
MIN_HOURS = 20
CELL_DEG = 0.25
MIN_KM_FROM_METAR = 10.0
BATCH = 80
MS_TO_KMH = 3.6
#: control de calidad: rango físico, salto frente a la mediana del día, lectura de lluvia imposible
QC_RANGE = {"temperatura": (-10.0, 45.0), "viento": (0.0, 150.0)}
QC_SPIKE = {"temperatura": 12.0, "viento": 60.0}
QC_RAIN_MAX_READING = 25.0

Getter = Callable[[str], bytes]


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia de gran círculo (haversine)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (
        math.sin((p2 - p1) / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    )
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def clean_name(raw: str) -> str:
    """'LLORO  [11035010]' → 'Lloro'; 'BELLAVISTA - AUT' → 'Bellavista' (el código va en el id)."""
    name = " ".join(raw.split("[")[0].split())
    for suffix in (" - AUT", " -AUT", " AUT"):
        if name.upper().endswith(suffix):
            name = name[: -len(suffix)]
    return name.strip(" -").title()


def station_id(code: str) -> str:
    """Id propio, corto y sin caracteres raros: «IDEAM-21205791»."""
    return f"IDEAM-{code.lstrip('0') or '0'}"


def to_utc(local_iso: str) -> datetime:
    """'2026-11-12T13:00:00.000' (hora de Colombia) → datetime UTC."""
    naive = datetime.fromisoformat(local_iso[:19])
    return (naive - LOCAL_OFFSET).replace(tzinfo=UTC)


def local_window(day: date) -> tuple[str, str]:
    """Ventana local que cubre el día UTC `day` más la hora previa (para la lluvia de las 00Z)."""
    start = datetime(day.year, day.month, day.day) + LOCAL_OFFSET - timedelta(hours=1)
    end = start + timedelta(hours=25) - timedelta(seconds=1)
    return start.isoformat(), end.isoformat()


def soql(dataset: str, query: str, get: Getter = grids.http_get, sleep=time.sleep) -> list[dict]:
    url = f"{API}/{dataset}.json?" + urllib.parse.urlencode({"$query": query})
    rows = metar.fetch_json(url, get=get, sleep=sleep)
    sleep(0.5)  # cortesía con datos.gov.co (sin token)
    return rows  # type: ignore[return-value]


def _in(codes: list[str]) -> str:
    return ",".join(f"'{c}'" for c in codes)


# ---------- observaciones ----------


def hourly_observations(
    day: date, stations: list[dict], get: Getter = grids.http_get, sleep=time.sleep
) -> dict[str, dict[datetime, dict]]:
    """{id: {hora UTC: {temperatura, viento, lluvia}}} del día UTC `day` (None = sin dato)."""
    start, end = local_window(day)
    win = f"fechaobservacion between '{start}' and '{end}'"
    by_code = {s["codigo"]: s["icao"] for s in stations}
    t0 = datetime(day.year, day.month, day.day, tzinfo=UTC)
    hours = [t0 + timedelta(hours=h) for h in range(24)]
    raw: dict[str, dict[str, dict[datetime, float]]] = defaultdict(lambda: defaultdict(dict))
    codes = list(by_code)
    for i in range(0, len(codes), BATCH):
        inn = _in(codes[i : i + BATCH])
        for var in ("temperatura", "viento"):
            rows = soql(
                DATASETS[var],
                "SELECT codigoestacion, fechaobservacion, avg(valorobservado) AS v "
                f"WHERE {win} AND date_extract_mm(fechaobservacion) = 0 "
                f"AND codigoestacion in ({inn}) "
                "GROUP BY codigoestacion, fechaobservacion LIMIT 50000",
                get=get,
                sleep=sleep,
            )
            for r in rows:
                v = float(r["v"]) * (MS_TO_KMH if var == "viento" else 1.0)
                raw[r["codigoestacion"]][var][to_utc(r["fechaobservacion"])] = v
        rows = soql(
            DATASETS["lluvia"],
            "SELECT codigoestacion, date_trunc_ymd(fechaobservacion) AS d, "
            "date_extract_hh(fechaobservacion) AS h, max(valorobservado) AS mx "
            f"WHERE {win} AND codigoestacion in ({inn}) GROUP BY codigoestacion, d, h LIMIT 50000",
            get=get,
            sleep=sleep,
        )
        for r in rows:
            # lecturas de [h, h+1) local → lluvia de la hora que acaba en h+1 (como Open-Meteo)
            end_local = datetime.fromisoformat(r["d"][:10]) + timedelta(hours=int(r["h"]) + 1)
            raw[r["codigoestacion"]]["lluvia"][to_utc(end_local.isoformat())] = float(r["mx"])
    out: dict[str, dict[datetime, dict]] = {}
    for code, sid in by_code.items():
        series = raw.get(code)
        if not series:
            continue
        temp = qc_series("temperatura", series.get("temperatura", {}))
        wind = qc_series("viento", series.get("viento", {}))
        rain = series.get("lluvia", {})
        st_hours: dict[datetime, dict] = {}
        for t in hours:
            mx = rain.get(t)
            values = {
                "temperatura": temp.get(t),
                "viento": wind.get(t),
                "lluvia": None if mx is None or mx > QC_RAIN_MAX_READING else (1 if mx > 0 else 0),
            }
            if any(v is not None for v in values.values()):
                st_hours[t] = values
        if st_hours:
            out[sid] = st_hours
    return out


def qc_series(var: str, series: dict[datetime, float]) -> dict[datetime, float]:
    """Rango físico, sensor pegado (todo igual) y saltos respecto a la mediana del día."""
    lo, hi = QC_RANGE[var]
    ok = {t: v for t, v in series.items() if lo <= v <= hi}
    if len(ok) >= 6 and len(set(ok.values())) == 1:
        return {}  # sensor pegado: todo el día el mismo valor
    if not ok:
        return {}
    med = statistics.median(ok.values())
    return {t: round(v, 1) for t, v in ok.items() if abs(v - med) <= QC_SPIKE[var]}


# ---------- selección de estaciones ----------


def coverage(day: date, get: Getter = grids.http_get, sleep=time.sleep) -> dict[str, dict]:
    """Horas con dato por estación y variable en `day` (más metadatos de la estación)."""
    start, end = local_window(day)
    win = f"fechaobservacion between '{start}' and '{end}'"
    meta: dict[str, dict] = {}
    rows = soql(
        DATASETS["temperatura"],
        "SELECT codigoestacion, nombreestacion, departamento, municipio, avg(latitud) AS lat, "
        "avg(longitud) AS lon, count(distinct fechaobservacion) AS n "
        f"WHERE {win} AND date_extract_mm(fechaobservacion) = 0 "
        "GROUP BY codigoestacion, nombreestacion, departamento, municipio LIMIT 5000",
        get=get,
        sleep=sleep,
    )
    for r in rows:
        m = meta.setdefault(r["codigoestacion"], {**r, "horas": {}})
        m["horas"]["temperatura"] = max(int(r["n"]), m["horas"].get("temperatura", 0))
    for var, extra in (
        ("viento", "date_extract_mm(fechaobservacion) = 0"),
        ("lluvia", None),
    ):
        count = (
            "count(distinct fechaobservacion)"
            if extra
            else "count(distinct date_extract_hh(fechaobservacion))"
        )
        cond = f"{win} AND {extra}" if extra else win
        rows = soql(
            DATASETS[var],
            f"SELECT codigoestacion, {count} AS n WHERE {cond} GROUP BY codigoestacion LIMIT 5000",
            get=get,
            sleep=sleep,
        )
        for r in rows:
            if r["codigoestacion"] in meta:
                meta[r["codigoestacion"]]["horas"][var] = int(r["n"])
    return meta


def select_stations(
    meta: dict[str, dict],
    metar_stations: list[dict],
    min_hours: int = MIN_HOURS,
    cell_deg: float = CELL_DEG,
    min_km: float = MIN_KM_FROM_METAR,
) -> list[dict]:
    best: dict[tuple[int, int], dict] = {}
    for code, m in meta.items():
        h = m["horas"]
        if min(h.get(v, 0) for v in DATASETS) < min_hours:
            continue
        lat, lon = float(m["lat"]), float(m["lon"])
        if any(distance_km(lat, lon, s["lat"], s["lon"]) < min_km for s in metar_stations):
            continue
        cell = (int((lat + 90) // cell_deg), int((lon + 180) // cell_deg))
        total = sum(h.values())
        if cell not in best or total > best[cell]["_total"]:
            best[cell] = {"codigo": code, "m": m, "_total": total}
    out = []
    for b in best.values():
        m = b["m"]
        out.append(
            {
                "icao": station_id(b["codigo"]),
                "codigo": b["codigo"],
                "nombre": clean_name(m["nombreestacion"]),
                "pais": "CO",
                "departamento": (m.get("departamento") or "").title() or None,
                "municipio": (m.get("municipio") or "").title() or None,
                "lat": round(float(m["lat"]), 4),
                "lon": round(float(m["lon"]), 4),
                "elev_m": None,
                "horas_dia_ref": m["horas"],
                "red": "IDEAM",
            }
        )
    return sorted(out, key=lambda s: s["icao"])


def add_elevation(stations: list[dict], get: Getter = grids.http_get, sleep=time.sleep) -> None:
    """Altitud del DEM de Open-Meteo (≤ 100 coordenadas por llamada)."""
    for i in range(0, len(stations), 100):
        group = stations[i : i + 100]
        lat = ",".join(str(s["lat"]) for s in group)
        lon = ",".join(str(s["lon"]) for s in group)
        doc = metar.fetch_json(
            f"{ELEVATION_API}?latitude={lat}&longitude={lon}", get=get, sleep=sleep
        )
        for s, e in zip(group, doc["elevation"], strict=True):  # type: ignore[index]
            s["elev_m"] = round(float(e))
        sleep(1.0)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--estaciones", action="store_true", help="regenerar stations-ideam.json")
    parser.add_argument(
        "--dia", type=date.fromisoformat, help="día de referencia (def. hace 2 días)"
    )
    parser.add_argument("--salida", type=Path, default=OUTPUT)
    args = parser.parse_args(argv)
    if not args.estaciones:
        parser.error("por ahora solo --estaciones (las observaciones las pide verify.py)")
    day = args.dia or (datetime.now(UTC).date() - timedelta(days=2))
    metar_st = json.loads((ROOT / "pipeline/data/stations.json").read_text(encoding="utf-8"))
    meta = coverage(day)
    stations = select_stations(meta, metar_st["stations"])
    add_elevation(stations)
    doc = {
        "source": SOURCE,
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "dia_referencia": day.isoformat(),
        "criterio": (
            f"temperatura, viento y lluvia en ≥ {MIN_HOURS} h; una por celda de {CELL_DEG}°; "
            f"a ≥ {MIN_KM_FROM_METAR:g} km de un METAR; altitud del DEM de Open-Meteo"
        ),
        "candidatas": len(meta),
        "stations": stations,
    }
    args.salida.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✓ {len(stations)} estaciones IDEAM de {len(meta)} candidatas → {args.salida}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
