/**
 * Lectura de las rejillas publicadas por el pipeline (`/data/{modelo}/latest.json` → `meta.json`, T-32).
 * Esquema documentado en pipeline/src/windcloud_pipeline/encode.py.
 */
import { fetchJson } from '../api/http'

export const DATA_BASE = `${import.meta.env.BASE_URL}data`

export type WindLevel = '10m' | '850' | '500'

export interface WindFrame {
  step: number
  uMin: number
  uMax: number
  vMin: number
  vMax: number
}

export interface GridMeta {
  schema: number
  model: string
  modelLabel: string
  source: string
  run: string
  generatedAt: string
  bounds: { west: number; east: number; north: number; south: number }
  projection: 'mercator-rows'
  width: number
  height: number
  steps: number[]
  validTimes: string[]
  wind: {
    units: 'm/s'
    file: string
    levels: Record<WindLevel, { label: string; frames: WindFrame[] }>
  }
  isobars?: { units: 'hPa'; every: number; file: string; steps: number[]; note: string }
  scalars: Record<
    string,
    {
      label: string
      units: string
      min: number
      max: number
      transform: 'linear' | 'sqrt'
      note: string
      file: string
      steps: number[]
    }
  >
}

export interface LoadedMeta {
  meta: GridMeta
  /** Carpeta del run, p. ej. "/data/gfs/2026111306". */
  base: string
}

export async function fetchGridMeta(model = 'gfs', base = DATA_BASE): Promise<LoadedMeta> {
  const latest = await fetchJson<{ run: string; meta: string }>(`${base}/${model}/latest.json`, {
    retries: 0,
  })
  const meta = await fetchJson<GridMeta>(`${base}/${model}/${latest.meta}`, { retries: 1 })
  if (meta.schema !== 1) throw new Error(`Esquema de rejillas no soportado: ${meta.schema}`)
  return { meta, base: `${base}/${model}/${latest.meta.replace(/\/meta\.json$/, '')}` }
}

/** Índice del paso cuya hora válida está más cerca de `now`. */
export function nearestStepIndex(meta: Pick<GridMeta, 'validTimes'>, now: Date): number {
  let best = 0
  let bestDiff = Infinity
  meta.validTimes.forEach((t, i) => {
    const diff = Math.abs(Date.parse(t) - now.getTime())
    if (diff < bestDiff) {
      best = i
      bestDiff = diff
    }
  })
  return best
}

export const windFileUrl = (loaded: LoadedMeta, level: WindLevel, step: number) =>
  `${loaded.base}/${loaded.meta.wind.file.replace('{level}', level).replace('{step}', String(step).padStart(3, '0'))}`

export function windFrame(meta: GridMeta, level: WindLevel, step: number): WindFrame {
  const f = meta.wind.levels[level].frames.find((x) => x.step === step)
  if (!f) throw new Error(`Sin cuadro de viento ${level} para el paso ${step}`)
  return f
}

/** Horas desde el inicio del run (para el aviso de antigüedad: fase 2 exige < 9 h). */
export const runAgeHours = (meta: Pick<GridMeta, 'run'>, now: Date) =>
  (now.getTime() - Date.parse(meta.run)) / 3_600_000

/**
 * Antigüedad del run a partir de la cual se avisa, por modelo. Según la latencia medida (2026-11-13): GFS completa
 * sus 72 h ~5 h después del run y ECMWF ~7,5 h; con runs cada 6 h, lo normal es hasta ~11 h y ~13,5 h. Avisar por
 * debajo de eso haría que el aviso saliera siempre y dejara de significar algo.
 */
export const STALE_GRID_HOURS: Record<string, number> = { gfs: 9, ecmwf: 14 }
export const staleHours = (model: string) => STALE_GRID_HOURS[model] ?? 9
