import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ago,
  arrowGeoJSON,
  cardinalName,
  clearFiresCache,
  destination,
  fetchFires,
  firesGeoJSON,
  towardDeg,
  windOutlook,
} from './data'
import { FIRES } from './fixture'

describe('dirección de propagación', () => {
  it('el fuego va hacia donde sopla el viento (al revés de su procedencia)', () => {
    expect(towardDeg(45)).toBe(225) // viento del NE → hacia el SO
    expect(towardDeg(270)).toBe(90)
    expect(cardinalName(225)).toBe('el sudoeste')
    expect(cardinalName(0)).toBe('el norte')
  })

  it('destino a una distancia y rumbo', () => {
    const [lon, lat] = destination(0, 0, 90, 111.195)
    expect(lon).toBeCloseTo(1, 3)
    expect(lat).toBeCloseTo(0, 6)
    const [, lat2] = destination(4, -74, 0, 111.195)
    expect(lat2).toBeCloseTo(5, 3)
  })

  it('flecha con tallo y punta de dos trazos', () => {
    const fc = arrowGeoJSON({ lat: 0, lon: 0 }, 90, 20)
    const [stem, head] = fc.features[0].geometry.coordinates
    expect(stem[0]).toEqual([0, 0])
    expect(stem[1][0]).toBeCloseTo(0.18, 2)
    expect(head[1]).toEqual(stem[1]) // la punta comparte el extremo
    expect(head[0][0]).toBeLessThan(stem[1][0]) // trazos hacia atrás
    expect(Math.sign(head[0][1])).toBe(-Math.sign(head[2][1])) // uno a cada lado
  })
})

describe('windOutlook', () => {
  it('toma la hora más cercana a ahora, +6, +12 y +24 h', () => {
    const t0 = Date.parse('2026-11-14T15:00:00Z')
    const times = Array.from({ length: 30 }, (_, i) => new Date(t0 + i * 3_600_000))
    const rows = windOutlook(
      times,
      {
        wind_speed_10m: times.map((_, i) => i),
        wind_direction_10m: times.map((_, i) => (i === 6 ? null : 45)),
        wind_gusts_10m: times.map(() => 20),
      },
      new Date(t0 + 20 * 60_000),
    )
    expect(rows.map((r) => r.label)).toEqual(['Ahora', 'En 6 h', 'En 12 h', 'En 24 h'])
    expect(rows.map((r) => r.speed)).toEqual([0, 6, 12, 24])
    expect(rows[0]).toMatchObject({ from: 45, toward: 225, towardName: 'el sudoeste', gust: 20 })
    expect(rows[1]).toMatchObject({ toward: null, towardName: 'variable' })
  })
})

describe('focos', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearFiresCache()
  })

  it('GeoJSON con color por confianza y el elegido marcado', () => {
    const fc = firesGeoJSON(FIRES, 1)
    expect(fc.features.map((f) => f.properties.color)).toEqual(['#ff2d2d', '#ff7a1a', '#f2c94c'])
    expect(fc.features.map((f) => f.properties.selected)).toEqual([false, true, false])
    expect(fc.features[0].geometry.coordinates).toEqual([-72.4, 5.6])
  })

  it('«hace X h» desde la pasada del satélite', () => {
    const now = new Date('2026-11-14T16:30:00Z')
    expect(ago('2026-11-14T06:12:00Z', now)).toBe('hace 10 h')
    expect(ago('2026-11-14T16:10:00Z', now)).toBe('hace menos de 1 h')
  })

  it('lee fires.json y no cachea errores', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    )
    await expect(fetchFires('/data')).rejects.toThrow()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => FIRES })),
    )
    await expect(fetchFires('/data')).resolves.toMatchObject({ ventana_h: 48 })
  })
})
