/**
 * Presupuesto de llamadas a Open-Meteo (T-62, RNF-6). TS puro.
 *
 * Open-Meteo (plan gratuito, por IP) admite 600 llamadas/min, 5 000/h y 10 000/día, y cuenta **llamadas
 * ponderadas**: una petición vale (variables × modelos / 10) × (días / 14), con mínimo 1 por factor. Es la
 * misma regla con la que el pipeline calibró su ritmo tras el HTTP 429 de la T-47.
 *
 * El navegador de cada usuario consulta con su propia IP; los trabajos programados, con la de GitHub. El
 * presupuesto se fija para ambos por separado.
 */
import { CHECK_EVERY_MS } from './alerts'
import { CACHE_MS } from '../api/openMeteo'

export const DAILY_LIMIT = 10_000
export const HOURLY_LIMIT = 5_000

/** Peso de una petición de Open-Meteo a partir de su URL. */
export function callWeight(url: string): number {
  const p = new URL(url).searchParams
  const vars = (p.get('hourly') ?? '').split(',').filter(Boolean).length || 1
  const models = (p.get('models') ?? '').split(',').filter(Boolean).length || 1
  const days = Number(p.get('forecast_days') ?? 7)
  return Math.max(1, (vars * models) / 10) * Math.max(1, days / 14)
}

/** Peso de cada acción del usuario (las URL reales salen de los mismos constructores que usa la app). */
export interface UserActions {
  /** Abrir el pronóstico de un punto: multimodelo + ensambles. */
  point: number
  /** Búsqueda de lugar (una petición por texto, con espera de 300 ms entre teclas). */
  search: number
  /** Un día entero con alertas activas y la página abierta. */
  alertsDay: number
}

export function userActions(forecastWeight: number, ensembleWeight: number): UserActions {
  // Las alertas revisan cada CHECK_EVERY_MS, pero el pronóstico se cachea CACHE_MS: como mucho una
  // petición por ventana de caché.
  const perDay = (24 * 3_600_000) / Math.max(CHECK_EVERY_MS, CACHE_MS)
  return { point: forecastWeight + ensembleWeight, search: 1, alertsDay: perDay * forecastWeight }
}

/** Verificación diaria del pipeline (`daily.py`, CALL_BUDGET): tope por corrida. */
export const JOBS_DAILY_BUDGET = 4_000
