import { describe, expect, it, vi } from 'vitest'
import {
  setStations,
  stationAt,
  stationsGeoJSON,
  STATIONS_LAYER,
  STATIONS_SOURCE,
} from './stations'

const ST = [
  { icao: 'SKBO', nombre: 'Bogotá', lat: 4.7, lon: -74.15, color: '#E69F00', best: 'ICON' },
  { icao: 'SETU', nombre: 'Tulcán', lat: 0.81, lon: -77.7, color: null, best: 'sin muestra' },
]

function fakeMap() {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers = new Set<string>()
  return {
    sources,
    layers,
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string) => sources.set(id, { setData: vi.fn() })),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    addLayer: vi.fn((l: { id: string }) => layers.add(l.id)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    queryRenderedFeatures: vi.fn(() => [
      { properties: { icao: 'SKBO', nombre: 'Bogotá', best: 'ICON' } },
    ]),
  }
}

describe('estaciones en el mapa', () => {
  it('GeoJSON con color, hueco y seleccionada', () => {
    const fc = stationsGeoJSON(ST, 'SETU')
    expect(fc.features[0].geometry.coordinates).toEqual([-74.15, 4.7])
    expect(fc.features[0].properties).toMatchObject({
      color: '#E69F00',
      empty: false,
      selected: false,
    })
    expect(fc.features[1].properties).toMatchObject({ empty: true, selected: true })
  })

  it('crea una vez, actualiza con setData y quita con null', () => {
    const map = fakeMap()
    setStations(map as never, ST, null)
    setStations(map as never, ST, 'SKBO')
    expect(map.addSource).toHaveBeenCalledTimes(1)
    expect(map.addLayer).toHaveBeenCalledTimes(1)
    expect(map.sources.get(STATIONS_SOURCE)!.setData).toHaveBeenCalledTimes(1)
    expect(stationAt(map as never, [0, 0])).toEqual({
      icao: 'SKBO',
      nombre: 'Bogotá',
      best: 'ICON',
    })
    setStations(map as never, null, null)
    expect(map.layers.has(STATIONS_LAYER)).toBe(false)
    expect(map.sources.has(STATIONS_SOURCE)).toBe(false)
    expect(stationAt(map as never, [0, 0])).toBeNull()
  })
})
