import { useEffect, useState } from 'react'
import {
  fetchGridMeta,
  nearestStepIndex,
  windFileUrl,
  windFrame,
  type LoadedMeta,
  type WindLevel,
} from './meta'
import type { WindField } from './WindLayer'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; loaded: LoadedMeta; stepIndex: number; field: WindField }

/** Decodifica el PNG sin tocar sus bytes (son datos, no color). */
async function loadBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return createImageBitmap(await res.blob(), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })
}

/** Viento del run más reciente en la hora más cercana a ahora (T-34; la línea de tiempo llega en T-35). */
export function useWindField(enabled: boolean, level: WindLevel = '10m') {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    if (!enabled) return
    let alive = true
    ;(async () => {
      try {
        const loaded = await fetchGridMeta('gfs')
        const stepIndex = nearestStepIndex(loaded.meta, new Date())
        const step = loaded.meta.steps[stepIndex]
        const image = await loadBitmap(windFileUrl(loaded, level, step))
        const field: WindField = {
          image,
          frame: windFrame(loaded.meta, level, step),
          level,
          bounds: loaded.meta.bounds,
        }
        if (alive) setState({ status: 'ready', loaded, stepIndex, field })
      } catch (e) {
        if (alive)
          setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => {
      alive = false
    }
  }, [enabled, level])

  return enabled ? state : ({ status: 'off' } as const)
}
