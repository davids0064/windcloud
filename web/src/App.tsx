import { lazy, Suspense, useCallback, useState } from 'react'
import { CLOUD_LAYERS, type CloudKind } from './api/gibs'
import { zoomForKind, type Place } from './api/geocoding'
import { CloudPanel } from './clouds/CloudPanel'
import { useCloudAnimation } from './clouds/useCloudAnimation'
import type { ClickedPoint, FlyTarget, LatLon } from './map/MapView'
import { PlaceSearch } from './search/PlaceSearch'
import './App.css'

// El mapa (MapLibre + deck.gl) se carga aparte para no inflar el bundle inicial (RNF-2).
const MapView = lazy(() => import('./map/MapView'))
// El panel de punto (con su gráfica) también se carga aparte.
const PointPanel = lazy(() => import('./point/PointPanel'))

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
  const [cloudKind, setCloudKind] = useState<CloudKind | null>('infrarrojo')
  const cloud = useCloudAnimation(cloudKind)

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
    <div className={point ? 'app app--panel-open' : 'app'}>
      <Suspense fallback={<p className="app__loading">Cargando mapa…</p>}>
        <MapView
          onSelectPoint={onMapClick}
          selectedPoint={point}
          flyTo={flyTo}
          clouds={
            cloudKind && cloud.status === 'ready'
              ? {
                  layer: CLOUD_LAYERS[cloudKind],
                  frames: cloud.frames,
                  index: cloud.index,
                  preloadAll: cloud.playing,
                }
              : null
          }
        />
      </Suspense>

      <header className="app__header">
        <div className="app__brand">
          <h1 className="app__title">WindCloud</h1>
          <span className="app__tagline">Observatorio meteorológico abierto</span>
        </div>
        <PlaceSearch onSelect={onSelectPlace} />
      </header>

      <CloudPanel
        kind={cloudKind}
        onKindChange={(k) => {
          cloud.stop()
          setCloudKind(k)
        }}
        status={cloud.status}
        frames={cloud.frames}
        index={cloud.index}
        onIndexChange={cloud.setIndex}
        playing={cloud.playing}
        onTogglePlay={cloud.togglePlay}
      />

      {point && (
        <Suspense fallback={null}>
          <PointPanel point={point} onClose={() => setPoint(null)} />
        </Suspense>
      )}
    </div>
  )
}
