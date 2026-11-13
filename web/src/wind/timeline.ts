/** Textos de la línea de tiempo del viento (T-35). Puros para poder probarlos. */
import type { GridMeta, WindLevel } from './meta'

export const LEVEL_LABELS: Record<WindLevel, { short: string; long: string }> = {
  '10m': { short: '10 m', long: 'Viento a 10 m del suelo' },
  '850': { short: '~1,5 km', long: 'Viento a 850 hPa (~1,5 km de altura)' },
  '500': { short: '~5,5 km', long: 'Viento a 500 hPa (~5,5 km de altura)' },
}

/** "+21 h" desde el inicio del run. */
export const leadLabel = (step: number) => `+${step} h`

/** "jue 14, 7:00 a. m." en la zona horaria indicada (o la del navegador). */
export function validLabel(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    weekday: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  })
}

/** Posición (0–1) de "ahora" en la línea de tiempo, o null si cae fuera. */
export function nowPosition(meta: Pick<GridMeta, 'validTimes'>, now: Date): number | null {
  const t0 = Date.parse(meta.validTimes[0])
  const t1 = Date.parse(meta.validTimes[meta.validTimes.length - 1])
  const t = now.getTime()
  if (t < t0 || t > t1 || t1 === t0) return null
  return (t - t0) / (t1 - t0)
}

/** "hace 2 h", "dentro de 21 h" o "ahora" respecto a la hora válida. */
export function relativeLabel(iso: string, now: Date): string {
  const h = Math.round((Date.parse(iso) - now.getTime()) / 3_600_000)
  if (h === 0) return 'ahora'
  return h > 0 ? `dentro de ${h} h` : `hace ${-h} h`
}
