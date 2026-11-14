import { describe, expect, it } from 'vitest'
import {
  CITIES,
  citiesByStatus,
  hasNetwork,
  officialNetworkAt,
  type CityEntry,
  type CityNetwork,
} from './cityNetworks'

describe('officialNetworkAt', () => {
  it('encuentra la red de la ciudad del punto', () => {
    expect(officialNetworkAt(4.65, -74.08)?.red).toMatch(/SAB/) // Bogotá centro
    expect(officialNetworkAt(6.25, -75.57)?.red).toBe('SIATA') // Medellín
    expect(officialNetworkAt(3.45, -76.53)?.operador).toBe('CVC') // Cali
    expect(officialNetworkAt(5.07, -75.5)?.ciudad).toBe('Manizales')
  })

  it('no enlaza redes no verificadas ni caídas (RF-14)', () => {
    expect(officialNetworkAt(4.81, -75.69)).toBeNull() // Pereira
    expect(officialNetworkAt(7.12, -73.12)).toBeNull() // Bucaramanga
  })

  it('fuera de toda ciudad con red → null', () => {
    expect(officialNetworkAt(10.96, -74.8)).toBeNull() // Barranquilla
    expect(officialNetworkAt(0, 0)).toBeNull()
  })

  it('respeta el estado aunque el punto caiga en el bbox', () => {
    const city = (estado: CityNetwork['estado']): CityEntry => ({
      ciudad: 'X',
      bbox: [0, 0, 1, 1],
      red: 'R',
      operador: 'O',
      url: 'https://x',
      estado,
    })
    expect(officialNetworkAt(0.5, 0.5, [city('caida')])).toBeNull()
    expect(officialNetworkAt(0.5, 0.5, [city('no_verificada')])).toBeNull()
    expect(officialNetworkAt(0.5, 0.5, [city('verificada')])?.red).toBe('R')
  })
})

describe('datos de cityNetworks.json', () => {
  it('bbox bien formados, en Colombia y URL https en las verificadas', () => {
    for (const c of CITIES.filter(hasNetwork)) {
      const [w, s, e, n] = c.bbox
      expect(w).toBeLessThan(e)
      expect(s).toBeLessThan(n)
      expect(s).toBeGreaterThan(-4.5)
      expect(n).toBeLessThan(13.5)
      if (c.estado === 'verificada') expect(c.url).toMatch(/^https:\/\//)
    }
  })

  it('agrupa por estado', () => {
    const g = citiesByStatus()
    expect(g.verified.map((c) => c.ciudad)).toContain('Bogotá')
    expect(g.unverified.map((c) => c.ciudad)).toEqual(['Pereira', 'Bucaramanga'])
    expect(g.without.map((c) => c.ciudad)).toContain('Barranquilla')
  })
})
