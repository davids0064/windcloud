/**
 * Contraste WCAG 2.1 (T-61, RNF-7): texto normal ≥ 4,5:1 y elementos gráficos ≥ 3:1. Los colores se leen del
 * CSS real (variables de `index.css`), así que un cambio de paleta que rompa AA hace fallar esta prueba.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FIRE_COLORS } from '../fires/data'
import { AGE_BINS } from '../lightning/data'
import { RISK_COLORS } from '../risk/data'

const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')
const tokens = Object.fromEntries(
  [...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]),
)
const color = (c: string) => tokens[c] ?? c

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function ratio(a: string, b: string): number {
  const [l1, l2] = [luminance(color(a)), luminance(color(b))].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

const BACKGROUNDS = ['bg', 'surface', 'surface-2']

/** Fondos de las insignias de acuerdo (alto, medio, bajo), leídos de PointPanel.css. */
const panelCss = readFileSync(join(process.cwd(), 'src/point/PointPanel.css'), 'utf8')
const AGREEMENT = ['alto', 'medio', 'bajo'].map(
  (l) =>
    panelCss.match(new RegExp(`\\.agreement--${l} \\{[^}]*background: (#[0-9a-f]{6})`, 'i'))![1],
)

// Simulación de daltonismo (Machado, Oliveira y Fernandes 2009, severidad 1) y diferencia CIE76 en Lab.
const CVD: Record<string, number[][]> = {
  normal: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  protanopía: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopía: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopía: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}
const srgbLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
function lab(hex: string, m: number[][]): number[] {
  const c = [1, 3, 5].map((i) => srgbLin(parseInt(hex.slice(i, i + 2), 16) / 255))
  const [r, g, b] = m.map((row) =>
    Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2])),
  )
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
const deltaE = (a: string, b: string, m: number[][]) => {
  const [p, q] = [lab(a, m), lab(b, m)]
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

describe('contraste AA', () => {
  it('texto y acentos sobre todos los fondos (≥ 4,5:1)', () => {
    const fails: string[] = []
    for (const fg of [
      'text',
      'text-muted',
      'accent',
      'observed',
      'forecast',
      'estimated',
      '#f2c94c',
    ]) {
      for (const bg of BACKGROUNDS) {
        const r = ratio(fg, bg)
        if (r < 4.5) fails.push(`${fg} sobre ${bg}: ${r.toFixed(2)}`)
      }
    }
    expect(fails).toEqual([])
  })

  it('insignias de acuerdo: texto oscuro sobre color (≥ 4,5:1)', () => {
    for (const bg of AGREEMENT) {
      expect(ratio('#0b0d10', bg)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('marcas del mapa y leyendas distinguibles del fondo (≥ 3:1)', () => {
    const marks = [
      ...RISK_COLORS.incendio.slice(1),
      RISK_COLORS.viento[1],
      RISK_COLORS.lluvia[1],
      RISK_COLORS.calor[1],
      ...Object.values(FIRE_COLORS),
      ...AGE_BINS.map((b) => b.color),
    ]
    const fails = marks
      .filter((c) => ratio(c, 'bg') < 3)
      .map((c) => `${c}: ${ratio(c, 'bg').toFixed(2)}`)
    expect(fails).toEqual([])
  })
})

describe('daltonismo (RNF-7)', () => {
  /** Escalas de clases: cada tono debe distinguirse del vecino con cualquier tipo de visión (ΔE ≥ 12). */
  const SCALES: Record<string, string[]> = {
    'acuerdo alto/medio/bajo': AGREEMENT,
    'acuerdo alto/bajo': [AGREEMENT[0], AGREEMENT[2]],
    'riesgo de incendio': RISK_COLORS.incendio.slice(1),
    'confianza de focos': [FIRE_COLORS.baja, FIRE_COLORS.nominal, FIRE_COLORS.alta],
    'antigüedad de rayos': AGE_BINS.map((b) => b.color),
    'tipo de dato': [color('observed'), color('forecast'), color('estimated')],
  }
  it('tonos vecinos distinguibles con protanopía, deuteranopía y tritanopía', () => {
    const fails: string[] = []
    for (const [name, cols] of Object.entries(SCALES)) {
      for (const [vision, m] of Object.entries(CVD)) {
        for (let i = 1; i < cols.length; i++) {
          const d = deltaE(cols[i - 1], cols[i], m)
          if (d < 12)
            fails.push(`${name} (${vision}) ${cols[i - 1]}→${cols[i]}: ΔE ${d.toFixed(0)}`)
        }
      }
    }
    expect(fails).toEqual([])
  })
})
