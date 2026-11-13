import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GridMeta } from './meta'
import { LEVEL_LABELS, leadLabel, nowPosition, relativeLabel, validLabel } from './timeline'
import { useForecastGrid } from './useForecastGrid'
import { ForecastPanel } from './ForecastPanel'

const NOW = new Date()
const H = 3_600_000
// Run que empezó hace 4 h, pasos 0–72 cada 3 h (como el pipeline)
// Exactamente 4 h antes de ahora (no redondeado a la hora): así el paso más cercano es siempre el de +3 h
// (hace 1 h) frente al de +6 h (dentro de 2 h), sin depender del minuto en que corra la prueba.
const runStart = new Date(NOW.getTime() - 4 * H)
const steps = Array.from({ length: 25 }, (_, i) => i * 3)
const meta = {
  schema: 1,
  model: 'gfs',
  modelLabel: 'GFS 0,25° (NOAA)',
  run: runStart.toISOString(),
  bounds: { west: -100, east: -50, north: 25, south: -20 },
  steps,
  validTimes: steps.map((s) => new Date(runStart.getTime() + s * H).toISOString()),
  wind: {
    file: 'wind_{level}_{step}.png',
    levels: Object.fromEntries(
      ['10m', '850', '500'].map((l) => [
        l,
        { label: l, frames: steps.map((step) => ({ step, uMin: -1, uMax: 1, vMin: -1, vMax: 1 })) },
      ]),
    ),
  },
} as unknown as GridMeta

describe('textos de la línea de tiempo', () => {
  it('etiquetas de altura, adelanto y hora relativa', () => {
    expect(LEVEL_LABELS['850'].short).toBe('~1,5 km')
    expect(leadLabel(21)).toBe('+21 h')
    expect(relativeLabel(new Date(NOW.getTime() + 21 * H).toISOString(), NOW)).toBe(
      'dentro de 21 h',
    )
    expect(relativeLabel(new Date(NOW.getTime() - 2 * H).toISOString(), NOW)).toBe('hace 2 h')
    expect(relativeLabel(NOW.toISOString(), NOW)).toBe('ahora')
  })

  it('hora válida en la zona del punto', () => {
    expect(validLabel('2026-11-14T12:00:00Z', 'America/Bogota').replace(/\s/g, ' ')).toBe(
      'sáb 14, 7:00 a. m.',
    )
  })

  it('"ahora" dentro de la línea de tiempo', () => {
    const pos = nowPosition(meta, NOW)!
    expect(pos).toBeGreaterThan(0.04)
    expect(pos).toBeLessThan(0.07) // ~4 h de 72 h
    expect(nowPosition(meta, new Date(NOW.getTime() + 100 * H))).toBeNull()
  })
})

describe('useForecastGrid (T-35, T-36)', () => {
  const urls: string[] = []
  beforeEach(() => {
    urls.length = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        if (url.endsWith('latest.json'))
          return { ok: true, json: async () => ({ run: meta.run, meta: '2026111306/meta.json' }) }
        if (url.endsWith('meta.json')) return { ok: true, json: async () => meta }
        return { ok: true, blob: async () => new Blob() }
      }),
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 201, height: 186 })),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('empieza en la hora más cercana a ahora y precarga los 25 pasos del nivel', async () => {
    const { result } = renderHook(() => useForecastGrid(true))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const r = result.current as Extract<typeof result.current, { status: 'ready' }>
    expect(meta.steps[r.stepIndex]).toBe(3) // hace 4 h + 3 h ≈ hace 1 h: el más cercano a ahora
    await waitFor(() => expect(urls.filter((u) => u.includes('wind_10m_')).length).toBe(25))
    expect(createImageBitmap).toHaveBeenCalledWith(expect.anything(), {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    })
  })

  it('cambiar de nivel carga ese nivel; mover el tiempo detiene la reproducción', async () => {
    const { result } = renderHook(() => useForecastGrid(true))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const ready = () => result.current as Extract<typeof result.current, { status: 'ready' }>
    act(() => ready().setLevel('500'))
    await waitFor(() => expect(ready().field?.level).toBe('500'))
    act(() => ready().togglePlay())
    expect(ready().playing).toBe(true)
    act(() => ready().setStepIndex(10))
    expect(ready().playing).toBe(false)
    await waitFor(() => expect(ready().field?.frame.step).toBe(30))
  })

  it('con el viento apagado da la línea de tiempo sin descargar imágenes de viento', async () => {
    const { result } = renderHook(() => useForecastGrid(true, false))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const r = result.current as Extract<typeof result.current, { status: 'ready' }>
    expect(r.field).toBeNull()
    expect(urls.some((u) => u.includes('wind_'))).toBe(false)
  })

  it('apagado no pide nada; sin datos publicados lo dice', async () => {
    const { result } = renderHook(() => useForecastGrid(false))
    expect(result.current.status).toBe('off')
    expect(urls).toEqual([])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    )
    const r2 = renderHook(() => useForecastGrid(true))
    await waitFor(() => expect(r2.result.current.status).toBe('error'))
  })
})

describe('ForecastPanel', () => {
  const metaWithScalars = {
    ...meta,
    scalars: {
      prate: {
        label: 'Lluvia',
        units: 'mm/h',
        min: 0,
        max: 50,
        transform: 'sqrt',
        note: '',
        file: 'prate_{step}.png',
        steps,
      },
      t2m: {
        label: 'Temp',
        units: '°C',
        min: -10,
        max: 40,
        transform: 'linear',
        note: '',
        file: 't2m_{step}.png',
        steps,
      },
    },
    isobars: {
      units: 'hPa',
      every: 2,
      file: 'isobars_{step}.geojson',
      steps,
      note: 'Presión reducida al nivel del mar',
    },
  } as unknown as GridMeta
  const state = {
    status: 'ready' as const,
    loaded: { meta: metaWithScalars, base: '/data/gfs/x' },
    field: {} as never,
    level: '10m' as const,
    stepIndex: 2,
    playing: false,
    setLevel: vi.fn(),
    setStepIndex: vi.fn(),
    togglePlay: vi.fn(),
  }
  const base = {
    state,
    windOn: true,
    onWindOn: vi.fn(),
    scalar: null,
    onScalar: vi.fn(),
    isobarsOn: false,
    onIsobarsOn: vi.fn(),
  }

  it('línea de tiempo común con hora y adelanto, fuente y run (P2)', () => {
    render(<ForecastPanel {...base} />)
    expect(screen.getByText(/\+6 h del run/)).toBeInTheDocument()
    expect(screen.getByTitle('Ahora')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '10 m' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('≥ 54 km/h')).toBeInTheDocument()
    const source = screen.getByText(/Fuente: GFS 0,25° \(NOAA\)/)
    expect(source).toHaveTextContent(/run \d{2}\/\d{2}, \d{2}:\d{2} UTC/)
    expect(source.querySelector('time')).toHaveAttribute('dateTime', meta.run)
  })

  it('la leyenda del viento se adapta a la altura', () => {
    render(<ForecastPanel {...base} state={{ ...state, level: '500' }} />)
    expect(screen.getByText('≥ 144 km/h')).toBeInTheDocument()
  })

  it('controles: altura, línea de tiempo, reproducir, capa de color e isobaras', () => {
    render(<ForecastPanel {...base} />)
    fireEvent.click(screen.getByRole('radio', { name: '~5,5 km' }))
    expect(state.setLevel).toHaveBeenCalledWith('500')
    fireEvent.change(screen.getByRole('slider', { name: 'Hora del pronóstico' }), {
      target: { value: '8' },
    })
    expect(state.setStepIndex).toHaveBeenCalledWith(8)
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir las próximas 72 horas' }))
    expect(state.togglePlay).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: 'Lluvia' }))
    expect(base.onScalar).toHaveBeenCalledWith('prate')
    fireEvent.click(screen.getByRole('checkbox', { name: /Isobaras \(cada 2 hPa\)/ }))
    expect(base.onIsobarsOn).toHaveBeenCalledWith(true)
  })

  it('leyenda de la capa de color con marcas en su escala y nota de isobaras', () => {
    render(<ForecastPanel {...base} scalar="prate" isobarsOn />)
    expect(screen.getByText('Lluvia (tasa instantánea) (mm/h)')).toBeInTheDocument()
    expect(screen.getByText('0,5')).toBeInTheDocument()
    expect(screen.getByText('Presión reducida al nivel del mar.')).toBeInTheDocument()
  })

  it('sin datos publicados lo dice en vez de mostrar capas', () => {
    render(<ForecastPanel {...base} state={{ status: 'error', message: 'HTTP 404' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Sin datos de pronóstico')
  })
})
