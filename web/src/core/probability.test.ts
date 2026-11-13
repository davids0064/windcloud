import { describe, expect, it } from 'vitest'
import { dailyRainProbability, localDay, probabilityAgreement } from './probability'

const OFFSET = -5 * 3600 // Bogotá
// 48 h desde 2026-11-13 00:00 hora local (= 05:00 UTC)
const times = Array.from({ length: 48 }, (_, i) => new Date(Date.UTC(2026, 10, 13, 5 + i)))
const member = (perHourDay1: number, perHourDay2: number) =>
  times.map((_, i) => (i < 24 ? perHourDay1 : perHourDay2))

describe('probabilidad de lluvia por ensamble (§5.4)', () => {
  it('agrupa por día LOCAL del punto', () => {
    expect(localDay(new Date('2026-11-14T03:00:00Z'), OFFSET)).toBe('2026-11-13')
    expect(localDay(new Date('2026-11-14T05:00:00Z'), OFFSET)).toBe('2026-11-14')
  })

  it('P = miembros con acumulado diario > 1 mm / miembros con datos', () => {
    const members = [member(0.1, 0), member(0.05, 0), member(0, 0), member(0.02, 0.5)]
    // Día 1: acumulados 2,4 · 1,2 · 0 · 0,48 → 2 de 4. Día 2: 0 · 0 · 0 · 12 → 1 de 4.
    const days = dailyRainProbability(times, members, OFFSET)
    expect(days.map((d) => [d.day, d.wet, d.total, d.p])).toEqual([
      ['2026-11-13', 2, 4, 0.5],
      ['2026-11-14', 1, 4, 0.25],
    ])
    expect(days.every((d) => !d.partial)).toBe(true)
  })

  it('exactamente 1 mm no cuenta como lluvia (umbral estricto)', () => {
    const days = dailyRainProbability(times, [member(1 / 24, 0)], OFFSET)
    expect(days[0].wet).toBe(0)
  })

  it('hoy cuenta solo desde la hora en curso y se marca parcial', () => {
    const wetEarly = times.map((_, i) => (i < 6 ? 5 : 0)) // llovió de madrugada, ya pasó
    const days = dailyRainProbability(times, [wetEarly], OFFSET, 10)
    expect(days[0]).toMatchObject({ day: '2026-11-13', wet: 0, total: 1, partial: true })
  })

  it('excluye miembros con menos del 90 % de horas con dato; sin miembros → null', () => {
    const gappy = times.map((_, i) => (i % 5 === 0 ? null : 1))
    const days = dailyRainProbability(times, [gappy, member(1, 1)], OFFSET)
    expect(days[0].total).toBe(1)
    expect(dailyRainProbability(times, [times.map(() => null)], OFFSET)[0].p).toBeNull()
  })

  it('acuerdo entre ensambles por diferencia en puntos', () => {
    expect(probabilityAgreement([0.6, 0.7])).toBe('alto')
    expect(probabilityAgreement([0.6, 0.85])).toBe('medio')
    expect(probabilityAgreement([0.59, 1])).toBe('bajo') // caso real Bogotá: ECMWF 59 % vs GFS 100 %
    expect(probabilityAgreement([0.5, null])).toBeNull()
  })
})
