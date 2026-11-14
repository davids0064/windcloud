import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Attributions } from './Attributions'
import { SOURCES } from './sources'

describe('Attributions (T-64)', () => {
  it('lista cada fuente con su uso, licencia y enlace', () => {
    render(<Attributions />)
    fireEvent.click(screen.getByText(`Fuentes y licencias (${SOURCES.length})`))
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(SOURCES.length)
    for (const s of SOURCES) {
      const link = within(list).getByRole('link', { name: s.name })
      expect(link).toHaveAttribute('href', s.url)
      expect(link.closest('li')).toHaveTextContent(s.license)
    }
    expect(screen.getByText(/no son pronósticos ni alertas oficiales/)).toBeInTheDocument()
  })

  it('cubre todas las fuentes de datos que usa la app', () => {
    const names = SOURCES.map((s) => s.name).join(' | ')
    for (const k of [
      'Open-Meteo',
      'GFS',
      'ECMWF',
      'GIBS',
      'GLM',
      'FIRMS',
      'Aviation',
      'IDEAM',
      'OpenStreetMap',
      'geoBoundaries',
      'EOX',
      'Terrain',
      'GeoNames',
    ]) {
      expect(names).toContain(k)
    }
    expect(SOURCES.every((s) => s.url.startsWith('https://'))).toBe(true)
  })
})
