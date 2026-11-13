"""Pruebas de descarga y lectura de rejillas GFS (T-30) con GRIB2 reales recortados (fixtures)."""

import json
import urllib.error
import urllib.parse
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pytest

from windcloud_pipeline import grids

FIX = Path(__file__).parent / "fixtures"
RUN = datetime(2026, 11, 13, 6, tzinfo=UTC)


def test_ciclo_y_id_de_run():
    assert grids.cycle_floor(datetime(2026, 11, 13, 15, 42, tzinfo=UTC)) == datetime(
        2026, 11, 13, 12, tzinfo=UTC
    )
    assert grids.run_id(RUN) == "2026111306"
    assert grids.parse_run_id("2026111306") == RUN
    with pytest.raises(ValueError):
        grids.parse_run_id("2026111307")


def test_run_mas_reciente_completo_salta_el_que_aun_no_publica():
    # Caso real 15:01 UTC: el run de 12Z aún no tiene f072; el de 06Z sí.
    published = {grids.idx_url(RUN, 72)}
    found = grids.latest_complete_run(
        datetime(2026, 11, 13, 15, 1, tzinfo=UTC), 72, lambda u: u in published
    )
    assert found == RUN
    assert grids.latest_complete_run(RUN, 72, lambda u: False) is None


def test_url_del_filtro_pide_solo_lo_necesario_y_la_region():
    url = grids.filter_url(RUN, 72, "colombia")
    q = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(url).query, keep_blank_values=True))
    assert q["dir"] == "/gfs.20261113/06/atmos"
    assert q["file"] == "gfs.t06z.pgrb2.0p25.f072"
    assert {k for k in q if k.startswith("var_")} == {f"var_{v}" for v in grids.VARIABLES}
    assert q["lev_10_m_above_ground"] == q["lev_850_mb"] == "on"
    assert (q["leftlon"], q["rightlon"], q["bottomlat"], q["toplat"]) == (
        "-100",
        "-50",
        "-20",
        "25",
    )
    assert "subregion" not in dict(
        urllib.parse.parse_qsl(urllib.parse.urlparse(grids.filter_url(RUN, 0, "global")).query)
    )


class FakeGet:
    """Simula NOMADS: lista de respuestas (bytes o excepciones) por llamada."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls: list[str] = []

    def __call__(self, url: str) -> bytes:
        self.calls.append(url)
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def http_error(code: int) -> urllib.error.HTTPError:
    return urllib.error.HTTPError("u", code, "x", None, None)  # type: ignore[arg-type]


def test_reintenta_ante_5xx_y_rechaza_html():
    get = FakeGet(http_error(503), b"<html>error</html>", b"GRIB...datos")
    waits: list[float] = []
    assert grids.fetch_grib("u", get=get, sleep=waits.append) == b"GRIB...datos"
    assert waits == [5.0, 15.0]


def test_404_no_se_reintenta_y_falla_tras_agotar_reintentos():
    with pytest.raises(grids.DownloadError, match="404"):
        grids.fetch_grib("u", get=FakeGet(http_error(404)), sleep=lambda s: None)
    with pytest.raises(grids.DownloadError, match="reintentos"):
        grids.fetch_grib("u", get=FakeGet(*[b"<html>"] * 4), sleep=lambda s: None)


def test_descarga_un_run_con_pausas_reanuda_y_deja_manifiesto(tmp_path):
    real = (FIX / "gfs_bogota_f003.grib2").read_bytes()
    get = FakeGet(real, real)
    sleeps: list[float] = []
    res = grids.download_run(
        RUN, tmp_path, [0, 3], get=get, sleep=sleeps.append, log=lambda m: None
    )
    assert sorted(res.files) == [0, 3]
    assert len(get.calls) == 2 and sleeps == [grids.POLITE_DELAY_S]  # cortesía entre peticiones
    manifest = json.loads((tmp_path / "2026111306" / "download.json").read_text())
    assert manifest["run"] == "2026-11-13T06:00:00Z" and manifest["steps"] == [0, 3]
    assert manifest["bbox"] == [-100.0, -50.0, -20.0, 25.0]
    assert not list((tmp_path / "2026111306").glob("*.part"))
    # Segunda vez: reanuda sin volver a pedir nada.
    get2 = FakeGet()
    grids.download_run(RUN, tmp_path, [0, 3], get=get2, sleep=lambda s: None, log=lambda m: None)
    assert get2.calls == []


def test_lee_campos_reales_orientados_norte_sur():
    g = grids.read_step(FIX / "gfs_bogota_f003.grib2")
    assert g.run == RUN and g.step == 3
    assert g.valid == datetime(2026, 11, 13, 9, tzinfo=UTC)
    assert set(g.fields) == set(grids.FIELDS)  # TCDC a 500/850 hPa se descarta
    assert g.lats[0] > g.lats[-1]  # filas norte → sur
    assert g.lons[0] < g.lons[-1] and g.lons.max() <= 180  # oeste → este, −180…180
    assert g.lats[0] == pytest.approx(7) and g.lons[0] == pytest.approx(-76)
    assert g.fields["u10"].shape == (len(g.lats), len(g.lons)) == (17, 17)
    assert np.nanmax(g.fields["tcc"]) <= 100
    speed_kmh = grids.wind_speed(g.fields["u10"], g.fields["v10"]) * grids.MS_TO_KMH
    assert 0 <= np.nanmin(speed_kmh) and np.nanmax(speed_kmh) < 150  # plausible en los Andes


def test_usa_valores_instantaneos_tambien_en_f000():
    # f000 solo trae PRATE instantánea (no hay intervalo previo): se usa como en los demás pasos.
    g0 = grids.read_step(FIX / "gfs_bogota_f000.grib2")
    assert g0.step == 0 and "prate" in g0.fields
    mmh = g0.fields["prate"] * grids.KGM2S_TO_MMH
    assert 0 <= float(np.nanmin(mmh)) and float(np.nanmax(mmh)) == pytest.approx(7.5, abs=0.1)


def test_en_f003_elige_el_instantaneo_y_no_el_promedio_0_3h():
    import eccodes

    by_type: dict[str, np.ndarray] = {}
    with (FIX / "gfs_bogota_f003.grib2").open("rb") as f:
        while (h := eccodes.codes_grib_new_from_file(f)) is not None:
            if eccodes.codes_get(h, "shortName") == "prate":
                by_type[eccodes.codes_get(h, "stepType")] = eccodes.codes_get_values(h)
            eccodes.codes_release(h)
    assert set(by_type) == {"instant", "avg"}  # GFS envía ambos
    g = grids.read_step(FIX / "gfs_bogota_f003.grib2")
    assert float(np.nanmax(g.fields["prate"])) == pytest.approx(float(by_type["instant"].max()))
    assert float(np.nanmax(g.fields["prate"])) != pytest.approx(float(by_type["avg"].max()))
