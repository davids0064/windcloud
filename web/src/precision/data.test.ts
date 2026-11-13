import { afterEach, describe, expect, it, vi } from 'vitest'
import { MODELS } from '../core/models'
import { modelColor } from '../point/colors'
import {
  bestByStation,
  clearPrecisionCache,
  fetchPrecision,
  fmt,
  generatedLabel,
  modelColorOf,
  rankModels,
  windowRange,
} from './data'
import { scores, SUMMARY } from './fixture'

const ids = MODELS.map((m) => m.apiId)

describe('rankModels', () => {
  it('ordena por MAE ascendente en temperatura y viento', () => {
    const rows = rankModels(scores(), 'temperatura', 1, [...ids].reverse(), 24)
    expect(rows.map((r) => r.model)).toEqual(ids)
    expect(rows.every((r) => r.ranked)).toBe(true)
  })

  it('ordena por CSI descendente en lluvia', () => {
    const rows = rankModels(scores(), 'lluvia', 2, ids, 24)
    expect(rows[0].model).toBe(ids[0])
    expect(rows.at(-1)!.model).toBe(ids.at(-1))
  })

  it('deja al final, sin puesto, los modelos con menos pares que el mínimo', () => {
    const s = scores()
    s.temperatura[`${ids[0]}_d1`] = { n: 3, mae: 0.1, sesgo: 0, rmse: 0.1 }
    const rows = rankModels(s, 'temperatura', 1, ids, 24)
    expect(rows.at(-1)).toMatchObject({ model: ids[0], ranked: false })
    expect(rows[0].model).toBe(ids[1])
  })

  it('un CSI nulo (sin lluvia observada) no entra al ranking', () => {
    const s = scores()
    s.lluvia[`${ids[0]}_d1`] = { ...s.lluvia[`${ids[0]}_d1`], csi: null }
    expect(rankModels(s, 'lluvia', 1, ids, 24).at(-1)).toMatchObject({ ranked: false })
  })
})

describe('bestByStation', () => {
  it('toma el primero del ranking de cada estación; null sin muestra', () => {
    const t = bestByStation(SUMMARY, '7', 'temperatura')
    expect([...t]).toEqual([
      ['SKBO', 'icon_seamless'],
      ['SKUI', 'ukmo_seamless'],
      ['SETU', null],
    ])
    expect(bestByStation(SUMMARY, '7', 'lluvia').get('SKBO')).toBeNull()
    expect(bestByStation(SUMMARY, '30', 'temperatura').get('SKBO')).toBe('ecmwf_ifs')
  })
})

describe('formato', () => {
  it('rango de la ventana, hora de cálculo y números es-CO', () => {
    expect(windowRange(SUMMARY.ventanas['7'].dias)).toBe('06/11–12/11')
    expect(windowRange(['2026-11-12'])).toBe('12/11')
    expect(windowRange([])).toBe('')
    expect(generatedLabel('2026-11-13T20:04:03Z')).toBe('13/11 20:04 UTC')
    expect(fmt.value(1.345)).toBe('1,3')
    expect(fmt.signed(-0.64)).toBe('-0,6')
    expect(fmt.signed(0.86)).toBe('+0,9')
    expect(fmt.pct(0.666)).toBe('67 %')
    expect(fmt.value(null)).toBe('—')
  })

  it('el color de cada modelo es el mismo que en la gráfica del panel de punto', () => {
    expect(modelColorOf(ids[3])).toBe(modelColor(3))
    expect(modelColorOf('desconocido')).toBe('#888888')
  })
})

describe('fetchPrecision', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearPrecisionCache()
  })

  it('pide /data/precision.json una vez y no cachea errores', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('x', { status: 500 }))
      .mockResolvedValueOnce(new Response('x', { status: 500 }))
      .mockResolvedValue(new Response(JSON.stringify(SUMMARY)))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchPrecision('/data')).rejects.toThrow('HTTP 500')
    await expect(fetchPrecision('/data')).resolves.toMatchObject({ hasta: '2026-11-12' })
    await fetchPrecision('/data')
    expect(fetchMock).toHaveBeenCalledTimes(3) // 2 intentos fallidos + 1 bueno; luego caché
    expect(fetchMock.mock.calls[0][0]).toBe('/data/precision.json')
  })
})
