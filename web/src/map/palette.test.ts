import { describe, expect, it, vi } from 'vitest'
import {
  applyDarkPalette,
  applySpanishLabels,
  DARK_PAINT_OVERRIDES,
  SPANISH_NAME_EXPRESSION,
} from './palette'

/** Luminancia relativa WCAG de un color #rrggbb. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('paleta del mapa oscuro', () => {
  const land = DARK_PAINT_OVERRIDES.background['background-color'] as string
  const water = DARK_PAINT_OVERRIDES.water['fill-color'] as string

  it('es más clara que el estilo original (rgb 12,12,12)', () => {
    expect(luminance(land)).toBeGreaterThan(luminance('#0c0c0c') * 3)
  })

  it('nombres de ciudades y países con contraste AA (≥ 4,5:1) sobre la tierra (RNF-7)', () => {
    for (const id of ['place_city', 'place_city_large', 'place_country_major', 'place_town']) {
      expect(
        contrast(DARK_PAINT_OVERRIDES[id]['text-color'] as string, land),
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('el agua se distingue de la tierra', () => {
    expect(contrast(land, water)).toBeGreaterThan(1.2)
  })

  it('solo pinta capas existentes', () => {
    const setPaintProperty = vi.fn()
    const map = { getLayer: (id: string) => (id === 'water' ? {} : undefined), setPaintProperty }
    expect(applyDarkPalette(map as unknown as Parameters<typeof applyDarkPalette>[0])).toBe(1)
    expect(setPaintProperty).toHaveBeenCalledWith('water', 'fill-color', water)
  })
})

describe('nombres en español', () => {
  it('usa name:es con respaldo al nombre local, sin forzar inglés', () => {
    expect(SPANISH_NAME_EXPRESSION[1]).toEqual(['get', 'name:es'])
    expect(JSON.stringify(SPANISH_NAME_EXPRESSION)).not.toContain('name_en')
  })

  it('solo cambia nombres de lugares y agua, no de vías', () => {
    const setLayoutProperty = vi.fn()
    const layers = [
      { id: 'place_city', type: 'symbol' },
      { id: 'place_country_major', type: 'symbol' },
      { id: 'water_name', type: 'symbol' },
      { id: 'highway_name_other', type: 'symbol' },
      { id: 'water', type: 'fill' },
    ]
    const map = { getStyle: () => ({ layers }), setLayoutProperty }
    expect(applySpanishLabels(map as unknown as Parameters<typeof applySpanishLabels>[0])).toBe(3)
    expect(setLayoutProperty.mock.calls.map((c) => c[0])).toEqual([
      'place_city',
      'place_country_major',
      'water_name',
    ])
  })
})
