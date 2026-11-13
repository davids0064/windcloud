import { fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearOpenMeteoCache } from '../api/openMeteo'
import { MODELS } from '../core/models'
import PointPanel from './PointPanel'

const ensembleBody = (wetEcmwf: number, wetGefs: number) => {
  // 51 y 31 miembros con 48 h; los primeros `wet*` llueven 1 mm/h, el resto nada.
  const hourly: Record<string, unknown> = { time }
  for (let m = 0; m < 51; m++) {
    const k =
      m === 0
        ? 'precipitation_ecmwf_ifs025_ensemble'
        : `precipitation_member${String(m).padStart(2, '0')}_ecmwf_ifs025_ensemble`
    hourly[k] = time.map(() => (m < wetEcmwf ? 1 : 0))
  }
  for (let m = 0; m < 31; m++) {
    const k =
      m === 0
        ? 'precipitation_ncep_gefs025'
        : `precipitation_member${String(m).padStart(2, '0')}_ncep_gefs025`
    hourly[k] = time.map(() => (m < wetGefs ? 1 : 0))
  }
  return { timezone: 'America/Bogota', utc_offset_seconds: -18000, hourly }
}

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
          : url.includes('ensemble-api')
            ? { ok: true, json: async () => ensembleBody(30, 31) }
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
    const header = screen.getByRole('heading', { name: 'Bogotá, Colombia' }).closest('header')!
    expect(within(header).getByText('Pronóstico')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Bogotá, Colombia' })).toBeInTheDocument()
    expect(screen.getByText('15,4')).toBeInTheDocument() // media de 15,0…15,7
    expect(screen.getByText(/del SE/)).toBeInTheDocument()
    expect(screen.getByText(/2\.586 m/)).toBeInTheDocument()
    expect(screen.getAllByText('Acuerdo alto').length).toBeGreaterThanOrEqual(3)
  })

  it('avisa cuando los modelos no coinciden (RF-8)', async () => {
    render(<PointPanel point={point} onClose={() => {}} />)
    await screen.findByText(/consenso de 8 modelos/)
    // Tarjeta de ráfagas (26–66 km/h): acuerdo bajo con su aviso.
    const gusts = screen.getByRole('heading', { name: 'Ráfagas' }).closest('article')!
    expect(within(gusts).getByText('Acuerdo bajo')).toBeInTheDocument()
    expect(
      within(gusts).getByText('Los modelos no coinciden: pronóstico incierto.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Modelos: 26–66 (6)')).toBeInTheDocument() // 2 modelos sin ráfagas
  })

  it('lista cada modelo con la hora de su run y explica los pesos (P2, RF-7)', async () => {
    render(<PointPanel point={point} onClose={() => {}} />)
    await screen.findByText(/consenso de 8 modelos/)
    const list = screen
      .getByRole('heading', { name: 'Modelos y hora de su run' })
      .closest('section')!
    expect(within(list).getAllByText('run 13/11, 06:00 UTC')).toHaveLength(8)
    expect(screen.getByText('¿Por qué este número?')).toBeInTheDocument()
    expect(screen.getByText(/todos los modelos pesan igual/)).toBeInTheDocument()
    expect(screen.getAllByText(/Fuente: Open-Meteo/).length).toBeGreaterThanOrEqual(3) // tarjetas, gráfica, ensambles
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
    const list = screen
      .getByRole('heading', { name: 'Modelos y hora de su run' })
      .closest('section')!
    expect(within(list).getAllByText('run desconocido')).toHaveLength(8) // sin meta.json no se inventa
    expect(screen.getAllByText('runs desconocidos').length).toBeGreaterThan(0)
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

  it('muestra la probabilidad de lluvia por ensamble y avisa si discrepan (T-23)', async () => {
    render(<PointPanel point={point} onClose={() => {}} />)
    expect(await screen.findByText('Probabilidad de lluvia (> 1 mm en el día)')).toBeInTheDocument()
    expect(screen.getByText('59–100 %')).toBeInTheDocument() // 30/51 ECMWF, 31/31 GEFS
    expect(screen.getByText('ECMWF 30/51 · GFS 31/31')).toBeInTheDocument()
    expect(screen.getByText('Los ensambles no coinciden.')).toBeInTheDocument()
    expect(screen.getByText(/ECMWF ENS: 51 miembros · run 13\/11, 06:00 UTC/)).toBeInTheDocument()
    expect(screen.getByText('Hoy')).toBeInTheDocument()
  })

  it('si fallan los ensambles, el resto del panel sigue y lo dice', async () => {
    fetchMock.mockImplementation(
      realisticFetch((url) =>
        url.includes('ensemble-api')
          ? { ok: false, status: 503 }
          : url.includes('/static/meta.json')
            ? { ok: false, status: 404 }
            : { ok: true, json: async () => rawForecast() },
      ),
    )
    render(<PointPanel point={point} onClose={() => {}} />)
    expect(await screen.findByText(/consenso de 8 modelos/)).toBeInTheDocument()
    expect(await screen.findByText(/Sin datos de probabilidad de lluvia/)).toBeInTheDocument()
    expect(screen.getByText('Sin datos de ensambles.')).toBeInTheDocument()
  })

  it('rotula cada dato y muestra fuente + hora junto a él (T-24: P2, P3, RNF-9)', async () => {
    render(<PointPanel point={point} onClose={() => {}} />)
    await screen.findByText(/consenso de 8 modelos/)
    // Fuente + runs junto a las tarjetas, con <time> legible por máquinas
    const sources = screen.getAllByText(/Fuente: Open-Meteo Forecast API/)
    expect(sources.length).toBeGreaterThanOrEqual(2) // tarjetas y gráfica
    const time = sources[0].querySelector('time')!
    expect(time).toHaveTextContent('run 13/11, 06:00 UTC')
    expect(time).toHaveAttribute('dateTime', '2026-11-13T06:00:00.000Z')
    // El acuerdo es un indicador propio: rotulado "Estimado"
    const estimated = screen.getByText('Estimado')
    expect(estimated).toHaveAttribute('title', expect.stringMatching(/Indicador propio/))
    // Probabilidad por ensamble: rotulada pronóstico y con su fuente
    const rain = (await screen.findByRole('heading', { name: /Probabilidad de lluvia/ })).closest(
      'section',
    )!
    expect(within(rain).getByText('Pronóstico')).toBeInTheDocument()
    expect(within(rain).getByText(/Fuente: Open-Meteo Ensemble API/)).toBeInTheDocument()
  })

  it('marca un modelo con run de más de un día como atrasado (P4)', async () => {
    const old = Math.floor(Date.now() / 1000) - 50 * 3600 // hace 50 h
    fetchMock.mockImplementation(
      realisticFetch((url) =>
        url.includes('/static/meta.json')
          ? {
              ok: true,
              json: async () => ({
                last_run_initialisation_time: url.includes('cmc_gem')
                  ? old
                  : Math.floor(Date.now() / 1000) - 6 * 3600,
              }),
            }
          : url.includes('ensemble-api')
            ? { ok: true, json: async () => ensembleBody(30, 31) }
            : { ok: true, json: async () => rawForecast() },
      ),
    )
    render(<PointPanel point={point} onClose={() => {}} />)
    await screen.findByText(/consenso de 8 modelos/)
    expect(await screen.findByText(/⚠ atrasado/)).toBeInTheDocument()
    expect(screen.getAllByText(/⚠ atrasado/)).toHaveLength(1)
    expect(screen.getByText(/GEM: su último run tiene más de un día/)).toBeInTheDocument()
  })

  it('cerrar llama a onClose', () => {
    const onClose = vi.fn()
    render(<PointPanel point={point} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar panel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
