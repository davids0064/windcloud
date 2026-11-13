/**
 * Protocolo `wcescalar://{variable}/{ruta}` para MapLibre: descarga el PNG gris de la ruta (mismo origen),
 * lo colorea con la tabla registrada para esa variable y devuelve un ImageBitmap. Solo cambia la presentación.
 */
import { addProtocol } from 'maplibre-gl'
import { colorize } from './scalarStyles'
import { parseScalarUrl, SCALAR_PROTOCOL } from './scalarUrl'

const luts = new Map<string, Uint8ClampedArray>()

export const setScalarLut = (name: string, lut: Uint8ClampedArray) => luts.set(name, lut)

let registered = false
export function registerScalarProtocol(): void {
  if (registered) return
  addProtocol(SCALAR_PROTOCOL, async (params, abort) => {
    const parsed = parseScalarUrl(params.url)
    const lut = parsed && luts.get(parsed.name)
    if (!parsed || !lut) throw new Error(`Capa de color sin escala: ${params.url}`)
    const res = await fetch(parsed.path, { signal: abort.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const bmp = await createImageBitmap(await res.blob(), {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    })
    const canvas = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(bmp, 0, 0)
    bmp.close()
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    colorize(img.data, lut)
    return { data: await createImageBitmap(img) }
  })
  registered = true
}
