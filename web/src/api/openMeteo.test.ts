import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MODELS } from '../core/models'
import {
  clearOpenMeteoCache,
  fetchModelRun,
  fetchMultiModel,
  forecastUrl,
  identicalSeries,
  parseMultiModel,
  roundCoord,
} from './openMeteo'

const T0 = 1794528000 // 2026-11-13T00:00Z
const hours = 30
const time = Array.from({ length: hours }, (_, i) => T0 + i * 3600)
const ramp = (base: number) => time.map((_, i) => base + i * 0.1)

/** Respuesta con la forma real de Open-Meteo multi-modelo (sufijo _<modelo>). */
function raw(overrides: Record<string, (number | null)[]> = {}) {
  const hourly: Record<string, (number | null)[]> = { time }
  for (const [i, m] of MODELS.entries()) {
    hourly[`temperature_2m_${m.apiId}`] = ramp(14 + i)
    hourly[`precipitation_${m.apiId}`] = time.map(() => 0)
  }
  return {
    latitude: 4.5,
    longitude: -74,
    elevation: 2586,
    timezone: 'America/Bogota',
    utc_offset_seconds: -18000,
    hourly: { ...hourly, ...overrides } as Record<string, (number | null)[]> & { time: number[] },
  }
}

describe('openMeteo', () => {
  it('pide todos los modelos y variables en una sola URL, con coordenadas redondeadas', () => {
    const url = new URL(forecastUrl(4.60971, -74.08175))
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    const p = Object.fromEntries(url.searchParams)
    expect(p.latitude).toBe('4.61')
    expect(p.longitude).toBe('-74.08')
    expect(p.models.split(',')).toEqual(MODELS.map((m) => m.apiId))
    expect(p.hourly).toContain('wind_direction_10m')
    expect(p).toMatchObject({ forecast_days: '7', timeformat: 'unixtime', wind_speed_unit: 'kmh' })
    expect(p.models).not.toContain('metno') // duplicaría a ECMWF fuera de Escandinavia
    expect(roundCoord(-74.08175)).toBe(-74.08)
  })

  it('parsea series por modelo y horas en UTC', () => {
    const f = parseMultiModel(raw())
    expect(f.times[0].toISOString()).toBe('2026-11-13T00:00:00.000Z')
    expect(f.models).toHaveLength(MODELS.length)
    expect(f.models[0].values.temperature_2m[1]).toBeCloseTo(14.1)
    expect(f.models[0].values.wind_gusts_10m.every((v) => v === null)).toBe(true) // variable ausente → null
    expect(f).toMatchObject({ timezone: 'America/Bogota', point: { elevation: 2586 } })
  })

  it('excluye modelos sin cobertura y modelos idénticos a otro', () => {
    const f = parseMultiModel(
      raw({
        [`temperature_2m_${MODELS[5].apiId}`]: time.map(() => null),
        [`temperature_2m_${MODELS[7].apiId}`]: ramp(14), // copia exacta de ECMWF IFS
      }),
    )
    expect(f.models.map((m) => m.model.apiId)).not.toContain(MODELS[5].apiId)
    expect(f.excluded).toEqual([
      { model: MODELS[5], reason: 'sin-cobertura' },
      { model: MODELS[7], reason: 'duplicado', of: 'ECMWF IFS' },
    ])
  })

  it('identicalSeries exige ≥ 24 horas comparables y tolera nulls', () => {
    expect(identicalSeries(ramp(1), ramp(1))).toBe(true)
    expect(identicalSeries(ramp(1), ramp(1.05))).toBe(false)
    expect(identicalSeries([1, 2, 3], [1, 2, 3])).toBe(false)
    const withGaps = ramp(1).map((v, i) => (i % 10 === 0 ? null : v))
    expect(identicalSeries(ramp(1), withGaps)).toBe(true)
  })

  it('propaga el error de la API', () => {
    expect(() => parseMultiModel({ ...raw(), error: true, reason: 'Parámetro inválido' })).toThrow(
      'Open-Meteo: Parámetro inválido',
    )
  })

  describe('red y caché (RNF-5)', () => {
    const fetchMock = vi.fn()
    beforeEach(() => {
      clearOpenMeteoCache()
      fetchMock.mockReset()
      vi.stubGlobal('fetch', fetchMock)
    })
    afterEach(() => vi.unstubAllGlobals())

    it('cachea 30 min por punto redondeado y vuelve a pedir después', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => raw() })
      await fetchMultiModel(4.6097, -74.0817, { now: 0 })
      await fetchMultiModel(4.6102, -74.0821, { now: 29 * 60_000 }) // mismo punto redondeado
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await fetchMultiModel(4.61, -74.08, { now: 31 * 60_000 })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('no cachea errores', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 })
      await expect(fetchMultiModel(1, 1, { now: 0, retries: 0 })).rejects.toThrow('HTTP 503')
      fetchMock.mockResolvedValue({ ok: true, json: async () => raw() })
      await expect(fetchMultiModel(1, 1, { now: 1 })).resolves.toBeTruthy()
    })

    it('hora del run desde meta.json; si falla devuelve null (nunca inventa)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ last_run_initialisation_time: 1794549600 }),
      })
      const run = await fetchModelRun(MODELS[0], { now: 0 })
      expect(run?.toISOString()).toBe('2026-11-13T06:00:00.000Z')
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.open-meteo.com/data/ecmwf_ifs/static/meta.json',
      )
      fetchMock.mockResolvedValue({ ok: false, status: 404 })
      expect(await fetchModelRun(MODELS[2], { now: 0 })).toBeNull()
    })
  })
})
