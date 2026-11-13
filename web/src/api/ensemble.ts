/**
 * Ensambles para probabilidad de lluvia: Open-Meteo Ensemble API (gratis, sin clave, CORS `*`). → T-23, RF-6, §5.4
 *
 * Validado el 2026-11-13: `models=ecmwf_ifs025,gfs025` responde con claves `precipitation[_memberNN]_<sufijo>`,
 * donde el sufijo es `ecmwf_ifs025_ensemble` (control + 50 = 51 miembros) y `ncep_gefs025` (control + 30 = 31).
 * El sufijo coincide con el id de `/data/{sufijo}/static/meta.json` (hora del run). Coste por consulta: 8,2.
 */
import { fetchJson } from './http'
import { cachedForecast, fetchRunTime, roundCoord } from './openMeteo'

export const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble'
export const ENSEMBLE_META_URL = 'https://ensemble-api.open-meteo.com/data'

export interface EnsembleInfo {
  /** Valor para `models=`. */
  apiId: string
  /** Sufijo de las claves en la respuesta y id de meta.json. */
  suffix: string
  label: string
  org: string
  members: number
}

export const ENSEMBLES: readonly EnsembleInfo[] = [
  {
    apiId: 'ecmwf_ifs025',
    suffix: 'ecmwf_ifs025_ensemble',
    label: 'ECMWF ENS',
    org: 'ECMWF (Europa)',
    members: 51,
  },
  {
    apiId: 'gfs025',
    suffix: 'ncep_gefs025',
    label: 'GFS ENS (GEFS)',
    org: 'NOAA (EE. UU.)',
    members: 31,
  },
]

export interface EnsembleMembers {
  ensemble: EnsembleInfo
  /** Precipitación horaria (mm) de cada miembro; índice 0 = control. */
  members: (number | null)[][]
}

export interface EnsembleForecast {
  times: Date[]
  utcOffsetSeconds: number
  timezone: string
  ensembles: EnsembleMembers[]
}

export function ensembleUrl(lat: number, lon: number, days = 7): string {
  const params = new URLSearchParams({
    latitude: String(roundCoord(lat)),
    longitude: String(roundCoord(lon)),
    hourly: 'precipitation',
    models: ENSEMBLES.map((e) => e.apiId).join(','),
    forecast_days: String(days),
    timezone: 'auto',
    timeformat: 'unixtime',
  })
  return `${ENSEMBLE_URL}?${params}`
}

const KEY_RE = /^precipitation(?:_member(\d+))?_(.+)$/

interface RawEnsemble {
  timezone: string
  utc_offset_seconds: number
  hourly: Record<string, (number | null)[]> & { time: number[] }
  error?: boolean
  reason?: string
}

/** Agrupa las claves por sufijo de modelo y ordena miembros (control primero). */
export function parseEnsemble(raw: RawEnsemble): EnsembleForecast {
  if (raw.error) throw new Error(`Open-Meteo Ensemble: ${raw.reason ?? 'error desconocido'}`)
  const bySuffix = new Map<string, Map<number, (number | null)[]>>()
  for (const [key, series] of Object.entries(raw.hourly)) {
    const m = key.match(KEY_RE)
    if (!m) continue
    const [, member, suffix] = m
    if (!bySuffix.has(suffix)) bySuffix.set(suffix, new Map())
    bySuffix.get(suffix)!.set(member ? Number(member) : 0, series)
  }
  const ensembles = ENSEMBLES.flatMap((ensemble) => {
    const members = bySuffix.get(ensemble.suffix)
    if (!members?.size) return []
    const ordered = [...members.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s)
    return [{ ensemble, members: ordered }]
  })
  return {
    times: raw.hourly.time.map((t) => new Date(t * 1000)),
    utcOffsetSeconds: raw.utc_offset_seconds,
    timezone: raw.timezone,
    ensembles,
  }
}

/** Ensambles de un punto (caché 30 min; sin AbortSignal por ser compartida, ver diseño §10). */
export function fetchEnsemble(
  lat: number,
  lon: number,
  now = Date.now(),
): Promise<EnsembleForecast> {
  const url = ensembleUrl(lat, lon)
  return cachedForecast(
    `ens:${url}`,
    async () => parseEnsemble(await fetchJson<RawEnsemble>(url)),
    now,
  )
}

export const fetchEnsembleRun = (e: EnsembleInfo) =>
  fetchRunTime(`${ENSEMBLE_META_URL}/${e.suffix}/static/meta.json`)
