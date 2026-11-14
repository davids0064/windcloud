/**
 * Alertas por ubicación (T-53, RF-12, diseño §8). TS puro.
 *
 * El usuario fija un punto y umbrales; mientras la página está abierta se revisa el **consenso** de las
 * próximas 24 h. Cada regla avisa una sola vez por día local (no se repite en cada revisión ni cuando un
 * run nuevo corre la hora unas horas).
 */
import type { Series } from '../api/openMeteo'

export type AlertRuleId = 'rafaga' | 'lluvia' | 'calor'

export interface AlertRule {
  id: AlertRuleId
  label: string
  /** Variable del consenso que se compara. */
  variable: 'wind_gusts_10m' | 'precipitation' | 'temperature_2m'
  unit: string
  /** Texto del umbral: «ráfagas de más de 50 km/h». */
  describe: (threshold: number) => string
  default: number
  min: number
  max: number
  step: number
}

export const ALERT_RULES: AlertRule[] = [
  {
    id: 'rafaga',
    label: 'Ráfagas',
    variable: 'wind_gusts_10m',
    unit: 'km/h',
    describe: (x) => `ráfagas de más de ${x} km/h`,
    default: 50,
    min: 20,
    max: 150,
    step: 5,
  },
  {
    id: 'lluvia',
    label: 'Lluvia en 1 h',
    variable: 'precipitation',
    unit: 'mm',
    describe: (x) => `más de ${x} mm de lluvia en una hora`,
    default: 10,
    min: 1,
    max: 100,
    step: 1,
  },
  {
    id: 'calor',
    label: 'Temperatura',
    variable: 'temperature_2m',
    unit: '°C',
    describe: (x) => `más de ${x} °C`,
    default: 32,
    min: 15,
    max: 45,
    step: 1,
  },
]

export const ALERT_HORIZON_H = 24
export const CHECK_EVERY_MS = 15 * 60_000

/** Umbral por regla; null = regla apagada. */
export type AlertThresholds = Record<AlertRuleId, number | null>

export const DEFAULT_THRESHOLDS: AlertThresholds = { rafaga: 50, lluvia: 10, calor: null }

export interface Exceedance {
  rule: AlertRuleId
  threshold: number
  /** Primera hora que supera el umbral. */
  first: Date
  peak: number
  peakAt: Date
}

/**
 * Reglas que el consenso supera en las próximas `horizonH` horas (desde la hora en curso).
 * `consensus` trae una serie por variable alineada con `times`.
 */
export function checkAlerts(
  times: readonly Date[],
  consensus: Partial<Record<AlertRule['variable'], Series>>,
  thresholds: AlertThresholds,
  now: Date,
  horizonH = ALERT_HORIZON_H,
): Exceedance[] {
  const from = now.getTime() - 3_600_000 // incluye la hora en curso
  const to = now.getTime() + horizonH * 3_600_000
  const out: Exceedance[] = []
  for (const rule of ALERT_RULES) {
    const threshold = thresholds[rule.id]
    const series = consensus[rule.variable]
    if (threshold === null || !series) continue
    let hit = null as Exceedance | null
    for (let i = 0; i < times.length; i++) {
      const t = times[i]
      const v = series[i]
      const ms = t.getTime()
      if (v === null || v === undefined || ms <= from || ms > to || v <= threshold) continue
      if (!hit) hit = { rule: rule.id, threshold, first: t, peak: v, peakAt: t }
      else if (v > hit.peak) {
        hit.peak = v
        hit.peakAt = t
      }
    }
    if (hit) out.push(hit)
  }
  return out
}

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Clave para avisar una sola vez: punto + regla + día local del primer exceso. */
export const exceedanceKey = (pointKey: string, e: Exceedance) =>
  `${pointKey}|${e.rule}|${dayFmt.format(e.first)}`

export const pointKey = (p: { lat: number; lon: number }) =>
  `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`

const hourFmt = new Intl.DateTimeFormat('es-CO', {
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Bogota',
})
const one = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

/** «Ráfagas de hasta 62 km/h desde sáb 3:00 p. m. (umbral 50 km/h)». */
export function describeExceedance(e: Exceedance): string {
  const rule = ALERT_RULES.find((r) => r.id === e.rule)!
  const what = { rafaga: 'Ráfagas', lluvia: 'Lluvia', calor: 'Temperatura' }[e.rule]
  const peak =
    e.rule === 'lluvia' ? `${one.format(e.peak)} mm en 1 h` : `${Math.round(e.peak)} ${rule.unit}`
  return `${what} de hasta ${peak} desde ${hourFmt.format(e.first)} (umbral ${e.threshold} ${rule.unit})`
}
