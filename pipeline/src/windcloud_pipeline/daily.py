"""Verificación diaria (T-43): completa los días que falten, recalcula métricas y publica.

1. Para cada día de los últimos `--dias-atras` (por defecto 10; el METAR guarda ≥ 12 días) sin
   archivo de pares en el histórico, ejecuta `verify.verify_day`. Así, si un día falla (API caída,
   Actions sin correr), se recupera solo al siguiente.
2. Recalcula `precision.json` (ventanas 7 y 30 días hasta ayer UTC) y el detalle por estación.
3. Escribe `verificacion-status.json` con lo verificado, lo fallido y la ventana publicada.

El histórico de pares no se borra nunca (RF-9: el ranking mejora con el tiempo): ~57 KB/día.
Sale con código 1 si algún día falló, pero publica igual lo que sí hay (nunca a medias: cada
archivo se escribe completo).

Uso local:  uv run python -m windcloud_pipeline.daily
En Actions: --historico <rama data>/pares --web <rama data>/web
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from . import metrics, verify

LOOKBACK_DAYS = 10
#: llamadas ponderadas de Open-Meteo por corrida (límite gratuito: 5 000/h, 10 000/día); lo que no
#: quepa se verifica en la corrida siguiente
CALL_BUDGET = 4000


def pending_days(
    history: Path, today: date, lookback: int = LOOKBACK_DAYS, network: str = "METAR"
) -> list[date]:
    """Días sin pares de esa red, desde `lookback` atrás hasta el último que la red ya publicó."""
    lag = verify.NETWORK_LAG_DAYS[network]
    days = [today - timedelta(days=i) for i in range(lookback, lag - 1, -1)]
    return [d for d in days if not verify.pairs_path(history, d, network).exists()]


def run(
    history: Path,
    web: Path,
    stations: list[dict],
    *,
    today: date,
    lookback: int = LOOKBACK_DAYS,
    budget: float = CALL_BUDGET,
    verify_day: Callable[..., Path] = verify.verify_day,
    now: datetime | None = None,
    log: Callable[[str], None] = print,
) -> dict:
    done, failed, deferred = [], [], []
    spent = 0.0
    networks = [n for n in verify.NETWORK_LAG_DAYS if any(s.get("red") == n for s in stations)]
    for net in networks:
        cost = verify.call_weight(sum(1 for s in stations if s.get("red") == net))
        # lo más reciente primero: si el presupuesto no alcanza, quedan pendientes los más viejos
        for d in reversed(pending_days(history, today, lookback, net)):
            if spent + cost > budget:
                deferred.append({"red": net, "dia": d.isoformat()})
                continue
            spent += cost
            try:
                verify_day(d, stations, history, network=net)
                done.append({"red": net, "dia": d.isoformat()})
                log(f"✓ {net} {d}")
            except Exception as e:  # noqa: BLE001 — un día malo no detiene a los demás
                failed.append(
                    {"red": net, "dia": d.isoformat(), "error": f"{type(e).__name__}: {e}"}
                )
                log(f"✗ {net} {d}: {e}")
    until = today - timedelta(days=1)
    doc = metrics.build_precision(history, until, stations, now=now)
    metrics.write_web(doc, web)
    status = {
        "checkedAt": doc["generatedAt"],
        "hasta": until.isoformat(),
        "verificados": done,
        "fallidos": failed,
        "aplazados": deferred,
        "llamadas_open_meteo": round(spent),
        "dias_ventana": {w: len(v["dias"]) for w, v in doc["ventanas"].items()},
    }
    (web / "verificacion-status.json").write_text(
        json.dumps(status, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return status


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--historico", type=Path, default=verify.OUT)
    parser.add_argument("--web", type=Path, default=metrics.WEB)
    parser.add_argument("--dias-atras", type=int, default=LOOKBACK_DAYS)
    args = parser.parse_args(argv)
    stations = verify.load_stations()
    status = run(
        args.historico,
        args.web,
        stations,
        today=datetime.now(UTC).date(),
        lookback=args.dias_atras,
    )
    print(
        f"Ventanas: {status['dias_ventana']} días con datos · "
        f"nuevos {len(status['verificados'])} · fallidos {len(status['fallidos'])} · "
        f"aplazados {len(status['aplazados'])} · ~{status['llamadas_open_meteo']} llamadas"
    )
    return 1 if status["fallidos"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
