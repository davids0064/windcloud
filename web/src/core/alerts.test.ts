import { describe, expect, it } from 'vitest'
import { checkAlerts, describeExceedance, exceedanceKey, pointKey } from './alerts'

const T0 = Date.parse('2026-11-14T15:00:00Z') // 10:00 a. m. en Colombia
const times = Array.from({ length: 48 }, (_, i) => new Date(T0 + (i - 2) * 3_600_000))
const flat = (v: number) => times.map(() => v)

describe('checkAlerts', () => {
  const now = new Date(T0 + 10 * 60_000) // 10:10 a. m.

  it('detecta el primer exceso y el pico dentro de 24 h', () => {
    const gust = flat(30)
    gust[6] = 55 // +4 h
    gust[8] = 70 // +6 h (pico)
    const out = checkAlerts(
      times,
      { wind_gusts_10m: gust },
      { rafaga: 50, lluvia: null, calor: null },
      now,
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ rule: 'rafaga', threshold: 50, peak: 70 })
    expect(out[0].first.getTime()).toBe(T0 + 4 * 3_600_000)
    expect(out[0].peakAt.getTime()).toBe(T0 + 6 * 3_600_000)
  })

  it('ignora el pasado, lo que está más allá de 24 h, nulos y reglas apagadas', () => {
    const rain = flat(0)
    rain[0] = 50 // hace 2 h
    rain[30] = 50 // +28 h
    rain[5] = null as unknown as number
    const temp = flat(40)
    expect(
      checkAlerts(
        times,
        { precipitation: rain, temperature_2m: temp },
        { rafaga: 50, lluvia: 10, calor: null },
        now,
      ),
    ).toEqual([])
  })

  it('incluye la hora en curso y exige superar (no igualar) el umbral', () => {
    const temp = flat(30)
    temp[2] = 33 // la hora en curso (10:00)
    expect(
      checkAlerts(times, { temperature_2m: temp }, { rafaga: null, lluvia: null, calor: 32 }, now),
    ).toHaveLength(1)
    expect(
      checkAlerts(
        times,
        { temperature_2m: flat(32) },
        { rafaga: null, lluvia: null, calor: 32 },
        now,
      ),
    ).toEqual([])
  })

  it('clave por punto, regla y día local; texto legible', () => {
    const rain = flat(0)
    rain[10] = 12.4 // +8 h = 6:00 p. m. del sáb 14 en Colombia
    const [e] = checkAlerts(
      times,
      { precipitation: rain },
      { rafaga: null, lluvia: 10, calor: null },
      now,
    )
    expect(exceedanceKey(pointKey({ lat: 4.6097, lon: -74.0817 }), e)).toBe(
      '4.61,-74.08|lluvia|2026-11-14',
    )
    expect(describeExceedance(e)).toMatch(
      /^Lluvia de hasta 12,4 mm en 1 h desde sáb,? 6:00\s*p\.\s*m\. \(umbral 10 mm\)$/,
    )
  })
})
