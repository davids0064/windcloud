import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ENSEMBLES, ensembleUrl, fetchEnsemble, fetchEnsembleRun, parseEnsemble } from './ensemble'
import { clearOpenMeteoCache } from './openMeteo'

const time = [1794546000, 1794549600, 1794553200]
/** Forma real de la respuesta (2026-11-13): sufijos `ecmwf_ifs025_ensemble` y `ncep_gefs025`. */
export function rawEnsemble(ecmwfMembers = 51, gefsMembers = 31) {
  const hourly: Record<string, unknown> = { time }
  for (let m = 0; m < ecmwfMembers; m++) {
    const k =
      m === 0
        ? 'precipitation_ecmwf_ifs025_ensemble'
        : `precipitation_member${String(m).padStart(2, '0')}_ecmwf_ifs025_ensemble`
    hourly[k] = time.map(() => m * 0.01)
  }
  for (let m = 0; m < gefsMembers; m++) {
    const k =
      m === 0
        ? 'precipitation_ncep_gefs025'
        : `precipitation_member${String(m).padStart(2, '0')}_ncep_gefs025`
    hourly[k] = time.map(() => 2)
  }
  return { timezone: 'America/Bogota', utc_offset_seconds: -18000, hourly }
}

describe('ensemble', () => {
  it('pide ECMWF ENS y GFS ENS de precipitación en una URL', () => {
    const p = Object.fromEntries(new URL(ensembleUrl(4.60971, -74.08175)).searchParams)
    expect(p).toMatchObject({
      latitude: '4.61',
      longitude: '-74.08',
      hourly: 'precipitation',
      models: 'ecmwf_ifs025,gfs025',
    })
  })

  it('agrupa miembros por sufijo real: 51 ECMWF y 31 GEFS, control primero', () => {
    const e = parseEnsemble(rawEnsemble() as never)
    expect(e.ensembles.map((x) => [x.ensemble.label, x.members.length])).toEqual([
      ['ECMWF ENS', 51],
      ['GFS ENS (GEFS)', 31],
    ])
    expect(e.ensembles[0].members[0][0]).toBe(0) // control
    expect(e.ensembles[0].members[50][0]).toBeCloseTo(0.5) // member50
    expect(e.times[0].toISOString()).toBe('2026-11-13T05:00:00.000Z')
  })

  it('omite un ensamble ausente y propaga errores de la API', () => {
    expect(parseEnsemble(rawEnsemble(51, 0) as never).ensembles).toHaveLength(1)
    expect(() => parseEnsemble({ ...rawEnsemble(), error: true, reason: 'x' } as never)).toThrow(
      'Ensemble: x',
    )
  })

  describe('red', () => {
    const fetchMock = vi.fn()
    beforeEach(() => {
      clearOpenMeteoCache()
      fetchMock.mockReset()
      vi.stubGlobal('fetch', fetchMock)
    })
    afterEach(() => vi.unstubAllGlobals())

    it('cachea la consulta y lee la hora del run en el host de ensambles', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => rawEnsemble() })
      await fetchEnsemble(4.61, -74.08, 0)
      await fetchEnsemble(4.61, -74.08, 1000)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ last_run_initialisation_time: 1794528000 }),
      })
      expect((await fetchEnsembleRun(ENSEMBLES[0]))?.toISOString()).toBe('2026-11-13T00:00:00.000Z')
      expect(fetchMock.mock.calls.at(-1)![0]).toBe(
        'https://ensemble-api.open-meteo.com/data/ecmwf_ifs025_ensemble/static/meta.json',
      )
    })
  })
})
