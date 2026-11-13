import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearGeocodingCache,
  flagEmoji,
  parsePlaces,
  placeKind,
  searchPlaces,
  zoomForKind,
} from './geocoding'

// Respuesta real recortada de Open-Meteo (2026-11-13).
const RESPONSE = {
  results: [
    {
      id: 3688689,
      name: 'Bogotá',
      latitude: 4.60971,
      longitude: -74.08175,
      feature_code: 'PPLC',
      country_code: 'CO',
      country: 'Colombia',
      admin1: 'Bogotá D.C.',
      population: 7674366,
    },
    {
      id: 3686110,
      name: 'Colombia',
      latitude: 4,
      longitude: -73.25,
      feature_code: 'PCLI',
      country_code: 'CO',
      country: 'Colombia',
      population: 53425635,
    },
    {
      id: 1,
      name: 'Antioquia',
      latitude: 7,
      longitude: -75.5,
      feature_code: 'ADM1',
      country_code: 'CO',
      country: 'Colombia',
    },
  ],
}

describe('geocoding', () => {
  it('clasifica por código GeoNames', () => {
    expect(placeKind('PCLI')).toBe('pais')
    expect(placeKind('ADM1')).toBe('region')
    expect(placeKind('PPLC')).toBe('ciudad')
    expect(placeKind('PPLA2')).toBe('ciudad')
    expect(placeKind('MT')).toBe('lugar')
    expect(placeKind(undefined)).toBe('lugar')
  })

  it('vuela más cerca a una ciudad que a un país', () => {
    expect(zoomForKind('ciudad')).toBeGreaterThan(zoomForKind('region'))
    expect(zoomForKind('region')).toBeGreaterThan(zoomForKind('pais'))
  })

  it('parsea resultados con contexto legible', () => {
    const [bogota, colombia, antioquia] = parsePlaces(RESPONSE)
    expect(bogota).toMatchObject({
      name: 'Bogotá',
      kind: 'ciudad',
      context: 'Bogotá D.C., Colombia',
      lat: 4.60971,
    })
    expect(colombia).toMatchObject({ kind: 'pais', context: '' })
    expect(antioquia.context).toBe('Colombia')
    expect(parsePlaces({})).toEqual([])
  })

  it('genera la bandera desde el código de país', () => {
    expect(flagEmoji('CO')).toBe('🇨🇴')
    expect(flagEmoji('')).toBe('')
    expect(flagEmoji('col')).toBe('')
  })

  describe('searchPlaces', () => {
    const fetchMock = vi.fn()
    beforeEach(() => {
      clearGeocodingCache()
      fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => RESPONSE })
      vi.stubGlobal('fetch', fetchMock)
    })
    afterEach(() => vi.unstubAllGlobals())

    it('no consulta con menos de 2 caracteres', async () => {
      expect(await searchPlaces(' b ')).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('pide resultados en español y solo envía el texto buscado (RNF-8)', async () => {
      await searchPlaces('Bogotá')
      const url = new URL(fetchMock.mock.calls[0][0])
      expect(url.origin + url.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search')
      expect(Object.fromEntries(url.searchParams)).toEqual({
        name: 'Bogotá',
        count: '8',
        language: 'es',
        format: 'json',
      })
    })

    it('usa caché sin distinguir mayúsculas', async () => {
      await searchPlaces('Bogotá')
      await searchPlaces('BOGOTÁ')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('reintenta una vez y luego falla', async () => {
      fetchMock.mockReset().mockResolvedValue({ ok: false, status: 503 })
      await expect(searchPlaces('Cali')).rejects.toThrow('HTTP 503')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })
})
