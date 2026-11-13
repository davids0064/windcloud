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

/** Modelos con rejillas publicadas por el pipeline (T-31). */
export type GridModel = 'gfs' | 'ecmwf'

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
  | { model: GridModel; status: 'loading' }
  | { model: GridModel; status: 'error'; message: string }
  | { model: GridModel; status: 'ready'; loaded: LoadedMeta }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Rejilla de pronóstico del run más reciente del modelo elegido: línea de tiempo común a todas las capas
 * (viento, capa de color, isobaras) y campo de viento del nivel elegido (T-31, T-34, T-35, T-36). Meta e
 * imágenes se guardan por modelo; se precargan los 25 pasos del nivel para que mover el tiempo sea inmediato.
 * `windOn` = falso: no se descargan imágenes de viento (solo la línea de tiempo para otras capas).
 */
export function useForecastGrid(enabled: boolean, windOn = true, model: GridModel = 'gfs') {
  const [metaState, setMetaState] = useState<MetaState>({ model, status: 'loading' })
  const [level, setLevel] = useState<WindLevel>('10m')
  const [stepIndex, setStepIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [field, setField] = useState<{ model: GridModel; field: WindField } | null>(null)
  const metas = useRef(new Map<GridModel, LoadedMeta>())
  const bitmaps = useRef(new Map<string, Promise<ImageBitmap>>())

  // 1) meta del modelo (una vez por modelo) y paso inicial = hora más cercana a ahora
  useEffect(() => {
    if (!enabled) return
    const known = metas.current.get(model)
    if (known) {
      setMetaState({ model, status: 'ready', loaded: known })
      setStepIndex(nearestStepIndex(known.meta, new Date()))
      return
    }
    let alive = true
    fetchGridMeta(model)
      .then((loaded) => {
        metas.current.set(model, loaded)
        if (!alive) return
        setMetaState({ model, status: 'ready', loaded })
        setStepIndex(nearestStepIndex(loaded.meta, new Date()))
      })
      .catch((e) => alive && setMetaState({ model, status: 'error', message: errorText(e) }))
    return () => {
      alive = false
    }
  }, [enabled, model])

  const current = metaState.model === model ? metaState : null
  const loaded = current?.status === 'ready' ? current.loaded : null

  const bitmap = (lvl: WindLevel, step: number) => {
    const key = `${model}:${lvl}:${step}`
    let p = bitmaps.current.get(key)
    if (!p) {
      p = loadBitmap(windFileUrl(loaded!, lvl, step))
      p.catch(() => bitmaps.current.delete(key)) // no cachear errores
      bitmaps.current.set(key, p)
    }
    return p
  }

  // 2) campo del nivel y paso elegidos; luego precarga del resto de pasos de ese nivel
  useEffect(() => {
    if (!enabled || !windOn || !loaded || stepIndex === null) return
    if (stepIndex >= loaded.meta.steps.length) return
    let alive = true
    const step = loaded.meta.steps[stepIndex]
    bitmap(level, step)
      .then((image) => {
        if (!alive) return
        setField({
          model,
          field: {
            image,
            frame: windFrame(loaded.meta, level, step),
            level,
            bounds: loaded.meta.bounds,
          },
        })
        loaded.meta.steps.forEach((s) => void bitmap(level, s).catch(() => {}))
      })
      .catch((e) => alive && setMetaState({ model, status: 'error', message: errorText(e) }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bitmap usa la caché (ref)
  }, [enabled, windOn, loaded, level, stepIndex, model])

  // 3) reproducción: avanza un paso cada PLAY_INTERVAL_MS y vuelve al inicio
  const total = loaded?.meta.steps.length ?? 0
  useEffect(() => {
    if (!playing || !total) return
    const t = setInterval(() => setStepIndex((i) => ((i ?? 0) + 1) % total), PLAY_INTERVAL_MS)
    return () => clearInterval(t)
  }, [playing, total])

  const currentField = field?.model === model ? field.field : null
  if (!enabled) return { status: 'off' as const }
  if (current?.status === 'error') return { status: 'error' as const, message: current.message }
  if (
    !loaded ||
    stepIndex === null ||
    stepIndex >= loaded.meta.steps.length ||
    (windOn && !currentField)
  ) {
    return { status: 'loading' as const }
  }
  return {
    status: 'ready' as const,
    model,
    loaded,
    /** null si el viento está apagado. */
    field: windOn ? currentField : null,
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
