import { useEffect, useState } from 'react'
import {
  fetchPrecision,
  fetchStationDetail,
  type PrecisionSummary,
  type StationDetail,
} from './data'

export type Loadable<T> =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Resumen de precisión; solo se pide cuando `enabled` (la pestaña o el mapa lo necesitan). */
export function usePrecision(enabled: boolean): Loadable<PrecisionSummary> {
  const [state, setState] = useState<Loadable<PrecisionSummary>>({ status: 'loading' })
  useEffect(() => {
    if (!enabled) return
    let alive = true
    fetchPrecision()
      .then((data) => alive && setState({ status: 'ready', data }))
      .catch((e) => alive && setState({ status: 'error', message: errorText(e) }))
    return () => {
      alive = false
    }
  }, [enabled])
  return enabled ? state : { status: 'off' }
}

/** Detalle de una estación (se carga al abrirla). */
export function useStationDetail(icao: string | null): Loadable<StationDetail> {
  const [state, setState] = useState<{ icao: string; value: Loadable<StationDetail> } | null>(null)
  useEffect(() => {
    if (!icao) return
    let alive = true
    fetchStationDetail(icao)
      .then((data) => alive && setState({ icao, value: { status: 'ready', data } }))
      .catch((e) => alive && setState({ icao, value: { status: 'error', message: errorText(e) } }))
    return () => {
      alive = false
    }
  }, [icao])
  if (!icao) return { status: 'off' }
  return state?.icao === icao ? state.value : { status: 'loading' }
}
