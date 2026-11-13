import { fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearOpenMeteoCache } from '../api/openMeteo'
import { MODELS } from '../core/models'
import PointPanel from './PointPanel'

// uPlot necesita canvas: se reemplaza la gráfica.
vi.mock('./ModelChart', () => ({
  ModelChart: ({ variable }: { variable: string }) => <div>gráfica de {variable}</div>,
}))

const T0 = Math.floor(Date.now() / 3_600_000) * 3600 - 2 * 3600 // empieza 2 h antes de ahora
const time = Array.from({ length: 48 }, (_, i) => T0 + i * 3600)
function rawForecast() {
  const hourly: Record<string, unknown> = { time }
  MODELS.forEach((m, i) => {
    hourly[`temperature_2m_${m.apiId}`] = time.map(() => 15 + i * 0.1)
    hourly[`wind_speed_10m_${m.apiId}`] = time.map(() => 10)
    hourly[`wind_direction_10m_${m.apiId}`] = time.map(() => 140)
    hourly[`wind_gusts_10m_${m.apiId}`] = time.map(() => (i < 2 ? null : 10 + i * 8))
    hourly[`cloud_cover_${m.apiId}`] = time.map(() => 60)
    hourly[`precipitation_${m.apiId}`] = time.map(() => 0)
  })
  return {
    latitude: 4.5,
    longitude: -74,
    elevation: 2586,
    timezone: 'America/Bogota',
    utc_offset_seconds: -18000,
    hourly,
  }
}

/** Como el fetch real: tarda un poco y se rechaza con AbortError si cancelan su signal. */
function realisticFetch(
  body: (url: string) => { ok: boolean; status?: number; json?: () => Promise<unknown> },
) {
  return (url: string, init?: { signal?: AbortSignal }) =>
    new Promise((resolve, reject) => {
      const signal = init?.signal
      const abort = () => reject(new DOMException('signal is aborted without reason', 'AbortError'))
      if (signal?.aborted) return abort()
      const timer = setTimeout(() => resolve(body(url)), 5)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        abort()
      })
    })
}

describe('PointPanel', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    clearOpenMeteoCache()
    fetchMock.mockReset()
    fetchMock.mockImplementation(
      realisticFetch((url) =>
        url.includes('/static/meta.json')
          ? { ok: true, json: async () => ({ last_run_initialisation_time: 1794549600 }) }
          : { ok: true, json: async () => rawForecast() },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const point = { lat: 4.61, lon: -74.08, label: 'Bogotá, Colombia' }

  it('muestra consenso, acuerdo y rango por variable, rotulado como pronóstico (RF-6, RF-8, P3)', async () => {
    render(<PointPanel point={point} onClose={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Consultando 8 modelos')
    expect(await screen.findByText(/consenso de 8 modelos/)).toBeInTheDocument()
    expect(screen.getByText('Pronóstico')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Bogotá, Colombia' })).toBeInTheDocument()
    expect(screen.getByText('15,4')).toBeInTheDocument() // media de 15,0…15,7
    expect(screen.getByText(/del SE/)).toBeInTheDocument()
    expect(screen.getByText(/2\.586 m/)).toBeInTheDocument()
    expect(screen.getAllByText('Acuerdo alto').length).toBeGreaterThanOrEqual(3)
  })

  it('avisa cuando los modelos no coinciden (RF-8)', async () => {
    render(<PointPanel point={point} onClose={() => {}} />)
    await screen.findByText(/consenso de 8 modelos/)
    expect(screen.getByText('Acuerdo bajo')).toBeInTheDocument() // ráfagas 26–66 km/h
    expect(screen.getByText('Los modelos no coinciden: pronóstico incierto.')).toBeInTheDocument()
    expect(screen.getByText('Modelos: 26–66 (6)')).toBeInTheDocument() // 2 modelos sin ráfagas
  })

  it('lista cada modelo con la hora de su run y explica los pesos (P2, RF-7)', async () => {
    render(<PointPanel point={point} onClose={() => {}} />)
    await screen.findByText(/consenso de 8 modelos/)
    expect(screen.getAllByText('run 13/11, 06:00 UTC')).toHaveLength(8)
    expect(screen.getByText('¿Por qué este número?')).toBeInTheDocument()
    expect(screen.getByText(/todos los modelos pesan igual/)).toBeInTheDocument()
    expect(screen.getByText(/Fuente: Open-Meteo/)).toBeInTheDocument()
  })

  it('cambia la variable de la gráfica', async () => {
    render(<PointPanel point={point} onClose={() => {}} />)
    expect(await screen.findByText('gráfica de temperature_2m')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Ráfagas' }))
    expect(await screen.findByText('gráfica de wind_gusts_10m')).toBeInTheDocument()
  })

  it('si Open-Meteo falla dice "sin datos" y permite reintentar', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 })
    render(<PointPanel point={point} onClose={() => {}} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin datos de pronóstico')
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/static/meta.json')
        ? { ok: false, status: 404 }
        : { ok: true, json: async () => rawForecast() },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(/consenso de 8 modelos/)).toBeInTheDocument()
    expect(screen.getAllByText('run desconocido')).toHaveLength(8) // sin meta.json no se inventa
  })

  it('funciona con StrictMode (doble montaje) y la caché compartida', async () => {
    // Regresión: la 1.ª consulta se abortaba al desmontar y la caché entregaba esa promesa abortada.
    render(
      <StrictMode>
        <PointPanel point={point} onClose={() => {}} />
      </StrictMode>,
    )
    expect(await screen.findByText(/consenso de 8 modelos/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const forecastCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/v1/forecast'))
    expect(forecastCalls).toHaveLength(1) // la caché evita la petición duplicada
  })

  it('cerrar llama a onClose', () => {
    const onClose = vi.fn()
    render(<PointPanel point={point} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar panel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
