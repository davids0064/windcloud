"""verify.py: emparejar METAR por hora con los pronósticos de Previous Runs (sin red)."""

import csv
import json
import re
from datetime import UTC, date, datetime
from pathlib import Path

from windcloud_pipeline import verify

DAY = date(2026, 11, 12)
T0 = datetime(2026, 11, 12, tzinfo=UTC).timestamp()
ROOT = Path(__file__).resolve().parents[2]


def rep(icao, minutes, kind="METAR", temp=20, wspd=5, wx=None, raw=""):
    return {
        "icaoId": icao,
        "obsTime": int(T0 + minutes * 60),
        "metarType": kind,
        "temp": temp,
        "wspd": wspd,
        "wxString": wx,
        "rawOb": raw or f"{kind} {icao}",
    }


def test_modelos_iguales_a_la_web():
    ts = (ROOT / "web/src/core/models.ts").read_text(encoding="utf-8")
    assert tuple(re.findall(r"apiId: '([a-z0-9_]+)'", ts)) == verify.MODELS


def test_observaciones_por_hora():
    reports = [
        rep("SKUI", -30, kind="SPECI", wx="RA"),  # día anterior, 23:30 → lluvia de la hora 00
        rep("SKUI", 0, temp=25, wspd=10),
        rep("SKUI", 58, temp=26),  # METAR de las 01 que llegó 2 min antes
        rep("SKUI", 125, kind="SPECI", wx="-DZ"),  # llovizna entre 02 y 03
        rep("SKUI", 180, raw="METAR SKUI 120300Z 9999 BKN015 29/28 Q1009"),
        rep("SKUI", 240, raw="METAR SKUI 120400Z 9999 BKN015 29/28 Q1009 RERA"),
        rep("SKUI", 300, temp=None),  # AUTO sin temperatura
        rep("SKUI", 360, temp=80),  # fuera de rango físico
        rep("SKUI", 450),  # 07:30: lejos de cualquier hora en punto
    ]
    obs = verify.hourly_observations(reports, DAY)["SKUI"]
    h = {t.hour: v for t, v in obs.items()}
    assert sorted(h) == [0, 1, 3, 4, 5, 6]
    assert h[0] == {"temperatura": 25.0, "viento": 18.5, "lluvia": 1}
    assert h[1]["temperatura"] == 26.0 and h[1]["lluvia"] == 0
    assert h[3]["lluvia"] == 1  # SPECI de las 02:05 dentro de (02:00, 03:00]
    assert h[4]["lluvia"] == 1  # RERA
    assert h[5]["temperatura"] is None and h[6]["temperatura"] is None


def fake_doc(base: float):
    times = [f"2026-11-12T{h:02d}:00" for h in range(24)]
    hourly = {"time": times}
    for api in verify.VARIABLES.values():
        for m in verify.MODELS:
            for d in verify.LEADS:
                hourly[f"{api}_previous_day{d}_{m}"] = [base + d] * 24
    return {"hourly": hourly}


STATIONS = [
    {"icao": "SKBO", "lat": 4.7, "lon": -74.15, "elev_m": 2547, "red": "METAR"},
    {"icao": "SKUI", "lat": 5.69, "lon": -76.64, "elev_m": 55, "red": "METAR"},
]


def test_url_previous_runs():
    url = verify.previous_runs_url(STATIONS, DAY)
    assert "latitude=4.7,5.69" in url and "elevation=2547,55" in url
    assert "start_date=2026-11-12&end_date=2026-11-12" in url and "timezone=GMT" in url
    assert "temperature_2m_previous_day1,temperature_2m_previous_day2" in url
    assert "precipitation_previous_day2" in url and "models=ecmwf_ifs," in url


def test_verify_day_extremo_a_extremo(tmp_path):
    def get(url):
        if "aviationweather" in url:
            return json.dumps([rep("SKBO", 0, temp=14), rep("SKUI", 60, wx="RA")]).encode()
        return json.dumps([fake_doc(10.0), fake_doc(20.0)]).encode()

    path = verify.verify_day(DAY, STATIONS, tmp_path, get=get, sleep=lambda s: None)
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    assert path.name == "2026-11-12.csv"
    assert len(rows) == 6  # 2 estaciones × 1 hora × 3 variables
    skbo_t = next(r for r in rows if r["icao"] == "SKBO" and r["variable"] == "temperatura")
    assert skbo_t["hora_utc"] == "2026-11-12T00:00Z" and skbo_t["obs"] == "14.0"
    assert skbo_t["gfs_seamless_d1"] == "11.0" and skbo_t["gfs_seamless_d2"] == "12.0"
    skui_r = next(r for r in rows if r["icao"] == "SKUI" and r["variable"] == "lluvia")
    assert skui_r["hora_utc"] == "2026-11-12T01:00Z" and skui_r["obs"] == "1"
    assert skui_r["ukmo_seamless_d1"] == "21.0"
    assert list(rows[0])[:5] == ["hora_utc", "icao", "red", "variable", "obs"]


def test_una_sola_ubicacion_devuelve_objeto():
    fc = verify.fetch_forecasts(
        STATIONS[:1], DAY, get=lambda u: json.dumps(fake_doc(0)).encode(), sleep=lambda s: None
    )
    assert set(fc) == {"SKBO"}
