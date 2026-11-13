"""Pruebas de ECMWF Open Data (T-31) con mensajes GRIB2 reales recortados (ecmwf_bogota_*)."""

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

import eccodes
import numpy as np
import pytest

from windcloud_pipeline import ecmwf, encode, grids, update

FIX = Path(__file__).parent / "fixtures"
RUN = datetime(2026, 11, 13, 0, tzinfo=UTC)


def index_for(path: Path) -> list[str]:
    """Índice tipo ECMWF (una línea JSON por mensaje con _offset/_length) de un GRIB2 local."""
    lines, offset = [], 0
    names = {
        "10u": ("10u", "sfc", None),
        "10v": ("10v", "sfc", None),
        "10fg": ("10fg", "sfc", None),
        "tcc": ("tcc", "sfc", None),
        "tprate": ("tprate", "sfc", None),
        "2t": ("2t", "sfc", None),
        "msl": ("msl", "sfc", None),
    }
    with path.open("rb") as f:
        while (h := eccodes.codes_grib_new_from_file(f)) is not None:
            length = eccodes.codes_get(h, "totalLength")
            sn = eccodes.codes_get(h, "shortName")
            if sn in ("u", "v"):
                param, levtype, lev = sn, "pl", str(eccodes.codes_get(h, "level"))
            else:
                param, levtype, lev = names[sn]
            entry = {"param": param, "levtype": levtype, "_offset": offset, "_length": length}
            if lev:
                entry["levelist"] = lev
            lines.append(json.dumps(entry))
            offset += length
            eccodes.codes_release(h)
    # Campos que no se usan (deben ignorarse)
    lines.append(
        json.dumps({"param": "z", "levtype": "pl", "levelist": "500", "_offset": 0, "_length": 1})
    )
    lines.append(json.dumps({"param": "lsm", "levtype": "sfc", "_offset": 0, "_length": 1}))
    return lines


def test_urls_y_run_mas_reciente_publicado():
    assert ecmwf.file_url(RUN, 72, "index") == (
        "https://data.ecmwf.int/forecasts/20261113/00z/ifs/0p25/oper/20261113000000-72h-oper-fc.index"
    )
    published = {ecmwf.file_url(RUN, 72, "index")}
    now = datetime(2026, 11, 13, 17, 45, tzinfo=UTC)  # 12Z y 06Z aún sin f072 en este ejemplo
    assert ecmwf.latest_complete_run(now, 72, lambda u: u in published) == RUN


def test_selecciona_solo_los_campos_necesarios():
    entries = ecmwf.select_messages(index_for(FIX / "ecmwf_bogota_f003.grib2"))
    keys = {(e["param"], e.get("levelist")) for e in entries}
    assert ("z", "500") not in keys and ("lsm", None) not in keys
    assert {("10u", None), ("u", "850"), ("v", "500"), ("10fg", None), ("tprate", None)} <= keys
    assert len(entries) == 11


def test_descarga_por_rangos_reconstruye_el_grib(tmp_path):
    src = (FIX / "ecmwf_bogota_f003.grib2").read_bytes()
    idx = "\n".join(index_for(FIX / "ecmwf_bogota_f003.grib2")).encode()
    calls = []

    def get_range(url, start, length):
        calls.append((start, length))
        return src[start : start + length]

    res = ecmwf.download_run(
        RUN,
        tmp_path,
        [3],
        get_text=lambda u: idx,
        get_range=get_range,
        sleep=lambda s: None,
        log=lambda m: None,
    )
    out = res.files[3].read_bytes()
    assert out == src and len(calls) == 11  # solo los 11 campos, en orden
    assert json.loads((tmp_path / "2026111300" / "download.json").read_text())["steps"] == [3]


def test_indice_incompleto_es_error_claro(tmp_path):
    lines = [ln for ln in index_for(FIX / "ecmwf_bogota_f003.grib2") if '"tcc"' not in ln]
    with pytest.raises(grids.DownloadError, match="tcc"):
        ecmwf.download_run(
            RUN,
            tmp_path,
            [3],
            get_text=lambda u: "\n".join(lines).encode(),
            get_range=lambda *a: b"",
            sleep=lambda s: None,
            log=lambda m: None,
        )


def test_rango_que_no_es_grib_se_reintenta():
    answers = iter([b"<html>", b"GRIB-ok"])
    waits = []
    data = ecmwf.fetch_message(
        "u", {"_offset": 0, "_length": 7}, get_range=lambda *a: next(answers), sleep=waits.append
    )
    assert data == b"GRIB-ok" and waits == [5.0]


def test_lector_normaliza_a_las_convenciones_de_gfs():
    read = ecmwf.make_reader("colombia")
    g3 = read(FIX / "ecmwf_bogota_f003.grib2")
    assert set(g3.fields) == set(grids.FIELDS)  # mismos nombres que GFS
    assert (
        0 <= float(np.nanmin(g3.fields["tcc"])) and float(np.nanmax(g3.fields["tcc"])) > 1
    )  # % no fracción
    assert g3.lats[0] > g3.lats[-1] and g3.lons[0] < g3.lons[-1]
    g0 = read(FIX / "ecmwf_bogota_f000.grib2")
    assert "gust" not in g0.fields  # máximo de un intervalo vacío en f000


def test_recorte_a_la_region():
    lats = np.array([10.0, 5.0, 0.0])
    lons = np.array([-80.0, -74.0, -60.0])
    step = grids.GridStep(RUN, 3, lats, lons, {"a": np.arange(9.0).reshape(3, 3)})
    c = grids.crop(step, (-75, -60, 0, 6))
    assert c.lats.tolist() == [5.0, 0.0] and c.lons.tolist() == [-74.0, -60.0]
    assert c.fields["a"].tolist() == [[4.0, 5.0], [7.0, 8.0]]
    assert grids.crop(step, None) is step


def test_codifica_y_publica_un_run_ecmwf(tmp_path):
    def download(run, work_dir, steps, region):
        d = work_dir / grids.run_id(run)
        d.mkdir(parents=True, exist_ok=True)
        res = grids.DownloadResult(run=run, region=region)
        for s in steps:
            dst = d / f"f{s:03d}.grib2"
            shutil.copy(FIX / f"ecmwf_bogota_f{s:03d}.grib2", dst)
            res.files[s] = dst
        return res

    r = update.update(
        tmp_path / "web",
        tmp_path / "raw",
        model="ecmwf",
        steps=[0, 3],
        find_run=lambda now, last: RUN,
        download=download,
        log=lambda m: None,
    )
    assert r.status == "actualizado"
    out = tmp_path / "web" / "ecmwf" / "2026111300"
    meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    assert meta["model"] == "ecmwf" and meta["modelLabel"] == encode.MODEL_LABEL["ecmwf"]
    assert "CC BY 4.0" in meta["source"]
    assert meta["scalars"]["gust"]["steps"] == [3]  # sin ráfaga en f000
    assert meta["scalars"]["tcc"]["steps"] == [0, 3]
    assert not (tmp_path / "raw" / "2026111300").exists()  # GRIB crudos borrados tras publicar
