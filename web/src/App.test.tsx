import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { ClickedPoint } from './map/MapView'

// MapLibre necesita WebGL (no existe en jsdom): se sustituye por un botón que simula el clic.
vi.mock('./map/MapView', () => ({
  default: ({ onSelectPoint }: { onSelectPoint: (p: ClickedPoint) => void }) => (
    <>
      <button type="button" onClick={() => onSelectPoint({ lat: 4.711, lon: -74.0721 })}>
        mapa simulado
      </button>
      <button
        type="button"
        onClick={() => onSelectPoint({ lat: 6.25, lon: -75.56, departamento: 'Antioquia' })}
      >
        clic en Antioquia
      </button>
    </>
  ),
}))

// El panel de punto se prueba aparte (PointPanel.test.tsx); aquí solo importa qué punto recibe.
vi.mock('./point/PointPanel', () => ({
  default: ({
    point,
    onClose,
  }: {
    point: { lat: number; lon: number; label?: string }
    onClose: () => void
  }) => (
    <aside>
      <h2>{point.label ?? 'Punto seleccionado'}</h2>
      <p>
        {point.lat}, {point.lon}
      </p>
      <button type="button" onClick={onClose} aria-label="Cerrar panel">
        ×
      </button>
    </aside>
  ),
}))

describe('App', () => {
  // El panel de nubes consulta GIBS al iniciar: sin red en pruebas.
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '<Domains/>' }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('muestra el nombre del proyecto', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'WindCloud' })).toBeInTheDocument()
    expect(await screen.findByText('mapa simulado')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Buscar ciudad o país' })).toBeInTheDocument()
  })

  it('clic en el mapa abre el panel de punto para esas coordenadas (RF-1 → RF-6)', async () => {
    render(<App />)
    await act(async () => fireEvent.click(await screen.findByText('mapa simulado')))
    expect(await screen.findByRole('heading', { name: 'Punto seleccionado' })).toBeInTheDocument()
    expect(screen.getByText('4.711, -74.0721')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar panel' }))
    expect(screen.queryByRole('heading', { name: 'Punto seleccionado' })).not.toBeInTheDocument()
  })

  it('si el clic cae en un departamento, el chip lo nombra (T-11)', async () => {
    render(<App />)
    await act(async () => fireEvent.click(await screen.findByText('clic en Antioquia')))
    expect(await screen.findByRole('heading', { name: 'Punto en Antioquia' })).toBeInTheDocument()
  })

  it('«Usar mi ubicación» abre el panel en tu posición (RF-6)', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      onLine: true,
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: { latitude: 3.45, longitude: -76.53, accuracy: 20 },
          } as GeolocationPosition),
      },
    })
    render(<App />)
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Usar mi ubicación' })),
    )
    expect(await screen.findByRole('heading', { name: 'Mi ubicación' })).toBeInTheDocument()
    expect(screen.getByText('3.45, -76.53')).toBeInTheDocument()
  })

  it('las pestañas cambian el contenido y cerrar el panel conserva el punto en «Mi punto»', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Mapa base' })).toBeInTheDocument()
    await act(async () => fireEvent.click(await screen.findByText('clic en Antioquia')))
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar panel' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Mi punto' }))
    expect(screen.getByText('Punto en Antioquia')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver pronóstico de este punto' }))
    expect(await screen.findByRole('heading', { name: 'Punto en Antioquia' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Riesgo' }))
    expect(await screen.findByText(/no una alerta oficial/)).toBeInTheDocument()
  })
})
