/**
 * Fondo transparente para las teselas de nubes de GIBS (que llegan opacas).
 *
 * Solo cambia la PRESENTACIÓN, no el dato: el brillo de cada píxel se convierte en opacidad para que se vea
 * el mapa debajo. Nubes brillantes/frías → opacas; suelo oscuro/cálido → transparente. En infrarrojo los píxeles
 * de color (topes muy fríos, tormentas) se dejan siempre opacos. Documentar en Metodología (T-60).
 */
import { addProtocol, removeProtocol } from 'maplibre-gl'
import { CLOUD_PROTOCOL, parseProtocolUrl, type CloudKind } from '../api/gibs'

/** Umbrales de brillo (0–255) entre los que la opacidad pasa de 0 a 1. Ajustados con teselas reales. */
export const ALPHA_RAMP: Record<CloudKind, { lo: number; hi: number }> = {
  visible: { lo: 55, hi: 165 },
  infrarrojo: { lo: 105, hi: 200 },
}
/** Diferencia entre canales a partir de la cual un píxel IR se considera "coloreado" (tope muy frío). */
export const COLOR_SATURATION = 40

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** ¿Píxel IR coloreado (tope muy frío)? */
const isColored = (r: number, g: number, b: number) =>
  Math.max(r, g, b) - Math.min(r, g, b) > COLOR_SATURATION

/** Opacidad 0–255 de un píxel de nube. */
export function cloudAlpha(kind: CloudKind, r: number, g: number, b: number): number {
  if (kind === 'infrarrojo' && isColored(r, g, b)) return 255
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  const { lo, hi } = ALPHA_RAMP[kind]
  const t = clamp01((lum - lo) / (hi - lo))
  return Math.round(t * t * (3 - 2 * t) * 255) // suavizado (smoothstep)
}

/**
 * Aplica la opacidad en sitio sobre un RGBA (ImageData.data) y aclara el gris de las nubes hacia blanco, para
 * que contrasten tanto en el mapa oscuro como sobre la imagen satelital. Los colores IR (tormentas) no se tocan.
 */
export function applyCloudAlpha(kind: CloudKind, rgba: Uint8ClampedArray): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]
    const g = rgba[i + 1]
    const b = rgba[i + 2]
    const a = cloudAlpha(kind, r, g, b)
    if (kind === 'visible' || !isColored(r, g, b)) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      const v = Math.min(255, kind === 'visible' ? lum * 1.15 + 20 : lum * 0.6 + 110)
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v
    }
    rgba[i + 3] = Math.round((a * rgba[i + 3]) / 255)
  }
}

let registered = false

/** Registra el protocolo `wcnubes://` en MapLibre (una vez). */
export function registerCloudProtocol(): void {
  if (registered) return
  addProtocol(CLOUD_PROTOCOL, async (params, abortController) => {
    const parsed = parseProtocolUrl(params.url)
    if (!parsed) throw new Error(`URL de nubes no válida: ${params.url}`)
    const res = await fetch(parsed.https, { signal: abortController.signal })
    if (!res.ok) throw new Error(`GIBS HTTP ${res.status}`)
    const bitmap = await createImageBitmap(await res.blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return { data: bitmap }
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    applyCloudAlpha(parsed.kind, img.data)
    return { data: await createImageBitmap(img) }
  })
  registered = true
}

/** Solo para pruebas / recarga en caliente. */
export function unregisterCloudProtocol(): void {
  if (!registered) return
  removeProtocol(CLOUD_PROTOCOL)
  registered = false
}
