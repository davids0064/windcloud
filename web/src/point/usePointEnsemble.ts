import { useEffect, useState } from 'react'
import { fetchEnsemble, fetchEnsembleRun, type EnsembleForecast } from '../api/ensemble'
import type { LatLon } from '../map/MapView'

type State =
  | { key: string; status: 'ready'; data: EnsembleForecast; runs: Record<string, Date | null> }
  | { key: string; status: 'error' }

const keyOf = (p: LatLon) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`

/**
 * Ensambles de lluvia de un punto (T-23). Independiente del pronóstico multi-modelo: si falla, el resto del
 * panel sigue funcionando y esta sección dice "sin datos".
 */
export function usePointEnsemble(point: LatLon) {
  const [state, setState] = useState<State | null>(null)

  useEffect(() => {
    const key = keyOf(point)
    let alive = true
    ;(async () => {
      try {
        const data = await fetchEnsemble(point.lat, point.lon)
        const runList = await Promise.all(data.ensembles.map((e) => fetchEnsembleRun(e.ensemble)))
        const runs = Object.fromEntries(
          data.ensembles.map((e, i) => [e.ensemble.apiId, runList[i]]),
        )
        if (alive) setState({ key, status: 'ready', data, runs })
      } catch {
        if (alive) setState({ key, status: 'error' })
      }
    })()
    return () => {
      alive = false
    }
  }, [point])

  const current = state?.key === keyOf(point) ? state : null
  return {
    status: current?.status ?? ('loading' as const),
    data: current?.status === 'ready' ? current.data : null,
    runs: current?.status === 'ready' ? current.runs : {},
  }
}
