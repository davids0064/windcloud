/**
 * Capas de color de pronóstico (T-36, RF-4, RF-5): ráfagas, nubosidad, lluvia y temperatura.
 *
 * El pipeline guarda cada variable como PNG gris con rango fijo (meta.json → scalars). Aquí se arma una tabla de
 * 256 colores decodificando cada gris a su valor físico con la misma fórmula del pipeline (lineal o raíz) y
 * buscando su color en la escala de la variable. MapLibre 6 no tiene `raster-color`: se colorea en el navegador.
 */

export type ScalarName = 'gust' | 'tcc' | 'prate' | 't2m'

export interface ScalarScale {
  min: number
  max: number
  transform: 'linear' | 'sqrt'
}

/** [valor físico, color #rrggbb, opacidad 0–1]. */
export type Stop = [number, string, number]

export interface ScalarStyle {
  label: string
  units: string
  stops: Stop[]
  /** Marcas de la leyenda (valores físicos). */
  ticks: number[]
  note?: string
}

export const SCALAR_STYLES: Record<ScalarName, ScalarStyle> = {
  // Ráfagas: transparente con brisa, de amarillo a magenta con ráfagas fuertes (> 60 km/h = temporal).
  gust: {
    label: 'Ráfagas',
    units: 'km/h',
    stops: [
      [0, '#000000', 0],
      [20, '#ffffcc', 0],
      [30, '#ffeda0', 0.45],
      [45, '#feb24c', 0.6],
      [60, '#f03b20', 0.7],
      [80, '#bd0026', 0.75],
      [110, '#7a0177', 0.8],
    ],
    ticks: [30, 60, 90],
    note: 'Máximo entre la ráfaga del modelo y el viento medio',
  },
  // Nubosidad: blanco que va tapando el mapa (sin color: no compite con la lluvia).
  tcc: {
    label: 'Nubosidad',
    units: '%',
    stops: [
      [0, '#ffffff', 0],
      [20, '#ffffff', 0],
      [50, '#e8edf2', 0.35],
      [80, '#f4f6f8', 0.6],
      [100, '#ffffff', 0.75],
    ],
    ticks: [25, 50, 75, 100],
  },
  // Lluvia: escala tipo radar, transparente por debajo de 0,1 mm/h (llovizna imperceptible).
  prate: {
    label: 'Lluvia (tasa instantánea)',
    units: 'mm/h',
    stops: [
      [0, '#000000', 0],
      [0.1, '#a6d8ff', 0],
      [0.3, '#7fc4ff', 0.55],
      [1, '#2b8cf2', 0.7],
      [4, '#1db35c', 0.75],
      [10, '#f2d21d', 0.8],
      [25, '#f0661d', 0.85],
      [50, '#c4167a', 0.9],
    ],
    ticks: [0.5, 2, 10, 50],
  },
  // Temperatura: azul–amarillo–rojo (divergente apta para daltonismo, tipo RdYlBu).
  t2m: {
    label: 'Temperatura a 2 m',
    units: '°C',
    stops: [
      [-10, '#313695', 0.6],
      [0, '#4575b4', 0.6],
      [8, '#74add1', 0.6],
      [14, '#abd9e9', 0.6],
      [20, '#fee090', 0.6],
      [26, '#fdae61', 0.6],
      [32, '#f46d43', 0.6],
      [40, '#a50026', 0.6],
    ],
    ticks: [0, 10, 20, 30],
  },
}

/** Valor físico de un gris (0–255), igual que `decode_scalar` del pipeline. */
export function decodeGray(gray: number, s: ScalarScale): number {
  const lo = s.transform === 'sqrt' ? Math.sqrt(s.min) : s.min
  const hi = s.transform === 'sqrt' ? Math.sqrt(s.max) : s.max
  const y = lo + (gray / 255) * (hi - lo)
  return s.transform === 'sqrt' ? y * y : y
}

const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

/** Color RGBA (0–255) de un valor físico según la escala (interpolación lineal entre paradas). */
export function colorAt(value: number, stops: Stop[]): [number, number, number, number] {
  if (value <= stops[0][0]) {
    const [r, g, b] = hexRgb(stops[0][1])
    return [r, g, b, Math.round(stops[0][2] * 255)]
  }
  for (let i = 1; i < stops.length; i++) {
    const [v1, c1, a1] = stops[i]
    if (value <= v1) {
      const [v0, c0, a0] = stops[i - 1]
      const t = (value - v0) / (v1 - v0)
      const p = hexRgb(c0)
      const q = hexRgb(c1)
      return [
        Math.round(p[0] + (q[0] - p[0]) * t),
        Math.round(p[1] + (q[1] - p[1]) * t),
        Math.round(p[2] + (q[2] - p[2]) * t),
        Math.round((a0 + (a1 - a0) * t) * 255),
      ]
    }
  }
  const last = stops[stops.length - 1]
  const [r, g, b] = hexRgb(last[1])
  return [r, g, b, Math.round(last[2] * 255)]
}

/** Tabla de 256 colores RGBA para un PNG gris con la escala `scale`. */
export function buildLut(scale: ScalarScale, stops: Stop[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4)
  for (let g = 0; g < 256; g++) lut.set(colorAt(decodeGray(g, scale), stops), g * 4)
  return lut
}

/**
 * Colorea en sitio un RGBA decodificado de un PNG gris+alfa (r = g = b = gris). Píxeles sin dato (alfa 0) quedan
 * transparentes. Sale con alfa normal (no premultiplicado).
 */
export function colorize(rgba: Uint8ClampedArray, lut: Uint8ClampedArray): void {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue
    const k = rgba[i] * 4
    rgba[i] = lut[k]
    rgba[i + 1] = lut[k + 1]
    rgba[i + 2] = lut[k + 2]
    rgba[i + 3] = lut[k + 3]
  }
}

/** CSS linear-gradient de la leyenda (en la escala del PNG: raíz cuadrada para la lluvia). */
export function legendGradient(style: ScalarStyle, scale: ScalarScale): string {
  const parts: string[] = []
  for (let i = 0; i <= 20; i++) {
    const [r, g, b, a] = colorAt(decodeGray((i / 20) * 255, scale), style.stops)
    parts.push(`rgba(${r},${g},${b},${Math.max(a / 255, 0.08).toFixed(2)}) ${i * 5}%`)
  }
  return `linear-gradient(to right, ${parts.join(', ')})`
}

/** Posición (0–1) de una marca en la leyenda según la escala del PNG. */
export function tickPosition(value: number, scale: ScalarScale): number {
  const f = (x: number) => (scale.transform === 'sqrt' ? Math.sqrt(Math.max(0, x)) : x)
  return (f(value) - f(scale.min)) / (f(scale.max) - f(scale.min))
}
