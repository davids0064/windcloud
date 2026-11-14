"""Metodología (web/src/core/methodology.ts) muestra las mismas constantes que el pipeline."""

import re
from pathlib import Path

from windcloud_pipeline import fires, lightning, metrics, risk, verify

TS = (Path(__file__).resolve().parents[2] / "web/src/core/methodology.ts").read_text(
    encoding="utf-8"
)


def ts_value(name: str) -> str:
    """Valor de `name: …` o `export const name = …` (una lista entre corchetes, o hasta la coma)."""
    m = re.search(rf"(?:\b{name}: |export const {name} = )(\[[^\]]*\]|[^,/\n]+)", TS)
    assert m, name
    return m.group(1).strip()


def nums(text: str) -> list[float]:
    return [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", text)]


def test_verificacion():
    assert nums(ts_value("matchMin")) == [verify.MATCH_MIN]
    assert nums(ts_value("rainBlockH")) == [metrics.RAIN_BLOCK_H]
    assert nums(ts_value("rainMm")) == [metrics.RAIN_MM]
    assert nums(ts_value("rainMinHours")) == [metrics.RAIN_MIN_HOURS]
    assert nums(ts_value("minPairs")) == [metrics.MIN_PAIRS]
    assert nums(ts_value("windows")) == list(metrics.WINDOWS)
    assert nums(ts_value("qcTemp")) == list(verify.QC_RANGE["temperatura"])
    assert nums(ts_value("qcWind")) == list(verify.QC_RANGE["viento"])


def test_riesgo_focos_y_rayos():
    assert nums(ts_value("gustKmh")) == [risk.GUST_KMH]
    assert nums(ts_value("rainMm3h")) == [risk.RAIN_MM_3H]
    assert nums(ts_value("heatC")) == [risk.HEAT_C]
    assert nums(ts_value("ffwiClasses")) == [lo for lo, _ in risk.FFWI_CLASSES]
    assert nums(ts_value("FIRES_HOURS")) == [fires.DAYS * 24]
    assert nums(ts_value("LIGHTNING_MINUTES")) == [lightning.MINUTES]
