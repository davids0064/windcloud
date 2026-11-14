/**
 * Focos de calor en el mapa (T-52, RF-11): un círculo por foco (color por confianza) y, para el foco
 * elegido, una flecha (líneas: no depende de las fuentes del mapa) hacia donde lo empujaría el viento. Capas nativas de MapLibre, encima de todo.
 */
import type { GeoJSONSource, Map as MapLibreMap, PointLike } from 'maplibre-gl'

export const FIRES_SOURCE = 'wc-focos'
export const FIRES_LAYER = 'wc-focos-circulo'
export const FIRE_ARROW_SOURCE = 'wc-focos-flecha'
export const FIRE_ARROW_LAYER = 'wc-focos-flecha-linea'

type FiresMap = Pick<
  MapLibreMap,
  'getSource' | 'addSource' | 'getLayer' | 'addLayer' | 'removeLayer' | 'removeSource'
>

function upsert(map: FiresMap, id: string, data: GeoJSON.FeatureCollection) {
  const src = map.getSource(id) as GeoJSONSource | undefined
  if (src) src.setData(data)
  else map.addSource(id, { type: 'geojson', data })
}

function remove(map: FiresMap, layers: string[], source: string) {
  for (const l of layers) if (map.getLayer(l)) map.removeLayer(l)
  if (map.getSource(source)) map.removeSource(source)
}

export function setFires(
  map: FiresMap,
  data: GeoJSON.FeatureCollection | null,
  /** Flecha del foco elegido (`arrowGeoJSON`); null = sin flecha. */
  arrow: GeoJSON.FeatureCollection | null,
): void {
  if (!data) {
    remove(map, [FIRES_LAYER], FIRES_SOURCE)
    remove(map, [FIRE_ARROW_LAYER], FIRE_ARROW_SOURCE)
    return
  }
  upsert(map, FIRES_SOURCE, data)
  if (!map.getLayer(FIRES_LAYER)) {
    map.addLayer({
      id: FIRES_LAYER,
      type: 'circle',
      source: FIRES_SOURCE,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          4,
          ['case', ['get', 'selected'], 7, 3.5],
          9,
          ['case', ['get', 'selected'], 10, 6],
        ],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': ['case', ['get', 'selected'], 2.5, 0.8],
        'circle-stroke-color': ['case', ['get', 'selected'], '#ffffff', '#1a0a00'],
      },
    })
  }
  if (!arrow) {
    remove(map, [FIRE_ARROW_LAYER], FIRE_ARROW_SOURCE)
    return
  }
  upsert(map, FIRE_ARROW_SOURCE, arrow)
  if (!map.getLayer(FIRE_ARROW_LAYER)) {
    map.addLayer(
      {
        id: FIRE_ARROW_LAYER,
        type: 'line',
        source: FIRE_ARROW_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 2.5 },
      },
      FIRES_LAYER,
    )
  }
}

/** Índice del foco bajo el cursor (si la capa existe). */
export function fireAt(
  map: Pick<MapLibreMap, 'getLayer' | 'queryRenderedFeatures'>,
  point: PointLike,
): number | null {
  if (!map.getLayer(FIRES_LAYER)) return null
  const f = map.queryRenderedFeatures(point, { layers: [FIRES_LAYER] })[0]
  return f ? (f.properties as { i: number }).i : null
}
