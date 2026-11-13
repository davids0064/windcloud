"""Pruebas de la actualización programada (T-33) con descargas simuladas desde GRIB2 reales."""

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

from windcloud_pipeline import grids, update

FIX = Path(__file__).parent / "fixtures"
RUN = datetime(2026, 11, 13, 6, tzinfo=UTC)
NEXT = datetime(2026, 11, 13, 12, tzinfo=UTC)
STEPS = [0, 3]


def fake_download(fail_steps=()):
    """Copia los fixtures como si vinieran de NOMADS (f000 y f003)."""

    def download(run, work_dir, steps, region):
        d = work_dir / grids.run_id(run)
        d.mkdir(parents=True, exist_ok=True)
        res = grids.DownloadResult(run=run, region=region)
        for step in steps:
            if step in fail_steps:
                continue
            dst = d / f"f{step:03d}.grib2"
            shutil.copy(FIX / f"gfs_bogota_f{min(step, 3):03d}.grib2", dst)
            res.files[step] = dst
        return res

    return download


def run_update(tmp_path, run, **kw):
    return update.update(
        tmp_path / "web",
        tmp_path / "work",
        steps=STEPS,
        find_run=lambda now, last: run,
        download=kw.pop("download", fake_download()),
        log=lambda m: None,
        **kw,
    )


def test_publica_un_run_nuevo_valida_y_escribe_estado(tmp_path):
    r = run_update(tmp_path, RUN)
    assert r.status == "actualizado" and r.run == "2026-11-13T06:00:00Z"
    model = tmp_path / "web" / "gfs"
    assert json.loads((model / "latest.json").read_text())["run"] == r.run
    assert update.validate_run(model / "2026111306", STEPS) == []
    status = json.loads((model / "status.json").read_text())
    assert status["result"] == "actualizado" and status["latestRun"] == r.run


def test_si_el_run_ya_esta_publicado_no_descarga_nada(tmp_path):
    run_update(tmp_path, RUN)
    calls = []
    r = run_update(tmp_path, RUN, download=lambda *a: calls.append(a))
    assert r.status == "sin-cambios" and calls == []


def test_descarga_incompleta_deja_publicado_el_run_anterior(tmp_path):
    run_update(tmp_path, RUN)
    r = run_update(tmp_path, NEXT, download=fake_download(fail_steps={3}))
    assert r.status == "error"
    assert "incompleta" in r.message or "falta" in r.message
    model = tmp_path / "web" / "gfs"
    assert json.loads((model / "latest.json").read_text())["run"] == "2026-11-13T06:00:00Z"
    assert not (model / "2026111312").exists()  # el run a medias se borra
    assert json.loads((model / "status.json").read_text())["result"] == "error"


def test_una_excepcion_se_registra_y_no_rompe_lo_publicado(tmp_path):
    run_update(tmp_path, RUN)

    def boom(*a):
        raise grids.DownloadError("NOMADS caído")

    r = run_update(tmp_path, NEXT, download=boom)
    assert r.status == "error" and "NOMADS caído" in r.message
    assert update.current_run(tmp_path / "web" / "gfs") == "2026-11-13T06:00:00Z"


def test_sin_run_disponible_es_error_explicito(tmp_path):
    r = run_update(tmp_path, None)
    assert r.status == "error" and "ningún run" in r.message


def test_conserva_los_ultimos_runs_y_nunca_el_vigente(tmp_path):
    model = tmp_path / "gfs"
    for rid in ("2026111300", "2026111306", "2026111312"):
        (model / rid).mkdir(parents=True)
    (model / "2026111318.tmp").mkdir()
    (model / "latest.json").write_text(json.dumps({"run": "2026-11-13T12:00:00Z"}))
    assert update.prune(model, keep=2) == ["2026111300"]
    assert sorted(p.name for p in model.iterdir() if p.is_dir()) == ["2026111306", "2026111312"]
    # Aunque keep=0, el run vigente no se borra
    update.prune(model, keep=0)
    assert [p.name for p in model.iterdir() if p.is_dir()] == ["2026111312"]


def test_validacion_detecta_archivos_faltantes(tmp_path):
    run_update(tmp_path, RUN)
    out = tmp_path / "web" / "gfs" / "2026111306"
    (out / "prate_003.png").unlink()
    (out / "isobars_000.geojson").unlink()
    problems = update.validate_run(out, STEPS)
    assert "falta prate_003.png" in problems and "falta isobars_000.geojson" in problems
