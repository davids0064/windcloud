"""Pruebas de la codificación PNG + meta.json (T-32)."""

import json
import shutil
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from windcloud_pipeline import encode, grids

FIX = Path(__file__).parent / "fixtures"


def test_filas_mercator_van_de_norte_a_sur_con_pixeles_cuadrados():
    lats = encode.mercator_lats(25, -20, 201, -100, -50)
    assert lats[0] == pytest.approx(25) and lats[-1] == pytest.approx(-20)
    assert np.all(np.diff(lats) < 0)
    # equiespaciadas en Mercator, no en latitud
    assert np.allclose(np.diff(encode.merc_y(lats)), np.diff(encode.merc_y(lats))[0])
    assert 180 <= len(lats) <= 190  # 201 columnas × (45,9 / 50) ≈ 185 filas


def test_remuestreo_exacto_en_los_nodos_y_lineal_entre_ellos():
    src = np.array([10.0, 5.0, 0.0])  # norte → sur
    field = np.array([[100.0], [50.0], [0.0]])
    out = encode.resample_rows(field, src, np.array([10.0, 7.5, 0.0, 2.5]))
    assert out[:, 0].tolist() == pytest.approx([100.0, 75.0, 0.0, 25.0])


def test_corrige_el_desplazamiento_que_tendria_una_imagen_lat_lon():
    # La fila del medio remuestreada debe estar en la mitad del rango Mercator (~2,71°),
    # no en la mitad de latitudes (2,5°): esa diferencia (~23 km) es el error que se evita.
    lats = encode.mercator_lats(25, -20, 201, -100, -50)
    assert lats[len(lats) // 2] == pytest.approx(2.71, abs=0.15)


def test_viento_ida_y_vuelta_con_error_menor_a_un_escalon():
    rng = np.random.default_rng(0)
    u = rng.uniform(-20, 15, (30, 40)).astype(np.float32)
    v = rng.uniform(-10, 25, (30, 40)).astype(np.float32)
    u[0, 0] = np.nan
    rgba, r = encode.encode_wind(u, v)
    assert rgba.shape == (30, 40, 4) and rgba.dtype == np.uint8
    assert rgba[0, 0, 3] == 0 and rgba[1, 1, 3] == 255  # sin dato → transparente
    du = r["uMin"] + rgba[..., 0] / 255 * (r["uMax"] - r["uMin"])
    step = (r["uMax"] - r["uMin"]) / 255
    assert np.nanmax(np.abs(du - u)[1:, 1:]) <= step / 2 + 1e-3
    with pytest.raises(ValueError):
        encode.encode_wind(np.full((2, 2), np.nan), np.full((2, 2), np.nan))


def test_escalares_rango_fijo_recorte_y_raiz_cuadrada():
    tcc = encode.SCALARS["tcc"]
    la = encode.encode_scalar(np.array([[0.0, 50.0, 100.0, 140.0, np.nan]]), tcc)
    assert la[0, :, 0].tolist() == [0, 128, 255, 255, 0]
    assert la[0, :, 1].tolist() == [255, 255, 255, 255, 0]
    rain = encode.SCALARS["prate"]
    x = np.array([[0.1, 1.0, 5.0, 30.0]])
    back = encode.decode_scalar(encode.encode_scalar(x, rain)[..., 0], rain)
    assert back[0].tolist() == pytest.approx(x[0].tolist(), rel=0.12, abs=0.02)
    # la raíz cuadrada da más resolución a la llovizna que una escala lineal
    assert encode.encode_scalar(np.array([[0.5]]), rain)[0, 0, 0] > 20


def test_rafaga_nunca_menor_que_el_viento_medio():
    f = {
        "u10": np.array([[3.0]]),
        "v10": np.array([[4.0]]),  # 5 m/s
        "gust": np.array([[2.0]]),  # GFS: menor que el viento (no físico)
        "tcc": np.array([[10.0]]),
        "prate": np.array([[0.001]]),
    }
    step = grids.GridStep(None, 3, np.array([0.0]), np.array([0.0]), f)  # type: ignore[arg-type]
    s = encode.scalar_fields(step)
    assert s["gust"][0, 0] == pytest.approx(5 * 3.6)
    assert s["prate"][0, 0] == pytest.approx(3.6)


def test_codifica_un_run_real_con_meta_y_escritura_atomica(tmp_path):
    run_dir = tmp_path / "gfs" / "2026111306"
    run_dir.mkdir(parents=True)
    for f in ("f000", "f003"):
        shutil.copy(FIX / f"gfs_bogota_{f}.grib2", run_dir / f"{f}.grib2")
    out = encode.encode_run(run_dir, tmp_path / "web")

    assert out == tmp_path / "web" / "gfs" / "2026111306"
    assert not (tmp_path / "web" / "gfs" / "2026111306.tmp").exists()
    meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    assert meta["schema"] == 1 and meta["run"] == "2026-11-13T06:00:00Z"
    assert meta["steps"] == [0, 3] and meta["validTimes"][1] == "2026-11-13T09:00:00Z"
    assert meta["bounds"] == {"west": -76.0, "east": -72.0, "north": 7.0, "south": 3.0}
    assert meta["projection"] == "mercator-rows"
    assert list(meta["wind"]["levels"]) == ["10m", "850", "500"]
    assert meta["scalars"]["prate"]["transform"] == "sqrt"
    assert meta["scalars"]["prate"]["steps"] == [0, 3]

    img = Image.open(out / "wind_10m_003.png")
    assert img.mode == "RGBA" and img.size == (meta["width"], meta["height"])
    assert Image.open(out / "gust_000.png").mode == "LA"
    assert len(list(out.glob("*.png"))) == 2 * (3 + 4)  # 3 vientos + ráfaga, nubes, lluvia, temp.

    # Re-codificar reemplaza sin dejar restos
    encode.encode_run(run_dir, tmp_path / "web")
    assert len(list(out.glob("*.png"))) == 14


def test_el_valor_decodificado_coincide_con_el_grib_en_bogota(tmp_path):
    run_dir = tmp_path / "r" / "2026111306"
    run_dir.mkdir(parents=True)
    shutil.copy(FIX / "gfs_bogota_f003.grib2", run_dir / "f003.grib2")
    out = encode.encode_run(run_dir, tmp_path / "web")
    meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    g = grids.read_step(run_dir / "f003.grib2")
    i = int(np.argmin(abs(g.lats - 4.75)))
    j = int(np.argmin(abs(g.lons - -74.0)))
    lats = encode.mercator_lats(7, 3, 17, -76, -72)  # misma rejilla que encode_run
    k = int(np.argmin(abs(lats - g.lats[i])))
    px = np.asarray(Image.open(out / "tcc_003.png"))[k, j, 0]
    tcc = encode.decode_scalar(np.array(px), encode.SCALARS["tcc"])
    assert float(tcc) == pytest.approx(float(g.fields["tcc"][i, j]), abs=4)
    r = meta["wind"]["levels"]["10m"]["frames"][0]
    u_px = np.asarray(Image.open(out / "wind_10m_003.png"))[k, j, 0]
    u = r["uMin"] + u_px / 255 * (r["uMax"] - r["uMin"])
    assert u == pytest.approx(float(g.fields["u10"][i, j]), abs=0.5)


def test_latest_json_apunta_al_run_mas_reciente_y_no_retrocede(tmp_path):
    from datetime import UTC, datetime

    d = tmp_path / "gfs"
    d.mkdir()
    encode.write_latest(d, datetime(2026, 11, 13, 6, tzinfo=UTC))
    assert json.loads((d / "latest.json").read_text()) == {
        "run": "2026-11-13T06:00:00Z",
        "meta": "2026111306/meta.json",
    }
    encode.write_latest(d, datetime(2026, 11, 13, 12, tzinfo=UTC))
    encode.write_latest(d, datetime(2026, 11, 13, 0, tzinfo=UTC))  # más viejo: se ignora
    assert json.loads((d / "latest.json").read_text())["run"] == "2026-11-13T12:00:00Z"
    assert not list(d.glob("*.tmp"))


def test_temperatura_en_celsius_y_rango_fijo():
    g = grids.read_step(FIX / "gfs_bogota_f003.grib2")
    t = encode.scalar_fields(g)["t2m"]
    assert -5 < float(np.nanmin(t)) and float(np.nanmax(t)) < 40  # Andes fríos, valles cálidos
    assert encode.SCALARS["t2m"].units == "°C"


def test_isobaras_cada_2_hpa_en_lon_lat():
    g = grids.read_step(FIX / "gfs_bogota_f003.grib2")
    fc = encode.isobars(g)
    assert fc["type"] == "FeatureCollection" and fc["features"]
    levels = {f["properties"]["hpa"] for f in fc["features"]}
    assert all(lv % 2 == 0 for lv in levels)
    hpa = g.fields["prmsl"] / 100
    assert min(levels) >= np.floor(np.nanmin(hpa)) - 2
    assert max(levels) <= np.ceil(np.nanmax(hpa)) + 2
    for f in fc["features"]:
        for lon, lat in f["geometry"]["coordinates"]:
            assert -76 <= lon <= -72 and 3 <= lat <= 7


def test_el_run_codificado_incluye_isobaras_en_meta(tmp_path):
    run_dir = tmp_path / "gfs" / "2026111306"
    run_dir.mkdir(parents=True)
    shutil.copy(FIX / "gfs_bogota_f003.grib2", run_dir / "f003.grib2")
    out = encode.encode_run(run_dir, tmp_path / "web")
    meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    assert meta["isobars"]["steps"] == [3] and meta["isobars"]["every"] == 2
    assert (out / "isobars_003.geojson").exists()
    assert meta["scalars"]["t2m"]["min"] == -10


def test_suavizado_conserva_constantes_y_reduce_el_ruido():
    flat = np.full((10, 12), 1012.0)
    assert np.allclose(encode.smooth(flat, 3), flat)
    rng = np.random.default_rng(1)
    noisy = 1012 + rng.normal(0, 3, (40, 40))  # "ruido de montaña"
    assert encode.smooth(noisy, 3).std() < noisy.std() / 3
    ramp = np.tile(np.linspace(1008, 1016, 30), (20, 1))  # gradiente real: se conserva
    assert np.allclose(encode.smooth(ramp, 3)[:, 5:-5], ramp[:, 5:-5], atol=1e-6)
