/**
 * Mapas base (RF-1): oscuro, satélite y relieve 3D, todos gratuitos y sin clave (P1).
 *
 * Los tres comparten el estilo vectorial oscuro de OpenFreeMap (fronteras, ríos, nombres) y se alternan
 * cambiando visibilidad y añadiendo fuentes raster, sin `setStyle`: así las capas de deck.gl y de datos
 * no se pierden al cambiar de base.
 */
import type { Map as MapLibreMap } from 'maplibre-gl'

export type BasemapId = 'oscuro' | 'satelite' | 'relieve'

export interface Basemap {
  id: BasemapId
  label: string
  description: string
}

export const BASEMAPS: readonly Basemap[] = [
  { id: 'oscuro', label: 'Oscuro', description: 'Mapa vectorial oscuro (OpenFreeMap)' },
  { id: 'satelite', label: 'Satélite', description: 'Mosaico Sentinel-2 sin nubes 2020 (EOX)' },
  { id: 'relieve', label: 'Relieve 3D', description: 'Terreno 3D y sombreado (AWS Terrain Tiles)' },
]

export const DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

/** Vista inicial exigida por RF-1. */
export const INITIAL_VIEW = { center: [-74.0, 4.5] as [number, number], zoom: 5 }

export const SATELLITE_SOURCE = 'wc-satelite'
export const SATELLITE_LAYER = 'wc-satelite'
export const DEM_TERRAIN_SOURCE = 'wc-dem-terreno'
export const DEM_HILLSHADE_SOURCE = 'wc-dem-sombra'
export const HILLSHADE_LAYER = 'wc-sombreado'

const TERRARIUM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']
const TERRARIUM_ATTRIBUTION =
  '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles</a> (Mapzen, AWS Open Data)'

export const TERRAIN_EXAGGERATION = 1.5
export const RELIEF_PITCH = 55

/**
 * Capas del estilo oscuro que tapan la imagen satelital (rellenos de agua, bosque, edificios…).
 * Se ocultan solo en modo satélite; líneas y nombres se conservan.
 */
export function isFillThatHidesSatellite(layer: { id: string; type: string }): boolean {
  return layer.type === 'fill'
}

/** Visibilidad que debe tener cada capa propia de WindCloud para un mapa base dado. */
export function basemapLayerVisibility(id: BasemapId): Record<string, 'visible' | 'none'> {
  return {
    [SATELLITE_LAYER]: id === 'satelite' ? 'visible' : 'none',
    [HILLSHADE_LAYER]: id === 'relieve' ? 'visible' : 'none',
  }
}

/** Añade (una sola vez) las fuentes y capas raster propias sobre el estilo oscuro ya cargado. */
export function installBasemapSources(map: MapLibreMap): void {
  if (!map.getSource(SATELLITE_SOURCE)) {
    map.addSource(SATELLITE_SOURCE, {
      type: 'raster',
      tiles: [
        'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg',
      ],
      tileSize: 256,
      maxzoom: 15,
      attribution:
        '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by EOX IT Services GmbH (datos Copernicus Sentinel 2020 modificados, CC BY-NC-SA 4.0)',
    })
  }
  if (!map.getSource(DEM_TERRAIN_SOURCE)) {
    map.addSource(DEM_TERRAIN_SOURCE, {
      type: 'raster-dem',
      tiles: TERRARIUM_TILES,
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 15,
      attribution: TERRARIUM_ATTRIBUTION,
    })
  }
  if (!map.getSource(DEM_HILLSHADE_SOURCE)) {
    // Fuente separada para el sombreado: MapLibre recomienda no compartirla con el terreno.
    map.addSource(DEM_HILLSHADE_SOURCE, {
      type: 'raster-dem',
      tiles: TERRARIUM_TILES,
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 15,
    })
  }

  // Ambas capas van justo encima del fondo, debajo de ríos, vías, fronteras y nombres.
  const firstStyleLayer = map.getStyle().layers.find((l) => l.type !== 'background')?.id
  if (!map.getLayer(SATELLITE_LAYER)) {
    map.addLayer(
      {
        id: SATELLITE_LAYER,
        type: 'raster',
        source: SATELLITE_SOURCE,
        layout: { visibility: 'none' },
      },
      firstStyleLayer,
    )
  }
  if (!map.getLayer(HILLSHADE_LAYER)) {
    map.addLayer(
      {
        id: HILLSHADE_LAYER,
        type: 'hillshade',
        source: DEM_HILLSHADE_SOURCE,
        layout: { visibility: 'none' },
        paint: {
          'hillshade-shadow-color': '#000000',
          'hillshade-highlight-color': '#7d8a99',
          'hillshade-accent-color': '#2b3541',
          'hillshade-exaggeration': 0.6,
        },
      },
      // Encima de los rellenos (agua, bosque) para que el relieve se note, debajo de líneas y nombres.
      map.getStyle().layers.find((l) => l.type === 'line')?.id,
    )
  }
}

/** Cambia el mapa base. Requiere `installBasemapSources` previo. */
export function applyBasemap(map: MapLibreMap, id: BasemapId): void {
  for (const [layerId, visibility] of Object.entries(basemapLayerVisibility(id))) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility)
  }
  for (const layer of map.getStyle().layers) {
    if (isFillThatHidesSatellite(layer)) {
      map.setLayoutProperty(layer.id, 'visibility', id === 'satelite' ? 'none' : 'visible')
    }
  }

  if (id === 'relieve') {
    map.setTerrain({ source: DEM_TERRAIN_SOURCE, exaggeration: TERRAIN_EXAGGERATION })
    map.easeTo({ pitch: RELIEF_PITCH, duration: 800 })
  } else {
    map.setTerrain(null)
    if (map.getPitch() !== 0) map.easeTo({ pitch: 0, duration: 600 })
  }
}
