/**
 * Capa de nubes observadas animada (T-12, RF-3).
 *
 * Una fuente raster por cuadro (≤ 10), todas cargadas a la vez con opacidad 0: animar es solo cambiar la
 * opacidad, sin esperar teselas. Van encima del mapa base y debajo de departamentos y nombres.
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

/** Reemplaza los cuadros de nubes. `beforeId`: capa debajo de la cual se insertan. */
export function setCloudFrames(
  map: CloudMap,
  layer: CloudLayerInfo,
  frames: Date[],
  beforeId?: string,
  protocol?: string,
): void {
  clearClouds(map)
  const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined
  frames.forEach((time, i) => {
    const id = cloudId(i)
    map.addSource(id, {
      type: 'raster',
      tiles: [tileUrl(layer, time, protocol)],
      tileSize: 256,
      maxzoom: layer.maxzoom,
      attribution: GIBS_ATTRIBUTION,
    })
    map.addLayer(
      {
        id,
        type: 'raster',
        source: id,
        paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 },
      },
      before,
    )
  })
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
