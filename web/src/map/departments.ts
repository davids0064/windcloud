/**
 * Límites departamentales de Colombia (T-11, RF-1).
 *
 * GeoJSON propio en `public/geo/` generado por `pipeline/src/windcloud_pipeline/geo.py` a partir de
 * geoBoundaries ADM1 (datos de OpenStreetMap, ODbL 1.0). Se dibuja con capas nativas de MapLibre, encima de
 * vías y ríos y debajo de los nombres, para que se lea igual en el mapa oscuro y sobre el satélite.
 */
import type { Map as MapLibreMap, MapGeoJSONFeature, PointLike } from 'maplibre-gl'

export const DEPARTMENTS_SOURCE = 'wc-departamentos'
export const DEPARTMENTS_FILL = 'wc-departamentos-relleno'
export const DEPARTMENTS_CASING = 'wc-departamentos-borde-fondo'
export const DEPARTMENTS_LINE = 'wc-departamentos-borde'

export const DEPARTMENTS_URL = `${import.meta.env.BASE_URL}geo/colombia-departamentos.geojson`
export const DEPARTMENTS_ATTRIBUTION =
  'Departamentos: <a href="https://www.geoboundaries.org" target="_blank" rel="noopener">geoBoundaries</a> · © colaboradores de OpenStreetMap (ODbL)'

export interface DepartmentProps {
  nombre: string
  iso: string
}

type DepartmentsMap = Pick<
  MapLibreMap,
  'getSource' | 'addSource' | 'getLayer' | 'addLayer' | 'getStyle' | 'queryRenderedFeatures'
>

/** Añade fuente y capas una sola vez, justo debajo de la primera capa de nombres. */
export function installDepartments(map: DepartmentsMap, url = DEPARTMENTS_URL): void {
  if (!map.getSource(DEPARTMENTS_SOURCE)) {
    map.addSource(DEPARTMENTS_SOURCE, {
      type: 'geojson',
      data: url,
      promoteId: 'iso',
      attribution: DEPARTMENTS_ATTRIBUTION,
    })
  }
  const beforeLabels = map.getStyle().layers.find((l) => l.type === 'symbol')?.id

  if (!map.getLayer(DEPARTMENTS_FILL)) {
    // Relleno invisible salvo al pasar el cursor: sirve para detectar el departamento.
    map.addLayer(
      {
        id: DEPARTMENTS_FILL,
        type: 'fill',
        source: DEPARTMENTS_SOURCE,
        paint: {
          'fill-color': '#e6edf5',
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.12, 0],
        },
      },
      beforeLabels,
    )
  }
  if (!map.getLayer(DEPARTMENTS_CASING)) {
    // Halo oscuro bajo la línea: la hace legible sobre la imagen satelital.
    map.addLayer(
      {
        id: DEPARTMENTS_CASING,
        type: 'line',
        source: DEPARTMENTS_SOURCE,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': 'rgba(10,15,22,0.45)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2, 9, 4],
        },
      },
      beforeLabels,
    )
  }
  if (!map.getLayer(DEPARTMENTS_LINE)) {
    map.addLayer(
      {
        id: DEPARTMENTS_LINE,
        type: 'line',
        source: DEPARTMENTS_SOURCE,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': '#e6edf5',
          'line-opacity': 0.7,
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.7, 9, 1.8],
        },
      },
      beforeLabels,
    )
  }
}

/** Departamento bajo un punto de pantalla, o null (fuera de Colombia o capa sin cargar). */
export function departmentAt(
  map: Pick<MapLibreMap, 'queryRenderedFeatures' | 'getLayer'>,
  point: PointLike,
) {
  if (!map.getLayer(DEPARTMENTS_FILL)) return null
  const [feature] = map.queryRenderedFeatures(point, {
    layers: [DEPARTMENTS_FILL],
  }) as MapGeoJSONFeature[]
  if (!feature) return null
  const props = feature.properties as DepartmentProps
  return { id: feature.id ?? props.iso, nombre: props.nombre }
}
