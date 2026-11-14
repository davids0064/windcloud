import { useEffect, useState } from 'react'
import type { Loadable } from '../precision/usePrecision'
import { fetchFires, windOutlook, type Fire, type FiresData, type WindRow } from './data'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Focos publicados; solo se piden con la capa visible. */
export function useFires(enabled: boolean): Loadable<FiresData> {
  const [state, setState] = useState<Loadable<FiresData>>({ status: 'loading' })
  useEffect(() => {
    if (!enabled) return
    let alive = true
    fetchFires()
      .then((data) => alive && setState({ status: 'ready', data }))
      .catch((e) => alive && setState({ status: 'error', message: message(e) }))
    return () => {
      alive = false
    }
  }, [enabled])
  return enabled ? state : { status: 'off' }
}

/** Viento del consenso sobre el foco elegido (el código del pronóstico se carga en diferido). */
export function useFireWind(fire: Fire | null): Loadable<WindRow[]> {
  const [state, setState] = useState<{ key: string; value: Loadable<WindRow[]> } | null>(null)
  const key = fire ? `${fire.lat},${fire.lon}` : ''
  useEffect(() => {
    if (!fire) return
    let alive = true
    import('../point/usePointForecast')
      .then((m) => m.loadPointForecast({ lat: fire.lat, lon: fire.lon }))
      .then(({ forecast, consensus }) => {
        if (alive)
          setState({
            key,
            value: { status: 'ready', data: windOutlook(forecast.times, consensus, new Date()) },
          })
      })
      .catch((e) => alive && setState({ key, value: { status: 'error', message: message(e) } }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la clave resume el foco
  }, [key])
  if (!fire) return { status: 'off' }
  return state?.key === key ? state.value : { status: 'loading' }
}
