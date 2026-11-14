/**
 * Focos de calor NASA FIRMS (T-52, RF-11): lectura de `fires.json` (pipeline `fires.py`) y viento sobre un foco
 * para decir **hacia dónde lo empujaría**. TS puro.
 */
import { fetchJson } from '../api/http'
import type { Series } from '../api/openMeteo'
import { cardinal } from '../point/summary'
import { DATA_BASE } from '../wind/meta'

export interface Fire {
  lat: number
  lon: number
  /** Hora de la pasada del satélite (UTC). */
  hora: string
  sensor: string
  confianza: 'baja' | 'nominal' | 'alta'
  /** Potencia radiativa del fuego (MW). */
  frp: number | null
  dia: boolean
  departamento?: string
}

export interface FiresData {
  schema: 1
  source: string
  generatedAt: string
  ventana_h: number
  sensores: string[]
  fallidos: Record<string, string>
  focos: Fire[]
}

let cache: Promise<FiresData> | null = null

export function fetchFires(base = DATA_BASE): Promise<FiresData> {
  if (!cache) {
    cache = fetchJson<FiresData>(`${base}/fires.json`, { retries: 1 }).then((d) => {
      if (d.schema !== 1) throw new Error(`Esquema de focos no soportado: ${d.schema}`)
      return d
    })
    cache.catch(() => (cache = null))
  }
  return cache
}

/** Solo para pruebas. */
export const clearFiresCache = () => (cache = null)

export const FIRE_COLORS: Record<Fire['confianza'], string> = {
  baja: '#f2c94c',
  nominal: '#ff7a1a',
  alta: '#ff2d2d',
}

export function firesGeoJSON(data: FiresData, selected: number | null) {
  return {
    type: 'FeatureCollection' as const,
    features: data.focos.map((f, i) => ({
      type: 'Feature' as const,
      id: i,
      geometry: { type: 'Point' as const, coordinates: [f.lon, f.lat] },
      properties: { i, color: FIRE_COLORS[f.confianza], selected: i === selected },
    })),
  }
}

/** Dirección hacia la que sopla el viento (la meteorológica dice de dónde viene). */
export const towardDeg = (fromDeg: number) => (fromDeg + 180) % 360

const R_KM = 6371
/** Punto a `km` del origen en el rumbo `deg` (0 = norte, 90 = este). */
export function destination(lat: number, lon: number, deg: number, km: number): [number, number] {
  const d = km / R_KM
  const b = (deg * Math.PI) / 180
  const p1 = (lat * Math.PI) / 180
  const l1 = (lon * Math.PI) / 180
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b))
  const l2 =
    l1 +
    Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2))
  return [(l2 * 180) / Math.PI, (p2 * 180) / Math.PI]
}

export const ARROW_KM = 25

/**
 * Flecha desde el foco hacia `toward` (largo fijo: indica dirección, no distancia ni velocidad del fuego).
 * Punta con dos trazos a ±150° del rumbo.
 */
export function arrowGeoJSON(fire: Pick<Fire, 'lat' | 'lon'>, toward: number, km = ARROW_KM) {
  const tip = destination(fire.lat, fire.lon, toward, km)
  const head = (side: number) =>
    destination(tip[1], tip[0], (toward + 180 + side + 360) % 360, km / 4)
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: {
          type: 'MultiLineString' as const,
          coordinates: [
            [[fire.lon, fire.lat], tip],
            [head(-30), tip, head(30)],
          ],
        },
        properties: {},
      },
    ],
  }
}

export interface WindRow {
  label: string
  time: Date
  speed: number | null
  gust: number | null
  /** De dónde viene (meteorológico). */
  from: number | null
  /** Hacia dónde empujaría el fuego. */
  toward: number | null
  towardName: string
}

export const OUTLOOK_HOURS = [0, 6, 12, 24]

/** Viento del consenso ahora y en +6, +12 y +24 h (hora más cercana de la serie). */
export function windOutlook(
  times: readonly Date[],
  consensus: { wind_speed_10m: Series; wind_direction_10m: Series; wind_gusts_10m: Series },
  now: Date,
): WindRow[] {
  return OUTLOOK_HOURS.map((h) => {
    const target = now.getTime() + h * 3_600_000
    let i = 0
    for (let k = 1; k < times.length; k++) {
      if (Math.abs(times[k].getTime() - target) < Math.abs(times[i].getTime() - target)) i = k
    }
    const from = consensus.wind_direction_10m[i] ?? null
    const toward = from === null ? null : towardDeg(from)
    return {
      label: h === 0 ? 'Ahora' : `En ${h} h`,
      time: times[i],
      speed: consensus.wind_speed_10m[i] ?? null,
      gust: consensus.wind_gusts_10m[i] ?? null,
      from,
      toward,
      towardName: toward === null ? 'variable' : cardinalName(toward),
    }
  })
}

const NAMES: Record<string, string> = {
  N: 'el norte',
  NE: 'el nordeste',
  E: 'el este',
  SE: 'el sudeste',
  S: 'el sur',
  SO: 'el sudoeste',
  O: 'el oeste',
  NO: 'el noroeste',
}
export const cardinalName = (deg: number) => NAMES[cardinal(deg)] ?? cardinal(deg)

const localFmt = new Intl.DateTimeFormat('es-CO', {
  weekday: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Bogota',
})
export const localTime = (d: Date | string) =>
  localFmt.format(typeof d === 'string' ? new Date(d) : d)

/** «hace 5 h» desde la pasada del satélite. */
export function ago(iso: string, now: Date): string {
  const h = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 3_600_000))
  return h < 1 ? 'hace menos de 1 h' : `hace ${h} h`
}
