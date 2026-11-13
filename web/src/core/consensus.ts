/**
 * Consenso entre modelos (RF-7, diseño §5.2). TS puro, sin dependencias.
 *
 * - Media ponderada sobre los modelos con dato en esa hora (los null se excluyen).
 * - Precipitación: mediana ponderada (robusta a un modelo que exagera).
 * - Dirección del viento: se promedian componentes u/v, nunca grados (350° y 10° → 0°, no 180°).
 *   La velocidad del consenso es la media ponderada de velocidades (promediar vectores la subestimaría
 *   cuando los modelos discrepan en dirección).
 * - Pesos: iguales mientras no haya verificación (RF-9); `weightsFromMae` queda listo para T-45.
 */
import type { MultiModelForecast, Series } from '../api/openMeteo'
import type { VariableId } from './variables'

export interface WeightInfo {
  /** Peso por `apiId` del modelo. */
  weights: Record<string, number>
  equal: boolean
  /** Explicación para "¿Por qué este número?" (RF-7). */
  reason: string
}

export const EQUAL_WEIGHTS_REASON =
  'Todavía no hay verificación contra estaciones cercanas (RF-9): todos los modelos pesan igual.'

export function equalWeights(modelIds: readonly string[]): WeightInfo {
  return {
    weights: Object.fromEntries(modelIds.map((id) => [id, 1])),
    equal: true,
    reason: EQUAL_WEIGHTS_REASON,
  }
}

/** w = 1 / (MAE + ε) (diseño §5.2). Modelos sin MAE reciben el peso medio del resto. Para T-45. */
export function weightsFromMae(maes: Record<string, number | undefined>, eps = 0.1): WeightInfo {
  const known = Object.entries(maes).filter((e): e is [string, number] => e[1] !== undefined)
  if (!known.length) return equalWeights(Object.keys(maes))
  const raw = Object.fromEntries(known.map(([id, mae]) => [id, 1 / (mae + eps)]))
  const mean = Object.values(raw).reduce((a, b) => a + b, 0) / known.length
  const weights = Object.fromEntries(Object.keys(maes).map((id) => [id, raw[id] ?? mean]))
  return {
    weights,
    equal: false,
    reason: 'Pesos inversos al error medio reciente de cada modelo (RF-7).',
  }
}

/** Pares (valor, peso) válidos: sin null/NaN y con peso > 0. */
function pairs(values: readonly (number | null)[], weights: readonly number[]) {
  const out: [number, number][] = []
  values.forEach((v, i) => {
    const w = weights[i] ?? 0
    if (v !== null && Number.isFinite(v) && w > 0) out.push([v, w])
  })
  return out
}

export function weightedMean(
  values: readonly (number | null)[],
  weights: readonly number[],
): number | null {
  const p = pairs(values, weights)
  if (!p.length) return null
  const total = p.reduce((s, [, w]) => s + w, 0)
  return p.reduce((s, [v, w]) => s + v * w, 0) / total
}

/** Mediana ponderada: primer valor cuyo peso acumulado alcanza la mitad; si cae justo en la mitad, promedia. */
export function weightedMedian(
  values: readonly (number | null)[],
  weights: readonly number[],
): number | null {
  const p = pairs(values, weights).sort((a, b) => a[0] - b[0])
  if (!p.length) return null
  const half = p.reduce((s, [, w]) => s + w, 0) / 2
  let acc = 0
  for (let i = 0; i < p.length; i++) {
    acc += p[i][1]
    if (Math.abs(acc - half) < 1e-9 && i + 1 < p.length) return (p[i][0] + p[i + 1][0]) / 2
    if (acc > half) return p[i][0]
  }
  return p[p.length - 1][0]
}

const RAD = Math.PI / 180

/** Componentes u/v (convención meteorológica: dirección de DONDE viene el viento, horaria desde el norte). */
export function toUV(speed: number, directionDeg: number): [number, number] {
  return [-speed * Math.sin(directionDeg * RAD), -speed * Math.cos(directionDeg * RAD)]
}

export function directionFromUV(u: number, v: number): number {
  return (Math.atan2(-u, -v) / RAD + 360) % 360
}

/** Dirección de consenso por media ponderada de u/v. null si no hay datos o el vector medio es casi nulo. */
export function consensusDirection(
  speeds: readonly (number | null)[],
  directions: readonly (number | null)[],
  weights: readonly number[],
  calmKmh = 0.5,
): number | null {
  let u = 0
  let v = 0
  let total = 0
  speeds.forEach((s, i) => {
    const d = directions[i]
    const w = weights[i] ?? 0
    if (s === null || d === null || w <= 0) return
    const [cu, cv] = toUV(s, d)
    u += cu * w
    v += cv * w
    total += w
  })
  if (!total) return null
  u /= total
  v /= total
  return Math.hypot(u, v) < calmKmh ? null : directionFromUV(u, v)
}

export type ConsensusSeries = Record<VariableId, Series> & {
  /** Modelos con dato de temperatura en cada hora. */
  count: number[]
}

/** Consenso hora a hora de todas las variables. */
export function consensusSeries(forecast: MultiModelForecast, info: WeightInfo): ConsensusSeries {
  const w = forecast.models.map((m) => info.weights[m.model.apiId] ?? 0)
  const at = (v: VariableId, i: number) => forecast.models.map((m) => m.values[v][i] ?? null)
  const series = {
    temperature_2m: [],
    wind_speed_10m: [],
    wind_direction_10m: [],
    wind_gusts_10m: [],
    cloud_cover: [],
    precipitation: [],
    count: [],
  } as unknown as ConsensusSeries

  forecast.times.forEach((_, i) => {
    series.temperature_2m.push(weightedMean(at('temperature_2m', i), w))
    series.wind_speed_10m.push(weightedMean(at('wind_speed_10m', i), w))
    series.wind_direction_10m.push(
      consensusDirection(at('wind_speed_10m', i), at('wind_direction_10m', i), w),
    )
    series.wind_gusts_10m.push(weightedMean(at('wind_gusts_10m', i), w))
    series.cloud_cover.push(weightedMean(at('cloud_cover', i), w))
    series.precipitation.push(weightedMedian(at('precipitation', i), w))
    series.count.push(at('temperature_2m', i).filter((x) => x !== null).length)
  })
  return series
}
