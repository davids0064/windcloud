"""Pruebas del riesgo meteorológico (T-50, RF-10)."""

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pytest
from shapely.geometry import box

from windcloud_pipeline import encode, grids, risk, update

FIX = Path(__file__).parent / "fixtures"
RUN = datetime(2026, 11, 14, 12, tzinfo=UTC)


def step(n, fields, windows=None, lats=(1.0, 0.0), lons=(0.0, 1.0)):
    return grids.GridStep(RUN, n, np.array(lats), np.array(lons), fields, windows or {})


# ------------------------------------------------------------------------------------------ Fosberg
def test_fosberg_coincide_con_el_calculo_a_mano():
    # 90 °F, HR 20 %, 20 mph: m = 2,22749 + 0,160107·20 − 0,01478·90 = 4,0994
    # η = 1 − 2(0,13665) + 1,5(0,13665)² − 0,5(0,13665)³ = 0,75342 → FFWI = η·√401/0,3002 = 50,26
    t_c = (90 - 32) * 5 / 9
    wind_kmh = 20 / risk.MS_TO_MPH * 3.6
    assert risk.equilibrium_moisture(np.array(t_c), np.array(20.0)) == pytest.approx(
        4.0994, abs=1e-3
    )
    assert risk.fosberg(np.array(t_c), np.array(20.0), np.array(wind_kmh)) == pytest.approx(
        50.26, abs=0.05
    )


def test_fosberg_tramos_de_humedad_y_limites():
    t = np.full(3, 25.0)
    m = risk.equilibrium_moisture(t, np.array([5.0, 30.0, 90.0]))
    assert m[0] < m[1] < m[2]
    # Sin viento ni humedad: η = 1 → 1/0,3002
    assert risk.fosberg(np.array(25.0), np.array(0.0), np.array(0.0)) == pytest.approx(3.33, 0.01)
    # Muy seco y viento huracanado: tope en 100; aire saturado: casi 0
    assert risk.fosberg(np.array(35.0), np.array(5.0), np.array(150.0)) == 100
    assert risk.fosberg(np.array(20.0), np.array(100.0), np.array(10.0)) < 3


def test_mas_seco_o_mas_viento_da_mas_riesgo():
    base = risk.fosberg(np.array(30.0), np.array(40.0), np.array(20.0))
    assert risk.fosberg(np.array(30.0), np.array(20.0), np.array(20.0)) > base
    assert risk.fosberg(np.array(30.0), np.array(40.0), np.array(40.0)) > base


def test_clases_del_indice():
    assert [risk.ffwi_class(v) for v in (0, 24.9, 25, 50, 74, 75, 100)] == [
        "bajo",
        "bajo",
        "moderado",
        "alto",
        "alto",
        "muy alto",
        "muy alto",
    ]


# ------------------------------------------------------------------------------------ lluvia en 3 h
def test_lluvia_3h_desde_los_promedios_que_se_reinician_cada_6h():
    mmh = 1 / grids.KGM2S_TO_MMH  # 1 mm/h en kg/m²/s
    a = np.full((2, 2), 2 * mmh)  # 0–3 h: 2 mm/h → 6 mm
    b = np.full((2, 2), 3 * mmh)  # 0–6 h: 3 mm/h → 18 mm → 12 mm en 3–6 h
    c = np.full((2, 2), 1 * mmh)  # 6–9 h: 3 mm
    steps = [
        step(0, {}),
        step(3, {"prate_avg": a}, {"prate_avg": (0, 3)}),
        step(6, {"prate_avg": b}, {"prate_avg": (0, 6)}),
        step(9, {"prate_avg": c}, {"prate_avg": (6, 9)}),
    ]
    out = risk.rain_3h(steps)
    assert out[0] is None  # f000: sin acumulado (sin dato, no cero)
    assert out[1] == pytest.approx(np.full((2, 2), 6.0))
    assert out[2] == pytest.approx(np.full((2, 2), 12.0))
    assert out[3] == pytest.approx(np.full((2, 2), 3.0))


def test_lluvia_6h_sin_el_paso_anterior_no_se_inventa():
    mmh = 1 / grids.KGM2S_TO_MMH
    out = risk.rain_3h([step(6, {"prate_avg": np.full((2, 2), mmh)}, {"prate_avg": (0, 6)})])
    assert out == [None]


def test_lluvia_nunca_negativa_por_redondeo():
    mmh = 1 / grids.KGM2S_TO_MMH
    steps = [
        step(3, {"prate_avg": np.full((1, 1), 2.0 * mmh)}, {"prate_avg": (0, 3)}),
        step(6, {"prate_avg": np.full((1, 1), 0.999 * mmh)}, {"prate_avg": (0, 6)}),
    ]
    assert risk.rain_3h(steps)[1][0, 0] == 0


# ----------------------------------------------------------------------------------------- celdas
def test_celdas_dentro_del_territorio_con_margen_de_costa():
    lats = np.array([2.0, 1.0, 0.0, -1.0])
    lons = np.array([-1.0, 0.0, 1.0, 2.0])
    rows, cols = risk.colombia_cells(lats, lons, box(-0.1, -0.1, 1.1, 1.1), buffer=0)
    assert sorted(zip(lats[rows], lons[cols], strict=True)) == [
        (0.0, 0.0),
        (0.0, 1.0),
        (1.0, 0.0),
        (1.0, 1.0),
    ]
    rows, _ = risk.colombia_cells(lats, lons, box(0.1, 0.1, 0.9, 0.9), buffer=0.15)
    assert len(rows) == 4  # el margen recupera las celdas de borde


def test_peligros_por_umbral():
    k = 273.15
    f = {
        "t2m": np.array([[36 + k, 30 + k]]),
        "rh2m": np.array([[50.0, 50.0]]),
        "u10": np.array([[1.0, 1.0]]),
        "v10": np.array([[0.0, 0.0]]),
        "gust": np.array([[10.0, 20.0]]),  # 36 y 72 km/h
        "prate_avg": np.array([[0.0, 25 / 3 / grids.KGM2S_TO_MMH]]),  # 0 y 25 mm en 3 h
    }
    s = step(3, f, {"prate_avg": (0, 3)}, lats=(0.0,), lons=(0.0, 0.25))
    data = risk.compute([s], box(-0.2, -0.2, 0.5, 0.2))
    p = data["pasos"][0]
    bits = risk.HAZARD_BITS
    assert p["peligros"] == [bits["calor"], bits["viento"] | bits["lluvia"]]
    assert p["rafaga"] == [36, 72] and p["lluvia3h"] == [0.0, 25.0] and p["t"] == [36, 30]
    assert data["max_celdas"] == {"incendio_alto": 0, "viento": 1, "lluvia": 1, "calor": 1}


# --------------------------------------------------------------------------------- con GFS real
@pytest.fixture
def real_steps():
    return [grids.read_step(FIX / f"gfs_bogota_rh_f{s:03d}.grib2") for s in (3, 6)]


def test_riesgo_con_rejillas_reales_de_gfs(real_steps):
    data = risk.compute(real_steps, box(-75.0, 4.0, -73.0, 6.0))
    assert data["run"] == "2026-11-14T12:00:00Z" and data["rejilla"]["resolucion"] == 0.25
    n = len(data["celdas"])
    assert n == 9 * 9  # 2° × 2° a 0,25° (bordes incluidos, margen de 0,125°: 9 por lado)
    assert [p["step"] for p in data["pasos"]] == [3, 6]
    for p in data["pasos"]:
        assert len(p["ffwi"]) == len(p["peligros"]) == len(p["lluvia3h"]) == n
        assert all(0 <= v <= 100 for v in p["ffwi"])
        assert all(0 <= v <= 100 for v in p["hr"])
        assert all(v >= 0 for v in p["lluvia3h"])
        assert all(-10 < v < 45 for v in p["t"])
    assert data["umbrales"]["rafaga_kmh"] == 60 and data["oficial"].startswith("https://")


def test_encode_publica_risk_json_solo_si_hay_humedad(tmp_path):
    run_dir = tmp_path / "raw" / "2026111412"
    run_dir.mkdir(parents=True)
    for s in (3, 6):
        shutil.copy(FIX / f"gfs_bogota_rh_f{s:03d}.grib2", run_dir / f"f{s:03d}.grib2")
    out = encode.encode_run(run_dir, tmp_path / "web", colombia=box(-75, 4, -73, 6))
    meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    assert meta["risk"]["file"] == "risk.json"
    assert json.loads((out / "risk.json").read_text(encoding="utf-8"))["schema"] == 1
    assert update.validate_run(out, [3, 6]) == []
    (out / "risk.json").unlink()
    assert "falta risk.json" in update.validate_run(out, [3, 6])

    old = tmp_path / "raw2" / "2026111306"
    old.mkdir(parents=True)
    for f in ("f000", "f003"):
        shutil.copy(FIX / f"gfs_bogota_{f}.grib2", old / f"{f}.grib2")
    out = encode.encode_run(old, tmp_path / "web2", colombia=box(-75, 4, -73, 6))
    assert json.loads((out / "meta.json").read_text(encoding="utf-8"))["risk"] is None
