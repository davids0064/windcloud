/** Rayos en el mapa (T-55): círculos pequeños por descarga, color por antigüedad; encima de todo. */
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'

export const LIGHTNING_SOURCE = 'wc-rayos'
export const LIGHTNING_LAYER = 'wc-rayos-punto'

type LightningMap = Pick<
  MapLibreMap,
  'getSource' | 'addSource' | 'getLayer' | 'addLayer' | 'removeLayer' | 'removeSource'
>

export function setLightning(map: LightningMap, data: GeoJSON.FeatureCollection | null): void {
  if (!data) {
    if (map.getLayer(LIGHTNING_LAYER)) map.removeLayer(LIGHTNING_LAYER)
    if (map.getSource(LIGHTNING_SOURCE)) map.removeSource(LIGHTNING_SOURCE)
    return
  }
  const src = map.getSource(LIGHTNING_SOURCE) as GeoJSONSource | undefined
  if (src) src.setData(data)
  else map.addSource(LIGHTNING_SOURCE, { type: 'geojson', data })
  if (!map.getLayer(LIGHTNING_LAYER)) {
    map.addLayer({
      id: LIGHTNING_LAYER,
      type: 'circle',
      source: LIGHTNING_SOURCE,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2, 9, 4],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 0.6,
        'circle-stroke-color': '#3a1d00',
        'circle-opacity': 0.9,
      },
    })
  }
}
