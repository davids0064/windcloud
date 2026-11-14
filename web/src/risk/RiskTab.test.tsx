import { fireEvent, render, screen } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Loadable } from '../precision/usePrecision'
import { levelsFor, type RiskData } from './data'
import { RISK } from './fixture'
import RiskTab, { type RiskSelection } from './RiskTab'

function Harness({ state }: { state: Loadable<RiskData> }) {
  const [sel, setSel] = useState<RiskSelection>({ view: 'incendio', when: 'max' })
  const levels = useMemo(
    () => (state.status === 'ready' ? levelsFor(state.data, sel.view, sel.when) : null),
    [state, sel],
  )
  return <RiskTab state={state} selection={sel} onSelection={setSel} levels={levels} />
}

describe('RiskTab', () => {
  afterEach(() => vi.useRealTimers())

  it('rotula el indicador como propio y enlaza al IDEAM (RF-10, P3)', () => {
    render(<Harness state={{ status: 'ready', data: RISK }} />)
    expect(screen.getByText('Estimado')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/no una alerta oficial/)
    expect(screen.getByRole('link', { name: 'IDEAM' })).toHaveAttribute(
      'href',
      'https://www.ideam.gov.co/',
    )
    expect(screen.getByText(/Fuente: WindCloud \(indicador propio\) con NOAA/)).toHaveTextContent(
      'run 14/11 12:00 UTC',
    )
  })

  it('resume el peor caso de 72 h y cambia de vista', () => {
    render(<Harness state={{ status: 'ready', data: RISK }} />)
    expect(screen.getByText('1 celda con riesgo de incendio moderado o mayor')).toBeInTheDocument()
    expect(screen.getByText('moderado: 0 · alto: 1 · muy alto: 0')).toBeInTheDocument()
    expect(screen.getByText('La Guajira (1)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Lluvia' }))
    expect(screen.getByText('1 celda con lluvia intensa')).toBeInTheDocument()
    expect(screen.getByText('Cundinamarca (1)')).toBeInTheDocument()
    expect(screen.getByText('> 20 mm en 3 h')).toBeInTheDocument()
  })

  it('por hora empieza en la hora más cercana a ahora y se mueve con el deslizador', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-14T12:40:00Z')) // más cerca del paso 0 (12:00 UTC)
    render(<Harness state={{ status: 'ready', data: RISK }} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Calor' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Una hora' }))
    expect(screen.getByText('Sin calor extremo previsto')).toBeInTheDocument()
    const slider = screen.getByRole('slider', { name: 'Hora del pronóstico de riesgo' })
    fireEvent.change(slider, { target: { value: '1' } })
    expect(screen.getByText('1 celda con calor extremo')).toBeInTheDocument()
    // 15:00 UTC = 10:00 en Colombia
    expect(screen.getByText(/Hora:/)).toHaveTextContent(/10:00\s*a\.\s*m\./)
  })

  it('sin datos lo dice, sin dejar de enlazar al IDEAM', () => {
    render(<Harness state={{ status: 'error', message: 'HTTP 404' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Sin datos de riesgo (HTTP 404)')
    expect(screen.getByRole('link', { name: 'IDEAM' })).toBeInTheDocument()
  })
})
