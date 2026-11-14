import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlerts } from './useAlerts'

const NOW = Date.parse('2026-11-14T15:00:00Z')
const times = Array.from({ length: 30 }, (_, i) => new Date(NOW + i * 3_600_000))

function loader(gustAt3h: number) {
  return vi.fn(async () => ({
    forecast: { times },
    consensus: { wind_gusts_10m: times.map((_, i) => (i === 3 ? gustAt3h : 20)) },
  })) as never
}

const POINT = { lat: 4.61, lon: -74.08, label: 'Bogotá' }
const CONFIG = { point: POINT, thresholds: { rafaga: 50, lluvia: null, calor: null } }

describe('useAlerts', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('sin configuración no revisa nada', () => {
    const load = loader(80)
    const { result } = renderHook(() => useAlerts(load))
    expect(result.current.config).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it('avisa una sola vez por exceso, guarda la configuración y revisa cada intervalo', async () => {
    const notify = vi.fn()
    vi.stubGlobal(
      'Notification',
      Object.assign(notify, { permission: 'granted', requestPermission: vi.fn() }),
    )
    const load = loader(80)
    const { result } = renderHook(() => useAlerts(load, 1000))
    await act(async () => result.current.setConfig(CONFIG))
    expect(result.current.check?.exceedances).toHaveLength(1)
    expect(result.current.fresh).toHaveLength(1)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toBe('WindCloud · alerta en Bogotá')
    expect(JSON.parse(localStorage.getItem('wc-alertas-v1')!).config.point.label).toBe('Bogotá')

    act(() => result.current.dismiss())
    await act(async () => vi.advanceTimersByTime(1000))
    expect(load).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenCalledTimes(1) // ya avisado: no se repite
    expect(result.current.fresh).toHaveLength(0)
    expect(result.current.check?.exceedances).toHaveLength(1)
  })

  it('sin permiso del navegador queda el aviso en la página; un error se muestra', async () => {
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'denied' }))
    const load = loader(80)
    const { result } = renderHook(() => useAlerts(load, 1000))
    await act(async () => result.current.setConfig(CONFIG))
    expect(result.current.fresh).toHaveLength(1)

    const failing = vi.fn(async () => {
      throw new Error('HTTP 503')
    }) as never
    const r2 = renderHook(() => useAlerts(failing, 1000))
    await act(async () => {})
    expect(r2.result.current.config).not.toBeNull() // configuración guardada
    expect(r2.result.current.check?.error).toBe('HTTP 503')
  })

  it('desactivar borra la configuración', async () => {
    const load = loader(10)
    const { result } = renderHook(() => useAlerts(load, 1000))
    await act(async () => result.current.setConfig(CONFIG))
    expect(result.current.check?.exceedances).toEqual([])
    act(() => result.current.setConfig(null))
    expect(JSON.parse(localStorage.getItem('wc-alertas-v1')!).config).toBeNull()
  })
})
