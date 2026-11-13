import { describe, expect, it } from 'vitest'
import type { MultiModelForecast } from '../api/openMeteo'
import {
  consensusDirection,
  consensusSeries,
  directionFromUV,
  EQUAL_WEIGHTS_REASON,
  equalWeights,
  toUV,
  weightedMean,
  weightedMedian,
  weightsFromMae,
} from './consensus'
import { MODELS } from './models'
import { VARIABLES, type VariableId } from './variables'

describe('media y mediana ponderadas', () => {
  it('media con pesos iguales y desiguales', () => {
    expect(weightedMean([10, 20, 30], [1, 1, 1])).toBe(20)
    expect(weightedMean([10, 20], [3, 1])).toBe(12.5)
  })

  it('excluye null, NaN y pesos ≤ 0; sin datos → null', () => {
    expect(weightedMean([10, null, 30, NaN], [1, 1, 1, 1])).toBe(20)
    expect(weightedMean([10, 99], [1, 0])).toBe(10)
    expect(weightedMean([null, null], [1, 1])).toBeNull()
    expect(weightedMean([], [])).toBeNull()
  })

  it('mediana ponderada es robusta a un modelo que exagera la lluvia', () => {
    expect(weightedMedian([0, 0.2, 0.3, 45], [1, 1, 1, 1])).toBeCloseTo(0.25)
    expect(weightedMean([0, 0.2, 0.3, 45], [1, 1, 1, 1])).toBeGreaterThan(11)
  })

  it('mediana: impar, peso dominante, nulls y vacío', () => {
    expect(weightedMedian([3, 1, 2], [1, 1, 1])).toBe(2)
    expect(weightedMedian([1, 2, 3], [1, 1, 5])).toBe(3)
    expect(weightedMedian([null, 4], [1, 1])).toBe(4)
    expect(weightedMedian([null], [1])).toBeNull()
  })
})

describe('viento: u/v', () => {
  it('ida y vuelta grados ↔ u/v (convención meteorológica)', () => {
    for (const dir of [0, 45, 90, 180, 270, 359]) {
      const [u, v] = toUV(10, dir)
      expect(directionFromUV(u, v)).toBeCloseTo(dir % 360, 6)
    }
    const [u, v] = toUV(10, 90) // viento DEL este sopla hacia el oeste → u negativo
    expect(u).toBeCloseTo(-10)
    expect(v).toBeCloseTo(0)
  })

  it('350° y 10° dan 0° (norte), nunca 180°', () => {
    const d = consensusDirection([10, 10], [350, 10], [1, 1])!
    expect(Math.min(d, 360 - d)).toBeCloseTo(0, 6)
  })

  it('vientos opuestos de igual fuerza no tienen dirección definida', () => {
    expect(consensusDirection([10, 10], [90, 270], [1, 1])).toBeNull()
  })

  it('respeta pesos e ignora modelos sin dato', () => {
    expect(consensusDirection([10, 10, null], [0, 90, 200], [3, 0, 1])).toBeCloseTo(0, 6)
    expect(consensusDirection([null], [null], [1])).toBeNull()
  })
})

describe('pesos', () => {
  it('iguales lo dicen explícitamente (RF-7)', () => {
    const w = equalWeights(['a', 'b'])
    expect(w).toEqual({ weights: { a: 1, b: 1 }, equal: true, reason: EQUAL_WEIGHTS_REASON })
  })

  it('inversos al MAE; modelos sin MAE reciben el peso medio', () => {
    const w = weightsFromMae({ a: 0.9, b: 1.9, c: undefined })
    expect(w.equal).toBe(false)
    expect(w.weights.a).toBeCloseTo(1)
    expect(w.weights.b).toBeCloseTo(0.5)
    expect(w.weights.c).toBeCloseTo(0.75)
    expect(weightsFromMae({ a: undefined }).equal).toBe(true)
  })
})

describe('consensusSeries', () => {
  const series = (vals: (number | null)[]) => vals
  const model = (i: number, v: Partial<Record<VariableId, (number | null)[]>>) => ({
    model: MODELS[i],
    values: Object.fromEntries(VARIABLES.map((k) => [k, v[k] ?? [null, null]])) as Record<
      VariableId,
      (number | null)[]
    >,
  })
  const forecast = {
    times: [new Date('2026-11-13T12:00:00Z'), new Date('2026-11-13T13:00:00Z')],
    models: [
      model(0, {
        temperature_2m: series([14, 15]),
        wind_speed_10m: [10, 10],
        wind_direction_10m: [350, 0],
        precipitation: [0, 2],
        cloud_cover: [50, 60],
        wind_gusts_10m: [20, 22],
      }),
      model(1, {
        temperature_2m: series([16, null]),
        wind_speed_10m: [20, null],
        wind_direction_10m: [10, null],
        precipitation: [0.2, null],
        cloud_cover: [70, null],
      }),
      model(2, {
        temperature_2m: series([15, 17]),
        wind_speed_10m: [12, 14],
        wind_direction_10m: [5, 10],
        precipitation: [30, 1],
        cloud_cover: [60, 80],
        wind_gusts_10m: [24, 26],
      }),
    ],
  } as unknown as MultiModelForecast

  it('calcula cada variable hora a hora ignorando modelos sin dato', () => {
    const ids = forecast.models.map((m) => m.model.apiId)
    const c = consensusSeries(forecast, equalWeights(ids))
    expect(c.temperature_2m).toEqual([15, 16])
    expect(c.count).toEqual([3, 2])
    expect(c.wind_speed_10m[0]).toBeCloseTo(14)
    expect(c.cloud_cover).toEqual([60, 70])
    expect(c.wind_gusts_10m).toEqual([22, 24]) // AIFS sin ráfagas: se excluye
    expect(c.precipitation[0]).toBe(0.2) // mediana, no la media 10,07
    expect(c.precipitation[1]).toBe(1.5)
    const d = c.wind_direction_10m[0]!
    expect(Math.min(d, 360 - d)).toBeLessThan(10)
  })

  it('un modelo con peso 0 no influye', () => {
    const c = consensusSeries(forecast, {
      weights: { [MODELS[0].apiId]: 1, [MODELS[1].apiId]: 0, [MODELS[2].apiId]: 1 },
      equal: false,
      reason: '',
    })
    expect(c.temperature_2m[0]).toBe(14.5)
  })
})

describe('consensusSeries con pesos por variable (T-45)', () => {
  it('aplica los pesos solo a la variable indicada', () => {
    const models = ['a', 'b'].map((apiId, i) => ({
      model: { apiId } as never,
      values: {
        temperature_2m: [10 + i * 10],
        wind_speed_10m: [10 + i * 10],
        wind_direction_10m: [0],
        wind_gusts_10m: [null],
        cloud_cover: [10 + i * 10],
        precipitation: [0],
      },
    }))
    const forecast = { times: [0], models } as never
    const base = equalWeights(['a', 'b'])
    const heavyA = { weights: { a: 3, b: 1 }, equal: false, reason: '' }
    const c = consensusSeries(forecast, base, { temperature_2m: heavyA })
    expect(c.temperature_2m[0]).toBeCloseTo(12.5) // (10·3 + 20·1) / 4
    expect(c.cloud_cover[0]).toBeCloseTo(15) // sin pesos propios: iguales
    expect(c.wind_speed_10m[0]).toBeCloseTo(15)
  })
})
