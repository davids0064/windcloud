/**
 * Antigüedad de los runs de los modelos (P2: hora visible; P4: no presentar como actual algo viejo).
 * Un run se considera atrasado si empezó hace más de `STALE_RUN_HOURS` (los globales salen cada 6–12 h y
 * Open-Meteo los publica unas 3–9 h después; 30 h implica varios ciclos perdidos).
 */
export const STALE_RUN_HOURS = 30

export const isRunStale = (run: Date | null, now: Date) =>
  run !== null && now.getTime() - run.getTime() > STALE_RUN_HOURS * 3_600_000

/** Run más antiguo y más reciente de un conjunto (ignora los desconocidos). */
export function runRange(runs: readonly (Date | null)[]): { oldest: Date; newest: Date } | null {
  const known = runs.filter((r): r is Date => r !== null)
  if (!known.length) return null
  const t = known.map((r) => r.getTime())
  return { oldest: new Date(Math.min(...t)), newest: new Date(Math.max(...t)) }
}

const utc = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
})

/** "13/11, 06:00 UTC" */
export const formatRunUtc = (d: Date) => `${utc.format(d)} UTC`

/** "runs 12/11, 18:00 – 13/11, 06:00 UTC" o "run 13/11, 06:00 UTC" o "runs desconocidos". */
export function formatRunRange(runs: readonly (Date | null)[]): string {
  const r = runRange(runs)
  if (!r) return 'runs desconocidos'
  if (r.oldest.getTime() === r.newest.getTime()) return `run ${formatRunUtc(r.newest)}`
  return `runs ${utc.format(r.oldest)} – ${formatRunUtc(r.newest)}`
}
