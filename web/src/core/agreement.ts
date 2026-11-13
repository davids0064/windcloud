/**
 * Acuerdo entre modelos (RF-8, diseño §5.3). Umbrales ajustables, documentados en Metodología (T-60).
 *
 * Dispersión = desviación estándar poblacional entre modelos con dato. Lluvia: fracción de modelos que coinciden
 * con la mayoría sobre "llueve sí/no" (> 0,5 mm). Las ráfagas usan los umbrales del viento (el diseño no los fija).
 */
import type { VariableId } from './variables'

export type AgreementLevel = 'alto' | 'medio' | 'bajo'

export interface Agreement {
  level: AgreementLevel
  /** Desviación estándar (unidades de la variable) o fracción de acuerdo en lluvia (0–1). */
  spread: number
  /** Modelos considerados. */
  n: number
}

/** [alto si ≤, medio si ≤] en unidades de la variable. */
export const SPREAD_THRESHOLDS: Partial<Record<VariableId, [number, number]>> = {
  temperature_2m: [1.0, 2.5],
  wind_speed_10m: [3, 8],
  wind_gusts_10m: [3, 8],
  cloud_cover: [15, 30],
}

export const RAIN_MM = 0.5
/** [alto si ≥, medio si ≥] fracción de modelos de acuerdo sobre lluvia sí/no. */
export const RAIN_AGREEMENT: [number, number] = [0.8, 0.6]

export const LOW_AGREEMENT_WARNING = 'Los modelos no coinciden: pronóstico incierto.'

const valid = (values: readonly (number | null)[]) =>
  values.filter((v): v is number => v !== null && Number.isFinite(v))

export function stdDev(values: readonly (number | null)[]): number | null {
  const x = valid(values)
  if (x.length < 2) return null
  const mean = x.reduce((a, b) => a + b, 0) / x.length
  return Math.sqrt(x.reduce((s, v) => s + (v - mean) ** 2, 0) / x.length)
}

/** Fracción de modelos que coinciden con la mayoría en "llueve > 0,5 mm". */
export function rainAgreementShare(
  values: readonly (number | null)[],
  mm = RAIN_MM,
): number | null {
  const x = valid(values)
  if (x.length < 2) return null
  const wet = x.filter((v) => v > mm).length
  return Math.max(wet, x.length - wet) / x.length
}

/** Acuerdo de una variable en una hora; null si hay < 2 modelos o la variable no se clasifica (dirección). */
export function agreementFor(
  variable: VariableId,
  values: readonly (number | null)[],
): Agreement | null {
  const n = valid(values).length
  if (variable === 'precipitation') {
    const share = rainAgreementShare(values)
    if (share === null) return null
    const [hi, mid] = RAIN_AGREEMENT
    return { level: share >= hi ? 'alto' : share >= mid ? 'medio' : 'bajo', spread: share, n }
  }
  const thresholds = SPREAD_THRESHOLDS[variable]
  const s = stdDev(values)
  if (!thresholds || s === null) return null
  const [hi, mid] = thresholds
  return { level: s <= hi ? 'alto' : s <= mid ? 'medio' : 'bajo', spread: s, n }
}

/** Acuerdo de un periodo: el nivel más frecuente; ante empate, el más pesimista (honestidad, P3). */
export function summarizeAgreement(
  levels: readonly (AgreementLevel | null)[],
): AgreementLevel | null {
  const counts = { alto: 0, medio: 0, bajo: 0 }
  for (const l of levels) if (l) counts[l]++
  const total = counts.alto + counts.medio + counts.bajo
  if (!total) return null
  const order: AgreementLevel[] = ['bajo', 'medio', 'alto'] // empate → el más bajo
  return order.reduce((best, l) => (counts[l] > counts[best] ? l : best), order[0])
}
