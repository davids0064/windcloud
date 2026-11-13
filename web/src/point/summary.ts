/**
 * Lógica pura del panel de punto (T-22): qué hora es "ahora", banda de dispersión y datos de las tarjetas.
 */
import type { MultiModelForecast, Series } from '../api/openMeteo'
import {
  agreementFor,
  summarizeAgreement,
  type Agreement,
  type AgreementLevel,
} from '../core/agreement'
import type { ConsensusSeries } from '../core/consensus'
import type { VariableId } from '../core/variables'

/** Índice de la hora en curso (la última hora que ya empezó); 0 si todo es futuro. */
export function currentIndex(times: readonly Date[], now: Date): number {
  let idx = 0
  for (let i = 0; i < times.length; i++) {
    if (times[i].getTime() <= now.getTime()) idx = i
    else break
  }
  return idx
}

/** Valores de todos los modelos en una hora. */
export const valuesAt = (f: MultiModelForecast, v: VariableId, i: number) =>
  f.models.map((m) => m.values[v][i] ?? null)

/** Mínimo y máximo entre modelos, hora a hora (banda de dispersión de la gráfica). */
export function bandSeries(f: MultiModelForecast, v: VariableId): { min: Series; max: Series } {
  const min: Series = []
  const max: Series = []
  f.times.forEach((_, i) => {
    const x = valuesAt(f, v, i).filter((n): n is number => n !== null)
    min.push(x.length >= 2 ? Math.min(...x) : null)
    max.push(x.length >= 2 ? Math.max(...x) : null)
  })
  return { min, max }
}

export interface CardData {
  variable: VariableId
  /** Valor de consenso (o acumulado, para lluvia). */
  value: number | null
  /** Rango entre modelos en esa hora/periodo. */
  min: number | null
  max: number | null
  level: AgreementLevel | null
  agreement: Agreement | null
  /** Modelos con dato. */
  n: number
  /** 'ahora' = hora en curso; '24h' = próximas 24 h. */
  period: 'ahora' | '24h'
}

function range(values: (number | null)[]) {
  const x = values.filter((n): n is number => n !== null)
  return x.length
    ? { min: Math.min(...x), max: Math.max(...x), n: x.length }
    : { min: null, max: null, n: 0 }
}

/** Tarjeta de una variable en la hora `i`. */
export function cardNow(
  f: MultiModelForecast,
  c: ConsensusSeries,
  v: VariableId,
  i: number,
): CardData {
  const values = valuesAt(f, v, i)
  const agreement = agreementFor(v, values)
  return {
    variable: v,
    value: c[v][i] ?? null,
    ...range(values),
    level: agreement?.level ?? null,
    agreement,
    period: 'ahora',
  }
}

/**
 * Lluvia de las próximas 24 h: acumulado del consenso; rango = acumulado de cada modelo; acuerdo = resumen
 * (pesimista ante empate) del acuerdo hora a hora.
 */
export function rainNext24h(f: MultiModelForecast, c: ConsensusSeries, i: number): CardData {
  const end = Math.min(i + 24, f.times.length)
  const sum = (s: Series) => {
    let total = 0
    let any = false
    for (let k = i; k < end; k++) {
      if (s[k] !== null) {
        total += s[k]!
        any = true
      }
    }
    return any ? total : null
  }
  const perModel = f.models.map((m) => sum(m.values.precipitation))
  const levels: (AgreementLevel | null)[] = []
  for (let k = i; k < end; k++)
    levels.push(agreementFor('precipitation', valuesAt(f, 'precipitation', k))?.level ?? null)
  return {
    variable: 'precipitation',
    value: sum(c.precipitation),
    ...range(perModel),
    level: summarizeAgreement(levels),
    agreement: null,
    period: '24h',
  }
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const

/** Punto cardinal en español (de dónde viene el viento). */
export function cardinal(deg: number | null): string {
  if (deg === null) return 'variable'
  return CARDINALS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}

const decimals: Record<VariableId, number> = {
  temperature_2m: 1,
  wind_speed_10m: 0,
  wind_direction_10m: 0,
  wind_gusts_10m: 0,
  cloud_cover: 0,
  precipitation: 1,
}

export function formatValue(v: VariableId, x: number | null): string {
  if (x === null) return '—'
  return x.toLocaleString('es-CO', {
    minimumFractionDigits: decimals[v],
    maximumFractionDigits: decimals[v],
  })
}
