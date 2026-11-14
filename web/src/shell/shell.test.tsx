import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clockParts } from './clockFormat'
import { geoErrorMessage, locate } from './geolocation'
import { LocateButton } from './LocateButton'
import { TABS } from './menuTabs'
import { SideMenu } from './SideMenu'
import MethodologyTab from './tabs/MethodologyTab'

describe('reloj', () => {
  it('UTC en 24 h y hora local en la zona pedida', () => {
    const now = new Date('2026-11-13T14:42:00Z')
    const { utc, local } = clockParts(now, 'America/Bogota')
    expect(utc).toBe('14:42 UTC')
    expect(local.replace(/\s/g, ' ')).toBe('9:42 a. m.') // Intl usa espacio duro entre «a.» y «m.»
  })
})

describe('geolocalización (RF-6, RNF-8)', () => {
  const geo = (impl: Geolocation['getCurrentPosition']) =>
    ({ getCurrentPosition: impl }) as unknown as Geolocation

  it('resuelve lat/lon/precisión con un tiempo límite', async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({ coords: { latitude: 4.61, longitude: -74.08, accuracy: 25 } } as GeolocationPosition),
    )
    await expect(locate(geo(getCurrentPosition as never))).resolves.toEqual({
      lat: 4.61,
      lon: -74.08,
      accuracy: 25,
    })
    expect((getCurrentPosition.mock.calls[0] as unknown[])[2]).toMatchObject({
      timeout: 10_000,
      enableHighAccuracy: false,
    })
  })

  it('traduce los errores al español', async () => {
    const denied = geo(((_ok: PositionCallback, fail: PositionErrorCallback) =>
      fail({ code: 1 } as GeolocationPositionError)) as never)
    await expect(locate(denied)).rejects.toThrow('No diste permiso')
    await expect(locate(undefined)).rejects.toThrow('no permite obtener la ubicación')
    expect(geoErrorMessage(3)).toMatch(/tardó demasiado/)
    expect(geoErrorMessage(2)).toMatch(/No se pudo determinar/)
  })
})

describe('LocateButton', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('muestra el error si el usuario niega el permiso', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: (_: unknown, fail: PositionErrorCallback) =>
          fail({ code: 1 } as GeolocationPositionError),
      },
    })
    const onLocated = vi.fn()
    render(<LocateButton onLocated={onLocated} />)
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Usar mi ubicación' })),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('No diste permiso')
    expect(onLocated).not.toHaveBeenCalled()
  })

  it('entrega la posición', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: { latitude: 6.25, longitude: -75.56, accuracy: 30 },
          } as GeolocationPosition),
      },
    })
    const onLocated = vi.fn()
    render(<LocateButton onLocated={onLocated} />)
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Usar mi ubicación' })),
    )
    expect(onLocated).toHaveBeenCalledWith({ lat: 6.25, lon: -75.56, accuracy: 30 })
  })
})

describe('SideMenu (RF-13, diseño §9)', () => {
  const setup = (open = true) => {
    const onToggle = vi.fn()
    const onTabChange = vi.fn()
    render(
      <SideMenu
        open={open}
        onToggle={onToggle}
        tab="mapa"
        onTabChange={onTabChange}
        tools={<input aria-label="buscar" />}
      >
        <p>contenido</p>
      </SideMenu>,
    )
    return { onToggle, onTabChange }
  }

  it('tiene las 5 pestañas de RF-13, reloj y estado de conexión', () => {
    setup()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(TABS.map((t) => t.label))
    expect(TABS.map((t) => t.label)).toEqual([
      'Mapa',
      'Mi punto',
      'Precisión',
      'Riesgo',
      'Metodología',
    ])
    expect(screen.getByText(/UTC/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Conectado')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('contenido')
  })

  it('se pliega y despliega con un botón accesible', () => {
    const { onToggle } = setup(true)
    const btn = screen.getByRole('button', { name: 'Ocultar menú' })
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalled()
  })

  it('cerrado oculta el menú y deja el botón para abrirlo', () => {
    setup(false)
    expect(screen.getByRole('button', { name: 'Mostrar menú' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('las pestañas se recorren con flechas, Inicio y Fin', () => {
    const { onTabChange } = setup()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Mapa' }), { key: 'ArrowRight' })
    expect(onTabChange).toHaveBeenCalledWith('punto')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Mapa' }), { key: 'ArrowLeft' })
    expect(onTabChange).toHaveBeenCalledWith('metodologia')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Mapa' }), { key: 'End' })
    expect(onTabChange).toHaveBeenLastCalledWith('metodologia')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Mapa' }), { key: 'Home' })
    expect(onTabChange).toHaveBeenLastCalledWith('mapa')
  })

  it('avisa cuando no hay conexión (P4)', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    setup()
    expect(screen.getByRole('status')).toHaveTextContent('Sin conexión')
    spy.mockRestore()
  })
})

describe('Metodología (T-60)', () => {
  it('muestra los umbrales reales del código, las fórmulas y la transparencia de nubes', () => {
    render(<MethodologyTab />)
    expect(screen.getByText('≤ 1 °C')).toBeInTheDocument()
    expect(screen.getByText('> 8 km/h')).toBeInTheDocument()
    expect(screen.getByText(/ECMWF ENS: 51 · GFS ENS \(GEFS\): 31/)).toBeInTheDocument()
    expect(screen.getByText(/el brillo de cada píxel se convierte en opacidad/)).toBeInTheDocument()
    expect(screen.getByText(/solo para uso no comercial/)).toBeInTheDocument()
    expect(screen.getByText('wᵢ = 1 / (MAEᵢ + 0,1)')).toBeInTheDocument()
    expect(screen.getByText('CSI = a/(a+b+c)')).toBeInTheDocument()
    expect(screen.getByText('FFWI = η·√(1 + U²) / 0,3002')).toBeInTheDocument()
  })

  it('cubre verificación, riesgo, focos, rayos, alertas, limitaciones y referencias con DOI', () => {
    render(<MethodologyTab />)
    const toc = screen.getByRole('navigation', { name: 'Secciones de la metodología' })
    expect(toc.querySelectorAll('a')).toHaveLength(13)
    for (const h of [
      'Precisión verificada',
      'Riesgo meteorológico',
      'Focos de calor',
      'Rayos',
      'Limitaciones',
    ]) {
      expect(screen.getByRole('heading', { level: 3, name: new RegExp(h) })).toBeInTheDocument()
    }
    expect(screen.getByText(/ráfaga > 60 km\/h/)).toBeInTheDocument()
    expect(screen.getByText(/en bloques de 6 h/)).toBeInTheDocument()
    expect(screen.getByText(/menos de 24 pares/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'doi:10.1016/j.atmosres.2013.01.006' }),
    ).toHaveAttribute('href', 'https://doi.org/10.1016/j.atmosres.2013.01.006')
    expect(screen.getByText(/línea de emergencias es el 123/)).toBeInTheDocument()
  })
})
