import { describe, expect, it } from 'vitest'
import { ensembleUrl } from '../api/ensemble'
import { forecastUrl } from '../api/openMeteo'
import { DAILY_LIMIT, HOURLY_LIMIT, JOBS_DAILY_BUDGET, callWeight, userActions } from './apiBudget'

describe('presupuesto de llamadas a Open-Meteo (RNF-6)', () => {
  const forecast = callWeight(forecastUrl(4.61, -74.08))
  const ensemble = callWeight(ensembleUrl(4.61, -74.08))

  it('peso de las peticiones reales de la app', () => {
    expect(forecast).toBeCloseTo(4.8) // 6 variables × 8 modelos / 10, 7 días
    expect(ensemble).toBe(1) // 1 variable × 2 ensambles
    expect(callWeight('https://x/?hourly=a,b&models=m&forecast_days=28')).toBe(2) // 4 semanas = ×2
  })

  it('un usuario intenso cabe holgado en su límite diario por IP', () => {
    const a = userActions(forecast, ensemble)
    expect(a.point).toBeCloseTo(5.8)
    expect(a.alertsDay).toBeCloseTo(48 * 4.8) // 1 petición cada 30 min (caché), ~230/día
    // 300 puntos abiertos + 200 búsquedas + alertas todo el día
    const heavy = 300 * a.point + 200 * a.search + a.alertsDay
    expect(heavy).toBeLessThan(DAILY_LIMIT / 4)
    // y en una hora: 100 puntos seguidos
    expect(100 * a.point).toBeLessThan(HOURLY_LIMIT / 5)
  })

  it('los trabajos programados no pasan de 4 000 por corrida diaria', () => {
    expect(JOBS_DAILY_BUDGET).toBeLessThanOrEqual(DAILY_LIMIT / 2)
  })
})
