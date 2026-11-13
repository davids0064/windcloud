"""Límites departamentales de Colombia para el mapa (T-11, RF-1).

Descarga geoBoundaries ADM1 de Colombia (fijado a un commit para que sea reproducible),
simplifica las geometrías como *cobertura* (las fronteras compartidas se simplifican igual en
ambos lados, sin huecos ni solapes), redondea coordenadas y escribe un GeoJSON ligero para
``web/public/geo/``.

Fuente: geoBoundaries gbOpen COL ADM1 (datos de OpenStreetMap, licencia ODbL 1.0).
Uso:  uv run python -m windcloud_pipeline.geo [--tolerancia 0.01] [--salida RUTA] [--entrada RUTA]
"""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import urllib.request
from pathlib import Path
from typing import Any

import certifi
import shapely
from shapely.geometry import mapping, shape

GEOBOUNDARIES_URL = (
    "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/COL/ADM1/"
    "geoBoundaries-COL-ADM1_simplified.geojson"
)
ATTRIBUTION = "geoBoundaries (Runfola et al.) · datos © colaboradores de OpenStreetMap, ODbL 1.0"
DEFAULT_OUTPUT = (
    Path(__file__).resolve().parents[3] / "web/public/geo/colombia-departamentos.geojson"
)
MAX_BYTES = 300_000  # presupuesto de T-11

# Nombres oficiales en español cuando la fuente los trae en inglés o abreviados.
NAME_FIXES = {
    "Bogota Capital District": "Bogotá D.C.",
    "Archipiélago de San Andrés, Providencia y Santa Catalina": "San Andrés y Providencia",
}


def normalize_name(name: str) -> str:
    return NAME_FIXES.get(name, name)


def _round_coords(obj: Any, decimals: int) -> Any:
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(float(v), decimals) for v in obj]
        return [_round_coords(v, decimals) for v in obj]
    return obj


def simplify_departments(
    collection: dict[str, Any], tolerance: float = 0.01, decimals: int = 4
) -> dict[str, Any]:
    """Simplifica la cobertura de departamentos y deja solo ``nombre`` e ``iso`` como propiedades.

    ``tolerance`` va en grados (0,01° ≈ 1,1 km); ``decimals=4`` ≈ 11 m de precisión.
    """
    features = collection["features"]
    geoms = [shape(f["geometry"]) for f in features]
    simplified = shapely.coverage_simplify(geoms, tolerance)

    out = []
    for feature, geom in zip(features, simplified, strict=True):
        if geom.is_empty:
            continue
        props = feature["properties"]
        out.append(
            {
                "type": "Feature",
                "properties": {
                    "nombre": normalize_name(props["shapeName"]),
                    "iso": props.get("shapeISO", ""),
                },
                "geometry": _round_coords(mapping(geom), decimals),
            }
        )
    out.sort(key=lambda f: f["properties"]["nombre"])
    return {
        "type": "FeatureCollection",
        "attribution": ATTRIBUTION,
        "source": GEOBOUNDARIES_URL,
        "features": out,
    }


def dumps_compact(collection: dict[str, Any]) -> str:
    return json.dumps(collection, ensure_ascii=False, separators=(",", ":"))


def download(url: str = GEOBOUNDARIES_URL) -> dict[str, Any]:
    # Certificados de certifi: el Python de python.org en macOS no trae CA del sistema.
    context = ssl.create_default_context(cafile=certifi.where())
    req = urllib.request.Request(url, headers={"User-Agent": "WindCloud-pipeline"})
    with urllib.request.urlopen(req, timeout=60, context=context) as resp:  # noqa: S310 (URL fija de geoBoundaries)
        return json.load(resp)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--tolerancia", type=float, default=0.01, help="grados (0,01 ≈ 1,1 km)")
    parser.add_argument("--salida", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--entrada", type=Path, help="GeoJSON ya descargado (si no, se descarga)")
    args = parser.parse_args(argv)

    source = json.loads(args.entrada.read_text(encoding="utf-8")) if args.entrada else download()
    result = simplify_departments(source, tolerance=args.tolerancia)
    text = dumps_compact(result)
    size = len(text.encode("utf-8"))
    if size > MAX_BYTES:
        print(f"✗ {size:,} bytes supera el presupuesto de {MAX_BYTES:,}", file=sys.stderr)
        return 1
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_text(text, encoding="utf-8")
    print(f"✓ {len(result['features'])} departamentos · {size:,} bytes → {args.salida}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
