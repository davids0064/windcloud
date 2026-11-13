import { describe, expect, it } from 'vitest'
import { DARK_PAINT_OVERRIDES } from '../map/palette'
import { buildRamp, rampGradient, WIND_STOPS } from './colorRamp'
import {
  nearestStepIndex,
  runAgeHours,
  staleHours,
  windFileUrl,
  windFrame,
  type GridMeta,
  type LoadedMeta,
} from './meta'
import { mercBounds, mercX, mercY, spawnRect, speedUniform } from './motion'
import { AdaptiveCount, initialParticleCount, MIN_PARTICLES, stateResolution } from './particles'

const lum = (r: number, g: number, b: number) => {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const hexLum = (h: string) =>
  lum(...([1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]))
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

describe('escala de color del viento', () => {
  const ramp = buildRamp()
  const land = hexLum(DARK_PAINT_OVERRIDES.background['background-color'] as string)

  it('256 colores opacos que empiezan y terminan en los extremos de la escala', () => {
    expect(ramp).toHaveLength(1024)
    expect([...ramp.slice(0, 3)]).toEqual([0x96, 0x8c, 0xe0])
    expect([...ramp.slice(1020, 1023)]).toEqual([0xfd, 0xe7, 0x25])
    for (let i = 3; i < 1024; i += 4) expect(ramp[i]).toBe(255)
  })

  it('luminosidad monótona (lectura sin depender del tono, RNF-7)', () => {
    let prev = -1
    for (let i = 0; i < 256; i += 8) {
      const l = lum(ramp[i * 4], ramp[i * 4 + 1], ramp[i * 4 + 2])
      expect(l).toBeGreaterThanOrEqual(prev - 0.005)
      prev = l
    }
  })

  it('hasta el viento más flojo contrasta con la tierra del mapa oscuro (≥ 3:1)', () => {
    for (let i = 0; i < 256; i += 4) {
      expect(
        contrast(lum(ramp[i * 4], ramp[i * 4 + 1], ramp[i * 4 + 2]), land),
      ).toBeGreaterThanOrEqual(3)
    }
  })

  it('la leyenda usa los mismos colores', () => {
    expect(rampGradient()).toContain(WIND_STOPS[0][1])
    expect(rampGradient()).toContain('#fde725 100%')
  })
})

describe('Mercator y movimiento', () => {
  const bounds = { west: -100, east: -50, north: 25, south: -20 }

  it('coordenadas Mercator normalizadas como MapLibre', () => {
    expect(mercX(-180)).toBe(0)
    expect(mercX(0)).toBe(0.5)
    expect(mercY(0)).toBeCloseTo(0.5)
    expect(mercY(25)).toBeLessThan(mercY(-20)) // y crece hacia el sur
    const [x0, y0, x1, y1] = mercBounds(bounds)
    expect(x0).toBeLessThan(x1)
    expect(y0).toBeLessThan(y1)
  })

  it('la velocidad en uv se reduce a la mitad al subir un nivel de zoom (avance en pantalla constante)', () => {
    const m = mercBounds(bounds)
    const [sx5, sy5] = speedUniform(5, m)
    const [sx6] = speedUniform(6, m)
    expect(sx6).toBeCloseTo(sx5 / 2)
    // 10 m/s a zoom 5 avanza 0,18 px por (m/s) por cuadro → 1,8 px
    const px = 10 * sx5 * 512 * 2 ** 5 * (m[2] - m[0])
    expect(px).toBeCloseTo(1.8)
    expect(sy5).toBeGreaterThan(0)
  })

  it('las partículas reaparecen solo en la parte visible de la rejilla', () => {
    const r = spawnRect({ west: -80, east: -66, north: 13, south: -5 }, bounds)!
    expect(r[0]).toBeCloseTo(0.4)
    expect(r[2]).toBeCloseTo(0.68)
    expect(r[1]).toBeGreaterThan(0)
    expect(r[3]).toBeLessThan(1)
    expect(spawnRect({ west: -180, east: 180, north: 85, south: -85 }, bounds)).toEqual([
      0, 0, 1, 1,
    ])
    expect(spawnRect({ west: 10, east: 20, north: 50, south: 40 }, bounds)).toBeNull() // Europa: fuera
  })
})

describe('número de partículas (RNF-3)', () => {
  it('8 000 en móvil y 40 000 en escritorio', () => {
    expect(initialParticleCount({ width: 390, coarsePointer: true })).toBe(8000)
    expect(initialParticleCount({ width: 1440, coarsePointer: false })).toBe(40000)
    expect(initialParticleCount({ width: 1024, coarsePointer: true })).toBe(8000) // tableta táctil
    expect(stateResolution(40000)).toBe(200)
    expect(stateResolution(8000)).toBe(90)
  })

  it('reduce a la mitad solo con lentitud sostenida (< 30 fps) y nunca baja del mínimo', () => {
    const a = new AdaptiveCount(40000, 1000)
    let t = 0
    const run = (fps: number, ms: number) => {
      const changes: number[] = []
      for (let k = 0; k < (fps * ms) / 1000; k++) {
        t += 1000 / fps
        const c = a.tick(t)
        if (c !== null) changes.push(c)
      }
      return changes
    }
    a.tick(0)
    expect(run(60, 5000)).toEqual([]) // rápido: nunca reduce
    expect(run(20, 1000)).toEqual([]) // un instante lento: aún no
    expect(run(20, 3000)).toEqual([20000]) // lento sostenido: reduce a la mitad
    expect(a.lastFps).toBeCloseTo(20, 0)
    run(10, 30000)
    expect(a.count).toBe(MIN_PARTICLES)
  })
})

describe('meta.json', () => {
  const meta = {
    validTimes: ['2026-11-13T06:00:00Z', '2026-11-13T09:00:00Z', '2026-11-13T12:00:00Z'],
    steps: [0, 3, 6],
    run: '2026-11-13T06:00:00Z',
    wind: {
      file: 'wind_{level}_{step}.png',
      levels: {
        '10m': { label: '10 m', frames: [{ step: 3, uMin: -1, uMax: 2, vMin: -3, vMax: 4 }] },
      },
    },
  } as unknown as GridMeta

  it('elige la hora válida más cercana a ahora', () => {
    expect(nearestStepIndex(meta, new Date('2026-11-13T10:20:00Z'))).toBe(1)
    expect(nearestStepIndex(meta, new Date('2026-11-13T11:00:00Z'))).toBe(2)
    expect(nearestStepIndex(meta, new Date('2026-11-12T00:00:00Z'))).toBe(0)
  })

  it('arma la URL del PNG y lee el rango del cuadro', () => {
    const loaded = { meta, base: '/data/gfs/2026111306' } as LoadedMeta
    expect(windFileUrl(loaded, '10m', 3)).toBe('/data/gfs/2026111306/wind_10m_003.png')
    expect(windFrame(meta, '10m', 3)).toMatchObject({ uMin: -1, vMax: 4 })
    expect(() => windFrame(meta, '10m', 99)).toThrow('Sin cuadro')
  })

  it('umbral de aviso por modelo según su latencia real', () => {
    expect(staleHours('gfs')).toBe(9)
    expect(staleHours('ecmwf')).toBe(14)
    expect(staleHours('otro')).toBe(9)
  })

  it('antigüedad del run en horas (fase 2: < 9 h)', () => {
    expect(runAgeHours(meta, new Date('2026-11-13T15:20:00Z'))).toBeCloseTo(9.33, 1)
  })
})
