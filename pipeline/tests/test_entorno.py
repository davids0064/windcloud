"""Pruebas de humo: el entorno puede leer GRIB2 (eccodes + cfgrib) y escribir PNG."""

import sys

import numpy as np
from PIL import Image


def test_python_312():
    assert sys.version_info[:2] == (3, 12)


def test_eccodes_carga_libreria_nativa():
    import eccodes

    version = eccodes.codes_get_api_version()
    major = int(str(version).split(".")[0])
    assert major >= 2


def test_cfgrib_registra_motor_en_xarray():
    import xarray as xr

    assert "cfgrib" in xr.backends.list_engines()


def test_png_rg_conserva_bytes(tmp_path):
    # Las texturas de viento codifican u en R y v en G (diseño §4.1).
    rgba = np.zeros((2, 3, 4), dtype=np.uint8)
    rgba[..., 0] = 10
    rgba[..., 1] = 200
    rgba[..., 3] = 255
    ruta = tmp_path / "viento.png"
    Image.fromarray(rgba, "RGBA").save(ruta)
    leido = np.asarray(Image.open(ruta))
    assert (leido == rgba).all()
