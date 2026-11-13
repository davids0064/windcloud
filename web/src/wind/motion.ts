/**
 * Matemática compartida entre la GPU (shaders) y las pruebas: Mercator normalizado (0–1, como
 * MapLibre MercatorCoordinate), rectángulo de aparición y velocidad de las partículas por zoom.
 */
import type { GridMeta } from './meta'

export const mercX = (lon: number) => (lon + 180) / 360
export const mercY = (lat: number) => {
  const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180
  return (1 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / Math.PI) / 2
}

/** Límites de la rejilla en Mercator: [x0 (oeste), y0 (norte), x1 (este), y1 (sur)]. */
export function mercBounds(b: GridMeta['bounds']): [number, number, number, number] {
  return [mercX(b.west), mercY(b.north), mercX(b.east), mercY(b.south)]
}

/**
 * Desplazamiento en coordenadas de textura (uv) por cada m/s y por cuadro, para que una partícula avance
 * `pxPerMs` píxeles de pantalla por cada m/s. En Mercator la escala es igual en x e y en cada latitud y
 * se cancela con la de la rejilla (también Mercator): no depende de la latitud.
 *   metros/píxel = C·cos(lat) / (512·2^zoom);  metros/uv = span·C·cos(lat)  ⇒  uv = v·pxPerMs / (512·2^zoom·span)
 */
export function speedUniform(
  zoom: number,
  bounds: [number, number, number, number],
  pxPerMs = 0.18,
): [number, number] {
  const world = 512 * 2 ** zoom
  return [pxPerMs / (world * (bounds[2] - bounds[0])), pxPerMs / (world * (bounds[3] - bounds[1]))]
}

/** Rectángulo uv [x0, y0, x1, y1] visible dentro de la rejilla; null si no se ven. */
export function spawnRect(
  view: { west: number; east: number; north: number; south: number },
  b: GridMeta['bounds'],
): [number, number, number, number] | null {
  const [gx0, gy0, gx1, gy1] = mercBounds(b)
  const toU = (lon: number) => (mercX(lon) - gx0) / (gx1 - gx0)
  const toV = (lat: number) => (mercY(lat) - gy0) / (gy1 - gy0)
  const x0 = Math.max(0, toU(view.west))
  const x1 = Math.min(1, toU(view.east))
  const y0 = Math.max(0, toV(view.north))
  const y1 = Math.min(1, toV(view.south))
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null
}
