import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGeocodingCache } from '../api/geocoding'
import { PlaceSearch } from './PlaceSearch'

const RESPONSE = {
  results: [
    {
      id: 1,
      name: 'Medellín',
      latitude: 6.245,
      longitude: -75.57151,
      feature_code: 'PPLA',
      country_code: 'CO',
      country: 'Colombia',
      admin1: 'Antioquia',
    },
    {
      id: 2,
      name: 'Medellín',
      latitude: 38.96,
      longitude: -5.95,
      feature_code: 'PPLA3',
      country_code: 'ES',
      country: 'España',
      admin1: 'Extremadura',
    },
  ],
}

describe('PlaceSearch', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    clearGeocodingCache()
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => RESPONSE })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const setup = () => {
    const onSelect = vi.fn()
    render(<PlaceSearch onSelect={onSelect} debounceMs={0} />)
    return { onSelect, input: screen.getByRole('combobox', { name: 'Buscar ciudad o país' }) }
  }

  it('muestra resultados con contexto y la fuente (P2)', async () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'Medellín' } })
    expect(await screen.findAllByRole('option')).toHaveLength(2)
    expect(screen.getByText('Antioquia, Colombia')).toBeInTheDocument()
    expect(screen.getByText(/Fuente: Open-Meteo Geocoding/)).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  it('se maneja con teclado: flechas + Enter eligen', async () => {
    const { input, onSelect } = setup()
    fireEvent.change(input, { target: { value: 'Medellín' } })
    await screen.findAllByRole('option')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ context: 'Extremadura, España' }),
    )
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('clic en un resultado lo elige', async () => {
    const { input, onSelect } = setup()
    fireEvent.change(input, { target: { value: 'Medellín' } })
    fireEvent.click((await screen.findAllByRole('option'))[0])
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ lat: 6.245, kind: 'ciudad' }))
    expect(input).toHaveValue('Medellín')
  })

  it('avisa si no hay resultados', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'zzzz' } })
    expect(await screen.findByText('Sin resultados para “zzzz”.')).toBeInTheDocument()
  })

  it('avisa si la búsqueda falla', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'Cali' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo buscar')
  })

  it('Escape cierra la lista', async () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'Medellín' } })
    await screen.findAllByRole('option')
    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('option')).not.toBeInTheDocument())
  })
})
