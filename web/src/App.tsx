import { lazy, Suspense, useState } from 'react'
import type { LatLon } from './map/MapView'
import './App.css'

// El mapa (MapLibre + deck.gl) se carga aparte para no inflar el bundle inicial (RNF-2).
const MapView = lazy(() => import('./map/MapView'))

const coordFormat = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
})

export default function App() {
  const [point, setPoint] = useState<LatLon | null>(null)

  return (
    <div className="app">
      <Suspense fallback={<p className="app__loading">Cargando mapa…</p>}>
        <MapView onSelectPoint={setPoint} selectedPoint={point} />
      </Suspense>

      <header className="app__header">
        <h1 className="app__title">WindCloud</h1>
        <span className="app__tagline">Observatorio meteorológico abierto</span>
      </header>

      {point && (
        <aside className="point-chip" aria-live="polite">
          <span>
            Punto: {coordFormat.format(point.lat)}°, {coordFormat.format(point.lon)}°
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
