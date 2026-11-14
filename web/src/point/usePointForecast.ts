import { useEffect, useState } from 'react'
import { fetchModelRun, fetchMultiModel, type MultiModelForecast } from '../api/openMeteo'
import { consensusSeries, type ConsensusSeries } from '../core/consensus'
import { consensusWeights, nearestStation, type ConsensusWeights } from '../core/verifiedWeights'
import { fetchPrecision, fetchStationDetail } from '../precision/data'
import type { LatLon } from '../map/MapView'

export interface PointForecast {
  forecast: MultiModelForecast
  consensus: ConsensusSeries
  weights: ConsensusWeights
  /** Hora de inicio del run por `apiId` (null = desconocida). */
  runs: Record<string, Date | null>
}

type State =
  | { status: 'loading'; key: string }
  | { status: 'ready'; key: string; data: PointForecast }
  | { status: 'error'; key: string; message: string }

/** Resumen y detalle de la estación más cercana; nunca rompe el panel (null si no hay). */
async function loadVerification(point: LatLon) {
  try {
    const summary = await fetchPrecision()
    const near = nearestStation(point.lat, point.lon, summary.estaciones)
    const detail = near ? await fetchStationDetail(near.station.icao).catch(() => null) : null
    return [summary, detail] as const
  } catch {
    return [null, null] as const
  }
}

const keyOf = (p: LatLon) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`

/** Pronóstico + consenso (ponderado si hay verificación cerca) de un punto. Lo usan el panel y las alertas. */
export async function loadPointForecast(point: LatLon): Promise<PointForecast> {
  // Sin signal: la consulta se comparte en caché; si el punto cambia, quien llama ignora el resultado.
  const forecast = await fetchMultiModel(point.lat, point.lon)
  // Pesos por precisión verificada cerca del punto (T-45); si falla, pesos iguales y se dice.
  const [summary, detail] = await loadVerification(point)
  const weights = consensusWeights(
    forecast.models.map((m) => m.model.apiId),
    point,
    summary,
    detail,
  )
  const consensus = consensusSeries(forecast, weights.base, weights.byVariable)
  const runList = await Promise.all(forecast.models.map((m) => fetchModelRun(m.model)))
  const runs = Object.fromEntries(forecast.models.map((m, i) => [m.model.apiId, runList[i]]))
  return { forecast, consensus, weights, runs }
}

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
        const data = await loadPointForecast(point)
        if (!controller.signal.aborted) {
          setState({ status: 'ready', key, data })
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
