import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LightningPanel } from './LightningPanel'
import { useLightning } from './useLightning'
import { RAYOS } from './fixture'

describe('LightningPanel', () => {
  afterEach(() => vi.useRealTimers())

  it('apagado por defecto: solo la casilla', () => {
    const onToggle = vi.fn()
    render(<LightningPanel on={false} onToggle={onToggle} state={{ status: 'off' }} />)
    expect(screen.getByText('Observado')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Rayos detectados por satélite/ }))
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('cuenta, ventana en hora de Colombia, edad y fuente', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-14T16:50:00Z'))
    render(<LightningPanel on onToggle={() => {}} state={{ status: 'ready', data: RAYOS }} />)
    expect(screen.getByText(/3 descargas/).parentElement).toHaveTextContent(
      /entre las 11:31\s*a\.\s*m\. y las 11:46\s*a\.\s*m\. \(hace 4 min\)/,
    )
    expect(screen.getByText(/Fuente: NOAA GOES-19 GLM/)).toBeInTheDocument()
  })

  it('datos viejos: lo dice y no promete dibujarlos', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-14T18:00:00Z'))
    render(<LightningPanel on onToggle={() => {}} state={{ status: 'ready', data: RAYOS }} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/Sin datos recientes.*hace 74 min/)
  })
})

describe('useLightning', () => {
  afterEach(() => vi.useRealTimers())

  it('carga al encender, refresca y conserva lo anterior si un refresco falla', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const load = vi.fn().mockResolvedValueOnce(RAYOS).mockRejectedValueOnce(new Error('HTTP 503'))
    const { result, rerender } = renderHook(({ on }) => useLightning(on, load, 1000), {
      initialProps: { on: false },
    })
    expect(result.current.status).toBe('off')
    expect(load).not.toHaveBeenCalled()
    rerender({ on: true })
    await act(async () => {})
    expect(result.current.status).toBe('ready')
    await act(async () => vi.advanceTimersByTime(1000))
    expect(load).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('ready')
  })

  it('sin datos previos, un error se muestra', async () => {
    const load = vi.fn().mockRejectedValue(new Error('HTTP 404'))
    const { result } = renderHook(() => useLightning(true, load, 60_000))
    await act(async () => {})
    expect(result.current).toEqual({ status: 'error', message: 'HTTP 404' })
  })
})
