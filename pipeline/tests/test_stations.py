"""T-40: selección de estaciones METAR (sin red; frontera = GeoJSON real)."""

from collections import Counter

import pytest

from windcloud_pipeline import stations


@pytest.fixture(scope="module")
def colombia():
    return stations.colombia_shape()


def st(icao, lat, lon, country, site_type=("METAR", "TAF")):
    return {
        "icaoId": icao,
        "lat": lat,
        "lon": lon,
        "country": country,
        "elev": 10,
        "site": icao.title(),
        "siteType": list(site_type),
    }


def test_distancia_cero_dentro_y_positiva_fuera(colombia):
    shape, _ = colombia
    assert stations.km_to_colombia(-74.15, 4.70, shape) == 0.0  # Bogotá
    km_caracas = stations.km_to_colombia(-66.99, 10.60, shape)
    assert 300 < km_caracas < 700
    km_cucuta_ve = stations.km_to_colombia(-72.36, 7.84, shape)  # San Antonio del Táchira
    assert km_cucuta_ve < 20


def test_departamento(colombia):
    _, fc = colombia
    assert stations.department_of(-75.42, 6.17, fc) == "Antioquia"  # Rionegro
    assert stations.department_of(-60.0, 0.0, fc) is None


def test_seleccion(colombia):
    shape, fc = colombia
    catalog = [
        st("SKBO", 4.70, -74.15, "CO"),
        st("SKSV", 2.15, -74.77, "CO"),  # mudo
        st("SVSA", 7.84, -72.44, "VE"),  # vecino cerca de la frontera
        st("SVMI", 10.60, -66.99, "VE"),  # Caracas, lejos
        st("SKXX", 5.0, -74.0, "CO", site_type=()),  # sin METAR
        {"icaoId": None, "lat": 0, "lon": 0, "country": "CO", "siteType": ["METAR"]},
    ]
    reports = Counter({"SKBO": 24, "SKSV": 2, "SVSA": 12, "SVMI": 24, "SKXX": 24})
    got = stations.select_stations(catalog, reports, shape, fc, max_km=100, min_reports=6)
    assert [s["icao"] for s in got] == ["SKBO", "SVSA"]
    bog = got[0]
    assert bog["departamento"] == "Bogotá D.C."
    assert bog["km_a_colombia"] == 0 and bog["reportes_24h"] == 24 and bog["red"] == "METAR"
    assert got[1]["departamento"] is None and got[1]["pais"] == "VE"
