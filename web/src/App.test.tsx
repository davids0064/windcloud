import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import type { LatLon } from './map/MapView'

// MapLibre necesita WebGL (no existe en jsdom): se sustituye por un botón que simula el clic.
vi.mock('./map/MapView', () => ({
  default: ({ onSelectPoint }: { onSelectPoint: (p: LatLon) => void }) => (
    <button type="button" onClick={() => onSelectPoint({ lat: 4.711, lon: -74.0721 })}>
      mapa simulado
    </button>
  ),
}))

describe('App', () => {
  it('muestra el nombre del proyecto', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'WindCloud' })).toBeInTheDocument()
    expect(await screen.findByText('mapa simulado')).toBeInTheDocument()
  })

  it('clic en el mapa muestra las coordenadas del punto en formato es-CO (RF-1)', async () => {
    render(<App />)
    await act(async () => fireEvent.click(await screen.findByText('mapa simulado')))
    expect(screen.getByText(/Punto: 4,711°, -74,072°/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar punto' }))
    expect(screen.queryByText(/Punto:/)).not.toBeInTheDocument()
  })
})
