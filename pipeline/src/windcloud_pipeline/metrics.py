"""Métricas de precisión por modelo (T-42, RF-9, diseño §6.4).

Lee los pares diarios de `verify.py` (`out/verify/pares/AAAA-MM-DD.csv.gz`) y calcula, para las
ventanas de 7 y 30 días que terminan en `--hasta` (por defecto, ayer UTC):
- **Temperatura y viento:** MAE (error absoluto medio), sesgo (pronóstico − observado) y RMSE.
- **Lluvia sí/no por bloques de 6 h UTC** (00–06, 06–12…): tabla de contingencia → POD (aciertos),
  FAR (falsas alarmas), CSI (índice de éxito crítico) y sesgo de frecuencia (pronósticos «sí» /
  observaciones «sí»; 1 = ideal). Observado «sí» si algún reporte del bloque tuvo precipitación;
  pronóstico «sí» si suma ≥ `RAIN_MM` en esas mismas horas; el bloque necesita ≥ `RAIN_MIN_HOURS`
  horas con METAR. Por hora no sirve: con 7 días reales todos los modelos daban FAR ≈ 0,9 y
  CSI ≈ 0,1 (un desfase de una hora o de unos km cuenta como fallo y falsa alarma a la vez).
Por región (todas las estaciones), por red y por estación, para cada modelo y lead (día 1 y 2).

Justicia de la comparación: solo cuentan las horas en que **todos** los modelos tienen pronóstico
para ese lead; así ningún modelo sale beneficiado por faltar en las horas difíciles.

Uso: uv run python -m windcloud_pipeline.metrics [--hasta AAAA-MM-DD] [--web DIR]
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from . import metar, verify
from .sources import ideam

ROOT = Path(__file__).resolve().parents[3]
PAIRS = ROOT / "pipeline/out/verify/pares"
#: lo sirve el plugin de Vite en /data durante el desarrollo; en Actions, la rama `data`
WEB = ROOT / "pipeline/out/web/data"
WINDOWS = (7, 30)
#: lluvia: horas por bloque, mm pronosticados que cuentan como «sí», horas mínimas con dato
RAIN_BLOCK_H = 6
RAIN_MM = 1.0
RAIN_MIN_HOURS = 3
#: mínimo de pares para que un modelo entre al ranking de una estación o región
MIN_PAIRS = 24
CONTINUOUS = ("temperatura", "viento")
#: fuente de cada red (P2: todo dato visible con su fuente)
NETWORK_SOURCES = {"METAR": metar.SOURCE, "IDEAM": ideam.SOURCE}


# ---------- lectura ----------


def load_pairs(pairs_dir: Path, until: date, days: int) -> tuple[list[dict], list[str]]:
    """Filas de los `days` días que terminan en `until` (incluido) y los días que sí había."""
    rows: list[dict] = []
    found: list[str] = []
    for i in range(days - 1, -1, -1):
        d = until - timedelta(days=i)
        paths = [verify.pairs_path(pairs_dir, d, net) for net in verify.NETWORK_LAG_DAYS]
        paths = [p for p in paths if p.exists()]
        if not paths:
            continue
        found.append(d.isoformat())
        for path in paths:
            rows.extend(verify.read_pairs(path))
    return rows, found


def lead_columns(lead: int) -> list[str]:
    return [f"{m}_d{lead}" for m in verify.MODELS]


def complete_rows(rows: Iterable[dict], lead: int) -> list[dict]:
    """Filas con pronóstico de todos los modelos para ese lead."""
    cols = lead_columns(lead)
    return [r for r in rows if all(r.get(c) not in (None, "") for c in cols)]


# ---------- métricas ----------


def continuous_scores(obs: list[float], fc: list[float]) -> dict:
    n = len(obs)
    if n == 0:
        return {"n": 0, "mae": None, "sesgo": None, "rmse": None}
    err = [f - o for o, f in zip(obs, fc, strict=True)]
    return {
        "n": n,
        "mae": round(sum(abs(e) for e in err) / n, 2),
        "sesgo": round(sum(err) / n, 2),
        "rmse": round(math.sqrt(sum(e * e for e in err) / n), 2),
    }


def rain_scores(obs: list[int], fc_mm: list[float], threshold: float = RAIN_MM) -> dict:
    hits = misses = false_alarms = nulls = 0
    for o, f in zip(obs, fc_mm, strict=True):
        yes = f >= threshold
        if o and yes:
            hits += 1
        elif o:
            misses += 1
        elif yes:
            false_alarms += 1
        else:
            nulls += 1

    def ratio(a: int, b: int) -> float | None:
        return round(a / b, 3) if b else None

    return {
        "n": hits + misses + false_alarms + nulls,
        "aciertos": hits,
        "fallos": misses,
        "falsas_alarmas": false_alarms,
        "negativos": nulls,
        "pod": ratio(hits, hits + misses),
        "sesgo_frecuencia": ratio(hits + false_alarms, hits + misses),
        "far": ratio(false_alarms, hits + false_alarms),
        "csi": ratio(hits, hits + misses + false_alarms),
    }


def rain_blocks(rows: list[dict], lead: int) -> tuple[list[int], dict[str, list[float]]]:
    """Agrupa filas horarias de lluvia (ya completas) en bloques de RAIN_BLOCK_H horas UTC."""
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        hour = int(r["hora_utc"][11:13])
        groups[(r["icao"], r["hora_utc"][:10], hour // RAIN_BLOCK_H)].append(r)
    obs: list[int] = []
    fc: dict[str, list[float]] = {c: [] for c in lead_columns(lead)}
    for block in groups.values():
        if len(block) < RAIN_MIN_HOURS:
            continue
        obs.append(1 if any(int(float(r["obs"])) for r in block) else 0)
        for c in fc:
            fc[c].append(sum(float(r[c]) for r in block))
    return obs, fc


def scores_for(rows: list[dict]) -> dict:
    """{variable: {modelo_dN: métricas}} sobre un conjunto de filas."""
    out: dict[str, dict] = {}
    for var in verify.VARIABLES:
        sub = [r for r in rows if r["variable"] == var]
        per_col: dict[str, dict] = {}
        for lead in verify.LEADS:
            ok = complete_rows(sub, lead)
            if var == "lluvia":
                obs, fcs = rain_blocks(ok, lead)
                for col, fc in fcs.items():
                    per_col[col] = rain_scores(obs, fc)
                continue
            for col in lead_columns(lead):
                fc = [float(r[col]) for r in ok]
                per_col[col] = continuous_scores([float(r["obs"]) for r in ok], fc)
        out[var] = per_col
    return out


def ranking(scores: dict, lead: int = 1) -> dict[str, list[str]]:
    """Modelos de mejor a peor por variable (MAE ascendente; lluvia: CSI descendente)."""
    out = {}
    for var, per_col in scores.items():
        cand = []
        for m in verify.MODELS:
            s = per_col.get(f"{m}_d{lead}")
            if not s or s["n"] < MIN_PAIRS:
                continue
            key = s["mae"] if var in CONTINUOUS else (None if s["csi"] is None else -s["csi"])
            if key is not None:
                cand.append((key, m))
        out[var] = [m for _, m in sorted(cand)]
    return out


def window_summary(rows: list[dict], days_found: list[str], stations: list[dict]) -> dict:
    by_station: dict[str, list[dict]] = defaultdict(list)
    by_network: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_station[r["icao"]].append(r)
        by_network[r["red"]].append(r)
    region = scores_for(rows)
    st_out = {}
    for s in stations:
        sub = by_station.get(s["icao"])
        if not sub:
            continue
        sc = scores_for(sub)
        st_out[s["icao"]] = {"metricas": sc, "ranking": ranking(sc)}
    days_by_net: dict[str, set[str]] = defaultdict(set)
    for r in rows:
        days_by_net[r["red"]].add(r["hora_utc"][:10])
    return {
        "dias": days_found,
        "dias_por_red": {net: len(d) for net, d in sorted(days_by_net.items())},
        "region": {"metricas": region, "ranking": ranking(region)},
        "redes": {net: scores_for(sub) for net, sub in sorted(by_network.items())},
        "estaciones": st_out,
    }


def build_precision(
    pairs_dir: Path, until: date, stations: list[dict], now: datetime | None = None
) -> dict:
    networks = sorted({s.get("red", "METAR") for s in stations}, key=list(NETWORK_SOURCES).index)
    windows = {}
    for w in WINDOWS:
        rows, found = load_pairs(pairs_dir, until, w)
        windows[str(w)] = window_summary(rows, found, stations)
    return {
        "schema": 1,
        "generatedAt": (now or datetime.now(UTC))
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "hasta": until.isoformat(),
        "fuentes": {
            "observacion": " · ".join(NETWORK_SOURCES[n] for n in networks),
            "pronostico": verify.FORECAST_SOURCE,
            "redes": {n: NETWORK_SOURCES[n] for n in networks},
        },
        "modelos": list(verify.MODELS),
        "leads_dias": list(verify.LEADS),
        "umbrales": {
            "lluvia_bloque_h": RAIN_BLOCK_H,
            "lluvia_mm_bloque": RAIN_MM,
            "lluvia_horas_min_bloque": RAIN_MIN_HOURS,
            "min_pares_ranking": MIN_PAIRS,
        },
        "estaciones": [
            {k: s.get(k) for k in ("icao", "nombre", "pais", "departamento", "lat", "lon", "red")}
            for s in stations
        ],
        "ventanas": windows,
    }


def split_for_web(doc: dict) -> tuple[dict, dict[str, dict]]:
    """Resumen ligero (región, redes y ranking por estación) + detalle por estación.

    El resumen basta para el ranking y el mapa; el detalle se carga al abrir una estación.
    """
    summary = {k: v for k, v in doc.items() if k != "ventanas"}
    summary["ventanas"] = {}
    details: dict[str, dict] = {}
    for w, win in doc["ventanas"].items():
        summary["ventanas"][w] = {
            "dias": win["dias"],
            "dias_por_red": win["dias_por_red"],
            "region": win["region"],
            "redes": win["redes"],
            "estaciones": {
                icao: {"ranking": st["ranking"]} for icao, st in win["estaciones"].items()
            },
        }
        for icao, st in win["estaciones"].items():
            d = details.setdefault(
                icao,
                {
                    "schema": doc["schema"],
                    "generatedAt": doc["generatedAt"],
                    "hasta": doc["hasta"],
                    "icao": icao,
                    "ventanas": {},
                },
            )
            d["ventanas"][w] = st
    return summary, details


def write_web(doc: dict, web_dir: Path) -> list[Path]:
    """`precision.json` + `precision/<ICAO>.json`; borra estaciones retiradas."""
    summary, details = split_for_web(doc)
    out_dir = web_dir / "precision"
    out_dir.mkdir(parents=True, exist_ok=True)
    written = [web_dir / "precision.json"]
    written[0].write_text(dumps(summary), encoding="utf-8")
    for icao, d in details.items():
        path = out_dir / f"{icao}.json"
        path.write_text(dumps(d), encoding="utf-8")
        written.append(path)
    for old in out_dir.glob("*.json"):
        if old.stem not in details:
            old.unlink()
    return written


def dumps(obj: object) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--hasta", type=date.fromisoformat)
    parser.add_argument("--pares", type=Path, default=PAIRS)
    parser.add_argument("--web", type=Path, default=WEB)
    args = parser.parse_args(argv)
    until = args.hasta or (datetime.now(UTC).date() - timedelta(days=1))
    stations = verify.load_stations()
    doc = build_precision(args.pares, until, stations)
    written = write_web(doc, args.web)
    for w, win in doc["ventanas"].items():
        rk = win["region"]["ranking"]
        print(f"{w} días ({len(win['dias'])} con datos): temperatura {rk.get('temperatura')}")
    kb = written[0].stat().st_size / 1024
    print(f"✓ {written[0]} ({kb:.0f} KB) + {len(written) - 1} estaciones")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
