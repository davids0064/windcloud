/**
 * Rayos GOES-19 GLM (T-55, RF-5): lectura de `rayos.json` (pipeline `lightning.py`, workflow `rayos.yml`).
 * En producción se lee de la rama `rayos` vía raw.githubusercontent.com (se actualiza cada 10 min sin
 * redesplegar el sitio); en desarrollo, del archivo local. TS puro.
 */
import { fetchJson } from '../api/http'
import { DATA_BASE } from '../wind/meta'

export const RAYOS_URL: string =
  import.meta.env.VITE_RAYOS_URL ??
  (import.meta.env.PROD
    ? 'https://raw.githubusercontent.com/davids0064/windcloud/rayos/rayos.json'
    : `${DATA_BASE}/rayos.json`)

export const REFRESH_MS = 5 * 60_000
/** Más viejos que esto no se dibujan: un rayo de hace una hora ya no sirve (P4). */
export const MAX_DATA_AGE_MIN = 45

export interface LightningData {
  schema: 1
  source: string
  generatedAt: string
  /** Fin de la ventana (UTC). */
  hasta: string
  minutos: number
  archivos: number
  fallidos: number
  campos: string[]
  /** [lat, lon, segundos antes de `hasta`, energía fJ] */
  rayos: [number, number, number, number][]
}

export function fetchLightning(url = RAYOS_URL): Promise<LightningData> {
  return fetchJson<LightningData>(url, { retries: 1 }).then((d) => {
    if (d.schema !== 1) throw new Error(`Esquema de rayos no soportado: ${d.schema}`)
    return d
  })
}

/** Minutos desde el fin de la ventana hasta ahora. */
export const dataAgeMin = (d: Pick<LightningData, 'hasta'>, now: Date) =>
  Math.max(0, Math.round((now.getTime() - Date.parse(d.hasta)) / 60_000))

export const AGE_BINS: { maxMin: number; color: string; label: string }[] = [
  { maxMin: 5, color: '#ffffff', label: '< 5 min' },
  { maxMin: 10, color: '#ffe066', label: '5–10 min' },
  { maxMin: Infinity, color: '#ff9f43', label: '> 10 min' },
]

export function ageColor(minutes: number): string {
  return (AGE_BINS.find((b) => minutes < b.maxMin) ?? AGE_BINS[AGE_BINS.length - 1]).color
}

/** Puntos para el mapa, coloreados por antigüedad respecto de `now`; null si los datos están muy viejos. */
export function lightningGeoJSON(d: LightningData, now: Date) {
  const lag = dataAgeMin(d, now)
  if (lag > MAX_DATA_AGE_MIN) return null
  return {
    type: 'FeatureCollection' as const,
    features: d.rayos.map(([lat, lon, age]) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [lon, lat] },
      properties: { color: ageColor(age / 60 + lag) },
    })),
  }
}

const hm = new Intl.DateTimeFormat('es-CO', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Bogota',
})
export const localHM = (iso: string) => hm.format(new Date(iso))
