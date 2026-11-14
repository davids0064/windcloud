/**
 * Celdas de riesgo en el mapa (T-51, RF-10): cuadrados de la rejilla GFS 0,25° con el color del nivel.
 * Capa nativa de MapLibre debajo de los departamentos (sus bordes y nombres siguen encima).
 */
import type { GeoJSONSource, Map as MapLibreMap, PointLike } from 'maplibre-gl'

export const RISK_SOURCE = 'wc-riesgo'
export const RISK_LAYER = 'wc-riesgo-celdas'

type RiskMap = Pick<
  MapLibreMap,
  'getSource' | 'addSource' | 'getLayer' | 'addLayer' | 'removeLayer' | 'removeSource'
>

/** Crea, actualiza o quita la capa. `null` la quita (otra pestaña o sin datos). */
export function setRiskCells(
  map: RiskMap,
  data: GeoJSON.FeatureCollection | null,
  beforeId?: string,
): void {
  if (!data) {
    if (map.getLayer(RISK_LAYER)) map.removeLayer(RISK_LAYER)
    if (map.getSource(RISK_SOURCE)) map.removeSource(RISK_SOURCE)
    return
  }
  const source = map.getSource(RISK_SOURCE) as GeoJSONSource | undefined
  if (source) source.setData(data)
  else map.addSource(RISK_SOURCE, { type: 'geojson', data })
  if (!map.getLayer(RISK_LAYER)) {
    map.addLayer(
      {
        id: RISK_LAYER,
        type: 'fill',
        source: RISK_SOURCE,
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.55, 'fill-antialias': false },
      },
      beforeId && map.getLayer(beforeId) ? beforeId : undefined,
    )
  }
}

/** Índice de la celda bajo el cursor (si la capa existe). */
export function riskCellAt(
  map: Pick<MapLibreMap, 'getLayer' | 'queryRenderedFeatures'>,
  point: PointLike,
): number | null {
  if (!map.getLayer(RISK_LAYER)) return null
  const f = map.queryRenderedFeatures(point, { layers: [RISK_LAYER] })[0]
  return f ? (f.properties as { i: number }).i : null
}
