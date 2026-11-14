"""Actualización programada de las rejillas (T-33, RNF-5): la ejecuta `grids.yml` cada 6 h.

1. Busca el run de GFS más reciente con todos los pasos publicados.
2. Si ya está publicado (según `latest.json`), no hace nada.
3. Descarga, codifica en una carpeta nueva y **valida** (meta legible, todos los PNG y GeoJSON).
4. Solo entonces apunta `latest.json` al run nuevo (escritura atómica) y borra runs viejos,
   conservando `keep`.
   Si algo falla antes, `latest.json` sigue apuntando al run anterior: nunca queda la web sin datos.
5. Escribe `status.json` con la hora y el resultado del intento (para vigilar que no se atasque).

Uso:  uv run python -m windcloud_pipeline.update --salida DIR [--modelo gfs|ecmwf|todos]
          [--keep 2] [--trabajo DIR]
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from . import ecmwf, encode, grids

EXPECTED_WIND_LEVELS = len(encode.WIND_LEVELS)


@dataclass
class UpdateResult:
    status: str  # "actualizado" | "sin-cambios" | "error"
    run: str | None
    message: str


def current_run(model_dir: Path) -> str | None:
    latest = model_dir / "latest.json"
    if not latest.exists():
        return None
    return json.loads(latest.read_text(encoding="utf-8")).get("run")


def validate_run(run_dir: Path, steps: list[int]) -> list[str]:
    """Problemas encontrados en un run codificado (lista vacía = válido).

    Viento: todos los niveles en todos los pasos. Escalares e isobaras: los pasos que declara
    `meta.json` (ECMWF no trae ráfaga en f000); nubosidad, temperatura e isobaras, todos los pasos.
    """
    problems: list[str] = []
    meta_path = run_dir / "meta.json"
    if not meta_path.exists():
        return ["falta meta.json"]
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    if meta.get("steps") != steps:
        problems.append(f"pasos {meta.get('steps')} ≠ esperados {steps}")
    for step in steps:
        for lvl in encode.WIND_LEVELS:
            if not (run_dir / f"wind_{lvl}_{step:03d}.png").exists():
                problems.append(f"falta wind_{lvl}_{step:03d}.png")
    for name, info in meta.get("scalars", {}).items():
        for step in info.get("steps", []):
            if not (run_dir / f"{name}_{step:03d}.png").exists():
                problems.append(f"falta {name}_{step:03d}.png")
    for name in ("tcc", "t2m"):
        if meta.get("scalars", {}).get(name, {}).get("steps") != steps:
            problems.append(f"{name} no cubre todos los pasos")
    for step in meta.get("isobars", {}).get("steps", []):
        if not (run_dir / f"isobars_{step:03d}.geojson").exists():
            problems.append(f"falta isobars_{step:03d}.geojson")
    if meta.get("isobars", {}).get("steps") != steps:
        problems.append("isobaras no cubren todos los pasos")
    risk_meta = meta.get("risk")
    if risk_meta:
        path = run_dir / risk_meta["file"]
        if not path.exists():
            problems.append(f"falta {risk_meta['file']}")
        elif [p["step"] for p in json.loads(path.read_text(encoding="utf-8"))["pasos"]] != steps:
            problems.append("riesgo no cubre todos los pasos")
    return problems


def prune(model_dir: Path, keep: int) -> list[str]:
    """Borra runs viejos dejando los `keep` más recientes; nunca el que apunta `latest.json`."""
    protected = current_run(model_dir)
    protected_id = (
        grids.run_id(datetime.fromisoformat(protected.replace("Z", "+00:00")))
        if protected
        else None
    )
    runs = sorted(
        (p for p in model_dir.iterdir() if p.is_dir() and p.name.isdigit() and len(p.name) == 10),
        key=lambda p: p.name,
    )
    removed = []
    for old in runs[:-keep] if keep > 0 else runs:
        if old.name == protected_id:
            continue
        shutil.rmtree(old)
        removed.append(old.name)
    for leftover in model_dir.glob("*.tmp"):  # restos de un intento interrumpido
        shutil.rmtree(leftover) if leftover.is_dir() else leftover.unlink()
    return removed


def write_status(model_dir: Path, result: UpdateResult, now: datetime) -> None:
    status = {
        "checkedAt": encode.iso(now),
        "result": result.status,
        "run": result.run,
        "latestRun": current_run(model_dir),
        "message": result.message,
    }
    tmp = model_dir / "status.json.tmp"
    tmp.write_text(json.dumps(status, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(model_dir / "status.json")


def update(
    out_root: Path,
    work_dir: Path,
    *,
    model: str = "gfs",
    keep: int = 2,
    steps: list[int] | None = None,
    region: str = "colombia",
    now: datetime | None = None,
    find_run: Callable[[datetime, int], datetime | None] | None = None,
    download: Callable[..., grids.DownloadResult] | None = None,
    reader: Callable[[Path], grids.GridStep] | None = None,
    keep_raw: bool = False,
    log: Callable[[str], None] = print,
) -> UpdateResult:
    now = now or datetime.now(UTC)
    steps = list(steps or grids.DEFAULT_STEPS)
    model_dir = out_root / model
    model_dir.mkdir(parents=True, exist_ok=True)
    if model == "ecmwf":
        find = find_run or (lambda t, last: ecmwf.latest_complete_run(t, last, grids.http_exists))
        download = download or ecmwf.download_run
        reader = reader or ecmwf.make_reader(region)
    else:
        find = find_run or (lambda t, last: grids.latest_complete_run(t, last, grids.http_exists))
        download = download or grids.download_run
        reader = reader or grids.read_step

    try:
        run = find(now, steps[-1])
        if run is None:
            result = UpdateResult("error", None, "ningún run reciente tiene todos los pasos")
        elif current_run(model_dir) == encode.iso(run):
            result = UpdateResult(
                "sin-cambios", encode.iso(run), "el run más reciente ya está publicado"
            )
        else:
            log(f"Run nuevo {grids.run_id(run)}: descargando {len(steps)} pasos")
            dl = download(run, work_dir, steps, region)
            raw = work_dir / grids.run_id(run)
            out = encode.encode_run(raw, out_root, model, update_latest=False, reader=reader)
            problems = validate_run(out, sorted(dl.files))
            if sorted(dl.files) != steps:
                problems.append(f"descarga incompleta: {sorted(dl.files)}")
            if problems:
                shutil.rmtree(out, ignore_errors=True)  # el run anterior sigue publicado
                result = UpdateResult("error", encode.iso(run), "; ".join(problems[:5]))
            else:
                encode.write_latest(model_dir, run)
                removed = prune(model_dir, keep)
                if not keep_raw:
                    shutil.rmtree(raw, ignore_errors=True)  # GRIB crudos (hasta ~155 MB con ECMWF)
                note = ""
                if model == "gfs" and not json.loads(
                    (out / "meta.json").read_text(encoding="utf-8")
                ).get("risk"):
                    note = "; sin riesgo (faltan campos: ¿RH a 2 m?)"
                result = UpdateResult(
                    "actualizado",
                    encode.iso(run),
                    f"publicado; borrados: {removed or 'ninguno'}{note}",
                )
    except Exception as e:  # noqa: BLE001 — se registra y el run anterior queda publicado
        result = UpdateResult("error", None, f"{type(e).__name__}: {e}")
    write_status(model_dir, result, now)
    log(f"{result.status}: {result.message}")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    root = Path(__file__).resolve().parents[2]
    parser.add_argument("--salida", type=Path, default=root / "out/web/data")
    parser.add_argument("--trabajo", type=Path, default=root / "out/raw")
    parser.add_argument("--keep", type=int, default=2)
    parser.add_argument("--region", choices=sorted(grids.REGIONS), default="colombia")
    parser.add_argument("--modelo", choices=["gfs", "ecmwf", "todos"], default="todos")
    args = parser.parse_args(argv)
    models = ["gfs", "ecmwf"] if args.modelo == "todos" else [args.modelo]
    results = [
        update(args.salida, args.trabajo / m, model=m, keep=args.keep, region=args.region)
        for m in models
    ]
    # Un modelo que falla no impide publicar el otro; el código de salida avisa del fallo.
    return 1 if any(r.status == "error" for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
