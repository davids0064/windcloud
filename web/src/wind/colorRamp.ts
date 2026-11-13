/**
 * Escala de color del viento: tipo viridis aclarada (apta para daltonismo, RNF-7, y visible sobre el mapa
 * oscuro incluso con viento flojo; ver prueba de contraste).
 * Velocidad de referencia (color máximo) por nivel: el viento en altura es mucho más fuerte.
 */
import type { WindLevel } from './meta'

export const WIND_STOPS: [number, string][] = [
  // Variante clara de viridis para fondo oscuro: el viento flojo (lo más común tierra adentro en Colombia)
  // debe verse sobre el gris pizarra del mapa. La luminosidad crece de forma monótona (apta para daltonismo).
  [0.0, '#968ce0'],
  [0.25, '#5d97de'],
  [0.5, '#2fb5ad'],
  [0.75, '#93d65a'],
  [1.0, '#fde725'],
]

/** m/s a los que se llega al color máximo. */
export const SPEED_MAX_MS: Record<WindLevel, number> = { '10m': 15, '850': 25, '500': 40 }

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

/** Rampa de 256 colores RGBA (textura 256 × 1). */
export function buildRamp(stops: [number, string][] = WIND_STOPS): Uint8Array {
  const out = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    let k = 0
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++
    const [t0, c0] = stops[k]
    const [t1, c1] = stops[k + 1]
    const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))
    const a = hex(c0)
    const b = hex(c1)
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(a[c] + (b[c] - a[c]) * f)
    out[i * 4 + 3] = 255
  }
  return out
}

/** CSS linear-gradient para la leyenda (mismos colores que la textura). */
export const rampGradient = (stops: [number, string][] = WIND_STOPS) =>
  `linear-gradient(to right, ${stops.map(([t, c]) => `${c} ${t * 100}%`).join(', ')})`
