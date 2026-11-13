/**
 * Mapas base (RF-1): oscuro, satélite y relieve 3D, todos gratuitos y sin clave (P1).
 *
 * Los tres comparten el estilo vectorial oscuro de OpenFreeMap (fronteras, ríos, nombres) y se alternan
 * cambiando visibilidad y añadiendo fuentes raster, sin `setStyle`: así las capas de deck.gl y de datos
 * no se pierden al cambiar de base.
 *
 * Relieve 3D = imagen satelital sobre el terreno 3D (a pedido del usuario: conservar los colores reales del
 * satélite). No se añade sombreado artificial: la imagen ya trae la luz y sombra naturales de las montañas.
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
  {
    id: 'relieve',
    label: 'Relieve 3D',
    description: 'Satélite Sentinel-2 sobre terreno 3D (EOX + AWS Terrain Tiles)',
  },
]

export const DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

/** Vista inicial exigida por RF-1. */
export const INITIAL_VIEW = { center: [-74.0, 4.5] as [number, number], zoom: 5 }

export const SATELLITE_SOURCE = 'wc-satelite'
export const SATELLITE_LAYER = 'wc-satelite'
export const DEM_TERRAIN_SOURCE = 'wc-dem-terreno'

const TERRARIUM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']
const TERRARIUM_ATTRIBUTION =
  '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles</a> (Mapzen, AWS Open Data)'

export const TERRAIN_EXAGGERATION = 1.5
export const RELIEF_PITCH = 45

/**
 * Capas del estilo oscuro que tapan la imagen satelital (rellenos de agua, bosque, edificios…).
 * Se ocultan en los modos con satélite; líneas y nombres se conservan.
 */
export function isFillThatHidesSatellite(layer: { id: string; type: string }): boolean {
  return layer.type === 'fill'
}

/** Satélite y Relieve 3D muestran la imagen Sentinel-2; Oscuro, el estilo vectorial. */
export function usesSatellite(id: BasemapId): boolean {
  return id !== 'oscuro'
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

  // La imagen va justo encima del fondo, debajo del agua, ríos, vías, fronteras y nombres.
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
}

/** Cambia el mapa base. Requiere `installBasemapSources` previo. */
export function applyBasemap(map: MapLibreMap, id: BasemapId): void {
  const satellite = usesSatellite(id)
  if (map.getLayer(SATELLITE_LAYER)) {
    map.setLayoutProperty(SATELLITE_LAYER, 'visibility', satellite ? 'visible' : 'none')
  }
  for (const layer of map.getStyle().layers) {
    if (isFillThatHidesSatellite(layer)) {
      map.setLayoutProperty(layer.id, 'visibility', satellite ? 'none' : 'visible')
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
