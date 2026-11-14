"""Pruebas de rayos GOES GLM (T-55) con archivos HDF5 sintéticos (estructura de los reales)."""

import io
import urllib.error
from datetime import UTC, datetime

import h5py
import numpy as np
import pytest

from windcloud_pipeline import lightning

NOW = datetime(2026, 11, 14, 16, 46, 10, tzinfo=UTC)


def glm_file(lats, lons, quality=None, energy_raw=None) -> bytes:
    """Como los GLM reales: lat/lon float32; energía int16 «sin signo» con escala; calidad int16."""
    buf = io.BytesIO()
    n = len(lats)
    with h5py.File(buf, "w") as f:
        f["flash_lat"] = np.array(lats, dtype=np.float32)
        f["flash_lon"] = np.array(lons, dtype=np.float32)
        q = f.create_dataset(
            "flash_quality_flag", data=np.array(quality or [0] * n, dtype=np.int16)
        )
        q.attrs["_Unsigned"] = b"true"
        q.attrs["_FillValue"] = np.array([-1], dtype=np.int16)
        e = f.create_dataset(
            "flash_energy",
            data=np.array(energy_raw or [100] * n, dtype=np.uint16).view(np.int16),
        )
        e.attrs["scale_factor"] = np.array([1e-15], dtype=np.float32)
        e.attrs["add_offset"] = np.array([0.0], dtype=np.float32)
        e.attrs["_Unsigned"] = b"true"
        e.attrs["_FillValue"] = np.array([-1], dtype=np.int16)
    return buf.getvalue()


def key(hhmmss: str, doy="318") -> str:
    stamp = f"2026{doy}{hhmmss}0"
    return f"GLM-L2-LCFA/2026/{doy}/{hhmmss[:2]}/OR_GLM-L2-LCFA_G19_s{stamp}_e{stamp}_c0.nc"


def listing(*keys) -> bytes:
    return (
        "<ListBucketResult>"
        + "".join(f"<Contents><Key>{k}</Key></Contents>" for k in keys)
        + "</ListBucketResult>"
    ).encode()


def test_hora_de_inicio_desde_el_nombre_del_archivo():
    assert lightning.file_start(key("164500")) == datetime(2026, 11, 14, 16, 45, tzinfo=UTC)
    assert lightning.file_start("otro.nc") is None
    assert lightning.hour_prefix(NOW) == "GLM-L2-LCFA/2026/318/16/"


def test_ventana_que_cruza_la_hora_pide_ambas_horas():
    now = datetime(2026, 11, 14, 17, 5, tzinfo=UTC)
    asked = []

    def get(url):
        asked.append(url)
        if "/318/16/" in url:
            return listing(key("164900"), key("165100"))
        return listing(key("170000"), key("170500"), key("170520"))

    keys = lightning.keys_in_window(now, 15, get)
    assert len(asked) == 2
    assert [t.strftime("%H%M%S") for t, _ in keys] == [
        "165100",
        "170000",
        "170500",
    ]  # (16:50, 17:05]


def test_lee_descargas_buenas_dentro_de_colombia_con_energia_escalada():
    data = glm_file(
        lats=[4.6, 4.7, 30.0, 5.0],
        lons=[-74.1, -74.0, -74.0, -75.0],
        quality=[0, 0, 0, 3],
        energy_raw=[100, 40000, 1, 1],
    )
    lat, lon, energy = lightning.read_flashes(data)
    assert lat.tolist() == pytest.approx([4.6, 4.7])  # fuera del bbox y de mala calidad: fuera
    assert energy.tolist() == pytest.approx([100.0, 40000.0], rel=1e-6)  # 40000 > 32767: sin signo


def test_collect_arma_el_json_con_la_edad_de_cada_rayo():
    files = {
        key("164500"): glm_file([4.6], [-74.1]),
        key("164540"): glm_file([10.0, 11.0], [-75.0, -76.0]),
    }

    def get(url):
        if "list-type" in url:
            return listing(*files)
        return files[url.split(".com/")[1]]

    data = lightning.collect(NOW, 15, get=get, sleep=lambda s: None)
    assert data["archivos"] == 2 and data["fallidos"] == 0 and data["minutos"] == 15
    assert data["hasta"] == "2026-11-14T16:46:10Z"
    assert data["rayos"] == [
        [4.6, -74.1, 70, 100.0],
        [10.0, -75.0, 30, 100.0],
        [11.0, -76.0, 30, 100.0],
    ]


def test_un_archivo_roto_se_cuenta_y_si_fallan_todos_es_error():
    files = {key("164500"): b"no es hdf5", key("164540"): glm_file([4.6], [-74.1])}

    def get(url):
        if "list-type" in url:
            return listing(*files)
        return files[url.split(".com/")[1]]

    data = lightning.collect(NOW, 15, get=get, sleep=lambda s: None)
    assert data["fallidos"] == 1 and len(data["rayos"]) == 1

    def down(url):
        if "list-type" in url:
            return listing(key("164500"))
        raise urllib.error.URLError("caído")

    with pytest.raises(RuntimeError):
        lightning.collect(NOW, 15, get=down, sleep=lambda s: None)
