import { describe, expect, it, vi } from 'vitest'

vi.mock('maplibre-gl', () => ({ addProtocol: vi.fn(), removeProtocol: vi.fn() }))

import { addProtocol } from 'maplibre-gl'
import { ALPHA_RAMP, applyCloudAlpha, cloudAlpha, registerCloudProtocol } from './cloudAlpha'

describe('cloudAlpha (presentación de nubes)', () => {
  it('suelo oscuro transparente, nube brillante opaca', () => {
    expect(cloudAlpha('visible', 30, 30, 30)).toBe(0)
    expect(cloudAlpha('visible', 220, 220, 220)).toBe(255)
    expect(cloudAlpha('infrarrojo', 80, 80, 80)).toBe(0)
    expect(cloudAlpha('infrarrojo', 230, 230, 230)).toBe(255)
  })

  it('la opacidad crece con el brillo (sin saltos raros)', () => {
    const { lo, hi } = ALPHA_RAMP.visible
    let prev = -1
    for (let v = lo - 10; v <= hi + 10; v += 5) {
      const a = cloudAlpha('visible', v, v, v)
      expect(a).toBeGreaterThanOrEqual(prev)
      prev = a
    }
  })

  it('en infrarrojo los colores (topes muy fríos, tormentas) siempre se ven', () => {
    expect(cloudAlpha('infrarrojo', 255, 0, 0)).toBe(255) // rojo
    expect(cloudAlpha('infrarrojo', 0, 180, 60)).toBe(255) // verde
    expect(cloudAlpha('visible', 255, 0, 0)).toBeLessThan(255) // en visible no hay paleta de color
  })

  it('aplica la opacidad sobre RGBA y respeta la transparencia previa', () => {
    const px = new Uint8ClampedArray([30, 30, 30, 255, 220, 220, 220, 255, 220, 220, 220, 0])
    applyCloudAlpha('visible', px)
    expect(px[3]).toBe(0)
    expect(px[7]).toBe(255)
    expect(px[11]).toBe(0)
  })

  it('registra el protocolo una sola vez', () => {
    registerCloudProtocol()
    registerCloudProtocol()
    expect(addProtocol).toHaveBeenCalledTimes(1)
    expect(vi.mocked(addProtocol).mock.calls[0][0]).toBe('wcnubes')
  })
})
