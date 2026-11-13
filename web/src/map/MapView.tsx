import { MapboxOverlay } from '@deck.gl/mapbox'
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef, useState } from 'react'
import type { CloudLayerInfo } from '../api/gibs'
import { setIsobars, setScalarLayer } from '../layers/forecastLayers'
import { registerScalarProtocol, setScalarLut } from '../layers/scalarProtocol'
import { buildLut, SCALAR_STYLES, type ScalarName, type ScalarScale } from '../layers/scalarStyles'
import { initialParticleCount } from '../wind/particles'
import { WIND_LAYER_ID, WindLayer, type WindField } from '../wind/WindLayer'
import {
  applyBasemap,
  DARK_STYLE_URL,
  INITIAL_VIEW,
  installBasemapSources,
  type BasemapId,
} from './basemaps'
import { registerCloudProtocol } from './cloudAlpha'
import {
  CLOUD_PREFIX,
  clearClouds,
  ensureAllCloudFrames,
  ensureCloudFrame,
  showCloudFrame,
} from './clouds'
import { installDeckTransformShim } from './deckCompat'
import {
  departmentAt,
  DEPARTMENTS_FILL,
  DEPARTMENTS_SOURCE,
  installDepartments,
} from './departments'
import { MAPLIBRE_LOCALE_ES } from './locale'
import { applyDarkPalette, applySpanishLabels } from './palette'
import './MapView.css'

// MapLibre 6 busca su worker junto a su propio archivo (import.meta.url); el pre-empaquetado de Vite
// lo mueve y el worker no carga. Se le da la URL explícita, válida en desarrollo y en build.
setWorkerUrl(maplibreWorkerUrl)
registerCloudProtocol() // teselas de nubes con fondo transparente (cloudAlpha.ts)
registerScalarProtocol() // capas de color de pronóstico (scalarProtocol.ts)

/** Las nubes van debajo del viento (si está) y de los departamentos. */
const cloudsBefore = (map: MapLibreMap) =>
  map.getLayer(WIND_LAYER_ID) ? WIND_LAYER_ID : DEPARTMENTS_FILL

export interface LatLon {
  lat: number
  lon: number
}

export interface FlyTarget extends LatLon {
  zoom: number
  /** Cambia en cada búsqueda para volar aunque se repita el mismo lugar. */
  key: number
}

/** Punto elegido con un clic; `departamento` si cae dentro de Colombia. */
export interface ClickedPoint extends LatLon {
  departamento?: string
}

interface MapViewProps {
  /** RF-1: clic en el mapa → panel de punto (RF-6) para esas coordenadas. */
  onSelectPoint?: (point: ClickedPoint) => void
  selectedPoint?: LatLon | null
  /** Destino al que mover la cámara (p. ej. resultado del buscador). */
  flyTo?: FlyTarget | null
  /** Mapa base elegido en el menú (RF-1). */
  basemap?: BasemapId
  /** Campo de viento a animar (T-34); null = capa apagada. */
  wind?: WindField | null
  /** Capa de color de pronóstico (T-36). */
  scalar?: { name: ScalarName; url: string; scale: ScalarScale; bounds: WindField['bounds'] } | null
  /** URL del GeoJSON de isobaras del paso visible (T-36). */
  isobarsUrl?: string | null
  /** Nubes observadas (T-12): capa GIBS, cuadros disponibles y cuadro visible. */
  clouds?: { layer: CloudLayerInfo; frames: Date[]; index: number; preloadAll?: boolean } | null
}

/** Mapa principal: MapLibre + overlay de deck.gl (diseño §2). */
export default function MapView({
  onSelectPoint,
  selectedPoint,
  flyTo,
  clouds,
  basemap = 'oscuro',
  wind = null,
  scalar = null,
  isobarsUrl = null,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const onSelectRef = useRef(onSelectPoint)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [hover, setHover] = useState<{ x: number; y: number; nombre: string } | null>(null)

  useEffect(() => {
    onSelectRef.current = onSelectPoint
  }, [onSelectPoint])

  useEffect(() => {
    if (!containerRef.current) return
    const map = new MapLibreMap({
      container: containerRef.current,
      style: DARK_STYLE_URL,
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom,
      maxPitch: 70,
      attributionControl: { compact: true },
      locale: MAPLIBRE_LOCALE_ES,
    })
    mapRef.current = map
    installDeckTransformShim(map) // deck.gl 9.4 + MapLibre 6, ver deckCompat.ts
    if (import.meta.env.DEV) (window as unknown as { __wcMap?: MapLibreMap }).__wcMap = map // depuración

    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')
    // Abajo a la derecha: el menú lateral ocupa la izquierda.
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right')

    // Overlay de deck.gl intercalado con las capas de MapLibre; las capas de datos llegan en fases 1–2.
    const overlay = new MapboxOverlay({ interleaved: true, layers: [] })
    map.addControl(overlay)

    map.on('load', () => {
      applyDarkPalette(map)
      applySpanishLabels(map)
      installBasemapSources(map)
      installDepartments(map)
      // En pantallas angostas los créditos empiezan plegados (siguen a un toque en ⓘ): no tapan el mapa.
      if (window.matchMedia?.('(max-width: 640px)').matches) {
        containerRef.current
          ?.querySelector('.maplibregl-ctrl-attrib')
          ?.classList.remove('maplibregl-compact-show')
      }
      setReady(true)
    })
    map.on('click', (e) => {
      const dep = departmentAt(map, e.point)
      onSelectRef.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng, departamento: dep?.nombre })
    })

    // Resaltar el departamento bajo el cursor y mostrar su nombre (T-11).
    let hoveredId: string | number | null = null
    const setHovered = (id: string | number | null) => {
      if (hoveredId === id) return
      if (hoveredId !== null)
        map.setFeatureState({ source: DEPARTMENTS_SOURCE, id: hoveredId }, { hover: false })
      if (id !== null) map.setFeatureState({ source: DEPARTMENTS_SOURCE, id }, { hover: true })
      hoveredId = id
    }
    map.on('mousemove', (e) => {
      const dep = departmentAt(map, e.point)
      setHovered(dep?.id ?? null)
      setHover(dep ? { x: e.point.x, y: e.point.y, nombre: dep.nombre } : null)
    })
    map.on('mouseout', () => {
      setHovered(null)
      setHover(null)
    })
    let styleLoaded = false
    map.once('style.load', () => (styleLoaded = true))
    map.on('error', (e) => {
      // Solo un fallo del ESTILO base deja el mapa vacío: se avisa en vez de mostrar un lienzo negro (P4).
      // Los errores de teselas (traen sourceId) no tumban el mapa: cada capa maneja su "sin datos".
      const sourceId = (e as { sourceId?: string }).sourceId
      if (!styleLoaded && !sourceId) setFailed(true)
      if (!sourceId?.startsWith(CLOUD_PREFIX)) {
        console.warn('[WindCloud] Error del mapa:', e.error?.message)
      }
    })

    return () => {
      map.removeControl(overlay)
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (ready && mapRef.current) applyBasemap(mapRef.current, basemap)
  }, [ready, basemap])

  // Nubes: al cambiar capa o cuadros se borra todo; luego se crean bajo demanda solo los cuadros necesarios
  // (el visible, o todos al reproducir). Animar solo cambia la opacidad.
  const cloudLayer = clouds?.layer
  const cloudFrames = clouds?.frames
  const cloudKey = cloudLayer
    ? `${cloudLayer.kind}|${cloudFrames?.map((d) => d.getTime()).join(',')}`
    : ''
  const cloudIndex = clouds?.index ?? 0
  const cloudPreloadAll = clouds?.preloadAll ?? false
  useEffect(() => {
    const map = mapRef.current
    if (ready && map) clearClouds(map)
  }, [ready, cloudKey])
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !cloudLayer || !cloudFrames?.length) return
    if (cloudPreloadAll) {
      ensureAllCloudFrames(map, cloudLayer, cloudFrames, cloudIndex, cloudsBefore(map))
    } else {
      ensureCloudFrame(map, cloudLayer, cloudFrames, cloudIndex, cloudsBefore(map))
    }
    showCloudFrame(map, cloudFrames.length, cloudIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cloudKey resume capa y cuadros
  }, [ready, cloudKey, cloudIndex, cloudPreloadAll])

  // Viento (T-34): una sola capa WebGL; cambiar de campo solo sube otra textura.
  const windLayerRef = useRef<WindLayer | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    if (!wind) {
      if (map.getLayer(WIND_LAYER_ID)) map.removeLayer(WIND_LAYER_ID)
      windLayerRef.current = null
      return
    }
    if (windLayerRef.current && map.getLayer(WIND_LAYER_ID)) {
      windLayerRef.current.setField(wind)
      return
    }
    const count = initialParticleCount({
      width: window.innerWidth,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    })
    const layer = new WindLayer(count, wind)
    windLayerRef.current = layer
    if (import.meta.env.DEV) (window as unknown as { __wcWind?: WindLayer }).__wcWind = layer // depuración
    // Encima de las nubes, debajo de departamentos y nombres.
    map.addLayer(layer, map.getLayer(DEPARTMENTS_FILL) ? DEPARTMENTS_FILL : undefined)
  }, [ready, wind])

  // Capa de color e isobaras (T-36). Orden: capa de color < nubes < viento < isobaras < departamentos.
  const scalarName = scalar?.name
  const scalarUrlStr = scalar?.url
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    if (!scalar) return setScalarLayer(map, null)
    setScalarLut(scalar.name, buildLut(scalar.scale, SCALAR_STYLES[scalar.name].stops))
    const firstCloud = map.getStyle().layers.find((l) => l.id.startsWith(CLOUD_PREFIX))?.id
    setScalarLayer(map, { url: scalar.url, bounds: scalar.bounds }, firstCloud ?? cloudsBefore(map))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nombre y URL resumen el cambio
  }, [ready, scalarName, scalarUrlStr])
  useEffect(() => {
    const map = mapRef.current
    if (ready && map) setIsobars(map, isobarsUrl, DEPARTMENTS_FILL)
  }, [ready, isobarsUrl])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyTo) return
    map.flyTo({ center: [flyTo.lon, flyTo.lat], zoom: flyTo.zoom, essential: true, duration: 1800 })
  }, [flyTo])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!selectedPoint) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    const lngLat: [number, number] = [selectedPoint.lon, selectedPoint.lat]
    if (markerRef.current) markerRef.current.setLngLat(lngLat)
    else markerRef.current = new Marker({ color: '#4fc3f7' }).setLngLat(lngLat).addTo(map)
  }, [selectedPoint, ready])

  return (
    <div className="map-view">
      <div
        ref={containerRef}
        className="map-view__canvas"
        aria-label="Mapa meteorológico"
        role="region"
      />
      {hover && (
        <div
          className="map-view__tooltip"
          style={{ left: hover.x, top: hover.y }}
          aria-hidden="true"
        >
          {hover.nombre}
        </div>
      )}
      {failed && (
        <p className="map-view__error" role="alert">
          No se pudo cargar el mapa base. Revisa tu conexión y recarga la página.
        </p>
      )}
    </div>
  )
}
