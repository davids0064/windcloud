/**
 * Riesgo meteorológico (T-51, RF-10): lectura de `gfs/<run>/risk.json` (pipeline `risk.py`, T-50) y
 * preparación de las celdas para el mapa. Indicador propio de WindCloud, no una alerta oficial (P3).
 * TS puro: sin React ni MapLibre.
 */
import { fetchJson } from '../api/http'
import { DATA_BASE, fetchGridMeta } from '../wind/meta'

export interface RiskStep {
  step: number
  valid: string
  ffwi: (number | null)[]
  /** Bits: 1 viento, 2 lluvia, 4 calor. */
  peligros: number[]
  rafaga: (number | null)[]
  /** null en el paso 0 (sin lluvia acumulada). */
  lluvia3h: (number | null)[] | null
  t: (number | null)[]
  hr: (number | null)[]
}

export interface RiskData {
  schema: 1
  source: string
  model: string
  run: string
  generatedAt: string
  oficial: string
  umbrales: {
    rafaga_kmh: number
    lluvia_mm_3h: number
    calor_c: number
    ffwi_clases: { desde: number; clase: string }[]
    bits: { viento: number; lluvia: number; calor: number }
  }
  rejilla: { resolucion: number }
  /** [lat, lon] del centro de cada celda; los arreglos de `pasos` van en este orden. */
  celdas: [number, number][]
  departamentos?: string[]
  celda_depto?: number[]
  pasos: RiskStep[]
}

export type RiskView = 'incendio' | 'viento' | 'lluvia' | 'calor'
/** Índice de paso o el máximo de todos los pasos (próximas 72 h). */
export type RiskWhen = number | 'max'

export const RISK_VIEWS: { id: RiskView; label: string }[] = [
  { id: 'incendio', label: 'Incendio' },
  { id: 'viento', label: 'Viento' },
  { id: 'lluvia', label: 'Lluvia' },
  { id: 'calor', label: 'Calor' },
]

/** Colores por nivel (0 = nada, no se dibuja). Incendio: moderado, alto, muy alto. */
export const RISK_COLORS: Record<RiskView, string[]> = {
  incendio: ['', '#f2c94c', '#f2994a', '#d63b3b'],
  viento: ['', '#9b8cff'],
  lluvia: ['', '#2f80ed'],
  calor: ['', '#eb5757'],
}

let cache: Promise<RiskData> | null = null

/** Carga el riesgo del último run de GFS. Sin `risk` en meta → error explícito (P4). */
export function fetchRisk(base = DATA_BASE): Promise<RiskData> {
  if (!cache) {
    cache = (async () => {
      const { meta, base: runBase } = await fetchGridMeta('gfs', base)
      const file = meta.risk?.file
      if (!file) throw new Error('el último run no trae riesgo')
      const data = await fetchJson<RiskData>(`${runBase}/${file}`, { retries: 1 })
      if (data.schema !== 1) throw new Error(`Esquema de riesgo no soportado: ${data.schema}`)
      return data
    })()
    cache.catch(() => (cache = null)) // no cachear errores
  }
  return cache
}

/** Solo para pruebas. */
export const clearRiskCache = () => (cache = null)

/** Clase del FFWI (0 bajo … 3 muy alto); −1 sin dato. */
export function ffwiLevel(
  value: number | null,
  classes: RiskData['umbrales']['ffwi_clases'],
): number {
  if (value === null) return -1
  let level = 0
  classes.forEach((c, i) => {
    if (value >= c.desde) level = i
  })
  return level
}

function levelAt(data: RiskData, view: RiskView, step: RiskStep, i: number): number {
  if (view === 'incendio') return ffwiLevel(step.ffwi[i], data.umbrales.ffwi_clases)
  return step.peligros[i] & data.umbrales.bits[view] ? 1 : 0
}

/** Nivel de cada celda para la vista y el momento elegidos (máximo de los pasos si `when = 'max'`). */
export function levelsFor(data: RiskData, view: RiskView, when: RiskWhen): number[] {
  const steps = when === 'max' ? data.pasos : [data.pasos[when]].filter(Boolean)
  return data.celdas.map((_, i) => Math.max(-1, ...steps.map((s) => levelAt(data, view, s, i))))
}

/** Celdas a dibujar (nivel ≥ 1) como cuadrados de la rejilla. */
export function riskGeoJSON(data: RiskData, view: RiskView, levels: number[]) {
  const h = data.rejilla.resolucion / 2
  const features = []
  for (let i = 0; i < levels.length; i++) {
    if (levels[i] < 1) continue
    const [lat, lon] = data.celdas[i]
    features.push({
      type: 'Feature' as const,
      id: i,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [lon - h, lat - h],
            [lon + h, lat - h],
            [lon + h, lat + h],
            [lon - h, lat + h],
            [lon - h, lat - h],
          ],
        ],
      },
      properties: { i, color: RISK_COLORS[view][levels[i]] },
    })
  }
  return { type: 'FeatureCollection' as const, features }
}

export interface RiskSummary {
  /** Celdas con nivel ≥ 1. */
  cells: number
  /** Por nivel (índice = nivel); solo incendio tiene más de uno. */
  byLevel: number[]
  /** Departamentos con celdas en riesgo, de más a menos. */
  departments: { name: string; cells: number }[]
}

export function summarize(data: RiskData, levels: number[]): RiskSummary {
  const byLevel: number[] = []
  const deps = new Map<string, number>()
  let cells = 0
  levels.forEach((lv, i) => {
    if (lv < 1) return
    cells++
    byLevel[lv] = (byLevel[lv] ?? 0) + 1
    const k = data.celda_depto?.[i]
    const name = k !== undefined && k >= 0 ? data.departamentos?.[k] : undefined
    if (name) deps.set(name, (deps.get(name) ?? 0) + 1)
  })
  const departments = [...deps]
    .map(([name, n]) => ({ name, cells: n }))
    .sort((a, b) => b.cells - a.cells || a.name.localeCompare(b.name, 'es'))
  return { cells, byLevel, departments }
}

const n1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

/** Texto del rótulo al pasar el cursor por una celda. */
export function describeCell(data: RiskData, i: number, when: RiskWhen): string {
  const k = data.celda_depto?.[i]
  const where = k !== undefined && k >= 0 ? (data.departamentos?.[k] ?? '') : ''
  if (when === 'max') {
    const ffwi = Math.max(...data.pasos.map((s) => s.ffwi[i] ?? -1))
    const gust = Math.max(...data.pasos.map((s) => s.rafaga[i] ?? -1))
    const t = Math.max(...data.pasos.map((s) => s.t[i] ?? -Infinity))
    const rain = Math.max(...data.pasos.map((s) => s.lluvia3h?.[i] ?? -1))
    return [
      where && `${where} · máx. 72 h`,
      ffwi >= 0 && `Fosberg ${ffwi} (${fireClass(data, ffwi)})`,
      gust >= 0 && `ráfaga ${gust} km/h`,
      rain >= 0 && `lluvia ${n1.format(rain)} mm/3 h`,
      Number.isFinite(t) && `${t} °C`,
    ]
      .filter(Boolean)
      .join(' · ')
  }
  const s = data.pasos[when]
  const ffwi = s.ffwi[i]
  const rain = s.lluvia3h?.[i]
  return [
    where,
    ffwi !== null && `Fosberg ${ffwi} (${fireClass(data, ffwi)})`,
    s.t[i] !== null && `${s.t[i]} °C`,
    s.hr[i] !== null && `HR ${s.hr[i]} %`,
    s.rafaga[i] !== null && `ráfaga ${s.rafaga[i]} km/h`,
    rain != null && `lluvia ${n1.format(rain)} mm/3 h`,
  ]
    .filter(Boolean)
    .join(' · ')
}

export const fireClass = (data: RiskData, value: number) =>
  data.umbrales.ffwi_clases[Math.max(0, ffwiLevel(value, data.umbrales.ffwi_clases))].clase

/** "sáb 15, 1:00 p. m." en hora de Colombia. */
const localFmt = new Intl.DateTimeFormat('es-CO', {
  weekday: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Bogota',
})
export const localLabel = (iso: string) => localFmt.format(new Date(iso))

/** "14/11 12:00 UTC" desde un ISO en UTC. */
export const utcLabel = (iso: string) => {
  const d = new Date(iso).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)} UTC`
}

/** Índice del paso más cercano a `now`. */
export function nearestStep(data: RiskData, now: Date): number {
  let best = 0
  data.pasos.forEach((s, i) => {
    if (
      Math.abs(Date.parse(s.valid) - now.getTime()) <
      Math.abs(Date.parse(data.pasos[best].valid) - now.getTime())
    )
      best = i
  })
  return best
}
