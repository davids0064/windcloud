"""Pruebas de los focos de calor FIRMS (T-52) sin red ni clave real."""

import json
from datetime import UTC, datetime

import pytest
from shapely.geometry import box

from windcloud_pipeline import fires

KEY = "clave-de-prueba-123"
VIIRS = (
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,"
    "version,bright_ti5,frp,daynight\n"
    "5.5,-72.5,330,0.4,0.4,2026-11-13,603,N20,VIIRS,n,2.0NRT,290,4.2,N\n"
    "5.6,-72.4,340,0.4,0.4,2026-11-14,1812,N20,VIIRS,h,2.0NRT,295,12.7,D\n"
    "8.6,-69.2,305,0.4,0.4,2026-11-14,1812,N20,VIIRS,l,2.0NRT,281,1.0,D\n"  # Venezuela
)
MODIS = (
    "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,"
    "version,bright_t31,frp,daynight\n"
    "4.0,-73.0,301,1.5,1.2,2026-11-14,204,Terra,MODIS,85,6.1NRT,273,16.3,N\n"
)
COLOMBIA = box(-75, 3, -71, 7)
FC = {
    "features": [
        {"properties": {"nombre": "Casanare"}, "geometry": box(-73, 4.5, -71, 7).__geo_interface__},
        {"properties": {"nombre": "Meta"}, "geometry": box(-75, 3, -73, 4.5).__geo_interface__},
    ]
}


def fake_get(responses):
    def get(url):
        for sensor, body in responses.items():
            if f"/{sensor}/" in url:
                if isinstance(body, Exception):
                    raise body
                return body.encode()
        raise AssertionError(url)

    return get


def test_url_de_area_con_bbox_y_dias():
    assert fires.area_url("K", "MODIS_NRT", 2, (-79.2, -4.4, -66.7, 13.6)) == (
        "https://firms.modaps.eosdis.nasa.gov/api/area/csv/K/MODIS_NRT/-79.2,-4.4,-66.7,13.6/2"
    )


def test_confianza_unificada_entre_viirs_y_modis():
    assert [fires.confidence({"confidence": c}) for c in ("l", "n", "h", "10", "50", "80")] == [
        "baja",
        "nominal",
        "alta",
        "baja",
        "nominal",
        "alta",
    ]


def test_recoge_normaliza_y_recorta_a_colombia():
    get = fake_get(
        {
            "VIIRS_NOAA20_NRT": VIIRS,
            "VIIRS_NOAA21_NRT": VIIRS[: VIIRS.index("\n") + 1],
            "MODIS_NRT": MODIS,
        }
    )
    now = datetime(2026, 11, 14, 20, tzinfo=UTC)
    data = fires.collect(KEY, COLOMBIA, FC, get=get, sleep=lambda s: None, now=now)
    assert (
        data["sensores"] == ["VIIRS NOAA-20", "VIIRS NOAA-21", "MODIS"] and data["fallidos"] == {}
    )
    assert data["ventana_h"] == 48 and data["generatedAt"] == "2026-11-14T20:00:00Z"
    focos = data["focos"]
    assert len(focos) == 3  # el de Venezuela queda fuera
    assert [f["hora"] for f in focos] == [
        "2026-11-14T18:12:00Z",
        "2026-11-14T02:04:00Z",
        "2026-11-13T06:03:00Z",
    ]
    assert focos[0] == {
        "lat": 5.6,
        "lon": -72.4,
        "hora": "2026-11-14T18:12:00Z",
        "sensor": "VIIRS NOAA-20",
        "confianza": "alta",
        "frp": 12.7,
        "dia": True,
        "departamento": "Casanare",
    }
    assert focos[1]["sensor"] == "MODIS" and focos[1]["departamento"] == "Meta"


def test_un_sensor_caido_no_tumba_los_demas_y_nunca_filtra_la_clave():
    body = f"Invalid MAP_KEY {KEY}"
    get = fake_get({"VIIRS_NOAA20_NRT": VIIRS, "VIIRS_NOAA21_NRT": body, "MODIS_NRT": MODIS})
    data = fires.collect(KEY, COLOMBIA, None, get=get, sleep=lambda s: None)
    assert "VIIRS NOAA-21" in data["fallidos"]
    assert KEY not in json.dumps(data)
    assert "***" in data["fallidos"]["VIIRS NOAA-21"]
    assert "departamento" not in data["focos"][0]


def test_si_ninguno_responde_es_error_sin_la_clave():
    import urllib.error

    err = urllib.error.URLError(f"timeout en {KEY}")
    get = fake_get({s: err for s in fires.SENSORS})
    with pytest.raises(RuntimeError) as e:
        fires.collect(KEY, COLOMBIA, None, get=get, sleep=lambda s: None)
    assert KEY not in str(e.value)


def test_sin_clave_se_omite_sin_error(monkeypatch, tmp_path, capsys):
    monkeypatch.delenv(fires.KEY_ENV, raising=False)
    assert fires.main(["--salida", str(tmp_path)]) == 0
    assert not (tmp_path / "fires.json").exists()
    assert "Falta FIRMS_MAP_KEY" in capsys.readouterr().err


def test_escritura_atomica(tmp_path):
    p = fires.write({"schema": 1, "focos": []}, tmp_path / "d")
    assert json.loads(p.read_text())["schema"] == 1
    assert not list((tmp_path / "d").glob("*.tmp"))
