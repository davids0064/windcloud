/** Respuestas simuladas para las pruebas de punta a punta (mismos datos de ejemplo que las unitarias). */
import type { Page } from '@playwright/test'
import { MODELS } from '../src/core/models'
import { FIRES } from '../src/fires/fixture'
import { RAYOS } from '../src/lightning/fixture'
import { SUMMARY } from '../src/precision/fixture'

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

function forecast() {
  const t0 = Math.floor(Date.now() / 3_600_000) * 3600 - 2 * 3600
  const time = Array.from({ length: 7 * 24 }, (_, i) => t0 + i * 3600)
  const hourly: Record<string, unknown> = { time }
  MODELS.forEach((m, i) => {
    hourly[`temperature_2m_${m.apiId}`] = time.map(() => 14 + i * 0.2)
    hourly[`wind_speed_10m_${m.apiId}`] = time.map(() => 12)
    hourly[`wind_direction_10m_${m.apiId}`] = time.map(() => 45)
    hourly[`wind_gusts_10m_${m.apiId}`] = time.map(() => 25 + i)
    hourly[`cloud_cover_${m.apiId}`] = time.map(() => 60)
    hourly[`precipitation_${m.apiId}`] = time.map((_, k) => (k % 24 === 15 ? 2 : 0))
  })
  return {
    latitude: 4.61,
    longitude: -74.08,
    elevation: 2560,
    timezone: 'America/Bogota',
    utc_offset_seconds: -18000,
    hourly,
  }
}

function ensemble() {
  const t0 = Math.floor(Date.now() / 3_600_000) * 3600 - 2 * 3600
  const time = Array.from({ length: 7 * 24 }, (_, i) => t0 + i * 3600)
  const hourly: Record<string, unknown> = { time }
  const add = (n: number, id: string) => {
    for (let m = 0; m < n; m++) {
      const key =
        m === 0 ? `precipitation_${id}` : `precipitation_member${String(m).padStart(2, '0')}_${id}`
      hourly[key] = time.map(() => (m < n / 2 ? 0.5 : 0))
    }
  }
  add(51, 'ecmwf_ifs025_ensemble')
  add(31, 'ncep_gefs025')
  return { timezone: 'America/Bogota', utc_offset_seconds: -18000, hourly }
}

/** Simula Open-Meteo, el buscador, /data y los rayos. Devuelve los errores de página para comprobarlos. */
export async function mockApis(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('https://api.open-meteo.com/v1/forecast**', (r) => r.fulfill(json(forecast())))
  await page.route('https://ensemble-api.open-meteo.com/**', (r) => r.fulfill(json(ensemble())))
  await page.route('https://api.open-meteo.com/data/**', (r) =>
    r.fulfill(json({ last_run_initialisation_time: Math.floor(Date.now() / 21_600_000) * 21_600 })),
  )
  await page.route('https://geocoding-api.open-meteo.com/**', (r) =>
    r.fulfill(
      json({
        results: [
          {
            id: 3688689,
            name: 'Bogotá',
            latitude: 4.60971,
            longitude: -74.08175,
            feature_code: 'PPLC',
            country: 'Colombia',
            country_code: 'CO',
            admin1: 'Bogotá D.C.',
          },
        ],
      }),
    ),
  )
  await page.route('**/data/precision.json', (r) => r.fulfill(json(SUMMARY)))
  await page.route('**/data/fires.json', (r) => r.fulfill(json(FIRES)))
  await page.route('**/rayos/rayos.json', (r) =>
    r.fulfill(json({ ...RAYOS, hasta: new Date().toISOString() })),
  )
  return errors
}
