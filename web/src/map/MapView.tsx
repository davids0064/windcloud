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
import {
  applyBasemap,
  DARK_STYLE_URL,
  INITIAL_VIEW,
  installBasemapSources,
  type BasemapId,
} from './basemaps'
import { BasemapSwitcher } from './BasemapSwitcher'
import { installDeckTransformShim } from './deckCompat'
import { MAPLIBRE_LOCALE_ES } from './locale'
import './MapView.css'

// MapLibre 6 busca su worker junto a su propio archivo (import.meta.url); el pre-empaquetado de Vite
// lo mueve y el worker no carga. Se le da la URL explícita, válida en desarrollo y en build.
setWorkerUrl(maplibreWorkerUrl)

export interface LatLon {
  lat: number
  lon: number
}

interface MapViewProps {
  /** RF-1: clic en el mapa → panel de punto (RF-6) para esas coordenadas. */
  onSelectPoint?: (point: LatLon) => void
  selectedPoint?: LatLon | null
}

/** Mapa principal: MapLibre + overlay de deck.gl (diseño §2). */
export default function MapView({ onSelectPoint, selectedPoint }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const onSelectRef = useRef(onSelectPoint)
  const [ready, setReady] = useState(false)
  const [basemap, setBasemap] = useState<BasemapId>('oscuro')
  const [failed, setFailed] = useState(false)

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

    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')

    // Overlay de deck.gl intercalado con las capas de MapLibre; las capas de datos llegan en fases 1–2.
    const overlay = new MapboxOverlay({ interleaved: true, layers: [] })
    map.addControl(overlay)

    map.on('load', () => {
      installBasemapSources(map)
      setReady(true)
    })
    map.on('click', (e) => onSelectRef.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng }))
    map.on('error', (e) => {
      // Un fallo del estilo base deja el mapa vacío: se avisa en vez de mostrar un lienzo negro (P4).
      if (!map.isStyleLoaded() && !map.loaded()) setFailed(true)
      console.warn('[WindCloud] Error del mapa:', e.error?.message)
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
      <BasemapSwitcher value={basemap} onChange={setBasemap} disabled={!ready} />
      {failed && (
        <p className="map-view__error" role="alert">
          No se pudo cargar el mapa base. Revisa tu conexión y recarga la página.
        </p>
      )}
    </div>
  )
}
