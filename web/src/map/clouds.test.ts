import { describe, expect, it, vi } from 'vitest'
import { CLOUD_LAYERS } from '../api/gibs'
import {
  clearClouds,
  cloudId,
  ensureAllCloudFrames,
  ensureCloudFrame,
  showCloudFrame,
} from './clouds'

function fakeMap() {
  const layers: { id: string; type: string; paint?: Record<string, unknown> }[] = [
    { id: 'background', type: 'background' },
    { id: 'wc-departamentos-relleno', type: 'fill' },
    { id: 'place_city', type: 'symbol' },
  ]
  const sources = new Map<string, Record<string, unknown>>()
  const map = {
    getStyle: () => ({ layers }),
    getLayer: (id: string) => layers.find((l) => l.id === id),
    addLayer: vi.fn((layer: (typeof layers)[0], before?: string) => {
      const i = before ? layers.findIndex((l) => l.id === before) : layers.length
      layers.splice(i, 0, layer)
    }),
    removeLayer: vi.fn((id: string) =>
      layers.splice(
        layers.findIndex((l) => l.id === id),
        1,
      ),
    ),
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string, s: Record<string, unknown>) => sources.set(id, s)),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    setPaintProperty: vi.fn((id: string, prop: string, v: unknown) => {
      const l = layers.find((x) => x.id === id)!
      l.paint = { ...l.paint, [prop]: v }
    }),
  }
  return { map, layers, sources, ids: () => layers.map((l) => l.id) }
}

const frames = [new Date('2026-11-13T12:20:00Z'), new Date('2026-11-13T12:40:00Z')]

const ten = Array.from({ length: 10 }, (_, i) => new Date(Date.UTC(2026, 10, 13, 10, i * 20)))

describe('capa de nubes', () => {
  it('al abrir crea solo el cuadro visible, debajo de los departamentos', () => {
    const f = fakeMap()
    ensureCloudFrame(
      f.map as never,
      CLOUD_LAYERS.infrarrojo,
      frames,
      1,
      'wc-departamentos-relleno',
      '',
    )
    ensureCloudFrame(
      f.map as never,
      CLOUD_LAYERS.infrarrojo,
      frames,
      1,
      'wc-departamentos-relleno',
      '',
    )
    expect(f.ids()).toEqual(['background', cloudId(1), 'wc-departamentos-relleno', 'place_city'])
    const src = f.sources.get(cloudId(1))!
    expect(src).toMatchObject({ type: 'raster', maxzoom: 6 })
    expect(String((src.tiles as string[])[0])).toContain('2026-11-13T12:40:00Z')
    expect(src.attribution).toMatch(/NASA GIBS/)
  })

  it('al reproducir crea todos, empezando por el visible para que cargue primero', () => {
    const f = fakeMap()
    ensureAllCloudFrames(f.map as never, CLOUD_LAYERS.visible, ten, 9)
    const order = f.map.addSource.mock.calls.map((c) => c[0])
    expect(order).toHaveLength(10)
    expect(order[0]).toBe(cloudId(9))
    expect(new Set(order).size).toBe(10)
  })

  it('animar solo cambia la opacidad del cuadro visible', () => {
    const f = fakeMap()
    ensureAllCloudFrames(f.map as never, CLOUD_LAYERS.visible, frames, 1)
    showCloudFrame(f.map as never, frames.length, 1, 0.9)
    expect(f.layers.find((l) => l.id === cloudId(0))!.paint!['raster-opacity']).toBe(0)
    expect(f.layers.find((l) => l.id === cloudId(1))!.paint!['raster-opacity']).toBe(0.9)
  })

  it('apagar o cambiar de cuadros quita todas las capas y fuentes', () => {
    const f = fakeMap()
    ensureAllCloudFrames(f.map as never, CLOUD_LAYERS.visible, frames, 1)
    clearClouds(f.map as never)
    expect(f.ids().some((id) => id.startsWith('wc-nubes-'))).toBe(false)
    expect(f.sources.size).toBe(0)
  })
})
