/**
 * Pronóstico multi-modelo por punto: Open-Meteo Forecast API (gratis, sin clave, CORS `*`). → T-20, RF-6
 *
 * Una sola petición con todos los modelos (`models=`); la respuesta trae cada variable con sufijo `_<modelo>`.
 * Las horas del run (P2) salen de `/data/{modelo}/static/meta.json`. Caché en memoria de 30 min (RNF-5).
 * Licencia: datos CC BY 4.0; la API gratuita es solo para uso NO comercial (constitución P1).
 */
import { MODELS, type ModelInfo } from '../core/models'
import { VARIABLES, type VariableId } from '../core/variables'
import { fetchJson, type FetchOptions } from './http'

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
export const META_URL = 'https://api.open-meteo.com/data'
export const OPEN_METEO_SOURCE = 'Open-Meteo (datos CC BY 4.0)'
export const CACHE_MS = 30 * 60_000
export const FORECAST_DAYS = 7

export type Series = (number | null)[]

export interface ModelSeries {
  model: ModelInfo
  values: Record<VariableId, Series>
}

export interface MultiModelForecast {
  /** Instantes UTC de cada hora. */
  times: Date[]
  models: ModelSeries[]
  /** Modelos pedidos sin ningún dato aquí, o descartados por repetir a otro. */
  excluded: { model: ModelInfo; reason: 'sin-cobertura' | 'duplicado'; of?: string }[]
  point: { lat: number; lon: number; elevation: number }
  timezone: string
  utcOffsetSeconds: number
  fetchedAt: Date
}

/** Coordenadas redondeadas a 0,01° (~1 km): suficiente para la rejilla de los modelos y mejor para la caché. */
export const roundCoord = (x: number) => Math.round(x * 100) / 100

export function forecastUrl(
  lat: number,
  lon: number,
  models: readonly ModelInfo[] = MODELS,
): string {
  const params = new URLSearchParams({
    latitude: String(roundCoord(lat)),
    longitude: String(roundCoord(lon)),
    hourly: VARIABLES.join(','),
    models: models.map((m) => m.apiId).join(','),
    forecast_days: String(FORECAST_DAYS),
    timezone: 'auto',
    timeformat: 'unixtime',
    wind_speed_unit: 'kmh',
  })
  return `${FORECAST_URL}?${params}`
}

interface RawForecast {
  latitude: number
  longitude: number
  elevation: number
  timezone: string
  utc_offset_seconds: number
  hourly: Record<string, (number | null)[]> & { time: number[] }
  error?: boolean
  reason?: string
}

const hasData = (s: Series | undefined) => !!s && s.some((v) => v !== null)

/** ¿Dos series son idénticas en todas las horas donde ambas tienen dato? (al menos 24 horas comparables) */
export function identicalSeries(a: Series, b: Series): boolean {
  let compared = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === null || b[i] === null) continue
    if (a[i] !== b[i]) return false
    compared++
  }
  return compared >= 24
}

export function parseMultiModel(
  raw: RawForecast,
  models: readonly ModelInfo[] = MODELS,
  fetchedAt = new Date(),
): MultiModelForecast {
  if (raw.error) throw new Error(`Open-Meteo: ${raw.reason ?? 'error desconocido'}`)
  const times = raw.hourly.time.map((s) => new Date(s * 1000))
  const out: ModelSeries[] = []
  const excluded: MultiModelForecast['excluded'] = []

  for (const model of models) {
    const values = Object.fromEntries(
      VARIABLES.map((v) => [v, raw.hourly[`${v}_${model.apiId}`] ?? times.map(() => null)]),
    ) as Record<VariableId, Series>
    if (!hasData(values.temperature_2m)) {
      excluded.push({ model, reason: 'sin-cobertura' })
      continue
    }
    // Salvaguarda: un modelo que repite exactamente a otro (temperatura) no aporta opinión independiente.
    const twin = out.find((o) => identicalSeries(o.values.temperature_2m, values.temperature_2m))
    if (twin) {
      excluded.push({ model, reason: 'duplicado', of: twin.model.label })
      continue
    }
    out.push({ model, values })
  }

  return {
    times,
    models: out,
    excluded,
    point: { lat: raw.latitude, lon: raw.longitude, elevation: raw.elevation },
    timezone: raw.timezone,
    utcOffsetSeconds: raw.utc_offset_seconds,
    fetchedAt,
  }
}

interface CacheEntry<T> {
  at: number
  value: Promise<T>
}
const forecastCache = new Map<string, CacheEntry<MultiModelForecast>>()
const runCache = new Map<string, CacheEntry<Date | null>>()

function cached<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  load: () => Promise<T>,
  now: number,
) {
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_MS) return hit.value
  const value = load()
  cache.set(key, { at: now, value })
  value.catch(() => cache.delete(key)) // no cachear errores
  return value
}

/** Opciones de las consultas cacheadas: sin `signal` a propósito. */
type CachedFetchOptions = Omit<FetchOptions, 'signal'> & { now?: number }

/**
 * Pronóstico de todos los modelos para un punto (caché 30 min por punto redondeado).
 *
 * No acepta `AbortSignal`: la promesa se comparte en caché entre componentes, y si la cancelara quien la pidió
 * primero, la caché entregaría a los demás una petición abortada (pasaba con StrictMode, que monta dos veces).
 * Quien ya no necesite el resultado simplemente lo ignora.
 */
export function fetchMultiModel(
  lat: number,
  lon: number,
  options: CachedFetchOptions = {},
): Promise<MultiModelForecast> {
  const now = options.now ?? Date.now()
  const key = `${roundCoord(lat)},${roundCoord(lon)}`
  return cached(
    forecastCache,
    key,
    async () =>
      parseMultiModel(
        await fetchJson<RawForecast>(forecastUrl(lat, lon), options),
        MODELS,
        new Date(now),
      ),
    now,
  )
}

/** Hora de inicio del último run de un modelo (P2), o null si no se pudo saber. */
export function fetchModelRun(model: ModelInfo, options: CachedFetchOptions = {}) {
  const now = options.now ?? Date.now()
  return cached(
    runCache,
    model.metaId,
    async () => {
      try {
        const meta = await fetchJson<{ last_run_initialisation_time?: number }>(
          `${META_URL}/${model.metaId}/static/meta.json`,
          { ...options, retries: 0 },
        )
        return meta.last_run_initialisation_time
          ? new Date(meta.last_run_initialisation_time * 1000)
          : null
      } catch {
        return null // sin hora de run se muestra "run desconocido", nunca se inventa
      }
    },
    now,
  )
}

/** Solo para pruebas. */
export function clearOpenMeteoCache(): void {
  forecastCache.clear()
  runCache.clear()
}
