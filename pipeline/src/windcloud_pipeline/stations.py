"""Estaciones METAR para verificar los modelos (T-40, RF-9, diseño §6).

Genera `pipeline/data/stations.json`: aeropuertos de Colombia que reportan METAR, más los
de países vecinos a menos de `--km` de Colombia (frontera = unión de los departamentos de
`web/public/geo`).

Hallazgos con la API real (aviationweather.gov, 2026-11-13):
- `stationinfo?bbox=` da el catálogo (134 estaciones en la región, 47 en Colombia);
  `metar?ids=…&hours=24` da los reportes (tope de 400 por respuesta: ver `metar.py`).
- En Colombia reportan 37 de 38 aeropuertos con METAR, 7 a 24 veces al día (varios solo de día).
- El viento viene en nudos; no hay campo de precipitación (la lluvia sale del tiempo presente).
Se exige un mínimo de reportes en 24 h para no verificar contra estaciones casi mudas.

Uso:  uv run python -m windcloud_pipeline.stations [--km 100] [--min-reportes 6]
Fuente: NOAA Aviation Weather Center (dominio público).
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import shapely
from shapely.geometry import Point, shape
from shapely.ops import nearest_points

from . import metar

#: (sur, oeste, norte, este) en el orden que pide la API
REGION_BBOX = (-5.0, -82.0, 13.5, -66.0)
ROOT = Path(__file__).resolve().parents[3]
DEPARTMENTS = ROOT / "web/public/geo/colombia-departamentos.geojson"
OUTPUT = ROOT / "pipeline/data/stations.json"
KM_PER_DEG = 111.32


def colombia_shape(path: Path = DEPARTMENTS):
    fc = json.loads(path.read_text(encoding="utf-8"))
    return shapely.union_all([shape(f["geometry"]) for f in fc["features"]]), fc


def department_of(lon: float, lat: float, fc: dict) -> str | None:
    p = Point(lon, lat)
    for f in fc["features"]:
        if shape(f["geometry"]).contains(p):
            return f["properties"]["nombre"]
    return None


def km_to_colombia(lon: float, lat: float, colombia) -> float:
    """Distancia aproximada (km) al territorio colombiano; 0 si está dentro."""
    p = Point(lon, lat)
    if colombia.contains(p):
        return 0.0
    # grados → km con la escala de longitud a esa latitud (suficiente para ~100 km)
    nearest = nearest_points(colombia, p)[0]
    dx = (nearest.x - lon) * KM_PER_DEG * math.cos(math.radians(lat))
    dy = (nearest.y - lat) * KM_PER_DEG
    return (dx**2 + dy**2) ** 0.5


def select_stations(
    catalog: list[dict],
    reports: Counter,
    colombia,
    fc: dict,
    max_km: float = 100.0,
    min_reports: int = 6,
) -> list[dict]:
    """Estaciones METAR activas de Colombia y vecinas cercanas, ordenadas por código ICAO."""
    out = []
    for s in catalog:
        icao = s.get("icaoId")
        if not icao or "METAR" not in (s.get("siteType") or []):
            continue
        n = reports.get(icao, 0)
        if n < min_reports:
            continue
        km = km_to_colombia(s["lon"], s["lat"], colombia)
        if s.get("country") != "CO" and km > max_km:
            continue
        out.append(
            {
                "icao": icao,
                "nombre": s.get("site", icao),
                "pais": s.get("country"),
                "departamento": (
                    department_of(s["lon"], s["lat"], fc) if s.get("country") == "CO" else None
                ),
                "lat": round(float(s["lat"]), 4),
                "lon": round(float(s["lon"]), 4),
                "elev_m": s.get("elev"),
                "km_a_colombia": round(km),
                "reportes_24h": n,
                "red": "METAR",
            }
        )
    return sorted(out, key=lambda x: x["icao"])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--km", type=float, default=100.0)
    parser.add_argument("--min-reportes", type=int, default=6)
    parser.add_argument("--salida", type=Path, default=OUTPUT)
    args = parser.parse_args(argv)

    s, w, n, e = REGION_BBOX
    catalog = metar.fetch_json(f"{metar.API}/stationinfo?bbox={s},{w},{n},{e}&format=json")
    ids = [x["icaoId"] for x in catalog if x.get("icaoId") and "METAR" in (x.get("siteType") or [])]
    reports = Counter(o["icaoId"] for o in metar.fetch_metars(ids, hours=24))
    colombia, fc = colombia_shape()
    stations = select_stations(catalog, reports, colombia, fc, args.km, args.min_reportes)
    doc = {
        "source": metar.SOURCE,
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "criterio": (
            f"METAR activos (≥ {args.min_reportes} reportes/24 h) en Colombia o a ≤ {args.km:g} km"
        ),
        "stations": stations,
    }
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    by_country = Counter(x["pais"] for x in stations)
    print(f"✓ {len(stations)} estaciones {dict(by_country)} → {args.salida}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
