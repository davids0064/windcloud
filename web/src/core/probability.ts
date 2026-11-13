/**
 * Probabilidad de lluvia por ensamble (RF-6, diseño §5.4). TS puro.
 *
 * P(lluvia en un día) = miembros cuyo acumulado del día supera 1 mm / miembros con datos suficientes ese día.
 * Días en la hora local del punto. El día de hoy cuenta solo desde la hora en curso ("resto del día").
 * Acuerdo entre ensambles: diferencia en puntos porcentuales (≤ 15 alto, ≤ 30 medio, > 30 bajo).
 */
import type { AgreementLevel } from './agreement'

export const RAIN_DAY_MM = 1
/** Un miembro cuenta en un día si tiene dato en al menos esta fracción de sus horas. */
export const MIN_COVERAGE = 0.9
export const PROB_AGREEMENT_PTS: [number, number] = [15, 30]

export interface DayProbability {
  /** Fecha local "AAAA-MM-DD". */
  day: string
  wet: number
  total: number
  /** 0–1, o null si ningún miembro tiene datos suficientes. */
  p: number | null
  /** true si el día está incompleto (hoy desde ahora, o el último día cortado). */
  partial: boolean
}

/** Fecha local "AAAA-MM-DD" de un instante, dado el desfase UTC del punto. */
export function localDay(t: Date, utcOffsetSeconds: number): string {
  return new Date(t.getTime() + utcOffsetSeconds * 1000).toISOString().slice(0, 10)
}

export function dailyRainProbability(
  times: readonly Date[],
  members: readonly (readonly (number | null)[])[],
  utcOffsetSeconds: number,
  fromIndex = 0,
  thresholdMm = RAIN_DAY_MM,
): DayProbability[] {
  // Agrupar índices horarios por día local, desde `fromIndex`.
  const days = new Map<string, number[]>()
  for (let i = fromIndex; i < times.length; i++) {
    const d = localDay(times[i], utcOffsetSeconds)
    if (!days.has(d)) days.set(d, [])
    days.get(d)!.push(i)
  }
  return [...days.entries()].map(([day, idx]) => {
    let wet = 0
    let total = 0
    for (const series of members) {
      let sum = 0
      let have = 0
      for (const i of idx) {
        const v = series[i]
        if (v !== null && v !== undefined && Number.isFinite(v)) {
          sum += v
          have++
        }
      }
      if (have / idx.length < MIN_COVERAGE) continue
      total++
      if (sum > thresholdMm) wet++
    }
    return { day, wet, total, p: total ? wet / total : null, partial: idx.length < 24 }
  })
}

/** Acuerdo entre dos (o más) ensambles para un mismo día. */
export function probabilityAgreement(ps: readonly (number | null)[]): AgreementLevel | null {
  const x = ps.filter((p): p is number => p !== null)
  if (x.length < 2) return null
  const diff = (Math.max(...x) - Math.min(...x)) * 100
  const [hi, mid] = PROB_AGREEMENT_PTS
  return diff <= hi ? 'alto' : diff <= mid ? 'medio' : 'bajo'
}
