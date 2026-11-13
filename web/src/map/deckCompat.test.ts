import { describe, expect, it } from 'vitest'
import { installDeckTransformShim, type LegacyTransform, type MapLike } from './deckCompat'

function fakeMap(elevation: number, height: number) {
  const state = { elevation, height }
  const map: MapLike = {
    getCameraTargetElevation: () => state.elevation,
    getCanvas: () => ({ clientHeight: state.height }),
  }
  return {
    map,
    state,
    transform: () => (map as unknown as { transform: LegacyTransform }).transform,
  }
}

describe('installDeckTransformShim', () => {
  it('expone elevation y height vivos desde la API pública de MapLibre 6', () => {
    const f = fakeMap(2600, 800)
    installDeckTransformShim(f.map)
    expect(f.transform().elevation).toBe(2600)
    expect(f.transform().height).toBe(800)

    f.state.elevation = 0
    f.state.height = 640
    expect(f.transform().elevation).toBe(0)
    expect(f.transform().height).toBe(640)
  })

  it('deja near/far indefinidos para que deck.gl use su cálculo por defecto', () => {
    const f = fakeMap(0, 600)
    installDeckTransformShim(f.map)
    expect(Number.isFinite(f.transform()._nearZ)).toBe(false)
  })

  it('no toca mapas que ya tienen transform (MapLibre ≤ 5)', () => {
    const original = { elevation: 1 }
    const map = {
      transform: original,
      getCameraTargetElevation: () => 99,
      getCanvas: () => ({ clientHeight: 1 }),
    }
    installDeckTransformShim(map)
    expect(map.transform).toBe(original)
  })
})
