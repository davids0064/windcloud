/**
 * Estaciones de verificación en el mapa (T-44, RF-9): un círculo por aeropuerto con el color del modelo que
 * menos se equivoca allí. Capa nativa de MapLibre, encima de todo (son pocos puntos y se pueden pulsar).
 */
import type { GeoJSONSource, Map as MapLibreMap, PointLike } from 'maplibre-gl'

export const STATIONS_SOURCE = 'wc-estaciones'
export const STATIONS_LAYER = 'wc-estaciones-circulo'

export interface MapStation {
  icao: string
  nombre: string
  lat: number
  lon: number
  /** Color del mejor modelo; null = sin muestra suficiente (círculo hueco gris). */
  color: string | null
  /** Texto del mejor modelo para el rótulo al pasar el cursor. */
  best: string
}

type StationsMap = Pick<
  MapLibreMap,
  'getSource' | 'addSource' | 'getLayer' | 'addLayer' | 'removeLayer' | 'removeSource'
>

export function stationsGeoJSON(stations: MapStation[], selected: string | null) {
  return {
    type: 'FeatureCollection' as const,
    features: stations.map((s) => ({
      type: 'Feature' as const,
      id: s.icao,
      geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
      properties: {
        icao: s.icao,
        nombre: s.nombre,
        best: s.best,
        color: s.color ?? 'rgba(0,0,0,0)',
        empty: s.color === null,
        selected: s.icao === selected,
      },
    })),
  }
}

/** Crea, actualiza o quita la capa. `null` la quita (otra pestaña). */
export function setStations(
  map: StationsMap,
  stations: MapStation[] | null,
  selected: string | null,
): void {
  if (!stations) {
    if (map.getLayer(STATIONS_LAYER)) map.removeLayer(STATIONS_LAYER)
    if (map.getSource(STATIONS_SOURCE)) map.removeSource(STATIONS_SOURCE)
    return
  }
  const data = stationsGeoJSON(stations, selected)
  const source = map.getSource(STATIONS_SOURCE) as GeoJSONSource | undefined
  if (source) source.setData(data)
  else map.addSource(STATIONS_SOURCE, { type: 'geojson', data })
  if (!map.getLayer(STATIONS_LAYER)) {
    map.addLayer({
      id: STATIONS_LAYER,
      type: 'circle',
      source: STATIONS_SOURCE,
      paint: {
        'circle-radius': ['case', ['get', 'selected'], 9, 6],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': ['case', ['get', 'empty'], 2, 1.5],
        'circle-stroke-color': [
          'case',
          ['get', 'selected'],
          '#4fc3f7',
          ['get', 'empty'],
          '#8a939d',
          '#0b0d10',
        ],
      },
    })
  }
}

/** Estación bajo el cursor (si la capa existe). */
export function stationAt(
  map: Pick<MapLibreMap, 'getLayer' | 'queryRenderedFeatures'>,
  point: PointLike,
): { icao: string; nombre: string; best: string } | null {
  if (!map.getLayer(STATIONS_LAYER)) return null
  const f = map.queryRenderedFeatures(point, { layers: [STATIONS_LAYER] })[0]
  if (!f) return null
  const p = f.properties as { icao: string; nombre: string; best: string }
  return { icao: p.icao, nombre: p.nombre, best: p.best }
}
