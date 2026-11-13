"""metrics.py: MAE/sesgo/RMSE y POD/FAR/CSI con valores calculados a mano (sin red)."""

import json
from datetime import UTC, date, datetime

import pytest

from windcloud_pipeline import metrics, verify

M = verify.MODELS


def test_continuas_a_mano():
    s = metrics.continuous_scores([10, 12, 14], [11, 11, 17])  # errores +1, −1, +3
    assert s == {"n": 3, "mae": 1.67, "sesgo": 1.0, "rmse": 1.91}
    assert metrics.continuous_scores([], [])["mae"] is None


def test_lluvia_a_mano():
    obs = [1, 1, 1, 0, 0, 0, 0]
    fc = [5.0, 1.0, 0.0, 3.0, 0.5, 0.0, 0.0]  # 2 aciertos, 1 fallo, 1 falsa alarma, 3 negativos
    s = metrics.rain_scores(obs, fc, threshold=1.0)
    assert (s["aciertos"], s["fallos"], s["falsas_alarmas"], s["negativos"]) == (2, 1, 1, 3)
    assert s["pod"] == pytest.approx(2 / 3, abs=1e-3)
    assert s["far"] == 0.333 and s["csi"] == 0.5  # FAR = 1/(2+1); CSI = 2/(2+1+1)
    assert s["sesgo_frecuencia"] == 1.0  # 3 «sí» pronosticados / 3 observados
    assert metrics.rain_scores([0, 0], [0, 0])["pod"] is None  # sin lluvia observada


def test_bloques_de_lluvia():
    rows = [
        # bloque 00–06: llovió a las 02; el modelo 0 da 0,4 mm/h en 3 horas = 1,2 mm → acierto
        row("SKUI", "lluvia", 0, 0.4, hour=1),
        row("SKUI", "lluvia", 1, 0.4, hour=2),
        row("SKUI", "lluvia", 0, 0.4, hour=3),
        # bloque 06–12 con solo 2 horas de METAR → no cuenta
        row("SKUI", "lluvia", 1, 0.4, hour=7),
        row("SKUI", "lluvia", 1, 0.4, hour=8),
        # bloque 12–18: seco y el modelo 0 suma 0,3 mm → negativo correcto
        *[row("SKUI", "lluvia", 0, 0.1, hour=h) for h in (12, 13, 14)],
    ]
    obs, fc = metrics.rain_blocks(rows, 1)
    assert obs == [1, 0]
    assert fc[f"{M[0]}_d1"] == pytest.approx([1.2, 0.3])
    s = metrics.scores_for(rows)["lluvia"][f"{M[0]}_d1"]
    assert (s["n"], s["aciertos"], s["negativos"]) == (2, 1, 1)


def row(icao, var, obs, base, day="2026-11-12", hour=0, red="METAR", **override):
    """Fila de pares: el modelo i pronostica base + i (día 1) y base + 2i (día 2)."""
    r = {"hora_utc": f"{day}T{hour:02d}:00Z", "icao": icao, "red": red, "variable": var, "obs": obs}
    for i, m in enumerate(M):
        r[f"{m}_d1"] = base + i
        r[f"{m}_d2"] = base + 2 * i
    r.update(override)
    return {k: str(v) for k, v in r.items()}


def write_day(tmp_path, day, rows):
    verify.write_pairs(rows, verify.pairs_path(tmp_path, date.fromisoformat(day)))


def test_solo_horas_con_todos_los_modelos():
    rows = [
        row("SKBO", "temperatura", 14, 14),
        row("SKBO", "temperatura", 14, 30, **{f"{M[3]}_d1": ""}),  # falta un modelo → fuera
    ]
    sc = metrics.scores_for(rows)["temperatura"]
    assert sc[f"{M[0]}_d1"] == {"n": 1, "mae": 0.0, "sesgo": 0.0, "rmse": 0.0}
    assert sc[f"{M[0]}_d2"]["n"] == 2  # en día 2 no falta nadie


def test_ranking_y_minimo_de_pares():
    many = [row("SKBO", "temperatura", 14, 14, hour=h % 24) for h in range(metrics.MIN_PAIRS)]
    rk = metrics.ranking(metrics.scores_for(many))
    assert rk["temperatura"] == list(M)  # error crece con el índice del modelo
    few = metrics.scores_for(many[:3])
    assert metrics.ranking(few)["temperatura"] == []


def test_ranking_lluvia_por_csi():
    days = [f"2026-11-{d:02d}" for d in range(1, 8)]  # 7 días × 4 bloques = 28 ≥ MIN_PAIRS
    rows = [row("SKUI", "lluvia", 1, 0.0, day=d, hour=h) for d in days for h in range(24)]
    rk = metrics.ranking(metrics.scores_for(rows))["lluvia"]
    assert rk[-1] == M[0]  # el modelo 0 pronostica 0,0 mm siempre: CSI 0, último


def test_ventanas_regiones_y_estaciones(tmp_path):
    write_day(
        tmp_path, "2026-11-12", [row("SKBO", "temperatura", 14, 15), row("SKUI", "viento", 10, 8)]
    )
    write_day(tmp_path, "2026-11-01", [row("SKBO", "temperatura", 14, 20)])  # solo en la de 30
    stations = [
        {"icao": "SKBO", "nombre": "Bogotá", "red": "METAR"},
        {"icao": "SKUI", "nombre": "Quibdó", "red": "METAR"},
        {"icao": "SKSV", "nombre": "Sin datos", "red": "METAR"},
    ]
    now = datetime(2026, 11, 13, 6, tzinfo=UTC)
    doc = metrics.build_precision(tmp_path, date(2026, 11, 12), stations, now=now)
    assert doc["schema"] == 1 and doc["generatedAt"] == "2026-11-13T06:00:00Z"
    assert doc["umbrales"]["lluvia_mm_bloque"] == metrics.RAIN_MM
    w7, w30 = doc["ventanas"]["7"], doc["ventanas"]["30"]
    assert w7["dias"] == ["2026-11-12"] and w30["dias"] == ["2026-11-01", "2026-11-12"]
    t7 = w7["region"]["metricas"]["temperatura"][f"{M[0]}_d1"]
    assert t7["n"] == 1 and t7["sesgo"] == 1.0
    assert w30["region"]["metricas"]["temperatura"][f"{M[0]}_d1"]["mae"] == 3.5
    assert set(w7["estaciones"]) == {"SKBO", "SKUI"}  # SKSV sin pares no aparece
    assert w7["estaciones"]["SKUI"]["metricas"]["viento"][f"{M[0]}_d1"]["sesgo"] == -2.0
    assert list(w7["redes"]) == ["METAR"]


def test_resumen_y_detalle_para_la_web(tmp_path):
    pairs = tmp_path / "pares"
    write_day(pairs, "2026-11-12", [row("SKBO", "temperatura", 14, 15)])
    stations = [{"icao": "SKBO", "red": "METAR"}]
    doc = metrics.build_precision(pairs, date(2026, 11, 12), stations)
    web = tmp_path / "web"
    (web / "precision").mkdir(parents=True)
    (web / "precision" / "SKXX.json").write_text("{}")  # estación retirada
    written = metrics.write_web(doc, web)
    assert [p.name for p in written] == ["precision.json", "SKBO.json"]
    assert not (web / "precision" / "SKXX.json").exists()
    summary = json.loads((web / "precision.json").read_text())
    assert set(summary["ventanas"]["7"]["estaciones"]["SKBO"]) == {"ranking"}
    assert "metricas" in summary["ventanas"]["7"]["region"]
    detail = json.loads((web / "precision" / "SKBO.json").read_text())
    assert detail["icao"] == "SKBO" and set(detail["ventanas"]) == {"7", "30"}
    assert detail["ventanas"]["7"]["metricas"]["temperatura"][f"{M[0]}_d1"]["sesgo"] == 1.0
