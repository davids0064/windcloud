import { describe, expect, it, vi } from 'vitest'
import {
  DEPARTMENTS_CASING,
  DEPARTMENTS_FILL,
  DEPARTMENTS_LINE,
  DEPARTMENTS_SOURCE,
  departmentAt,
  installDepartments,
} from './departments'

function fakeMap(features: unknown[] = []) {
  const layers: { id: string; type: string }[] = [
    { id: 'background', type: 'background' },
    { id: 'water', type: 'fill' },
    { id: 'boundary_country_z5-', type: 'line' },
    { id: 'place_city', type: 'symbol' },
  ]
  const sources = new Map<string, Record<string, unknown>>()
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string, spec: Record<string, unknown>) => sources.set(id, spec)),
    getLayer: (id: string) => layers.find((l) => l.id === id),
    addLayer: vi.fn((layer: { id: string; type: string }, before?: string) => {
      const i = before ? layers.findIndex((l) => l.id === before) : layers.length
      layers.splice(i, 0, layer)
    }),
    getStyle: () => ({ layers }),
    queryRenderedFeatures: vi.fn(() => features),
  }
  return { map, sources, order: () => layers.map((l) => l.id) }
}

describe('departamentos (T-11)', () => {
  it('añade la fuente GeoJSON con atribución OSM/ODbL e id por código ISO', () => {
    const f = fakeMap()
    installDepartments(f.map as never, '/geo/x.geojson')
    const spec = f.sources.get(DEPARTMENTS_SOURCE)!
    expect(spec).toMatchObject({ type: 'geojson', data: '/geo/x.geojson', promoteId: 'iso' })
    expect(spec.attribution).toMatch(/OpenStreetMap.*ODbL/)
  })

  it('dibuja relleno, halo y línea debajo de los nombres, una sola vez', () => {
    const f = fakeMap()
    installDepartments(f.map as never)
    installDepartments(f.map as never)
    expect(f.map.addSource).toHaveBeenCalledTimes(1)
    expect(f.map.addLayer).toHaveBeenCalledTimes(3)
    expect(f.order()).toEqual([
      'background',
      'water',
      'boundary_country_z5-',
      DEPARTMENTS_FILL,
      DEPARTMENTS_CASING,
      DEPARTMENTS_LINE,
      'place_city',
    ])
  })

  it('identifica el departamento bajo el cursor', () => {
    const f = fakeMap([{ id: 'CO-ANT', properties: { nombre: 'Antioquia', iso: 'CO-ANT' } }])
    installDepartments(f.map as never)
    expect(departmentAt(f.map as never, [10, 10])).toEqual({ id: 'CO-ANT', nombre: 'Antioquia' })
    expect(f.map.queryRenderedFeatures).toHaveBeenCalledWith([10, 10], {
      layers: [DEPARTMENTS_FILL],
    })
  })

  it('devuelve null fuera de Colombia o si la capa aún no existe', () => {
    expect(departmentAt(fakeMap().map as never, [0, 0])).toBeNull()
    const f = fakeMap([])
    installDepartments(f.map as never)
    expect(departmentAt(f.map as never, [0, 0])).toBeNull()
  })
})
