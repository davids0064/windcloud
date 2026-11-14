import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AlertBanner, AlertsSection } from './AlertsSection'
import type { AlertsState } from './useAlerts'

const POINT = { lat: 4.61, lon: -74.08, label: 'Bogotá' }
const base = (patch: Partial<AlertsState> = {}): AlertsState => ({
  config: null,
  setConfig: vi.fn(),
  check: null,
  fresh: [],
  dismiss: vi.fn(),
  ...patch,
})
const EX = {
  rule: 'rafaga' as const,
  threshold: 50,
  first: new Date('2026-11-14T20:00:00Z'),
  peak: 62,
  peakAt: new Date('2026-11-14T21:00:00Z'),
}

describe('AlertsSection', () => {
  it('activa alertas para el punto con los umbrales elegidos', () => {
    const alerts = base()
    render(<AlertsSection point={POINT} alerts={alerts} />)
    expect(screen.getByText(/Solo funciona con esta página abierta/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Temperatura/ }))
    fireEvent.change(screen.getByRole('spinbutton', { name: /ráfagas/ }), {
      target: { value: '70' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Activar alertas para este punto' }))
    expect(alerts.setConfig).toHaveBeenCalledWith({
      point: POINT,
      thresholds: { rafaga: 70, lluvia: 10, calor: 32 },
    })
  })

  it('sin reglas no se puede activar; sin punto lo pide', () => {
    render(<AlertsSection point={null} alerts={base()} />)
    expect(screen.getByText('Elige primero un punto en el mapa.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Activar/ })).not.toBeInTheDocument()
  })

  it('muestra lo que se vigila, el resultado y permite desactivar', () => {
    const alerts = base({
      config: { point: POINT, thresholds: { rafaga: 50, lluvia: null, calor: null } },
      check: { at: new Date(), exceedances: [EX] },
    })
    render(<AlertsSection point={POINT} alerts={alerts} />)
    expect(screen.getByText(/Vigilando:/).parentElement).toHaveTextContent(
      'ráfagas de más de 50 km/h',
    )
    expect(screen.getByText(/Ráfagas de hasta 62 km\/h/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar umbrales' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar alertas' }))
    expect(alerts.setConfig).toHaveBeenCalledWith(null)
  })
})

describe('AlertBanner', () => {
  it('aparece con excesos nuevos y se puede cerrar o abrir el pronóstico', () => {
    const alerts = base({
      config: { point: POINT, thresholds: { rafaga: 50, lluvia: null, calor: null } },
      fresh: [EX],
    })
    const onOpen = vi.fn()
    render(<AlertBanner alerts={alerts} onOpen={onOpen} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/Alerta en Bogotá.*no alerta oficial/)
    fireEvent.click(screen.getByRole('button', { name: 'Ver pronóstico' }))
    expect(onOpen).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar alerta' }))
    expect(alerts.dismiss).toHaveBeenCalled()
  })

  it('sin excesos nuevos no aparece', () => {
    const { container } = render(<AlertBanner alerts={base()} onOpen={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
