import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FiresSection } from './FiresSection'
import { FIRES } from './fixture'
import type { WindRow } from './data'

const t = new Date('2026-11-14T16:00:00Z')
const WIND: WindRow[] = [
  {
    label: 'Ahora',
    time: t,
    speed: 14,
    gust: 30,
    from: 45,
    toward: 225,
    towardName: 'el sudoeste',
  },
  { label: 'En 6 h', time: t, speed: 8, gust: 20, from: 90, toward: 270, towardName: 'el oeste' },
]
const props = (patch = {}) => ({
  state: { status: 'ready' as const, data: FIRES },
  on: true,
  onToggle: vi.fn(),
  selected: null,
  onSelect: vi.fn(),
  wind: { status: 'off' as const },
  ...patch,
})

describe('FiresSection', () => {
  it('resume focos por departamento con fuente, hora y aviso de qué es un foco', () => {
    render(<FiresSection {...props()} />)
    expect(screen.getByText(/3 focos/).parentElement).toHaveTextContent(
      '3 focos en las últimas 48 h: Meta (2), Casanare (1).',
    )
    expect(screen.getByText(/no un\s+incendio confirmado/)).toBeInTheDocument()
    expect(screen.getByText(/Fuente: NASA FIRMS/)).toHaveTextContent('actualizado 14/11 16:30 UTC')
  })

  it('el foco elegido dice hacia dónde lo empujaría el viento', () => {
    render(<FiresSection {...props({ selected: 0, wind: { status: 'ready', data: WIND } })} />)
    expect(screen.getByText('Foco en Casanare')).toBeInTheDocument()
    expect(
      screen.getByText(/VIIRS NOAA-20 · confianza alta · potencia 12,7 MW/),
    ).toBeInTheDocument()
    expect(screen.getByText(/tendería a avanzar hacia el sudoeste/)).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent('En 6 h')
    expect(screen.getByText(/línea de emergencias 123/)).toBeInTheDocument()
  })

  it('sin viento casi no hay dirección; se puede cerrar el foco y apagar la capa', () => {
    const p = props({
      selected: 1,
      wind: { status: 'ready', data: [{ ...WIND[0], speed: 1 }] },
    })
    render(<FiresSection {...p} />)
    expect(screen.getByText(/casi no hay viento/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar foco' }))
    expect(p.onSelect).toHaveBeenCalledWith(null)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(p.onToggle).toHaveBeenCalledWith(false)
  })

  it('sin datos lo dice', () => {
    render(<FiresSection {...props({ state: { status: 'error', message: 'HTTP 404' } })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Sin datos de focos de calor (HTTP 404)')
  })
})
