/**
 * Revisión de alertas con la página abierta (T-53, RF-12, diseño §8).
 *
 * La configuración (punto + umbrales) y las alertas ya avisadas se guardan solo en este navegador
 * (`localStorage`): es una comodidad de quien la usa, no se envía a ningún servidor. Si el
 * almacenamiento no está disponible (navegación privada), las alertas funcionan mientras la página siga
 * abierta y se pierden al cerrarla.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  CHECK_EVERY_MS,
  checkAlerts,
  describeExceedance,
  exceedanceKey,
  pointKey,
  type AlertThresholds,
  type Exceedance,
} from '../core/alerts'
import type { LatLon } from '../map/MapView'
import type { PointForecast } from '../point/usePointForecast'

export interface AlertConfig {
  point: LatLon & { label?: string }
  thresholds: AlertThresholds
}

export interface AlertCheck {
  at: Date
  exceedances: Exceedance[]
  error?: string
}

const KEY = 'wc-alertas-v1'
const MAX_NOTIFIED = 50

interface Stored {
  config: AlertConfig | null
  notified: string[]
}

function read(): Stored {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Partial<Stored>
      return { config: s.config ?? null, notified: Array.isArray(s.notified) ? s.notified : [] }
    }
  } catch {
    // sin almacenamiento: alertas solo en memoria
  }
  return { config: null, notified: [] }
}

function write(s: Stored) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // sin almacenamiento: no pasa nada
  }
}

export type NotifyPermission = NotificationPermission | 'no-soportado'

export const notificationPermission = (): NotifyPermission =>
  typeof Notification === 'undefined' ? 'no-soportado' : Notification.permission

/** Aviso del sistema si el usuario lo permitió; si no, solo queda el aviso dentro de la página. */
function systemNotify(place: string, news: Exceedance[]) {
  if (notificationPermission() !== 'granted') return
  try {
    new Notification(`WindCloud · alerta en ${place}`, {
      body: news.map(describeExceedance).join('\n'),
      tag: 'wc-alerta',
    })
  } catch {
    // algunos navegadores móviles solo permiten avisos desde un service worker
  }
}

export interface AlertsState {
  config: AlertConfig | null
  setConfig: (c: AlertConfig | null) => void
  check: AlertCheck | null
  /** Excesos nuevos de la última revisión (para el aviso en la página). */
  fresh: Exceedance[]
  dismiss: () => void
}

type Loader = (p: LatLon) => Promise<Pick<PointForecast, 'forecast' | 'consensus'>>

/** El código del pronóstico se descarga solo si hay alertas activas (no infla la carga inicial). */
const lazyLoad: Loader = (p) =>
  import('../point/usePointForecast').then((m) => m.loadPointForecast(p))

export function useAlerts(load: Loader = lazyLoad, every = CHECK_EVERY_MS): AlertsState {
  const [config, setConfigState] = useState<AlertConfig | null>(() => read().config)
  const [check, setCheck] = useState<AlertCheck | null>(null)
  const [fresh, setFresh] = useState<Exceedance[]>([])

  const setConfig = useCallback((c: AlertConfig | null) => {
    setConfigState(c)
    setCheck(null)
    setFresh([])
    write({ ...read(), config: c })
  }, [])

  useEffect(() => {
    if (!config) return
    let alive = true
    const run = async () => {
      const now = new Date()
      try {
        const { forecast, consensus } = await load(config.point)
        if (!alive) return
        const exceedances = checkAlerts(forecast.times, consensus, config.thresholds, now)
        const stored = read()
        const pk = pointKey(config.point)
        const news = exceedances.filter((e) => !stored.notified.includes(exceedanceKey(pk, e)))
        if (news.length) {
          const keys = news.map((e) => exceedanceKey(pk, e))
          write({ ...stored, notified: [...stored.notified, ...keys].slice(-MAX_NOTIFIED) })
          systemNotify(config.point.label ?? 'tu punto', news)
          setFresh(news)
        }
        setCheck({ at: now, exceedances })
      } catch (e) {
        if (alive)
          setCheck({ at: now, exceedances: [], error: e instanceof Error ? e.message : String(e) })
      }
    }
    void run()
    const id = setInterval(run, every)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [config, load, every])

  return { config, setConfig, check, fresh, dismiss: useCallback(() => setFresh([]), []) }
}
