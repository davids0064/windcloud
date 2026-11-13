import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import {
  applyBasemap,
  BASEMAPS,
  basemapLayerVisibility,
  DEM_TERRAIN_SOURCE,
  HILLSHADE_LAYER,
  INITIAL_VIEW,
  installBasemapSources,
  RELIEF_PITCH,
  SATELLITE_LAYER,
} from './basemaps'

/** Mapa falso con lo mínimo que usan installBasemapSources/applyBasemap. */
function fakeMap() {
  const layers: { id: string; type: string; layout?: { visibility?: string } }[] = [
    { id: 'background', type: 'background' },
    { id: 'water', type: 'fill' },
    { id: 'landcover_wood', type: 'fill' },
    { id: 'waterway', type: 'line' },
    { id: 'boundary_country_z5-', type: 'line' },
    { id: 'place_city', type: 'symbol' },
  ]
  const sources = new Map<string, unknown>()
  let pitch = 0
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string, spec: unknown) => sources.set(id, spec)),
    getLayer: (id: string) => layers.find((l) => l.id === id),
    addLayer: vi.fn(
      (layer: { id: string; type: string; layout?: { visibility?: string } }, before?: string) => {
        const i = before ? layers.findIndex((l) => l.id === before) : layers.length
        layers.splice(i, 0, layer)
      },
    ),
    getStyle: () => ({ layers }),
    setLayoutProperty: vi.fn((id: string, _prop: string, value: string) => {
      const l = layers.find((x) => x.id === id)!
      l.layout = { ...l.layout, visibility: value }
    }),
    setTerrain: vi.fn(),
    easeTo: vi.fn(({ pitch: p }: { pitch: number }) => (pitch = p)),
    getPitch: () => pitch,
  }
  const visibility = (id: string) =>
    layers.find((l) => l.id === id)?.layout?.visibility ?? 'visible'
  const order = () => layers.map((l) => l.id)
  return { map, asMap: map as unknown as MapLibreMap, visibility, order }
}

describe('basemaps', () => {
  it('ofrece oscuro, satélite y relieve 3D (RF-1)', () => {
    expect(BASEMAPS.map((b) => b.id)).toEqual(['oscuro', 'satelite', 'relieve'])
  })

  it('abre centrado en Colombia: lat 4.5, lon −74, zoom 5 (RF-1)', () => {
    expect(INITIAL_VIEW).toEqual({ center: [-74.0, 4.5], zoom: 5 })
  })

  it('cada base muestra solo su capa propia', () => {
    expect(basemapLayerVisibility('oscuro')).toEqual({
      [SATELLITE_LAYER]: 'none',
      [HILLSHADE_LAYER]: 'none',
    })
    expect(basemapLayerVisibility('satelite')[SATELLITE_LAYER]).toBe('visible')
    expect(basemapLayerVisibility('relieve')[HILLSHADE_LAYER]).toBe('visible')
  })

  it('instala satélite y sombreado sobre el fondo y bajo el agua, una sola vez', () => {
    const f = fakeMap()
    installBasemapSources(f.asMap)
    installBasemapSources(f.asMap)
    expect(f.map.addSource).toHaveBeenCalledTimes(3)
    expect(f.map.addLayer).toHaveBeenCalledTimes(2)
    expect(f.order()).toEqual([
      'background',
      SATELLITE_LAYER,
      HILLSHADE_LAYER,
      'water',
      'landcover_wood',
      'waterway',
      'boundary_country_z5-',
      'place_city',
    ])
  })

  it('satélite oculta rellenos pero conserva fronteras y nombres', () => {
    const f = fakeMap()
    installBasemapSources(f.asMap)
    applyBasemap(f.asMap, 'satelite')
    expect(f.visibility(SATELLITE_LAYER)).toBe('visible')
    expect(f.visibility('water')).toBe('none')
    expect(f.visibility('boundary_country_z5-')).toBe('visible')
    expect(f.visibility('place_city')).toBe('visible')
    expect(f.map.setTerrain).toHaveBeenLastCalledWith(null)
  })

  it('relieve activa terreno 3D e inclina la cámara; volver a oscuro lo deshace', () => {
    const f = fakeMap()
    installBasemapSources(f.asMap)
    applyBasemap(f.asMap, 'relieve')
    expect(f.map.setTerrain).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: DEM_TERRAIN_SOURCE }),
    )
    expect(f.map.getPitch()).toBe(RELIEF_PITCH)
    expect(f.visibility(HILLSHADE_LAYER)).toBe('visible')

    applyBasemap(f.asMap, 'oscuro')
    expect(f.map.setTerrain).toHaveBeenLastCalledWith(null)
    expect(f.map.getPitch()).toBe(0)
    expect(f.visibility(HILLSHADE_LAYER)).toBe('none')
    expect(f.visibility('water')).toBe('visible')
  })
})
