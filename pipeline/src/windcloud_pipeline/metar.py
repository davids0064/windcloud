"""Cliente METAR de aviationweather.gov y lectura de los reportes (T-40, T-41).

Límites medidos con la API real (13/11/2026):
- Cada respuesta trae **como máximo 400 registros** y corta sin avisar (20 aeropuertos × 25 h
  devolvió 400 y dejó uno fuera). Por eso, si una respuesta llega al tope, el lote se parte en dos.
- Lotes grandes o de muchas horas a veces responden 504 → lotes de 10 y reintentos.
- `date=AAAAMMDD_HHMM&hours=N` da las N horas que terminan en esa fecha (UTC); hay al menos 12 días
  de historial.
- Viento en nudos (`wspd`, `wgst`); temperatura en °C enteros; `wdir` puede ser "VRB".
- No hay campo de precipitación: la lluvia sale del tiempo presente (`wxString`: RA, -DZ, TSRA…)
  y del tiempo reciente del reporte (RERA, RETSRA…, lluvia en la última hora que ya paró).
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
from collections.abc import Callable, Iterable

from . import grids

API = "https://aviationweather.gov/api/data"
SOURCE = "NOAA Aviation Weather Center (aviationweather.gov), dominio público"
MAX_RECORDS = 400
BATCH = 10
KT_TO_KMH = 1.852

#: precipitación que cae en la estación (no "VC" = en la vecindad, ni TS sola = solo trueno)
PRECIP_CODES = ("DZ", "RA", "SN", "SG", "PL", "GR", "GS", "UP", "IC")
_TOKEN = re.compile(r"^[+-]?(?:MI|PR|BC|DR|BL|SH|TS|FZ)*((?:DZ|RA|SN|SG|PL|GR|GS|UP|IC)+)$")
_RECENT = re.compile(r"^RE(?:SH|TS|FZ)?(?:DZ|RA|SN|SG|PL|GR|GS|UP)+$")

Getter = Callable[[str], bytes]


#: espera tras un HTTP 429: los límites por minuto se reponen en ese plazo
RATE_LIMIT_WAIT_S = 65.0
#: esperas tras 429 seguidos. En GitHub Actions la IP del runner se comparte con otros usuarios de
#: Open-Meteo y el límite puede estar ya gastado (14/11: un día de IDEAM falló con 3 intentos).
RATE_LIMIT_WAITS_S = (RATE_LIMIT_WAIT_S, 120.0, 240.0)
ERROR_WAITS_S = (3.0, 10.0)


def _cause(e: Exception) -> str:
    if isinstance(e, urllib.error.HTTPError):
        return f"HTTP {e.code}"
    return type(e).__name__


def fetch_json(url: str, get: Getter = grids.http_get, sleep=time.sleep) -> object:
    """GET JSON: 2 reintentos ante errores (504) y hasta 3 esperas largas ante HTTP 429."""
    errors = rate_limited = 0
    while True:
        try:
            return json.loads(get(url))
        except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError) as e:
            if isinstance(e, urllib.error.HTTPError) and e.code == 429:
                if rate_limited >= len(RATE_LIMIT_WAITS_S):
                    raise RuntimeError(
                        f"Falló tras reintentos (HTTP 429, límite de peticiones): {url}"
                    ) from e
                sleep(RATE_LIMIT_WAITS_S[rate_limited])
                rate_limited += 1
            else:
                if errors >= len(ERROR_WAITS_S):
                    raise RuntimeError(f"Falló tras reintentos ({_cause(e)}): {url}") from e
                sleep(ERROR_WAITS_S[errors])
                errors += 1


def batched(items: list[str], size: int) -> Iterable[list[str]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def fetch_metars(
    ids: list[str],
    *,
    hours: int = 24,
    date: str | None = None,
    get: Getter = grids.http_get,
    sleep=time.sleep,
    batch: int = BATCH,
) -> list[dict]:
    """Todos los METAR/SPECI de `ids` en la ventana; parte lotes que tocan el tope de 400."""
    out: list[dict] = []

    def one(group: list[str]) -> None:
        url = f"{API}/metar?ids={','.join(group)}&hours={hours}&format=json"
        if date:
            url += f"&date={date}"
        rows = fetch_json(url, get=get, sleep=sleep)
        sleep(1.0)  # cortesía con la API
        if len(rows) >= MAX_RECORDS:
            if len(group) == 1:
                raise RuntimeError(f"{group[0]}: más de {MAX_RECORDS} reportes; acortar la ventana")
            half = len(group) // 2
            one(group[:half])
            one(group[half:])
            return
        out.extend(rows)

    for group in batched(ids, batch):
        one(group)
    return out


def precip_now(wx: str | None) -> bool:
    """¿El tiempo presente indica precipitación en la estación?"""
    return any(_TOKEN.match(tok) for tok in (wx or "").split())


def precip_recent(raw: str) -> bool:
    """¿El reporte trae precipitación reciente (RERA…) antes de las observaciones (RMK)?"""
    body = raw.split(" RMK ", 1)[0]
    return any(_RECENT.match(tok) for tok in body.split())


def wind_kmh(row: dict) -> float | None:
    v = row.get("wspd")
    return None if v is None else round(float(v) * KT_TO_KMH, 1)
