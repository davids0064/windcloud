import { describe, expect, it } from 'vitest'
import { formatRunRange, formatRunUtc, isRunStale, runRange, STALE_RUN_HOURS } from './runs'

const now = new Date('2026-11-13T14:30:00Z')
const r = (iso: string) => new Date(iso)

describe('runs de los modelos', () => {
  it('atrasado si empezó hace más de 30 h; desconocido nunca se marca', () => {
    expect(STALE_RUN_HOURS).toBe(30)
    expect(isRunStale(r('2026-11-13T06:00:00Z'), now)).toBe(false)
    expect(isRunStale(r('2026-11-12T18:00:00Z'), now)).toBe(false) // JMA, ~20 h
    expect(isRunStale(r('2026-05-26T00:00:00Z'), now)).toBe(true) // caso real: cmc_gem_gdps congelado
    expect(isRunStale(null, now)).toBe(false)
  })

  it('rango de runs ignorando desconocidos', () => {
    const range = runRange([r('2026-11-13T06:00:00Z'), null, r('2026-11-12T18:00:00Z')])!
    expect(range.oldest.toISOString()).toBe('2026-11-12T18:00:00.000Z')
    expect(range.newest.toISOString()).toBe('2026-11-13T06:00:00.000Z')
    expect(runRange([null])).toBeNull()
  })

  it('texto en UTC para la línea de fuente', () => {
    expect(formatRunUtc(r('2026-11-13T06:00:00Z'))).toBe('13/11, 06:00 UTC')
    expect(formatRunRange([r('2026-11-13T06:00:00Z'), r('2026-11-12T18:00:00Z')])).toBe(
      'runs 12/11, 18:00 – 13/11, 06:00 UTC',
    )
    expect(formatRunRange([r('2026-11-13T06:00:00Z')])).toBe('run 13/11, 06:00 UTC')
    expect(formatRunRange([null, null])).toBe('runs desconocidos')
  })
})
