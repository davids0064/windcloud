/** Reloj UTC + hora local (diseño §9, P6: hora local con UTC visible). */
const utcFmt = new Intl.DateTimeFormat('es-CO', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
})
const localFmt = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' })

export function clockParts(now: Date, timeZone?: string) {
  const local = timeZone
    ? new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone }).format(now)
    : localFmt.format(now)
  return { utc: `${utcFmt.format(now)} UTC`, local }
}
