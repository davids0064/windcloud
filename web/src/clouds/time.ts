/** Formatos de hora para datos observados (P2: fuente + hora; P4: antigüedad visible). */

const utcFmt = new Intl.DateTimeFormat('es-CO', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
})
const localFmt = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' })

export const formatUtc = (d: Date) => `${utcFmt.format(d)} UTC`
export const formatLocal = (d: Date) => localFmt.format(d)

/** "hace 50 min", "hace 2 h 10 min", "hace menos de 1 min". */
export function formatAge(date: Date, now: Date): string {
  const min = Math.floor((now.getTime() - date.getTime()) / 60_000)
  if (min < 1) return 'hace menos de 1 min'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `hace ${h} h ${m} min` : `hace ${h} h`
}

/** La imagen más reciente se considera atrasada si supera este retraso (GIBS suele ir ~40–60 min detrás). */
export const STALE_AFTER_MIN = 120

export const isStale = (latest: Date, now: Date) =>
  now.getTime() - latest.getTime() > STALE_AFTER_MIN * 60_000
