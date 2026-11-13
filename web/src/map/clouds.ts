/**
 * Capa de nubes observadas animada (T-12, RF-3).
 *
 * Una fuente raster por cuadro (≤ 10), creada bajo demanda: al abrir solo se carga el cuadro visible (la
 * imagen más reciente); el resto se precarga al reproducir. Animar es solo cambiar la opacidad. Cargar los 10
 * de entrada (~240 teselas, muchas más en 3D) retrasaba ~15 s la imagen visible en Relieve 3D.
 * Van encima del mapa base y debajo de departamentos y nombres.
 */
import type { Map as MapLibreMap } from 'maplibre-gl'
import { GIBS_ATTRIBUTION, tileUrl, type CloudLayerInfo } from '../api/gibs'

export const CLOUD_PREFIX = 'wc-nubes-'
export const CLOUD_OPACITY = 0.9

type CloudMap = Pick<
  MapLibreMap,
  | 'getStyle'
  | 'getLayer'
  | 'addLayer'
  | 'removeLayer'
  | 'getSource'
  | 'addSource'
  | 'removeSource'
  | 'setPaintProperty'
>

export const cloudId = (i: number) => `${CLOUD_PREFIX}${i}`

/** Quita todas las capas y fuentes de nubes. */
export function clearClouds(map: CloudMap): void {
  const ids = map
    .getStyle()
    .layers.map((l) => l.id)
    .filter((id) => id.startsWith(CLOUD_PREFIX))
  for (const id of ids) {
    map.removeLayer(id)
    if (map.getSource(id)) map.removeSource(id)
  }
}

/** Crea (si falta) la fuente y capa del cuadro `i`, oculta. `beforeId`: capa debajo de la cual va. */
export function ensureCloudFrame(
  map: CloudMap,
  layer: CloudLayerInfo,
  frames: Date[],
  i: number,
  beforeId?: string,
  protocol?: string,
): void {
  const id = cloudId(i)
  const time = frames[i]
  if (!time || map.getLayer(id)) return
  map.addSource(id, {
    type: 'raster',
    tiles: [tileUrl(layer, time, protocol)],
    tileSize: 256,
    maxzoom: layer.maxzoom,
    attribution: GIBS_ATTRIBUTION,
  })
  map.addLayer(
    { id, type: 'raster', source: id, paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 } },
    beforeId && map.getLayer(beforeId) ? beforeId : undefined,
  )
}

/** Crea todos los cuadros (para reproducir sin huecos). El visible primero, para que cargue antes. */
export function ensureAllCloudFrames(
  map: CloudMap,
  layer: CloudLayerInfo,
  frames: Date[],
  firstIndex: number,
  beforeId?: string,
  protocol?: string,
): void {
  const order = [firstIndex, ...frames.keys()].filter((i, k, arr) => arr.indexOf(i) === k)
  for (const i of order) ensureCloudFrame(map, layer, frames, i, beforeId, protocol)
}

/** Muestra el cuadro `index` y oculta los demás. */
export function showCloudFrame(
  map: CloudMap,
  count: number,
  index: number,
  opacity = CLOUD_OPACITY,
) {
  for (let i = 0; i < count; i++) {
    if (map.getLayer(cloudId(i))) {
      map.setPaintProperty(cloudId(i), 'raster-opacity', i === index ? opacity : 0)
    }
  }
}
