"""Pruebas de la simplificación de departamentos (T-11)."""

import json

import shapely
from shapely.geometry import shape

from windcloud_pipeline.geo import (
    ATTRIBUTION,
    dumps_compact,
    normalize_name,
    simplify_departments,
)


def _square_with_wiggly_edge(x0: float, name: str, iso: str) -> dict:
    """Cuadrado de 1° con su borde derecho (x0+1) lleno de puntos casi colineales."""
    right = [[x0 + 1 + (0.001 if i % 2 else 0), i / 20] for i in range(21)]
    ring = [[x0, 0], *right, [x0, 1], [x0, 0]]
    return {
        "type": "Feature",
        "properties": {"shapeName": name, "shapeISO": iso, "shapeID": "x"},
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }


def _neighbors() -> dict:
    """Dos departamentos vecinos que comparten exactamente el borde x=1."""
    left = _square_with_wiggly_edge(0, "Bogota Capital District", "CO-DC")
    right_ring = [list(p) for p in reversed(left["geometry"]["coordinates"][0][1:22])]
    right_ring = [*right_ring, [2, 0], [2, 1], right_ring[0]]  # (1,1)→borde→(1,0)→(2,0)→(2,1)
    right = {
        "type": "Feature",
        "properties": {"shapeName": "Meta", "shapeISO": "CO-MET", "shapeID": "y"},
        "geometry": {"type": "Polygon", "coordinates": [right_ring]},
    }
    return {"type": "FeatureCollection", "features": [left, right]}


def test_normaliza_nombres_al_espanol():
    assert normalize_name("Bogota Capital District") == "Bogotá D.C."
    assert normalize_name("Antioquia") == "Antioquia"


def test_simplifica_y_reduce_vertices():
    original = _neighbors()
    result = simplify_departments(original, tolerance=0.01)
    before = sum(len(f["geometry"]["coordinates"][0]) for f in original["features"])
    after = sum(len(f["geometry"]["coordinates"][0]) for f in result["features"])
    assert after < before / 2


def test_fronteras_compartidas_sin_huecos_ni_solapes():
    result = simplify_departments(_neighbors(), tolerance=0.01)
    a, b = (shape(f["geometry"]) for f in result["features"])
    assert a.is_valid and b.is_valid
    assert a.intersection(b).area < 1e-9  # sin solapes
    union = shapely.union_all([a, b])
    assert abs(union.area - 2.0) < 0.005  # sin huecos: cubre los dos cuadrados


def test_propiedades_minimas_orden_y_atribucion():
    result = simplify_departments(_neighbors())
    assert [f["properties"] for f in result["features"]] == [
        {"nombre": "Bogotá D.C.", "iso": "CO-DC"},
        {"nombre": "Meta", "iso": "CO-MET"},
    ]
    assert result["attribution"] == ATTRIBUTION
    assert "OpenStreetMap" in ATTRIBUTION and "ODbL" in ATTRIBUTION


def test_redondea_coordenadas_y_json_compacto():
    result = simplify_departments(_neighbors(), decimals=3)
    coords = result["features"][0]["geometry"]["coordinates"][0]
    assert all(len(str(v).split(".")[-1]) <= 3 for p in coords for v in p)
    text = dumps_compact(result)
    assert '", "' not in text and "], [" not in text  # separadores sin espacios
    assert json.loads(text)["features"][0]["properties"]["nombre"] == "Bogotá D.C."
