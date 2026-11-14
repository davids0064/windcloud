import { useEffect, useState } from 'react'
import type { Loadable } from '../precision/usePrecision'
import { fetchRisk, type RiskData } from './data'

/** Riesgo del último run de GFS; solo se pide con la pestaña Riesgo abierta. */
export function useRisk(enabled: boolean): Loadable<RiskData> {
  const [state, setState] = useState<Loadable<RiskData>>({ status: 'loading' })
  useEffect(() => {
    if (!enabled) return
    let alive = true
    fetchRisk()
      .then((data) => alive && setState({ status: 'ready', data }))
      .catch(
        (e) =>
          alive &&
          setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
      )
    return () => {
      alive = false
    }
  }, [enabled])
  return enabled ? state : { status: 'off' }
}
