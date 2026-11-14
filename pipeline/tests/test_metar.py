"""metar.py: tope de 400 registros, reintentos y lectura de la lluvia (sin red)."""

import json
import urllib.error

import pytest

from windcloud_pipeline import metar


@pytest.mark.parametrize(
    ("wx", "rain"),
    [
        ("RA", True),
        ("-DZ", True),
        ("+TSRA", True),
        ("SHRA BR", True),
        ("BCFG", False),
        ("VCSH", False),  # en la vecindad, no en la estación
        ("TS", False),  # trueno sin lluvia
        ("BR", False),
        (None, False),
        ("", False),
    ],
)
def test_precip_now(wx, rain):
    assert metar.precip_now(wx) is rain


def test_precip_recent_ignora_observaciones():
    assert metar.precip_recent("METAR SKUI 121700Z 05004KT 9999 BKN015 29/28 Q1009 RERA")
    assert metar.precip_recent("METAR SKUI 121700Z 05004KT 9999 BKN015 29/28 Q1009 RETSRA")
    assert not metar.precip_recent("METAR SKBO 131200Z 14015KT 9999 BKN030 14/10 Q1029 RMK RERA")
    assert not metar.precip_recent("METAR SKBO 131200Z 14015KT 9999 VCSH BKN030 14/10 Q1029")


def test_viento_en_kmh():
    assert metar.wind_kmh({"wspd": 10}) == 18.5
    assert metar.wind_kmh({"wspd": None}) is None


def test_parte_lotes_que_tocan_el_tope():
    """La API corta en 400 sin avisar: el lote se divide hasta que cada respuesta quepa."""
    per_station = 150
    urls = []

    def get(url):
        urls.append(url)
        ids = url.split("ids=")[1].split("&")[0].split(",")
        rows = [{"icaoId": i, "obsTime": t} for i in ids for t in range(per_station)]
        return json.dumps(rows[: metar.MAX_RECORDS]).encode()

    ids = ["A", "B", "C", "D"]
    rows = metar.fetch_metars(ids, get=get, sleep=lambda s: None, batch=4)
    assert len(rows) == 4 * per_station
    assert {r["icaoId"] for r in rows} == set(ids)
    assert len(urls) == 3  # 4 (cortado) → 2 + 2


def test_fecha_en_la_url():
    urls = []
    metar.fetch_metars(
        ["SKBO"],
        hours=25,
        date="20261112_2359",
        get=lambda u: urls.append(u) or b"[]",
        sleep=lambda s: None,
    )
    assert "hours=25" in urls[0] and "date=20261112_2359" in urls[0]


def test_una_estacion_sobre_el_tope_falla():
    rows = json.dumps([{"icaoId": "A"}] * metar.MAX_RECORDS).encode()
    with pytest.raises(RuntimeError, match="acortar"):
        metar.fetch_metars(["A"], get=lambda u: rows, sleep=lambda s: None)


def test_fetch_json_reintenta():
    calls, waits = [], []

    def get(url):
        calls.append(url)
        if len(calls) < 3:
            raise urllib.error.URLError("504")
        return b'[{"icaoId": "SKBO"}]'

    assert metar.fetch_json("u", get=get, sleep=waits.append) == [{"icaoId": "SKBO"}]
    assert waits == [3.0, 10.0]


def test_fetch_json_falla_tras_reintentos():
    def get(url):
        raise TimeoutError

    with pytest.raises(RuntimeError, match="reintentos"):
        metar.fetch_json("u", get=get, sleep=lambda s: None)


def test_tras_429_espera_a_que_se_reponga_el_limite():
    waits, calls = [], []

    def get(url):
        calls.append(url)
        if len(calls) == 1:
            raise urllib.error.HTTPError(url, 429, "Too Many Requests", {}, None)
        return b"[]"

    assert metar.fetch_json("u", get=get, sleep=waits.append) == []
    assert waits == [metar.RATE_LIMIT_WAIT_S]


def test_429_seguidos_esperan_mas_y_el_error_dice_la_causa():
    waits = []

    def get(url):
        raise urllib.error.HTTPError(url, 429, "Too Many Requests", {}, None)

    with pytest.raises(RuntimeError, match=r"HTTP 429"):
        metar.fetch_json("u", get=get, sleep=waits.append)
    assert waits == list(metar.RATE_LIMIT_WAITS_S)


def test_un_error_comun_dice_su_causa():
    def get(url):
        raise urllib.error.HTTPError(url, 503, "Unavailable", {}, None)

    with pytest.raises(RuntimeError, match=r"\(HTTP 503\)"):
        metar.fetch_json("u", get=get, sleep=lambda s: None)
