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

  it('clic en el mapa muestra las coordenadas del punto en formato es-CO (RF-1)', async () => {
    render(<App />)
    await act(async () => fireEvent.click(await screen.findByText('mapa simulado')))
    expect(screen.getByText('Punto seleccionado')).toBeInTheDocument()
    expect(screen.getByText('4,711°, -74,072°')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar punto' }))
    expect(screen.queryByText('Punto seleccionado')).not.toBeInTheDocument()
  })

  it('si el clic cae en un departamento, el chip lo nombra (T-11)', async () => {
    render(<App />)
    await act(async () => fireEvent.click(await screen.findByText('clic en Antioquia')))
    expect(screen.getByText('Punto en Antioquia')).toBeInTheDocument()
  })
})
