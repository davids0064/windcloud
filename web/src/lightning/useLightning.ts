import { useEffect, useState } from 'react'
import type { Loadable } from '../precision/usePrecision'
import { REFRESH_MS, fetchLightning, type LightningData } from './data'

/** Datos + hora en que llegaron (referencia para colorear por antigüedad sin leer el reloj al dibujar). */
export type LoadedLightning = LightningData & { receivedAt: number }

/** Rayos; se piden al encender la capa y luego cada 5 min mientras siga encendida. */
export function useLightning(
  enabled: boolean,
  load: () => Promise<LightningData> = fetchLightning,
  every = REFRESH_MS,
): Loadable<LoadedLightning> {
  const [state, setState] = useState<Loadable<LoadedLightning>>({ status: 'loading' })
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const run = () =>
      load()
        .then(
          (data) =>
            alive && setState({ status: 'ready', data: { ...data, receivedAt: Date.now() } }),
        )
        .catch(
          (e) =>
            alive &&
            // Si ya había datos, se conservan (la edad visible avisa); si no, error.
            setState((prev) =>
              prev.status === 'ready'
                ? prev
                : { status: 'error', message: e instanceof Error ? e.message : String(e) },
            ),
        )
    void run()
    const id = setInterval(run, every)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [enabled, load, every])
  return enabled ? state : { status: 'off' }
}
