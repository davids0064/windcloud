import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DataChip } from './DataChip'
import { SourceLine } from './SourceLine'

describe('DataChip (P3)', () => {
  it.each([
    ['observado', 'Observado', /medido u observado/],
    ['pronostico', 'Pronóstico', /pronosticado por modelos/],
    ['estimado', 'Estimado', /Indicador propio/],
  ] as const)('%s', (kind, text, title) => {
    render(<DataChip kind={kind} />)
    const chip = screen.getByText(text)
    expect(chip).toHaveClass('chip', `chip--${kind}`)
    expect(chip).toHaveAttribute('title', expect.stringMatching(title))
  })
})

describe('SourceLine (P2)', () => {
  it('muestra fuente, hora en <time> y extra', () => {
    render(
      <SourceLine
        source="NASA GIBS"
        time={{ label: 'imagen 13:10 UTC', dateTime: '2026-11-13T13:10:00.000Z' }}
        extra="consultado 9:05 a. m."
      />,
    )
    const line = screen.getByText(/Fuente: NASA GIBS/)
    expect(line).toHaveTextContent('Fuente: NASA GIBS · imagen 13:10 UTC · consultado 9:05 a. m.')
    expect(line.querySelector('time')).toHaveAttribute('dateTime', '2026-11-13T13:10:00.000Z')
  })

  it('funciona sin hora', () => {
    render(<SourceLine source="Open-Meteo" />)
    expect(screen.getByText('Fuente: Open-Meteo')).toBeInTheDocument()
  })
})
