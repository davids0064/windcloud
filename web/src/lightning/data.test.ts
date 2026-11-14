import { describe, expect, it } from 'vitest'
import { ageColor, dataAgeMin, lightningGeoJSON } from './data'
import { RAYOS } from './fixture'

describe('rayos', () => {
  it('edad de los datos y color por antigüedad', () => {
    expect(dataAgeMin(RAYOS, new Date('2026-11-14T16:50:00Z'))).toBe(4)
    expect([0, 4.9, 5, 9.9, 10, 30].map(ageColor)).toEqual([
      '#ffffff',
      '#ffffff',
      '#ffe066',
      '#ffe066',
      '#ff9f43',
      '#ff9f43',
    ])
  })

  it('colorea respecto de ahora (suma el retraso de los datos)', () => {
    const fc = lightningGeoJSON(RAYOS, new Date('2026-11-14T16:46:00Z'))!
    expect(fc.features.map((f) => f.properties.color)).toEqual(['#ffffff', '#ffe066', '#ff9f43'])
    expect(fc.features[0].geometry.coordinates).toEqual([-74.1, 4.6])
    const later = lightningGeoJSON(RAYOS, new Date('2026-11-14T16:51:00Z'))!
    expect(later.features[0].properties.color).toBe('#ffe066') // 1 + 5 min
  })

  it('datos de hace más de 45 min no se dibujan (P4)', () => {
    expect(lightningGeoJSON(RAYOS, new Date('2026-11-14T17:40:00Z'))).toBeNull()
  })
})
