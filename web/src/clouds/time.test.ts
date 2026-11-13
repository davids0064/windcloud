import { describe, expect, it } from 'vitest'
import { formatAge, formatUtc, isStale } from './time'

const now = new Date('2026-11-13T13:30:00Z')

describe('horas de datos observados', () => {
  it('muestra la hora UTC en 24 h', () => {
    expect(formatUtc(new Date('2026-11-13T08:05:00Z'))).toBe('08:05 UTC')
  })

  it('describe la antigüedad (P4)', () => {
    expect(formatAge(new Date('2026-11-13T13:29:40Z'), now)).toBe('hace menos de 1 min')
    expect(formatAge(new Date('2026-11-13T12:40:00Z'), now)).toBe('hace 50 min')
    expect(formatAge(new Date('2026-11-13T11:00:00Z'), now)).toBe('hace 2 h 30 min')
    expect(formatAge(new Date('2026-11-13T11:30:00Z'), now)).toBe('hace 2 h')
  })

  it('marca como atrasada una imagen de más de 2 h', () => {
    expect(isStale(new Date('2026-11-13T12:40:00Z'), now)).toBe(false)
    expect(isStale(new Date('2026-11-13T11:00:00Z'), now)).toBe(true)
  })
})
