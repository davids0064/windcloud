import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CloudPanel } from './CloudPanel'

const frames = [new Date('2026-11-13T12:20:00Z'), new Date('2026-11-13T12:40:00Z')]
const base = {
  kind: 'infrarrojo' as const,
  onKindChange: vi.fn(),
  status: 'ready' as const,
  frames,
  index: 1,
  onIndexChange: vi.fn(),
  playing: false,
  onTogglePlay: vi.fn(),
}

describe('CloudPanel', () => {
  it('rotula el dato como observado y muestra fuente y hora (P2, P3)', () => {
    render(<CloudPanel {...base} />)
    expect(screen.getByText('Observado')).toBeInTheDocument()
    expect(screen.getByText('12:40 UTC')).toBeInTheDocument()
    const source = screen.getByText(/Fuente: NASA GIBS · GOES-East/)
    expect(source.querySelector('time')).toHaveAttribute('dateTime', '2026-11-13T12:40:00.000Z')
    expect(source).toHaveTextContent('imagen 12:40 UTC')
  })

  it('permite cambiar el tipo, reproducir y mover la línea de tiempo', () => {
    render(<CloudPanel {...base} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Visible' }))
    expect(base.onKindChange).toHaveBeenCalledWith('visible')
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir últimas 3 horas' }))
    expect(base.onTogglePlay).toHaveBeenCalled()
    fireEvent.change(screen.getByRole('slider', { name: 'Hora de la imagen' }), {
      target: { value: '0' },
    })
    expect(base.onIndexChange).toHaveBeenCalledWith(0)
  })

  it('si GIBS falla dice "sin datos" en vez de mostrar una imagen vieja (P4)', () => {
    render(<CloudPanel {...base} status="error" frames={[]} index={0} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Sin datos de nubes')
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('apagado no muestra controles de tiempo', () => {
    render(<CloudPanel {...base} kind={null} status="off" frames={[]} index={0} />)
    expect(screen.getByRole('radio', { name: 'Apagado' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })
})
