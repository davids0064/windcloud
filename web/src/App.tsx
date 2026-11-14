import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { zoomForKind, type Place } from './api/geocoding'
import { CLOUD_LAYERS, type CloudKind } from './api/gibs'
import { CloudPanel } from './clouds/CloudPanel'
import { useCloudAnimation } from './clouds/useCloudAnimation'
import type { BasemapId } from './map/basemaps'
import type { ClickedPoint, FlyTarget, LatLon } from './map/MapView'
import type { MapStation } from './map/stations'
import { bestByStation, modelColorOf, modelLabel } from './precision/data'
import type { PrecisionSelection } from './precision/PrecisionTab'
import { usePrecision } from './precision/usePrecision'
import { AlertBanner } from './alerts/AlertsSection'
import { useAlerts } from './alerts/useAlerts'
import { ago, arrowGeoJSON, firesGeoJSON } from './fires/data'
import { useFireWind, useFires } from './fires/useFires'
import { describeCell, levelsFor, riskGeoJSON } from './risk/data'
import type { RiskSelection } from './risk/RiskTab'
import { useRisk } from './risk/useRisk'
import { PlaceSearch } from './search/PlaceSearch'
import type { Located } from './shell/geolocation'
import { LocateButton } from './shell/LocateButton'
import { SideMenu } from './shell/SideMenu'
import type { TabId } from './shell/menuTabs'
import { MapTab } from './shell/tabs/MapTab'
import { MethodologyTab } from './shell/tabs/MethodologyTab'
import { PointTab } from './shell/tabs/PointTab'
import { scalarFileUrl } from './layers/forecastLayers'
import { scalarUrl } from './layers/scalarUrl'
import type { ScalarName } from './layers/scalarStyles'
import { ForecastPanel } from './wind/ForecastPanel'
import { useForecastGrid, type GridModel } from './wind/useForecastGrid'
import './App.css'

// El mapa (MapLibre + deck.gl) se carga aparte para no inflar el bundle inicial (RNF-2).
const MapView = lazy(() => import('./map/MapView'))
// El panel de punto (con su gráfica) también se carga aparte.
const PointPanel = lazy(() => import('./point/PointPanel'))
// La pestaña Precisión (tablas y lista de estaciones) solo se carga al abrirla.
const PrecisionTab = lazy(() => import('./precision/PrecisionTab'))
// Igual la pestaña Riesgo (T-51).
const RiskTab = lazy(() => import('./risk/RiskTab'))

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
  const [gridModel, setGridModel] = useState<GridModel>('gfs')
  const [precisionSel, setPrecisionSel] = useState<PrecisionSelection>({
    win: '7',
    variable: 'temperatura',
    lead: 1,
    red: 'todas',
  })
  const [station, setStation] = useState<string | null>(null)
  const precision = usePrecision(tab === 'precision')
  const precisionData = precision.status === 'ready' ? precision.data : null
  const mapStations = useMemo<MapStation[] | null>(() => {
    if (!precisionData) return null
    const best = bestByStation(precisionData, precisionSel.win, precisionSel.variable)
    const shown =
      precisionSel.red === 'todas'
        ? precisionData.estaciones
        : precisionData.estaciones.filter((s) => s.red === precisionSel.red)
    return shown.map((s) => {
      const m = best.get(s.icao) ?? null
      return {
        icao: s.icao,
        nombre: s.nombre,
        lat: s.lat,
        lon: s.lon,
        color: m ? modelColorOf(m) : null,
        best: m ? modelLabel(m) : 'sin muestra suficiente',
      }
    })
  }, [precisionData, precisionSel.win, precisionSel.variable, precisionSel.red])
  const alerts = useAlerts()
  const [riskSel, setRiskSel] = useState<RiskSelection>({ view: 'incendio', when: 'max' })
  const risk = useRisk(tab === 'riesgo')
  const riskData = risk.status === 'ready' ? risk.data : null
  const riskLevels = useMemo(
    () => (riskData ? levelsFor(riskData, riskSel.view, riskSel.when) : null),
    [riskData, riskSel.view, riskSel.when],
  )
  const riskLayer = useMemo(
    () =>
      riskData && riskLevels
        ? {
            cells: riskGeoJSON(riskData, riskSel.view, riskLevels),
            describe: (i: number) => describeCell(riskData, i, riskSel.when),
          }
        : null,
    [riskData, riskLevels, riskSel.view, riskSel.when],
  )
  const [firesOn, setFiresOn] = useState(true)
  const [fireIndex, setFireIndex] = useState<number | null>(null)
  const fires = useFires(tab === 'riesgo' && firesOn)
  const firesData = fires.status === 'ready' ? fires.data : null
  const selectedFire = firesData && fireIndex !== null ? (firesData.focos[fireIndex] ?? null) : null
  const fireWind = useFireWind(tab === 'riesgo' && firesOn ? selectedFire : null)
  const fireToward = fireWind.status === 'ready' ? fireWind.data[0] : null
  const firesLayer = useMemo(() => {
    if (!firesData) return null
    const arrow =
      selectedFire && fireToward?.toward != null && (fireToward.speed ?? 0) >= 2
        ? arrowGeoJSON(selectedFire, fireToward.toward)
        : null
    return {
      points: firesGeoJSON(firesData, fireIndex),
      arrow,
      describe: (i: number) => {
        const f = firesData.focos[i]
        return `Foco de calor · ${f.departamento ?? ''} · ${f.sensor} · ${ago(f.hora, new Date())} · confianza ${f.confianza}`
      },
    }
  }, [firesData, fireIndex, selectedFire, fireToward])
  const grid = useForecastGrid(windOn || scalar !== null || isobarsOn, windOn, gridModel)
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

  /** Desde la lista: abre el detalle y centra el mapa. Desde el mapa: solo abre el detalle. */
  const selectStation = useCallback(
    (icao: string | null, fly = true) => {
      setStation(icao)
      if (!icao) return
      setTab('precision')
      setMenuOpen(true)
      const s = precisionData?.estaciones.find((x) => x.icao === icao)
      if (fly && s) setFlyTo({ lat: s.lat, lon: s.lon, zoom: 7, key: Date.now() })
    },
    [precisionData],
  )
  const onMapStation = useCallback((icao: string) => selectStation(icao, false), [selectStation])

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
          stations={tab === 'precision' ? mapStations : null}
          selectedStation={station}
          onSelectStation={onMapStation}
          risk={tab === 'riesgo' ? riskLayer : null}
          fires={tab === 'riesgo' ? firesLayer : null}
          onSelectFire={setFireIndex}
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
                model={gridModel}
                onModel={setGridModel}
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
          <PointTab
            point={point}
            panelOpen={panelOpen}
            onOpenPanel={() => setPanelOpen(true)}
            alerts={alerts}
          />
        )}
        {tab === 'precision' && (
          <Suspense fallback={<p className="tab-section">Cargando…</p>}>
            <PrecisionTab
              state={precision}
              selection={precisionSel}
              onSelection={setPrecisionSel}
              station={station}
              onStation={selectStation}
            />
          </Suspense>
        )}
        {tab === 'riesgo' && (
          <Suspense fallback={<p className="tab-section">Cargando…</p>}>
            <RiskTab
              state={risk}
              selection={riskSel}
              onSelection={setRiskSel}
              levels={riskLevels}
              fires={{
                state: fires,
                on: firesOn,
                onToggle: (on) => {
                  setFiresOn(on)
                  if (!on) setFireIndex(null)
                },
                selected: fireIndex,
                onSelect: setFireIndex,
                wind: fireWind,
              }}
            />
          </Suspense>
        )}
        {tab === 'metodologia' && <MethodologyTab />}
      </SideMenu>

      <AlertBanner
        alerts={alerts}
        onOpen={() => {
          if (alerts.config) choosePoint(alerts.config.point)
          alerts.dismiss()
        }}
      />

      {point && panelOpen && (
        <Suspense fallback={null}>
          <PointPanel point={point} onClose={() => setPanelOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}
