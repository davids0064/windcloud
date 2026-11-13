import { describe, expect, it } from 'vitest'
import type { MultiModelForecast } from '../api/openMeteo'
import { consensusSeries, equalWeights } from '../core/consensus'
import { MODELS } from '../core/models'
import { VARIABLES, type VariableId } from '../core/variables'
import { bandSeries, cardinal, cardNow, currentIndex, formatValue, rainNext24h } from './summary'

const H = 30
const times = Array.from({ length: H }, (_, i) => new Date(Date.UTC(2026, 10, 13, i)))
const model = (k: number, v: Partial<Record<VariableId, (number | null)[]>>) => ({
  model: MODELS[k],
  values: Object.fromEntries(VARIABLES.map((x) => [x, v[x] ?? times.map(() => null)])) as Record<
    VariableId,
    (number | null)[]
  >,
})
const fill = (x: number | null) => times.map(() => x)
const forecast = {
  times,
  models: [
    model(0, { temperature_2m: fill(14), precipitation: fill(0.1), wind_gusts_10m: fill(20) }),
    model(1, { temperature_2m: fill(16), precipitation: fill(0) }),
    model(2, { temperature_2m: fill(21), precipitation: fill(2), wind_gusts_10m: fill(60) }),
  ],
  excluded: [],
  timezone: 'America/Bogota',
} as unknown as MultiModelForecast
const consensus = consensusSeries(forecast, equalWeights(forecast.models.map((m) => m.model.apiId)))

describe('resumen del panel', () => {
  it('la hora en curso es la última que ya empezó', () => {
    expect(currentIndex(times, new Date(Date.UTC(2026, 10, 13, 5, 40)))).toBe(5)
    expect(currentIndex(times, new Date(Date.UTC(2026, 10, 12)))).toBe(0)
    expect(currentIndex(times, new Date(Date.UTC(2026, 10, 20)))).toBe(H - 1)
  })

  it('banda mín–máx solo con ≥ 2 modelos', () => {
    const t = bandSeries(forecast, 'temperature_2m')
    expect([t.min[0], t.max[0]]).toEqual([14, 21])
    const one = bandSeries(forecast, 'cloud_cover')
    expect(one.min[0]).toBeNull()
  })

  it('tarjeta de ahora: consenso, rango, modelos y acuerdo', () => {
    const c = cardNow(forecast, consensus, 'temperature_2m', 3)
    expect(c).toMatchObject({ value: 17, min: 14, max: 21, n: 3, period: 'ahora', level: 'bajo' })
    const g = cardNow(forecast, consensus, 'wind_gusts_10m', 3)
    expect(g).toMatchObject({ n: 2, min: 20, max: 60, level: 'bajo' }) // modelo sin ráfagas no cuenta
  })

  it('lluvia de las próximas 24 h: acumulados y acuerdo resumido', () => {
    const r = rainNext24h(forecast, consensus, 0)
    expect(r.period).toBe('24h')
    expect(r.value).toBeCloseTo(24 * 0.1) // mediana por hora = 0,1
    expect(r.min).toBe(0)
    expect(r.max).toBe(48)
    expect(r.level).toBe('medio') // 2 de 3 dicen "no llueve" (> 0,5 mm) cada hora → 67 %
    expect(rainNext24h(forecast, consensus, H - 2).value).toBeCloseTo(0.2) // se corta al final de los datos
  })

  it('puntos cardinales en español y formato es-CO', () => {
    expect(cardinal(0)).toBe('N')
    expect(cardinal(140)).toBe('SE')
    expect(cardinal(225)).toBe('SO')
    expect(cardinal(271)).toBe('O')
    expect(cardinal(359)).toBe('N')
    expect(cardinal(null)).toBe('variable')
    expect(formatValue('temperature_2m', 16.06)).toBe('16,1')
    expect(formatValue('wind_speed_10m', 11.8)).toBe('12')
    expect(formatValue('precipitation', null)).toBe('—')
  })
})
