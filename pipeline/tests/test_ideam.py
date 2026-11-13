"""sources/ideam.py: hora local → UTC, duplicados, control de calidad y selección (sin red)."""

import json
import urllib.parse
from datetime import UTC, date, datetime

from windcloud_pipeline import verify
from windcloud_pipeline.sources import ideam

DAY = date(2026, 11, 11)
ST = [{"icao": "IDEAM-21205791", "codigo": "0021205791", "red": "IDEAM", "lat": 4.7, "lon": -74.1}]


def test_hora_local_a_utc_y_ventana():
    assert ideam.to_utc("2026-11-12T13:00:00.000") == datetime(2026, 11, 12, 18, tzinfo=UTC)
    # día UTC 11/11 = 10/11 19:00 … 11/11 18:59 locales (+ la hora previa, para la lluvia de 00Z)
    assert ideam.local_window(DAY) == ("2026-11-10T18:00:00", "2026-11-11T18:59:59")


def test_nombre_e_id():
    assert ideam.clean_name("LLORO  [11035010]") == "Lloro"
    assert ideam.clean_name("Bellavista - Aut") == "Bellavista"
    assert ideam.clean_name("AEROPUERTO LA NUBIA - AUT [26155110]") == "Aeropuerto La Nubia"
    assert ideam.station_id("0021205791") == "IDEAM-21205791"


def test_control_de_calidad():
    t = {datetime(2026, 11, 11, h, tzinfo=UTC): 14.0 + h * 0.1 for h in range(10)}
    t[datetime(2026, 11, 11, 10, tzinfo=UTC)] = 0.0  # cero falso (salto > 12 °C de la mediana)
    t[datetime(2026, 11, 11, 11, tzinfo=UTC)] = 60.0  # fuera de rango
    ok = ideam.qc_series("temperatura", t)
    assert len(ok) == 10 and min(ok.values()) == 14.0
    stuck = {datetime(2026, 11, 11, h, tzinfo=UTC): 3.6 for h in range(8)}
    assert ideam.qc_series("viento", stuck) == {}  # sensor pegado


def fake_soql(url: str) -> bytes:
    q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)["$query"][0]
    ds = url.split("/resource/")[1].split(".json")[0]
    if ds == ideam.DATASETS["lluvia"]:
        # 12:xx local → hora que acaba 13:00 local = 18Z; 30 mm en una lectura → descartada
        rows = [
            {
                "codigoestacion": "0021205791",
                "d": "2026-11-11T00:00:00.000",
                "h": "12",
                "mx": "0.4",
            },
            {"codigoestacion": "0021205791", "d": "2026-11-11T00:00:00.000", "h": "14", "mx": "30"},
            {"codigoestacion": "0021205791", "d": "2026-11-11T00:00:00.000", "h": "15", "mx": "0"},
        ]
    else:
        assert "date_extract_mm(fechaobservacion) = 0" in q and "avg(valorobservado)" in q
        v = "18.6" if ds == ideam.DATASETS["temperatura"] else "2.5"  # m/s
        rows = [
            {
                "codigoestacion": "0021205791",
                "fechaobservacion": f"2026-11-11T{h:02d}:00:00.000",
                "v": v,
            }
            for h in (13, 16)
        ]
    assert "0021205791" in q
    return json.dumps(rows).encode()


def test_observaciones_horarias_en_utc():
    obs = ideam.hourly_observations(DAY, ST, get=fake_soql, sleep=lambda s: None)["IDEAM-21205791"]
    h = {t.hour: v for t, v in obs.items()}
    assert h[18] == {
        "temperatura": 18.6,
        "viento": 9.0,
        "lluvia": 1,
    }  # 13:00 local; 2,5 m/s = 9 km/h
    assert 20 not in h  # solo había lluvia y era imposible (30 mm en una lectura): hora sin dato
    assert h[21] == {"temperatura": 18.6, "viento": 9.0, "lluvia": 0}


def test_seleccion_una_por_celda_y_lejos_de_metar():
    meta = {
        "A": {
            "nombreestacion": "A [1]",
            "lat": "5.01",
            "lon": "-75.01",
            "horas": dict(temperatura=24, viento=24, lluvia=24),
        },
        "B": {
            "nombreestacion": "B [2]",
            "lat": "5.05",
            "lon": "-75.05",
            "horas": dict(temperatura=20, viento=20, lluvia=20),
        },
        "C": {
            "nombreestacion": "C [3]",
            "lat": "4.70",
            "lon": "-74.15",
            "horas": dict(temperatura=24, viento=24, lluvia=24),
        },
        "D": {
            "nombreestacion": "D [4]",
            "lat": "7.00",
            "lon": "-73.00",
            "horas": dict(temperatura=24, viento=5, lluvia=24),
        },
    }
    metar = [{"lat": 4.7016, "lon": -74.1469}]  # El Dorado
    got = ideam.select_stations(meta, metar)
    assert [s["codigo"] for s in got] == [
        "A"
    ]  # B misma celda con menos horas; C junto a SKBO; D poco viento
    assert got[0]["red"] == "IDEAM" and got[0]["nombre"] == "A"


def test_altitud_del_dem():
    st = [{"lat": 4.7, "lon": -74.1}, {"lat": 6.2, "lon": -75.6}]
    ideam.add_elevation(st, get=lambda u: b'{"elevation": [2547.4, 1495.0]}', sleep=lambda s: None)
    assert [s["elev_m"] for s in st] == [2547, 1495]


def test_verify_day_por_red(tmp_path):
    """verify_day con network="IDEAM" usa el adaptador y escribe en pares/ideam/."""

    def get(url):
        if "datos.gov.co" in url:
            return fake_soql(url)
        times = [f"2026-11-11T{h:02d}:00" for h in range(24)]
        hourly = {"time": times}
        for api in verify.VARIABLES.values():
            for m in verify.MODELS:
                for d in verify.LEADS:
                    hourly[f"{api}_previous_day{d}_{m}"] = [17.0] * 24
        return json.dumps({"hourly": hourly}).encode()

    stations = [
        {**ST[0], "elev_m": 2547},
        {"icao": "SKBO", "red": "METAR", "lat": 4.7, "lon": -74.1},
    ]
    path = verify.verify_day(
        DAY, stations, tmp_path, get=get, sleep=lambda s: None, network="IDEAM"
    )
    assert path == tmp_path / "ideam" / "2026-11-11.csv.gz"
    rows = verify.read_pairs(path)
    assert {r["icao"] for r in rows} == {"IDEAM-21205791"} and {r["red"] for r in rows} == {"IDEAM"}


def test_cargar_estaciones_de_todas_las_redes(tmp_path):
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    a.write_text(json.dumps({"stations": [{"icao": "SKBO"}]}))
    b.write_text(json.dumps({"stations": [{"icao": "IDEAM-1", "red": "IDEAM"}]}))
    got = verify.load_stations({"METAR": a, "IDEAM": b, "OTRA": tmp_path / "no.json"})
    assert [(s["icao"], s["red"]) for s in got] == [("SKBO", "METAR"), ("IDEAM-1", "IDEAM")]
