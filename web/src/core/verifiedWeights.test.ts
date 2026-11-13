import { describe, expect, it } from 'vitest'
import { MODELS } from './models'
import {
  consensusWeights,
  distanceKm,
  MIN_VERIFIED_DAYS,
  nearestStation,
  normalizedWeights,
} from './verifiedWeights'
import { scores, SUMMARY } from '../precision/fixture'
import type { PrecisionSummary, StationDetail } from '../precision/data'

const ids = MODELS.map((m) => m.apiId)
const BOGOTA = { lat: 4.61, lon: -74.08 }
const days = (n: number) =>
  Array.from({ length: n }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`)

function summaryWith(nDays: number): PrecisionSummary {
  return {
    ...SUMMARY,
    ventanas: { ...SUMMARY.ventanas, '30': { ...SUMMARY.ventanas['30'], dias: days(nDays) } },
  }
}

const detail = (n = 300): StationDetail => ({
  schema: 1,
  generatedAt: SUMMARY.generatedAt,
  hasta: SUMMARY.hasta,
  icao: 'SKBO',
  ventanas: { '30': { metricas: scores(1, n), ranking: {} } },
})

describe('distancias', () => {
  it('Bogotá centro → El Dorado ≈ 12 km; la más cercana a menos de 150 km', () => {
    expect(distanceKm(4.61, -74.08, 4.7, -74.15)).toBeCloseTo(12.6, 0)
    expect(nearestStation(BOGOTA.lat, BOGOTA.lon, SUMMARY.estaciones)?.station.icao).toBe('SKBO')
    expect(nearestStation(-34.6, -58.4, SUMMARY.estaciones)).toBeNull() // Buenos Aires
  })
})

describe('consensusWeights', () => {
  it('sin verificación publicada → pesos iguales con el motivo', () => {
    const w = consensusWeights(ids, BOGOTA, null, null)
    expect(w.weighted).toBe(false)
    expect(w.base.equal).toBe(true)
    expect(w.reason).toMatch(/Sin datos de verificación/)
  })

  it('sin estación a menos de 150 km → pesos iguales', () => {
    const w = consensusWeights(ids, { lat: -34.6, lon: -58.4 }, summaryWith(30), detail())
    expect(w.near).toBeNull()
    expect(w.reason).toMatch(/150 km/)
  })

  it('con menos de 14 días → pesos iguales y dice cuántos lleva', () => {
    const w = consensusWeights(ids, BOGOTA, summaryWith(10), detail())
    expect(w.weighted).toBe(false)
    expect(w.near?.station.icao).toBe('SKBO')
    expect(w.reason).toContain(`10 de ${MIN_VERIFIED_DAYS} días`)
    expect(w.reason).toContain('SKBO (Bogota/El Dorado, a 13 km)')
  })

  it('sin detalle o sin muestra suficiente → pesos iguales', () => {
    expect(consensusWeights(ids, BOGOTA, summaryWith(14), null).reason).toMatch(/Sin métricas/)
    expect(consensusWeights(ids, BOGOTA, summaryWith(14), detail(5)).reason).toMatch(
      /muestra suficiente/,
    )
  })

  it('con 14 días: temperatura y viento ponderados (menos error, más peso); nubes y lluvia iguales', () => {
    const w = consensusWeights(ids, BOGOTA, summaryWith(14), detail())
    expect(w.weighted).toBe(true)
    expect(Object.keys(w.byVariable).sort()).toEqual(
      ['temperature_2m', 'wind_direction_10m', 'wind_gusts_10m', 'wind_speed_10m'].sort(),
    )
    const t = w.byVariable.temperature_2m!.weights
    expect(t[ids[0]]).toBeCloseTo(1 / (1 + 0.1)) // MAE 1,0 + ε
    expect(t[ids[0]]).toBeGreaterThan(t[ids[7]])
    expect(w.byVariable.cloud_cover).toBeUndefined()
    expect(w.base.equal).toBe(true)
    expect(w.reason).toMatch(/Temperatura y viento ponderados.*SKBO/)
    const n = normalizedWeights(w.byVariable.temperature_2m!, ids)
    expect(Object.values(n).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })

  it('un modelo sin muestra en la estación recibe el peso medio del resto', () => {
    const d = detail()
    d.ventanas['30']!.metricas.temperatura[`${ids[2]}_d1`] = { n: 3, mae: 0.1, sesgo: 0, rmse: 0 }
    const t = consensusWeights(ids, BOGOTA, summaryWith(14), d).byVariable.temperature_2m!.weights
    const others = ids.filter((_, i) => i !== 2).map((id) => t[id])
    expect(t[ids[2]]).toBeCloseTo(others.reduce((a, b) => a + b, 0) / others.length)
  })

  it('normalizedWeights con pesos nulos no divide por cero', () => {
    expect(normalizedWeights({ weights: {}, equal: true, reason: '' }, ['a'])).toEqual({ a: 0 })
  })
})
