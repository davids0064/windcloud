import { describe, expect, it, vi } from 'vitest'
import {
  corners,
  ISOBARS_ID,
  ISOBARS_LABELS_ID,
  SCALAR_ID,
  scalarFileUrl,
  setIsobars,
  setScalarLayer,
} from './forecastLayers'
import { parseScalarUrl, scalarUrl } from './scalarUrl'
import {
  buildLut,
  colorAt,
  colorize,
  decodeGray,
  SCALAR_STYLES,
  tickPosition,
  type ScalarScale,
} from './scalarStyles'

const rain: ScalarScale = { min: 0, max: 50, transform: 'sqrt' }
const temp: ScalarScale = { min: -10, max: 40, transform: 'linear' }

describe('decodificación de los PNG grises (igual que el pipeline)', () => {
  it('lineal y raíz cuadrada', () => {
    expect(decodeGray(0, temp)).toBe(-10)
    expect(decodeGray(255, temp)).toBe(40)
    expect(decodeGray(127.5, temp)).toBeCloseTo(15)
    expect(decodeGray(255, rain)).toBeCloseTo(50)
    expect(decodeGray(255 / 2, rain)).toBeCloseTo(12.5) // (√50/2)² = 12,5
  })
})

describe('escalas de color', () => {
  it('lluvia: transparente en llovizna imperceptible, opaca en aguacero', () => {
    expect(colorAt(0.05, SCALAR_STYLES.prate.stops)[3]).toBe(0)
    expect(colorAt(30, SCALAR_STYLES.prate.stops)[3]).toBeGreaterThan(200)
  })

  it('ráfagas: transparentes con brisa (< 20 km/h)', () => {
    expect(colorAt(15, SCALAR_STYLES.gust.stops)[3]).toBe(0)
    expect(colorAt(70, SCALAR_STYLES.gust.stops)[3]).toBeGreaterThan(150)
  })

  it('temperatura: más fría = más azul, más caliente = más roja', () => {
    const cold = colorAt(0, SCALAR_STYLES.t2m.stops)
    const hot = colorAt(32, SCALAR_STYLES.t2m.stops)
    expect(cold[2]).toBeGreaterThan(cold[0])
    expect(hot[0]).toBeGreaterThan(hot[2])
  })

  it('fuera de rango usa los extremos', () => {
    expect(colorAt(-50, SCALAR_STYLES.t2m.stops).slice(0, 3)).toEqual([0x31, 0x36, 0x95])
    expect(colorAt(99, SCALAR_STYLES.t2m.stops).slice(0, 3)).toEqual([0xa5, 0x00, 0x26])
  })

  it('tabla de 256 colores y coloreo respetando píxeles sin dato', () => {
    const lut = buildLut(temp, SCALAR_STYLES.t2m.stops)
    expect(lut).toHaveLength(1024)
    const px = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0])
    colorize(px, lut)
    expect([...px.slice(0, 4)]).toEqual([...lut.slice(1020, 1024)])
    expect([...px.slice(4)]).toEqual([0, 0, 0, 0]) // sin dato: transparente
  })

  it('marcas de leyenda en la escala del PNG (raíz para la lluvia)', () => {
    expect(tickPosition(12.5, rain)).toBeCloseTo(0.5)
    expect(tickPosition(15, temp)).toBeCloseTo(0.5)
  })
})

describe('protocolo y URLs', () => {
  it('ida y vuelta del protocolo wcescalar', () => {
    const u = scalarUrl('prate', '/data/gfs/2026111312/prate_024.png')
    expect(u).toBe('wcescalar://prate/data/gfs/2026111312/prate_024.png')
    expect(parseScalarUrl(u)).toEqual({ name: 'prate', path: '/data/gfs/2026111312/prate_024.png' })
    expect(parseScalarUrl('https://x/y.png')).toBeNull()
    expect(scalarFileUrl('/data/gfs/r', 'isobars_{step}.geojson', 3)).toBe(
      '/data/gfs/r/isobars_003.geojson',
    )
  })
})

function fakeMap() {
  const layers: { id: string }[] = [{ id: 'base' }, { id: 'wc-departamentos-relleno' }]
  const sources = new Map<
    string,
    { updateImage?: ReturnType<typeof vi.fn>; setData?: ReturnType<typeof vi.fn> }
  >()
  return {
    layers,
    sources,
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string) => sources.set(id, { updateImage: vi.fn(), setData: vi.fn() })),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    getLayer: (id: string) => layers.find((l) => l.id === id),
    addLayer: vi.fn((l: { id: string }, before?: string) => {
      const i = before ? layers.findIndex((x) => x.id === before) : layers.length
      layers.splice(i, 0, l)
    }),
    removeLayer: vi.fn((id: string) =>
      layers.splice(
        layers.findIndex((l) => l.id === id),
        1,
      ),
    ),
  }
}

describe('capas en el mapa', () => {
  const bounds = { west: -100, east: -50, north: 25, south: -20 }

  it('esquinas NO, NE, SE, SO para la imagen', () => {
    expect(corners(bounds)).toEqual([
      [-100, 25],
      [-50, 25],
      [-50, -20],
      [-100, -20],
    ])
  })

  it('capa de color: crea, actualiza la imagen al cambiar de hora y se quita', () => {
    const m = fakeMap()
    setScalarLayer(m as never, { url: 'a', bounds }, 'wc-departamentos-relleno')
    expect(m.layers.map((l) => l.id)).toEqual(['base', SCALAR_ID, 'wc-departamentos-relleno'])
    setScalarLayer(m as never, { url: 'b', bounds })
    expect(m.addSource).toHaveBeenCalledTimes(1)
    expect(m.sources.get(SCALAR_ID)!.updateImage).toHaveBeenCalledWith({
      url: 'b',
      coordinates: corners(bounds),
    })
    setScalarLayer(m as never, null)
    expect(m.getLayer(SCALAR_ID)).toBeUndefined()
  })

  it('isobaras: líneas y etiquetas; al cambiar de hora solo cambian los datos', () => {
    const m = fakeMap()
    setIsobars(m as never, '/i0.geojson', 'wc-departamentos-relleno')
    expect(m.layers.map((l) => l.id)).toEqual([
      'base',
      ISOBARS_ID,
      ISOBARS_LABELS_ID,
      'wc-departamentos-relleno',
    ])
    setIsobars(m as never, '/i3.geojson')
    expect(m.sources.get(ISOBARS_ID)!.setData).toHaveBeenCalledWith('/i3.geojson')
    setIsobars(m as never, null)
    expect(m.layers.map((l) => l.id)).toEqual(['base', 'wc-departamentos-relleno'])
  })
})
