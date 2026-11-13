/**
 * Pesos del consenso desde la verificación (T-45, RF-7, diseño §5.2). TS puro.
 *
 * - Estación verificada más cercana al punto, a menos de `MAX_STATION_KM`.
 * - Ventana de 30 días con al menos `MIN_VERIFIED_DAYS` días de datos; si no, pesos iguales y se dice por qué.
 * - Por variable: temperatura ← MAE de temperatura; viento, ráfagas y dirección ← MAE de viento.
 *   Nubosidad (no se verifica) y lluvia (solo sí/no en bloques de 6 h) siguen con pesos iguales.
 * - MAE del pronóstico emitido 1 día antes. `w = 1 / (MAE + ε)`; un modelo sin muestra suficiente recibe el
 *   peso medio del resto (`weightsFromMae`).
 */
import { equalWeights, weightsFromMae, type WeightInfo } from './consensus'
import type { PrecisionSummary, StationDetail, StationInfo } from '../precision/data'
import type { VariableId } from './variables'

export const MAX_STATION_KM = 150
export const MIN_VERIFIED_DAYS = 14
export const VERIFIED_WINDOW = '30'
export const VERIFIED_LEAD = 1

/** Variable del consenso → variable verificada que da sus pesos. */
export const WEIGHT_SOURCE: Partial<Record<VariableId, 'temperatura' | 'viento'>> = {
  temperature_2m: 'temperatura',
  wind_speed_10m: 'viento',
  wind_direction_10m: 'viento',
  wind_gusts_10m: 'viento',
}

export type VerifStation = Pick<StationInfo, 'icao' | 'nombre' | 'lat' | 'lon'>
export type VerifSummaryLike = Pick<PrecisionSummary, 'umbrales' | 'ventanas'> & {
  estaciones: VerifStation[]
}

export interface NearStation {
  station: VerifStation
  km: number
}

export interface ConsensusWeights {
  /** Pesos por variable del consenso (las que no aparecen usan `base`). */
  byVariable: Partial<Record<VariableId, WeightInfo>>
  base: WeightInfo
  /** true si al menos una variable usa pesos por precisión. */
  weighted: boolean
  near: NearStation | null
  /** Explicación corta para «¿Por qué este número?». */
  reason: string
}

const R_KM = 6371
const RAD = Math.PI / 180

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD
  const dLon = (lon2 - lon1) * RAD
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * R_KM * Math.asin(Math.sqrt(a))
}

export function nearestStation(
  lat: number,
  lon: number,
  stations: VerifStation[],
  maxKm = MAX_STATION_KM,
): NearStation | null {
  let best: NearStation | null = null
  for (const s of stations) {
    const km = distanceKm(lat, lon, s.lat, s.lon)
    if (km <= maxKm && (!best || km < best.km)) best = { station: s, km }
  }
  return best
}

const kmText = (km: number) => `${Math.round(km)} km`

function equalResult(modelIds: readonly string[], near: NearStation | null, reason: string) {
  return { byVariable: {}, base: equalWeights(modelIds), weighted: false, near, reason }
}

/**
 * Pesos del consenso para un punto. `summary`/`detail` null (sin verificación publicada o error al
 * cargarla) → pesos iguales con el motivo.
 */
export function consensusWeights(
  modelIds: readonly string[],
  point: { lat: number; lon: number },
  summary: VerifSummaryLike | null,
  detail: StationDetail | null,
): ConsensusWeights {
  if (!summary) {
    return equalResult(
      modelIds,
      null,
      'Sin datos de verificación disponibles: todos los modelos pesan igual.',
    )
  }
  const near = nearestStation(point.lat, point.lon, summary.estaciones)
  if (!near) {
    return equalResult(
      modelIds,
      null,
      `No hay estación verificada a menos de ${MAX_STATION_KM} km: todos los modelos pesan igual.`,
    )
  }
  const where = `${near.station.icao} (${near.station.nombre}, a ${kmText(near.km)})`
  const days = summary.ventanas[VERIFIED_WINDOW]?.dias.length ?? 0
  if (days < MIN_VERIFIED_DAYS) {
    return equalResult(
      modelIds,
      near,
      `La estación verificada más cercana es ${where}, pero la verificación lleva ${days} de ` +
        `${MIN_VERIFIED_DAYS} días necesarios: por ahora todos los modelos pesan igual.`,
    )
  }
  const scores = detail?.ventanas[VERIFIED_WINDOW]?.metricas
  if (!scores) {
    return equalResult(
      modelIds,
      near,
      `Sin métricas para ${where} en los últimos ${VERIFIED_WINDOW} días: todos los modelos pesan igual.`,
    )
  }
  const minPairs = summary.umbrales.min_pares_ranking
  const fromVar = new Map<string, WeightInfo>()
  for (const verif of new Set(Object.values(WEIGHT_SOURCE)) as Set<'temperatura' | 'viento'>) {
    const maes = Object.fromEntries(
      modelIds.map((id) => {
        const s = scores[verif][`${id}_d${VERIFIED_LEAD}`]
        return [id, s && s.n >= minPairs && s.mae != null ? s.mae : undefined]
      }),
    )
    const info = weightsFromMae(maes)
    if (!info.equal) fromVar.set(verif, info)
  }
  const byVariable: Partial<Record<VariableId, WeightInfo>> = {}
  for (const [v, verif] of Object.entries(WEIGHT_SOURCE) as [VariableId, string][]) {
    const info = fromVar.get(verif)
    if (info) byVariable[v] = info
  }
  if (!fromVar.size) {
    return equalResult(
      modelIds,
      near,
      `${where} no tiene muestra suficiente: todos los modelos pesan igual.`,
    )
  }
  return {
    byVariable,
    base: equalWeights(modelIds),
    weighted: true,
    near,
    reason:
      `Temperatura y viento ponderados por el error de cada modelo en ${where} durante los últimos ` +
      `${VERIFIED_WINDOW} días (pronóstico a 1 día): quien menos se equivoca allí pesa más. ` +
      'Nubosidad y lluvia: pesos iguales (no se verifican igual).',
  }
}

/** Peso normalizado (0–1) de cada modelo para una variable, para mostrarlo. */
export function normalizedWeights(info: WeightInfo, modelIds: readonly string[]) {
  const total = modelIds.reduce((s, id) => s + (info.weights[id] ?? 0), 0)
  return Object.fromEntries(modelIds.map((id) => [id, total ? (info.weights[id] ?? 0) / total : 0]))
}
