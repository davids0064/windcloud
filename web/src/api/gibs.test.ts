import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CLOUD_LAYERS,
  dropUnpublished,
  fetchAvailableTimes,
  gibsTime,
  parseDomains,
  parseProtocolUrl,
  pickFrames,
  probeUrl,
  tileUrl,
} from './gibs'

// Respuesta real de DescribeDomains (2026-11-13).
const DOMAINS = `<Domains xmlns:ows='http://www.opengis.net/ows/1.1'><SpaceDomain/><DimensionDomain><ows:Identifier>time</ows:Identifier><Domain>2026-11-13T08:00:00Z/2026-11-13T13:00:00Z/PT10M</Domain><Size>1</Size></DimensionDomain></Domains>`
const t = (s: string) => new Date(`2026-11-13T${s}:00Z`)

describe('gibs', () => {
  it('usa los IDs reales del GetCapabilities', () => {
    expect(CLOUD_LAYERS.visible.gibsId).toBe('GOES-East_ABI_Band2_Red_Visible_1km')
    expect(CLOUD_LAYERS.infrarrojo.gibsId).toBe('GOES-East_ABI_Band13_Clean_Infrared')
    expect(CLOUD_LAYERS.infrarrojo.maxzoom).toBe(6)
  })

  it('formatea la hora sin milisegundos', () => {
    expect(gibsTime(t('12:40'))).toBe('2026-11-13T12:40:00Z')
  })

  it('expande el rango de DescribeDomains cada 10 min', () => {
    const times = parseDomains(DOMAINS)
    expect(times).toHaveLength(31) // 08:00 … 13:00
    expect(times[0]).toEqual(t('08:00'))
    expect(times.at(-1)).toEqual(t('13:00'))
  })

  it('maneja varios rangos (huecos) e instantes sueltos', () => {
    const xml =
      '<Domain>2026-11-13T10:00:00Z/2026-11-13T10:20:00Z/PT10M,2026-11-13T11:00:00Z</Domain>'
    expect(parseDomains(xml).map(gibsTime)).toEqual([
      '2026-11-13T10:00:00Z',
      '2026-11-13T10:10:00Z',
      '2026-11-13T10:20:00Z',
      '2026-11-13T11:00:00Z',
    ])
    expect(parseDomains('<Domains/>')).toEqual([])
  })

  it('arma 10 cuadros de las últimas 3 h cada 20 min terminando en la más reciente (RF-3)', () => {
    const frames = pickFrames(parseDomains(DOMAINS))
    expect(frames).toHaveLength(10)
    expect(frames[0]).toEqual(t('10:00'))
    expect(frames.at(-1)).toEqual(t('13:00'))
  })

  it('omite cuadros que GIBS no declara (nunca inventa horas)', () => {
    // Faltan 12:20 y todo lo anterior a 12:00: solo salen los instantes que existen.
    const available = [t('12:00'), t('12:40'), t('13:00')]
    expect(pickFrames(available)).toEqual([t('12:00'), t('12:40'), t('13:00')])
    expect(pickFrames([])).toEqual([])
  })

  it('construye la URL WMTS y la del protocolo propio de ida y vuelta', () => {
    const https = tileUrl(CLOUD_LAYERS.infrarrojo, t('12:50'), '')
    expect(https).toBe(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_Band13_Clean_Infrared/default/2026-11-13T12:50:00Z/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png',
    )
    const custom = tileUrl(CLOUD_LAYERS.infrarrojo, t('12:50'))
    expect(custom.startsWith('wcnubes://infrarrojo/gibs.earthdata.nasa.gov/')).toBe(true)
    expect(parseProtocolUrl(custom.replace('{z}/{y}/{x}', '5/15/9'))).toEqual({
      kind: 'infrarrojo',
      https: https.replace('{z}/{y}/{x}', '5/15/9'),
    })
    expect(parseProtocolUrl('https://otro.com/x.png')).toBeNull()
  })

  describe('fetchAvailableTimes', () => {
    afterEach(() => vi.unstubAllGlobals())
    it('pide DescribeDomains de las últimas horas', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => DOMAINS })
      vi.stubGlobal('fetch', fetchMock)
      const times = await fetchAvailableTimes(CLOUD_LAYERS.visible, t('13:30'), 6)
      expect(times).toHaveLength(31)
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/GOES-East_ABI_Band2_Red_Visible_1km/default/GoogleMapsCompatible_Level7/all/2026-11-13T07:30:00Z--2026-11-13T13:30:00Z.xml',
      )
    })
  })

  describe('dropUnpublished', () => {
    afterEach(() => vi.unstubAllGlobals())
    const times = [t('12:40'), t('12:50'), t('13:00'), t('13:10')]

    it('comprueba con una tesela z2 que cubre Colombia', () => {
      expect(probeUrl(CLOUD_LAYERS.infrarrojo, t('13:00'))).toMatch(
        /2026-11-13T13:00:00Z\/GoogleMapsCompatible_Level6\/2\/1\/1\.png$/,
      )
    })

    it('descarta instantes declarados cuyas teselas aún dan 404 (caso real 13:10)', async () => {
      const fetchMock = vi.fn(async (url: string) => ({ ok: !url.includes('13:10') }))
      vi.stubGlobal('fetch', fetchMock)
      expect(await dropUnpublished(CLOUD_LAYERS.infrarrojo, times)).toEqual(times.slice(0, 3))
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('si ninguna comprobación responde, no muestra nada (P4)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false })),
      )
      expect(await dropUnpublished(CLOUD_LAYERS.infrarrojo, times, { maxChecks: 2 })).toEqual([])
    })
  })
})
