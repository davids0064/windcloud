"""daily.py: completa días faltantes, tolera fallos y publica (sin red)."""

import json
from datetime import UTC, date, datetime

from windcloud_pipeline import daily, verify

TODAY = date(2026, 11, 13)
STATIONS = [{"icao": "SKBO", "red": "METAR"}]


def fake_verify(fail_on=()):
    calls = []

    def run(day, stations, history):
        calls.append(day)
        if day in fail_on:
            raise RuntimeError("HTTP 504")
        rows = [
            {
                "hora_utc": f"{day}T00:00Z",
                "icao": "SKBO",
                "red": "METAR",
                "variable": "temperatura",
                "obs": "14",
                **{c: "15" for c in verify.forecast_columns()},
            }
        ]
        verify.write_pairs(rows, verify.pairs_path(history, day))
        return verify.pairs_path(history, day)

    return run, calls


def test_dias_pendientes(tmp_path):
    verify.write_pairs([], verify.pairs_path(tmp_path, date(2026, 11, 12)))
    got = daily.pending_days(tmp_path, TODAY, lookback=3)
    assert got == [date(2026, 11, 10), date(2026, 11, 11)]


def test_completa_publica_y_registra_fallos(tmp_path):
    hist, web = tmp_path / "pares", tmp_path / "web"
    bad = date(2026, 11, 11)
    fn, calls = fake_verify(fail_on=(bad,))
    status = daily.run(
        hist,
        web,
        STATIONS,
        today=TODAY,
        lookback=3,
        verify_day=fn,
        now=datetime(2026, 11, 13, 4, tzinfo=UTC),
        log=lambda m: None,
    )
    assert calls == [date(2026, 11, 10), bad, date(2026, 11, 12)]
    assert status["verificados"] == ["2026-11-10", "2026-11-12"]
    assert status["fallidos"][0]["dia"] == "2026-11-11" and "504" in status["fallidos"][0]["error"]
    assert status["dias_ventana"] == {"7": 2, "30": 2} and status["hasta"] == "2026-11-12"
    assert json.loads((web / "verificacion-status.json").read_text()) == status
    assert (web / "precision.json").exists() and (web / "precision" / "SKBO.json").exists()

    # al día siguiente solo reintenta el que falló (y el nuevo ayer)
    fn2, calls2 = fake_verify()
    daily.run(
        hist,
        web,
        STATIONS,
        today=date(2026, 11, 14),
        lookback=4,
        verify_day=fn2,
        log=lambda m: None,
    )
    assert calls2 == [bad, date(2026, 11, 13)]
