/**
 * Búsqueda de lugares con Open-Meteo Geocoding API (gratis, sin clave; datos GeoNames, CC BY 4.0).
 * Ver specs/04-fuentes-de-datos.md. Solo se envía el texto buscado (RNF-8).
 */
import { fetchJson } from './http'

export const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
export const GEOCODING_SOURCE = 'Open-Meteo Geocoding (GeoNames)'

export type PlaceKind = 'pais' | 'region' | 'ciudad' | 'lugar'

export interface Place {
  id: number
  name: string
  lat: number
  lon: number
  kind: PlaceKind
  /** "Antioquia, Colombia" — vacío para países. */
  context: string
  countryCode: string
  population?: number
}

interface RawResult {
  id: number
  name: string
  latitude: number
  longitude: number
  feature_code?: string
  country_code?: string
  country?: string
  admin1?: string
  population?: number
}

/** Tipo de lugar según el código de GeoNames (PCLI = país, ADM1 = departamento, PPL* = poblado). */
export function placeKind(featureCode = ''): PlaceKind {
  if (featureCode.startsWith('PCL')) return 'pais'
  if (featureCode.startsWith('ADM')) return 'region'
  if (featureCode.startsWith('PPL')) return 'ciudad'
  return 'lugar'
}

/** Zoom al que volar según el tipo de lugar. */
export function zoomForKind(kind: PlaceKind): number {
  return { pais: 5, region: 7, ciudad: 10, lugar: 9 }[kind]
}

export function parsePlaces(json: { results?: RawResult[] }): Place[] {
  return (json.results ?? []).map((r) => {
    const kind = placeKind(r.feature_code)
    const context = kind === 'pais' ? '' : [r.admin1, r.country].filter(Boolean).join(', ')
    return {
      id: r.id,
      name: r.name,
      lat: r.latitude,
      lon: r.longitude,
      kind,
      context,
      countryCode: (r.country_code ?? '').toUpperCase(),
      population: r.population,
    }
  })
}

/** Bandera emoji a partir del código ISO-3166 alfa-2 ("CO" → 🇨🇴). */
export function flagEmoji(countryCode: string): string {
  if (!/^[A-Z]{2}$/.test(countryCode)) return ''
  return String.fromCodePoint(...[...countryCode].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

const cache = new Map<string, Place[]>()

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const key = q.toLocaleLowerCase('es-CO')
  const hit = cache.get(key)
  if (hit) return hit
  const url = `${GEOCODING_URL}?${new URLSearchParams({ name: q, count: '8', language: 'es', format: 'json' })}`
  const places = parsePlaces(await fetchJson<{ results?: RawResult[] }>(url, { signal }))
  cache.set(key, places)
  return places
}

/** Solo para pruebas. */
export function clearGeocodingCache(): void {
  cache.clear()
}
