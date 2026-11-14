import { describe, expect, it, vi } from 'vitest'
import { RISK_LAYER, RISK_SOURCE, riskCellAt, setRiskCells } from './risk'

function fakeMap() {
  const layers = new Set<string>()
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  return {
    layers,
    sources,
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    addLayer: vi.fn((l: { id: string }) => layers.add(l.id)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string) => sources.set(id, { setData: vi.fn() })),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    queryRenderedFeatures: vi.fn(() => [{ properties: { i: 7 } }]),
  }
}

const FC = { type: 'FeatureCollection' as const, features: [] }

describe('capa de riesgo', () => {
  it('crea, actualiza y quita la capa', () => {
    const map = fakeMap()
    setRiskCells(map as never, FC, 'no-existe')
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: RISK_LAYER }),
      undefined,
    )
    setRiskCells(map as never, FC)
    expect(map.sources.get(RISK_SOURCE)?.setData).toHaveBeenCalledWith(FC)
    expect(map.addLayer).toHaveBeenCalledTimes(1)
    expect(riskCellAt(map as never, [0, 0])).toBe(7)
    setRiskCells(map as never, null)
    expect(map.layers.size + map.sources.size).toBe(0)
    expect(riskCellAt(map as never, [0, 0])).toBeNull()
  })
})
