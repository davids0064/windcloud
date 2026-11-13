import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OFFICIAL_RADARS } from './officialRadars'
import { RadarNotice } from './RadarNotice'

describe('Radar de lluvia (T-37, RF-4)', () => {
  it('dice que no hay radar para Colombia y ofrece alternativas', () => {
    render(<RadarNotice />)
    expect(screen.getByText('No disponible para Colombia.')).toBeInTheDocument()
    expect(screen.getByText(/RainViewer/)).toBeInTheDocument()
    expect(screen.getByText('Lluvia')).toBeInTheDocument()
    expect(screen.getByText('Infrarrojo')).toBeInTheDocument()
  })

  it('enlaza a los radares oficiales (solo enlace, en pestaña nueva)', () => {
    render(<RadarNotice />)
    for (const r of OFFICIAL_RADARS) {
      const link = screen.getByRole('link', { name: r.name })
      expect(link).toHaveAttribute('href', r.url)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })
})
