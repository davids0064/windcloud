import { describe, expect, it, vi } from 'vitest'
import { FIRE_ARROW_LAYER, FIRES_LAYER, fireAt, setFires } from './fires'

function fakeMap() {
  const layers = new Set<string>()
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  return {
    layers,
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    addLayer: vi.fn((l: { id: string }) => layers.add(l.id)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string) => sources.set(id, { setData: vi.fn() })),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    queryRenderedFeatures: vi.fn(() => [{ properties: { i: 2 } }]),
  }
}
const FC = { type: 'FeatureCollection' as const, features: [] }

describe('capa de focos', () => {
  it('círculos, flecha solo con foco elegido, y se quitan', () => {
    const map = fakeMap()
    setFires(map as never, FC, null)
    expect([...map.layers]).toEqual([FIRES_LAYER])
    setFires(map as never, FC, FC)
    expect(map.layers.has(FIRE_ARROW_LAYER)).toBe(true)
    expect(fireAt(map as never, [0, 0])).toBe(2)
    setFires(map as never, FC, null)
    expect(map.layers.has(FIRE_ARROW_LAYER)).toBe(false)
    setFires(map as never, null, null)
    expect(map.layers.size).toBe(0)
    expect(fireAt(map as never, [0, 0])).toBeNull()
  })
})
