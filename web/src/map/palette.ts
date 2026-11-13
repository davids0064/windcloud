/**
 * Paleta propia sobre el estilo `dark` de OpenFreeMap.
 *
 * El estilo original es casi negro (tierra rgb(12,12,12), agua rgb(27,27,29), nombres rgb(101,101,101)) y se
 * leía mal. Aquí se aclara a un gris pizarra azulado: el agua se distingue de la tierra, las fronteras y los
 * nombres tienen contraste suficiente, y el mapa sigue siendo oscuro para que resalten las capas de datos.
 */
import type { Map as MapLibreMap } from 'maplibre-gl'

const LAND = '#2b3541'
const WATER = '#172433'
const GREEN = '#2e3d3a'
const ROAD = '#3e4a58'
const ROAD_CASING = 'rgba(120,135,150,0.55)'
const LABEL = '#c3ccd6'
const LABEL_STRONG = '#e8ecf1'
const HALO = 'rgba(16,22,30,0.85)'

/**
 * Sombreado del modo Relieve 3D con los mismos tonos de la paleta: sombras algo más oscuras que la tierra y
 * luces algo más claras, en proporción parecida, para que el tono medio del mapa no cambie y las montañas se
 * noten. Antes usaba negro puro y oscurecía todo el mapa.
 */
export const HILLSHADE_PAINT = {
  'hillshade-shadow-color': '#1c242e',
  'hillshade-highlight-color': '#52606f',
  'hillshade-accent-color': LAND,
  'hillshade-exaggeration': 0.6,
} as const

export const DARK_PAINT_OVERRIDES: Record<string, Record<string, unknown>> = {
  background: { 'background-color': LAND },
  water: { 'fill-color': WATER },
  waterway: { 'line-color': WATER },
  landcover_ice_shelf: { 'fill-color': '#3a4552' },
  landcover_glacier: { 'fill-color': '#3a4552' },
  landuse_residential: { 'fill-color': '#323d4a', 'fill-opacity': 0.6 },
  landcover_wood: { 'fill-color': GREEN },
  landuse_park: { 'fill-color': GREEN },
  building: { 'fill-color': '#36414e', 'fill-outline-color': '#414d5b' },
  'aeroway-area': { 'fill-color': '#323d4a' },
  'aeroway-runway': { 'line-color': '#4a5666' },
  'aeroway-taxiway': { 'line-color': '#3e4a58' },
  road_area_pier: { 'fill-color': LAND },
  road_pier: { 'line-color': LAND },
  highway_path: { 'line-color': ROAD },
  highway_minor: { 'line-color': ROAD },
  highway_major_casing: { 'line-color': ROAD_CASING },
  highway_major_inner: { 'line-color': '#46525f' },
  highway_major_subtle: { 'line-color': '#46525f' },
  highway_motorway_casing: { 'line-color': ROAD_CASING },
  highway_motorway_inner: { 'line-color': '#55626f' },
  highway_motorway_subtle: { 'line-color': '#4a5666' },
  railway: { 'line-color': '#4a5666' },
  railway_minor: { 'line-color': '#4a5666' },
  railway_transit: { 'line-color': '#4a5666' },
  boundary_state: { 'line-color': '#6b7785' },
  'boundary_country_z0-4': { 'line-color': '#9aa6b3' },
  'boundary_country_z5-': { 'line-color': '#9aa6b3' },
  water_name: { 'text-color': '#8fb3d1', 'text-halo-color': WATER },
  highway_name_other: { 'text-color': '#8d99a6', 'text-halo-color': HALO },
  highway_name_motorway: { 'text-color': '#a3aebb', 'text-halo-color': HALO },
  place_other: { 'text-color': LABEL, 'text-halo-color': HALO },
  place_suburb: { 'text-color': LABEL, 'text-halo-color': HALO },
  place_village: { 'text-color': LABEL, 'text-halo-color': HALO },
  place_town: { 'text-color': LABEL, 'text-halo-color': HALO },
  place_city: { 'text-color': LABEL_STRONG, 'text-halo-color': HALO },
  place_city_large: { 'text-color': LABEL_STRONG, 'text-halo-color': HALO },
  place_state: { 'text-color': '#a3aebb', 'text-halo-color': HALO },
  place_country_other: { 'text-color': LABEL_STRONG, 'text-halo-color': HALO },
  place_country_minor: { 'text-color': LABEL_STRONG, 'text-halo-color': HALO },
  place_country_major: { 'text-color': LABEL_STRONG, 'text-halo-color': HALO },
}

/** Aplica la paleta; ignora capas que el estilo no tenga (el estilo remoto puede cambiar). */
export function applyDarkPalette(map: Pick<MapLibreMap, 'getLayer' | 'setPaintProperty'>): number {
  // La firma de MapLibre está tipada por propiedad; la tabla de arriba es genérica.
  const setPaint = map.setPaintProperty.bind(map) as (
    id: string,
    name: string,
    value: unknown,
  ) => void
  let applied = 0
  for (const [layerId, paint] of Object.entries(DARK_PAINT_OVERRIDES)) {
    if (!map.getLayer(layerId)) continue
    for (const [prop, value] of Object.entries(paint)) {
      setPaint(layerId, prop, value)
      applied++
    }
  }
  return applied
}

/** Nombre en español si existe; si no, el nombre latino/local (nunca se fuerza el inglés). */
export const SPANISH_NAME_EXPRESSION = [
  'coalesce',
  ['get', 'name:es'],
  ['get', 'name:latin'],
  ['get', 'name'],
] as const

/** Capas de nombres de lugares y agua que pasan a español (P6). Las vías conservan su nombre local. */
export function isPlaceLabelLayer(id: string): boolean {
  return id === 'water_name' || id.startsWith('place_')
}

export function applySpanishLabels(
  map: Pick<MapLibreMap, 'getStyle' | 'setLayoutProperty'>,
): number {
  const setLayout = map.setLayoutProperty.bind(map) as (
    id: string,
    name: string,
    value: unknown,
  ) => void
  let applied = 0
  for (const layer of map.getStyle().layers) {
    if (layer.type === 'symbol' && isPlaceLabelLayer(layer.id)) {
      setLayout(layer.id, 'text-field', SPANISH_NAME_EXPRESSION)
      applied++
    }
  }
  return applied
}
