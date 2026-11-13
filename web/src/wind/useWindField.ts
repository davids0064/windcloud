import { useEffect, useRef, useState } from 'react'
import {
  fetchGridMeta,
  nearestStepIndex,
  windFileUrl,
  windFrame,
  type LoadedMeta,
  type WindLevel,
} from './meta'
import type { WindField } from './WindLayer'

/** Decodifica el PNG sin tocar sus bytes (son datos, no color). */
async function loadBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return createImageBitmap(await res.blob(), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })
}

export const PLAY_INTERVAL_MS = 900

type MetaState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; loaded: LoadedMeta }

/**
 * Viento del run más reciente con línea de tiempo y nivel (T-34, T-35). El meta se lee una vez; las imágenes se
 * guardan por nivel y paso, y al elegir un nivel se precargan sus 25 pasos para que mover el tiempo sea inmediato.
 */
export function useWindField(enabled: boolean) {
  const [metaState, setMetaState] = useState<MetaState>({ status: 'loading' })
  const [level, setLevel] = useState<WindLevel>('10m')
  const [stepIndex, setStepIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [field, setField] = useState<WindField | null>(null)
  const cache = useRef(new Map<string, Promise<ImageBitmap>>())

  // 1) meta (una vez) y paso inicial = hora más cercana a ahora
  useEffect(() => {
    if (!enabled || metaState.status === 'ready') return
    let alive = true
    fetchGridMeta('gfs')
      .then((loaded) => {
        if (!alive) return
        setMetaState({ status: 'ready', loaded })
        setStepIndex((i) => i ?? nearestStepIndex(loaded.meta, new Date()))
      })
      .catch(
        (e) =>
          alive &&
          setMetaState({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
      )
    return () => {
      alive = false
    }
  }, [enabled, metaState.status])

  const loaded = metaState.status === 'ready' ? metaState.loaded : null

  const bitmap = (lvl: WindLevel, step: number) => {
    const key = `${lvl}:${step}`
    let p = cache.current.get(key)
    if (!p) {
      p = loadBitmap(windFileUrl(loaded!, lvl, step))
      p.catch(() => cache.current.delete(key)) // no cachear errores
      cache.current.set(key, p)
    }
    return p
  }

  // 2) campo del nivel y paso elegidos; luego precarga del resto de pasos de ese nivel
  useEffect(() => {
    if (!enabled || !loaded || stepIndex === null) return
    let alive = true
    const step = loaded.meta.steps[stepIndex]
    bitmap(level, step)
      .then((image) => {
        if (!alive) return
        setField({
          image,
          frame: windFrame(loaded.meta, level, step),
          level,
          bounds: loaded.meta.bounds,
        })
        loaded.meta.steps.forEach((s) => void bitmap(level, s).catch(() => {}))
      })
      .catch(
        (e) =>
          alive &&
          setMetaState({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
      )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bitmap usa la caché (ref)
  }, [enabled, loaded, level, stepIndex])

  // 3) reproducción: avanza un paso cada PLAY_INTERVAL_MS y vuelve al inicio
  const total = loaded?.meta.steps.length ?? 0
  useEffect(() => {
    if (!playing || !total) return
    const t = setInterval(() => setStepIndex((i) => ((i ?? 0) + 1) % total), PLAY_INTERVAL_MS)
    return () => clearInterval(t)
  }, [playing, total])

  if (!enabled) return { status: 'off' as const }
  if (metaState.status === 'error') return { status: 'error' as const, message: metaState.message }
  if (!loaded || stepIndex === null || !field) return { status: 'loading' as const }
  return {
    status: 'ready' as const,
    loaded,
    field,
    level,
    stepIndex,
    playing,
    setLevel: (l: WindLevel) => setLevel(l),
    setStepIndex: (i: number) => {
      setPlaying(false)
      setStepIndex(i)
    },
    togglePlay: () => setPlaying((p) => !p),
  }
}
