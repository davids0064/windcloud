import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearRiskCache,
  describeCell,
  fetchRisk,
  ffwiLevel,
  levelsFor,
  nearestStep,
  riskGeoJSON,
  summarize,
} from './data'
import { RISK } from './fixture'

describe('niveles de riesgo', () => {
  it('clases de Fosberg por umbral; sin dato = −1', () => {
    const c = RISK.umbrales.ffwi_clases
    expect([0, 24, 25, 50, 75, 100].map((v) => ffwiLevel(v, c))).toEqual([0, 0, 1, 2, 3, 3])
    expect(ffwiLevel(null, c)).toBe(-1)
  })

  it('una hora o el peor de 72 h', () => {
    expect(levelsFor(RISK, 'incendio', 0)).toEqual([1, 0, -1])
    expect(levelsFor(RISK, 'incendio', 'max')).toEqual([2, 0, -1])
    expect(levelsFor(RISK, 'viento', 0)).toEqual([0, 0, 0])
    expect(levelsFor(RISK, 'viento', 'max')).toEqual([1, 0, 0])
    expect(levelsFor(RISK, 'lluvia', 'max')).toEqual([0, 1, 0])
    expect(levelsFor(RISK, 'calor', 1)).toEqual([0, 0, 1])
  })

  it('solo dibuja celdas con nivel ≥ 1, como cuadrados de la rejilla', () => {
    const fc = riskGeoJSON(RISK, 'incendio', levelsFor(RISK, 'incendio', 'max'))
    expect(fc.features).toHaveLength(1)
    const f = fc.features[0]
    expect(f.properties).toEqual({ i: 0, color: '#f2994a' })
    expect(f.geometry.coordinates[0][0]).toEqual([-72.625, 11.375])
    expect(f.geometry.coordinates[0][2]).toEqual([-72.375, 11.625])
  })

  it('resume celdas por nivel y departamentos', () => {
    const s = summarize(RISK, [2, 1, 0])
    expect(s.cells).toBe(2)
    expect(s.byLevel[1]).toBe(1)
    expect(s.byLevel[2]).toBe(1)
    expect(s.departments.map((d) => d.name)).toEqual(['Cundinamarca', 'La Guajira'])
  })

  it('describe una celda en una hora y en el peor caso', () => {
    expect(describeCell(RISK, 0, 1)).toBe(
      'La Guajira · Fosberg 55 (alto) · 33 °C · HR 30 % · ráfaga 65 km/h · lluvia 0 mm/3 h',
    )
    expect(describeCell(RISK, 0, 0)).not.toMatch(/lluvia/) // paso 0: sin acumulado
    expect(describeCell(RISK, 1, 'max')).toBe(
      'Cundinamarca · máx. 72 h · Fosberg 2 (bajo) · ráfaga 12 km/h · lluvia 25,4 mm/3 h · 15 °C',
    )
    expect(describeCell(RISK, 2, 'max')).not.toMatch(/Fosberg/)
  })

  it('paso más cercano a ahora', () => {
    expect(nearestStep(RISK, new Date('2026-11-14T14:00:00Z'))).toBe(1)
    expect(nearestStep(RISK, new Date('2026-11-01T00:00:00Z'))).toBe(0)
  })
})

describe('fetchRisk', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearRiskCache()
  })

  const respond = (meta: object) =>
    vi.fn(async (url: string) => {
      if (url.endsWith('latest.json'))
        return { ok: true, json: async () => ({ run: RISK.run, meta: '2026111412/meta.json' }) }
      if (url.endsWith('meta.json')) return { ok: true, json: async () => ({ schema: 1, ...meta }) }
      if (url.endsWith('/gfs/2026111412/risk.json')) return { ok: true, json: async () => RISK }
      return { ok: false, status: 404 }
    })

  it('lee risk.json del último run de GFS', async () => {
    vi.stubGlobal('fetch', respond({ risk: { file: 'risk.json', label: 'x' } }))
    await expect(fetchRisk('/data')).resolves.toMatchObject({ run: RISK.run })
  })

  it('si el run no trae riesgo lo dice (y no cachea el error)', async () => {
    const f = respond({ risk: null })
    vi.stubGlobal('fetch', f)
    await expect(fetchRisk('/data')).rejects.toThrow('el último run no trae riesgo')
    vi.stubGlobal('fetch', respond({ risk: { file: 'risk.json', label: 'x' } }))
    await expect(fetchRisk('/data')).resolves.toMatchObject({ schema: 1 })
  })
})
