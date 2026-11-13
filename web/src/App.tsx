import { lazy, Suspense, useCallback, useState } from 'react'
import { zoomForKind, type Place } from './api/geocoding'
import { CLOUD_LAYERS, type CloudKind } from './api/gibs'
import { CloudPanel } from './clouds/CloudPanel'
import { useCloudAnimation } from './clouds/useCloudAnimation'
import type { BasemapId } from './map/basemaps'
import type { ClickedPoint, FlyTarget, LatLon } from './map/MapView'
import { PlaceSearch } from './search/PlaceSearch'
import type { Located } from './shell/geolocation'
import { LocateButton } from './shell/LocateButton'
import { SideMenu } from './shell/SideMenu'
import type { TabId } from './shell/menuTabs'
import { ComingSoon } from './shell/tabs/ComingSoon'
import { MapTab } from './shell/tabs/MapTab'
import { MethodologyTab } from './shell/tabs/MethodologyTab'
import { PointTab } from './shell/tabs/PointTab'
import { scalarFileUrl } from './layers/forecastLayers'
import { scalarUrl } from './layers/scalarUrl'
import type { ScalarName } from './layers/scalarStyles'
import { ForecastPanel } from './wind/ForecastPanel'
import { useForecastGrid } from './wind/useForecastGrid'
import './App.css'

// El mapa (MapLibre + deck.gl) se carga aparte para no inflar el bundle inicial (RNF-2).
const MapView = lazy(() => import('./map/MapView'))
// El panel de punto (con su gráfica) también se carga aparte.
const PointPanel = lazy(() => import('./point/PointPanel'))

interface SelectedPoint extends LatLon {
  /** Nombre si viene del buscador o de la ubicación; vacío si fue un clic sin departamento. */
  label?: string
}

/** En móvil el menú empieza cerrado para dejar ver el mapa (RNF-4). */
const startsOpen = () =>
  typeof window === 'undefined' || !window.matchMedia?.('(max-width: 640px)').matches

export default function App() {
  const [point, setPoint] = useState<SelectedPoint | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null)
  const [menuOpen, setMenuOpen] = useState(startsOpen)
  const [tab, setTab] = useState<TabId>('mapa')
  const [basemap, setBasemap] = useState<BasemapId>('oscuro')
  const [cloudKind, setCloudKind] = useState<CloudKind | null>('infrarrojo')
  const cloud = useCloudAnimation(cloudKind)
  const [windOn, setWindOn] = useState(true)
  const [scalar, setScalar] = useState<ScalarName | null>(null)
  const [isobarsOn, setIsobarsOn] = useState(false)
  const grid = useForecastGrid(windOn || scalar !== null || isobarsOn, windOn)
  const gridReady = grid.status === 'ready' ? grid : null
  const step = gridReady ? gridReady.loaded.meta.steps[gridReady.stepIndex] : null
  const scalarLayer =
    gridReady &&
    scalar &&
    step !== null &&
    gridReady.loaded.meta.scalars[scalar]?.steps.includes(step)
      ? {
          name: scalar,
          url: scalarUrl(
            scalar,
            scalarFileUrl(gridReady.loaded.base, gridReady.loaded.meta.scalars[scalar].file, step),
          ),
          scale: gridReady.loaded.meta.scalars[scalar],
          bounds: gridReady.loaded.meta.bounds,
        }
      : null
  const isobars = gridReady?.loaded.meta.isobars
  const isobarsUrl =
    gridReady && isobarsOn && isobars && step !== null && isobars.steps.includes(step)
      ? scalarFileUrl(gridReady.loaded.base, isobars.file, step)
      : null

  const choosePoint = useCallback((p: SelectedPoint) => {
    setPoint(p)
    setPanelOpen(true)
    // En móvil el menú y la hoja del pronóstico compiten por la pantalla: se cierra el menú.
    if (!startsOpen()) setMenuOpen(false)
  }, [])

  const onMapClick = useCallback(
    (p: ClickedPoint) =>
      choosePoint({
        lat: p.lat,
        lon: p.lon,
        label: p.departamento ? `Punto en ${p.departamento}` : undefined,
      }),
    [choosePoint],
  )

  const onSelectPlace = useCallback(
    (place: Place) => {
      setFlyTo({ lat: place.lat, lon: place.lon, zoom: zoomForKind(place.kind), key: Date.now() })
      // Un país no es un punto de pronóstico: solo se centra el mapa.
      if (place.kind === 'pais') {
        setPoint(null)
        setPanelOpen(false)
        return
      }
      choosePoint({
        lat: place.lat,
        lon: place.lon,
        label: place.context ? `${place.name}, ${place.context}` : place.name,
      })
    },
    [choosePoint],
  )

  const onLocated = useCallback(
    (where: Located) => {
      setFlyTo({ lat: where.lat, lon: where.lon, zoom: 10, key: Date.now() })
      choosePoint({ lat: where.lat, lon: where.lon, label: 'Mi ubicación' })
    },
    [choosePoint],
  )

  return (
    <div className={panelOpen && point ? 'app app--panel-open' : 'app'}>
      <Suspense fallback={<p className="app__loading">Cargando mapa…</p>}>
        <MapView
          onSelectPoint={onMapClick}
          selectedPoint={point}
          flyTo={flyTo}
          basemap={basemap}
          wind={gridReady?.field ?? null}
          scalar={scalarLayer}
          isobarsUrl={isobarsUrl}
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

      <SideMenu
        open={menuOpen}
        onToggle={() => setMenuOpen((o) => !o)}
        tab={tab}
        onTabChange={setTab}
        tools={
          <>
            <PlaceSearch onSelect={onSelectPlace} />
            <LocateButton onLocated={onLocated} />
          </>
        }
      >
        {tab === 'mapa' && (
          <MapTab
            basemap={basemap}
            onBasemapChange={setBasemap}
            wind={
              <ForecastPanel
                state={grid}
                windOn={windOn}
                onWindOn={setWindOn}
                scalar={scalar}
                onScalar={setScalar}
                isobarsOn={isobarsOn}
                onIsobarsOn={setIsobarsOn}
              />
            }
            clouds={
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
            }
          />
        )}
        {tab === 'punto' && (
          <PointTab point={point} panelOpen={panelOpen} onOpenPanel={() => setPanelOpen(true)} />
        )}
        {tab === 'precision' && (
          <ComingSoon title="Precisión verificada" phase="fase 3 (T-40 a T-45)">
            <p>
              Aquí verás qué modelo acierta más en cada lugar: comparación diaria contra estaciones
              METAR de aeropuertos e IDEAM (error medio, sesgo, aciertos de lluvia) en ventanas de 7
              y 30 días.
            </p>
            <p>
              Mientras no exista esa verificación, el consenso usa pesos iguales y así lo indica.
            </p>
          </ComingSoon>
        )}
        {tab === 'riesgo' && (
          <ComingSoon title="Riesgo meteorológico" phase="fase 4 (T-50 a T-53)">
            <p>
              Indicador propio de riesgo por viento fuerte, lluvia intensa, calor y condiciones de
              incendio, más focos de calor de NASA FIRMS. Será un{' '}
              <strong>indicador propio, no el pronóstico oficial del IDEAM</strong>.
            </p>
            <p>
              Para alertas oficiales consulta el{' '}
              <a href="https://www.ideam.gov.co" target="_blank" rel="noopener noreferrer">
                IDEAM
              </a>
              .
            </p>
          </ComingSoon>
        )}
        {tab === 'metodologia' && <MethodologyTab />}
      </SideMenu>

      {point && panelOpen && (
        <Suspense fallback={null}>
          <PointPanel point={point} onClose={() => setPanelOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}
