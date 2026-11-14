/**
 * Redes oficiales de ciudad (T-49, RF-14, diseño §6.1). Solo enlaces: WindCloud no extrae sus datos (T-46).
 * El estado de cada red se comprueba a mano y se registra en `specs/04-fuentes-de-datos.md`.
 */
import data from './cityNetworks.json'

export type NetworkStatus = 'verificada' | 'no_verificada' | 'caida'

/** [oeste, sur, este, norte] en grados. */
export type BBox = [number, number, number, number]

export interface CityNetwork {
  ciudad: string
  bbox: BBox
  red: string
  operador: string
  url: string
  estado: NetworkStatus
  nota?: string
}

/** Ciudad sin red local: depende de IDEAM y METAR. */
export interface CityWithoutNetwork {
  ciudad: string
  red: null
}

export type CityEntry = CityNetwork | CityWithoutNetwork

export const CITY_NETWORKS_CHECKED: string = data.comprobado
export const CITIES = data.ciudades as CityEntry[]

export const hasNetwork = (c: CityEntry): c is CityNetwork => c.red !== null

const inside = ([w, s, e, n]: BBox, lat: number, lon: number) =>
  lat >= s && lat <= n && lon >= w && lon <= e

/**
 * Red verificada que cubre el punto, o null. RF-14: una red no verificada o caída nunca se enlaza.
 */
export function officialNetworkAt(
  lat: number,
  lon: number,
  cities: readonly CityEntry[] = CITIES,
): CityNetwork | null {
  for (const c of cities) {
    if (hasNetwork(c) && c.estado === 'verificada' && inside(c.bbox, lat, lon)) return c
  }
  return null
}

export const STATUS_LABEL: Record<NetworkStatus, string> = {
  verificada: 'verificada',
  no_verificada: 'no verificada',
  caida: 'fuera de servicio',
}

/** Ciudades agrupadas para el listado de Precisión. */
export function citiesByStatus(cities: readonly CityEntry[] = CITIES) {
  const withNetwork = cities.filter(hasNetwork)
  return {
    verified: withNetwork.filter((c) => c.estado === 'verificada'),
    unverified: withNetwork.filter((c) => c.estado !== 'verificada'),
    without: cities.filter((c): c is CityWithoutNetwork => !hasNetwork(c)),
  }
}
