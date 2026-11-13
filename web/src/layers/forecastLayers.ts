/**
 * Capas de pronóstico en el mapa (T-36): una capa de color (imagen por sus 4 esquinas, exacta porque el PNG tiene
 * filas Mercator) y las isobaras (GeoJSON con etiquetas de hPa sobre la línea).
 */
import type { GeoJSONSource, ImageSource, Map as MapLibreMap } from 'maplibre-gl'
import type { GridMeta } from '../wind/meta'

export const SCALAR_ID = 'wc-capa-color'
export const ISOBARS_ID = 'wc-isobaras'
export const ISOBARS_LABELS_ID = 'wc-isobaras-etiquetas'

type LayersMap = Pick<
  MapLibreMap,
  'getSource' | 'addSource' | 'removeSource' | 'getLayer' | 'addLayer' | 'removeLayer'
>

/** Esquinas [NO, NE, SE, SO] para una image source de MapLibre. */
export function corners(
  b: GridMeta['bounds'],
): [[number, number], [number, number], [number, number], [number, number]] {
  return [
    [b.west, b.north],
    [b.east, b.north],
    [b.east, b.south],
    [b.west, b.south],
  ]
}

/** Pone, actualiza o quita la capa de color. `beforeId` = capa encima de la cual NO debe quedar. */
export function setScalarLayer(
  map: LayersMap,
  next: { url: string; bounds: GridMeta['bounds'] } | null,
  beforeId?: string,
): void {
  if (!next) {
    if (map.getLayer(SCALAR_ID)) map.removeLayer(SCALAR_ID)
    if (map.getSource(SCALAR_ID)) map.removeSource(SCALAR_ID)
    return
  }
  const src = map.getSource(SCALAR_ID) as ImageSource | undefined
  if (src) {
    src.updateImage({ url: next.url, coordinates: corners(next.bounds) })
    return
  }
  map.addSource(SCALAR_ID, { type: 'image', url: next.url, coordinates: corners(next.bounds) })
  map.addLayer(
    {
      id: SCALAR_ID,
      type: 'raster',
      source: SCALAR_ID,
      paint: { 'raster-opacity': 1, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
    },
    beforeId && map.getLayer(beforeId) ? beforeId : undefined,
  )
}

/** Pone, actualiza o quita las isobaras. */
export function setIsobars(map: LayersMap, url: string | null, beforeId?: string): void {
  if (!url) {
    for (const id of [ISOBARS_LABELS_ID, ISOBARS_ID]) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(ISOBARS_ID)) map.removeSource(ISOBARS_ID)
    return
  }
  const src = map.getSource(ISOBARS_ID) as GeoJSONSource | undefined
  if (src) {
    src.setData(url)
    return
  }
  const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined
  map.addSource(ISOBARS_ID, { type: 'geojson', data: url })
  map.addLayer(
    {
      id: ISOBARS_ID,
      type: 'line',
      source: ISOBARS_ID,
      paint: {
        'line-color': '#f2f5f8',
        'line-opacity': 0.75,
        // Cada 10 hPa más gruesa, como en los mapas sinópticos.
        'line-width': ['case', ['==', ['%', ['get', 'hpa'], 10], 0], 1.6, 0.8],
      },
    },
    before,
  )
  map.addLayer(
    {
      id: ISOBARS_LABELS_ID,
      type: 'symbol',
      source: ISOBARS_ID,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 280,
        'text-field': ['to-string', ['get', 'hpa']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
      },
      paint: {
        'text-color': '#f2f5f8',
        'text-halo-color': 'rgba(16,22,30,0.9)',
        'text-halo-width': 1.4,
      },
    },
    before,
  )
}

export const scalarFileUrl = (base: string, file: string, step: number) =>
  `${base}/${file.replace('{step}', String(step).padStart(3, '0'))}`
