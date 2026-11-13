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


def pending_days(history: Path, today: date, lookback: int = LOOKBACK_DAYS) -> list[date]:
    days = [today - timedelta(days=i) for i in range(lookback, 0, -1)]
    return [d for d in days if not verify.pairs_path(history, d).exists()]


def run(
    history: Path,
    web: Path,
    stations: list[dict],
    *,
    today: date,
    lookback: int = LOOKBACK_DAYS,
    verify_day: Callable[[date, list[dict], Path], Path] = verify.verify_day,
    now: datetime | None = None,
    log: Callable[[str], None] = print,
) -> dict:
    done, failed = [], []
    for d in pending_days(history, today, lookback):
        try:
            verify_day(d, stations, history)
            done.append(d.isoformat())
            log(f"✓ verificado {d}")
        except Exception as e:  # noqa: BLE001 — un día malo no detiene a los demás
            failed.append({"dia": d.isoformat(), "error": f"{type(e).__name__}: {e}"})
            log(f"✗ {d}: {e}")
    until = today - timedelta(days=1)
    doc = metrics.build_precision(history, until, stations, now=now)
    metrics.write_web(doc, web)
    status = {
        "checkedAt": doc["generatedAt"],
        "hasta": until.isoformat(),
        "verificados": done,
        "fallidos": failed,
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
    stations = json.loads(verify.STATIONS.read_text(encoding="utf-8"))["stations"]
    status = run(
        args.historico,
        args.web,
        stations,
        today=datetime.now(UTC).date(),
        lookback=args.dias_atras,
    )
    print(
        f"Ventanas: {status['dias_ventana']} días con datos · "
        f"nuevos {len(status['verificados'])} · fallidos {len(status['fallidos'])}"
    )
    return 1 if status["fallidos"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
