/**
 * Precisión verificada (T-44, RF-9): lectura de `precision.json` (resumen) y `precision/<ICAO>.json`
 * (detalle), publicados por el pipeline (`metrics.py`, `daily.py`). Sin dependencias de React ni del mapa.
 */
import { fetchJson } from '../api/http'
import { MODELS } from '../core/models'
import { modelColor } from '../point/colors'
import { DATA_BASE } from '../wind/meta'

export type WindowId = '7' | '30'
export type VerifVariable = 'temperatura' | 'viento' | 'lluvia'
export type Lead = 1 | 2

export interface ContinuousScore {
  n: number
  mae: number | null
  sesgo: number | null
  rmse: number | null
}

export interface RainScore {
  n: number
  aciertos: number
  fallos: number
  falsas_alarmas: number
  negativos: number
  pod: number | null
  sesgo_frecuencia: number | null
  far: number | null
  csi: number | null
}

/** {variable: {"<modelo>_d<lead>": métricas}} */
export interface Scores {
  temperatura: Record<string, ContinuousScore>
  viento: Record<string, ContinuousScore>
  lluvia: Record<string, RainScore>
}

export type Ranking = Partial<Record<VerifVariable, string[]>>

export interface StationInfo {
  icao: string
  nombre: string
  pais: string
  departamento: string | null
  lat: number
  lon: number
  red: string
}

export interface PrecisionSummary {
  schema: 1
  generatedAt: string
  hasta: string
  /** `redes`: fuente de cada red (T-47); falta en resúmenes anteriores. */
  fuentes: { observacion: string; pronostico: string; redes?: Record<string, string> }
  modelos: string[]
  leads_dias: number[]
  umbrales: {
    lluvia_bloque_h: number
    lluvia_mm_bloque: number
    lluvia_horas_min_bloque: number
    min_pares_ranking: number
  }
  estaciones: StationInfo[]
  ventanas: Record<
    WindowId,
    {
      dias: string[]
      /** Días con datos de cada red (T-47). */
      dias_por_red?: Record<string, number>
      region: { metricas: Scores; ranking: Ranking }
      redes: Record<string, Scores>
      estaciones: Record<string, { ranking: Ranking }>
    }
  >
}

export interface StationDetail {
  schema: 1
  generatedAt: string
  hasta: string
  icao: string
  ventanas: Partial<Record<WindowId, { metricas: Scores; ranking: Ranking }>>
}

export const WINDOWS: { id: WindowId; label: string }[] = [
  { id: '7', label: '7 días' },
  { id: '30', label: '30 días' },
]

export const VARIABLES: { id: VerifVariable; label: string }[] = [
  { id: 'temperatura', label: 'Temperatura' },
  { id: 'viento', label: 'Viento' },
  { id: 'lluvia', label: 'Lluvia' },
]

/** Días con datos por debajo de los cuales el ranking se marca «preliminar» (criterio de fase 3). */
export const PRELIMINARY_DAYS = 14

const summaryCache = new Map<string, Promise<PrecisionSummary>>()
const detailCache = new Map<string, Promise<StationDetail>>()

/** Se cachea sin AbortSignal (lección del panel de punto: una promesa cacheada no debe poder abortarse). */
function cached<T>(cache: Map<string, Promise<T>>, url: string): Promise<T> {
  let p = cache.get(url)
  if (!p) {
    p = fetchJson<T>(url)
    p.catch(() => cache.delete(url)) // no cachear errores
    cache.set(url, p)
  }
  return p
}

export const fetchPrecision = (base = DATA_BASE) => cached(summaryCache, `${base}/precision.json`)

export const fetchStationDetail = (icao: string, base = DATA_BASE) =>
  cached(detailCache, `${base}/precision/${encodeURIComponent(icao)}.json`)

/** Solo para pruebas. */
export function clearPrecisionCache() {
  summaryCache.clear()
  detailCache.clear()
}

export const modelLabel = (apiId: string) => MODELS.find((m) => m.apiId === apiId)?.label ?? apiId

export const modelColorOf = (apiId: string) => {
  const i = MODELS.findIndex((m) => m.apiId === apiId)
  return i < 0 ? '#888888' : modelColor(i)
}

export interface RankRow {
  model: string
  score: ContinuousScore | RainScore
  /** false: menos pares que el mínimo → se muestra, pero fuera del orden. */
  ranked: boolean
}

const isRain = (v: VerifVariable) => v === 'lluvia'

/** Clave de orden: MAE ascendente; lluvia, CSI descendente. null = no ordenable. */
function sortKey(variable: VerifVariable, s: ContinuousScore | RainScore): number | null {
  if (isRain(variable)) {
    const csi = (s as RainScore).csi
    return csi === null ? null : -csi
  }
  return (s as ContinuousScore).mae
}

/**
 * Ranking de modelos para una variable y lead, recalculado desde las métricas (el JSON trae el del día 1;
 * así sirve también para el día 2). Mismo criterio que el pipeline.
 */
export function rankModels(
  scores: Scores,
  variable: VerifVariable,
  lead: Lead,
  models: string[],
  minPairs: number,
): RankRow[] {
  const rows = models
    .map((model) => ({ model, score: scores[variable][`${model}_d${lead}`] }))
    .filter((r): r is { model: string; score: ContinuousScore | RainScore } => Boolean(r.score))
    .map((r) => {
      const key = sortKey(variable, r.score)
      return { ...r, key, ranked: key !== null && r.score.n >= minPairs }
    })
  return rows
    .sort((a, b) => {
      if (a.ranked !== b.ranked) return a.ranked ? -1 : 1
      return (a.key ?? Infinity) - (b.key ?? Infinity)
    })
    .map(({ model, score, ranked }) => ({ model, score, ranked }))
}

/** Mejor modelo por estación (día 1) para colorear el mapa; null si la estación no tiene muestra. */
/** Filtro de red: todas juntas o una (METAR, IDEAM…). */
export type NetworkFilter = 'todas' | string

/** Redes presentes, en el orden en que aparecen las estaciones. */
export function networksOf(summary: PrecisionSummary): string[] {
  return [...new Set(summary.estaciones.map((s) => s.red))]
}

/** Métricas de la ventana para todas las redes juntas o para una. */
export function scoresFor(summary: PrecisionSummary, win: WindowId, red: NetworkFilter): Scores {
  const w = summary.ventanas[win]
  return red === 'todas' ? w.region.metricas : (w.redes[red] ?? w.region.metricas)
}

export function stationsOf(summary: PrecisionSummary, red: NetworkFilter): StationInfo[] {
  return red === 'todas' ? summary.estaciones : summary.estaciones.filter((s) => s.red === red)
}

/** Días con datos de la ventana (de una red si se eligió y el resumen lo trae). */
export function daysFor(summary: PrecisionSummary, win: WindowId, red: NetworkFilter): number {
  const w = summary.ventanas[win]
  return red === 'todas' ? w.dias.length : (w.dias_por_red?.[red] ?? w.dias.length)
}

export const NETWORK_LABEL: Record<string, string> = {
  METAR: 'aeropuertos (METAR)',
  IDEAM: 'estaciones automáticas del IDEAM',
}

export function bestByStation(
  summary: PrecisionSummary,
  win: WindowId,
  variable: VerifVariable,
): Map<string, string | null> {
  const out = new Map<string, string | null>()
  const stations = summary.ventanas[win]?.estaciones ?? {}
  for (const s of summary.estaciones) {
    out.set(s.icao, stations[s.icao]?.ranking[variable]?.[0] ?? null)
  }
  return out
}

/** "dd/mm" desde "AAAA-MM-DD" (sin Intl: el relleno de `2-digit` varía entre motores). */
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

/** "06/11–12/11" de la lista de días con datos; "" si no hay. */
export function windowRange(days: string[]): string {
  if (!days.length) return ''
  const a = ddmm(days[0])
  const b = ddmm(days[days.length - 1])
  return a === b ? a : `${a}–${b}`
}

/** "13/11 20:04 UTC" desde un ISO en UTC. */
export const generatedLabel = (iso: string) => {
  const d = new Date(iso).toISOString()
  return `${ddmm(d)} ${d.slice(11, 16)} UTC`
}

const num1 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const num2 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signed = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

export const UNIT: Record<'temperatura' | 'viento', string> = { temperatura: '°C', viento: 'km/h' }

export const fmt = {
  value: (v: number | null) => (v === null ? '—' : num1.format(v)),
  signed: (v: number | null) => (v === null ? '—' : signed.format(v)),
  ratio: (v: number | null) => (v === null ? '—' : num2.format(v)),
  pct: (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)} %`),
}
