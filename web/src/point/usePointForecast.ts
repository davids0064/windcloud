import { useEffect, useState } from 'react'
import { fetchModelRun, fetchMultiModel, type MultiModelForecast } from '../api/openMeteo'
import {
  consensusSeries,
  equalWeights,
  type ConsensusSeries,
  type WeightInfo,
} from '../core/consensus'
import type { LatLon } from '../map/MapView'

export interface PointForecast {
  forecast: MultiModelForecast
  consensus: ConsensusSeries
  weights: WeightInfo
  /** Hora de inicio del run por `apiId` (null = desconocida). */
  runs: Record<string, Date | null>
}

type State =
  | { status: 'loading'; key: string }
  | { status: 'ready'; key: string; data: PointForecast }
  | { status: 'error'; key: string; message: string }

const keyOf = (p: LatLon) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`

/** Pronóstico multi-modelo + consenso para un punto (RF-6). */
export function usePointForecast(point: LatLon | null) {
  const [state, setState] = useState<State | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!point) return
    const key = keyOf(point)
    const controller = new AbortController()
    ;(async () => {
      try {
        // Sin signal: la consulta se comparte en caché; si el punto cambia, aquí solo se ignora el resultado.
        const forecast = await fetchMultiModel(point.lat, point.lon)
        // Pesos iguales hasta que exista verificación (RF-7 / T-45).
        const weights = equalWeights(forecast.models.map((m) => m.model.apiId))
        const consensus = consensusSeries(forecast, weights)
        const runList = await Promise.all(forecast.models.map((m) => fetchModelRun(m.model)))
        const runs = Object.fromEntries(forecast.models.map((m, i) => [m.model.apiId, runList[i]]))
        if (!controller.signal.aborted) {
          setState({ status: 'ready', key, data: { forecast, consensus, weights, runs } })
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setState({
            status: 'error',
            key,
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }
    })()
    return () => controller.abort()
  }, [point, attempt])

  // Mientras llega la respuesta del punto nuevo, se muestra "cargando" (nunca datos de otro punto).
  const current = point && state?.key === keyOf(point) ? state : null
  return {
    status: !point ? ('idle' as const) : (current?.status ?? ('loading' as const)),
    data: current?.status === 'ready' ? current.data : null,
    error: current?.status === 'error' ? current.message : null,
    retry: () => setAttempt((a) => a + 1),
  }
}
