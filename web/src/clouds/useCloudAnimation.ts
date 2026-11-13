import { useEffect, useState } from 'react'
import {
  CLOUD_LAYERS,
  dropUnpublished,
  fetchAvailableTimes,
  pickFrames,
  type CloudKind,
} from '../api/gibs'

export type CloudStatus = 'off' | 'loading' | 'ready' | 'error'

export const FRAME_INTERVAL_MS = 700
export const REFRESH_MS = 10 * 60_000 // GIBS publica cada 10 min

interface Loaded {
  kind: CloudKind
  frames: Date[]
  failed: boolean
}

/** Pide las horas disponibles en GIBS, arma los cuadros y anima. → RF-3 */
export function useCloudAnimation(kind: CloudKind | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!kind) return
    let controller = new AbortController()
    const load = async () => {
      controller.abort()
      controller = new AbortController()
      try {
        const layer = CLOUD_LAYERS[kind]
        const declared = await fetchAvailableTimes(layer, new Date(), 6, controller.signal)
        // GIBS declara horas cuyas teselas aún no publica: se descartan antes de animar.
        const published = await dropUnpublished(layer, declared, { signal: controller.signal })
        const frames = pickFrames(published)
        setLoaded({ kind, frames, failed: frames.length === 0 })
        setIndex(Math.max(0, frames.length - 1)) // empezar en la imagen más reciente
      } catch {
        if (!controller.signal.aborted) setLoaded({ kind, frames: [], failed: true })
      }
    }
    void load()
    const refresh = setInterval(load, REFRESH_MS)
    return () => {
      clearInterval(refresh)
      controller.abort()
    }
  }, [kind])

  const current = loaded && loaded.kind === kind ? loaded : null
  const frames = current?.frames ?? []
  const status: CloudStatus = !kind
    ? 'off'
    : !current
      ? 'loading'
      : current.failed
        ? 'error'
        : 'ready'
  const isPlaying = playing && status === 'ready' && frames.length > 1

  useEffect(() => {
    if (!isPlaying) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % frames.length), FRAME_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [isPlaying, frames.length])

  return {
    status,
    frames,
    index: Math.min(index, Math.max(0, frames.length - 1)),
    setIndex: (i: number) => {
      setPlaying(false)
      setIndex(i)
    },
    playing: isPlaying,
    togglePlay: () => setPlaying((p) => !p),
    /** Detiene la animación (al cambiar de tipo de imagen se vuelve a la más reciente). */
    stop: () => setPlaying(false),
  }
}
