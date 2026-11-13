import { describe, expect, it } from 'vitest'
import { agreementFor, rainAgreementShare, stdDev, summarizeAgreement } from './agreement'

describe('dispersión', () => {
  it('desviación estándar poblacional; < 2 valores → null', () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2)
    expect(stdDev([5, null])).toBeNull()
    expect(stdDev([])).toBeNull()
  })
})

describe('acuerdo (diseño §5.3)', () => {
  it('temperatura: ≤ 1,0 alto · ≤ 2,5 medio · > 2,5 bajo (bordes incluidos)', () => {
    expect(agreementFor('temperature_2m', [14, 16])!.level).toBe('alto') // s = 1,0
    expect(agreementFor('temperature_2m', [13, 18])!.level).toBe('medio') // s = 2,5
    expect(agreementFor('temperature_2m', [12, 18])!.level).toBe('bajo') // s = 3,0
  })

  it('viento y ráfagas: ≤ 3 alto · ≤ 8 medio · > 8 bajo km/h', () => {
    expect(agreementFor('wind_speed_10m', [10, 16])!.level).toBe('alto')
    expect(agreementFor('wind_speed_10m', [10, 26])!.level).toBe('medio')
    expect(agreementFor('wind_gusts_10m', [10, 30])!.level).toBe('bajo')
  })

  it('nubosidad: ≤ 15 alto · ≤ 30 medio · > 30 bajo %', () => {
    expect(agreementFor('cloud_cover', [40, 70])!.level).toBe('alto')
    expect(agreementFor('cloud_cover', [20, 80])!.level).toBe('medio')
    expect(agreementFor('cloud_cover', [0, 100])!.level).toBe('bajo')
  })

  it('lluvia: fracción de modelos que coinciden en sí/no (> 0,5 mm)', () => {
    expect(rainAgreementShare([0, 0, 0, 0, 2])).toBe(0.8)
    expect(agreementFor('precipitation', [0, 0, 0, 0, 2])!.level).toBe('alto')
    expect(agreementFor('precipitation', [0, 0, 0, 2, 3])!.level).toBe('medio')
    expect(agreementFor('precipitation', [0, 0, 1, 2])!.level).toBe('bajo') // 50 %
    expect(agreementFor('precipitation', [0.5, 0.4])!.spread).toBe(1) // 0,5 no cuenta como lluvia
  })

  it('sin suficientes modelos o variable no clasificable → null', () => {
    expect(agreementFor('temperature_2m', [14, null])).toBeNull()
    expect(agreementFor('precipitation', [1])).toBeNull()
    expect(agreementFor('wind_direction_10m', [10, 20])).toBeNull()
  })

  it('informa cuántos modelos se usaron', () => {
    expect(agreementFor('temperature_2m', [14, 15, null, 16])!.n).toBe(3)
  })
})

describe('resumen de un periodo', () => {
  it('nivel más frecuente; empate → el más pesimista', () => {
    expect(summarizeAgreement(['alto', 'alto', 'medio'])).toBe('alto')
    expect(summarizeAgreement(['alto', 'medio'])).toBe('medio')
    expect(summarizeAgreement(['bajo', 'alto'])).toBe('bajo')
    expect(summarizeAgreement([null, null])).toBeNull()
  })
})
