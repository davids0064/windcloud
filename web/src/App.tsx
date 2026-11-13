import { lazy, Suspense, useCallback, useState } from 'react'
import { zoomForKind, type Place } from './api/geocoding'
import type { ClickedPoint, FlyTarget, LatLon } from './map/MapView'
import { PlaceSearch } from './search/PlaceSearch'
import './App.css'

// El mapa (MapLibre + deck.gl) se carga aparte para no inflar el bundle inicial (RNF-2).
const MapView = lazy(() => import('./map/MapView'))

const coordFormat = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
})

interface SelectedPoint extends LatLon {
  /** Nombre si viene del buscador; vacío si fue un clic en el mapa. */
  label?: string
}

export default function App() {
  const [point, setPoint] = useState<SelectedPoint | null>(null)

  const onMapClick = useCallback((p: ClickedPoint) => {
    setPoint({
      lat: p.lat,
      lon: p.lon,
      label: p.departamento ? `Punto en ${p.departamento}` : undefined,
    })
  }, [])
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null)

  const onSelectPlace = useCallback((place: Place) => {
    setFlyTo({ lat: place.lat, lon: place.lon, zoom: zoomForKind(place.kind), key: Date.now() })
    // Un país no es un punto de pronóstico: solo se centra el mapa.
    setPoint(
      place.kind === 'pais'
        ? null
        : {
            lat: place.lat,
            lon: place.lon,
            label: place.context ? `${place.name}, ${place.context}` : place.name,
          },
    )
  }, [])

  return (
    <div className="app">
      <Suspense fallback={<p className="app__loading">Cargando mapa…</p>}>
        <MapView onSelectPoint={onMapClick} selectedPoint={point} flyTo={flyTo} />
      </Suspense>

      <header className="app__header">
        <div className="app__brand">
          <h1 className="app__title">WindCloud</h1>
          <span className="app__tagline">Observatorio meteorológico abierto</span>
        </div>
        <PlaceSearch onSelect={onSelectPlace} />
      </header>

      {point && (
        <aside className="point-chip" aria-live="polite">
          <span className="point-chip__label">
            {point.label ?? 'Punto seleccionado'}
            <span className="point-chip__coords">
              {coordFormat.format(point.lat)}°, {coordFormat.format(point.lon)}°
            </span>
          </span>
          <span className="point-chip__note">El panel multi-modelo llega en la tarea T-22</span>
          <button type="button" onClick={() => setPoint(null)} aria-label="Quitar punto">
            ×
          </button>
        </aside>
      )}
    </div>
  )
}
