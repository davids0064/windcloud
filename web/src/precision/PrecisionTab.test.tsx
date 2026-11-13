import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearPrecisionCache } from './data'
import { DETAIL_SKBO, SUMMARY } from './fixture'
import PrecisionTab, { type PrecisionSelection } from './PrecisionTab'
import type { Loadable } from './usePrecision'
import type { PrecisionSummary } from './data'

function Harness({ state }: { state: Loadable<PrecisionSummary> }) {
  const [sel, setSel] = useState<PrecisionSelection>({ win: '7', variable: 'temperatura', lead: 1 })
  const [station, setStation] = useState<string | null>(null)
  return (
    <PrecisionTab
      state={state}
      selection={sel}
      onSelection={setSel}
      station={station}
      onStation={setStation}
    />
  )
}

const ready = { status: 'ready', data: SUMMARY } as const
const bodyRows = () => within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1)

describe('PrecisionTab', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearPrecisionCache()
  })

  it('muestra el ranking regional con fuente, ventana y hora', () => {
    render(<Harness state={ready} />)
    const rows = bodyRows()
    expect(rows).toHaveLength(8)
    expect(rows[0]).toHaveTextContent(/^1 ECMWF IFS1,0-0,5100$/)
    expect(screen.getByText(/ventana 06\/11–12\/11 UTC \(7 días\)/)).toBeInTheDocument()
    expect(screen.getByText(/Fuente: NOAA AWC \(red: METAR\)/)).toBeInTheDocument()
    expect(screen.getByText(/Preliminar: 7 días con datos/)).toBeInTheDocument()
  })

  it('cambia a lluvia (CSI, aciertos, falsas alarmas) y a 30 días', () => {
    render(<Harness state={ready} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Lluvia' }))
    expect(screen.getByRole('columnheader', { name: 'CSI' })).toBeInTheDocument()
    expect(bodyRows()[0]).toHaveTextContent(/0,3067 %67 %2,0×100/)
    expect(screen.getByText(/bloques de 6 h/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '30 días' }))
    expect(screen.getByText(/Preliminar: 2 días con datos de 30/)).toBeInTheDocument()
  })

  it('lista estaciones con su mejor modelo y abre el detalle', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(DETAIL_SKBO))),
    )
    render(<Harness state={ready} />)
    expect(screen.getByRole('button', { name: /SETU.*sin muestra/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /SKBO.*ICON/ }))
    expect(
      await screen.findByRole('heading', { name: 'SKBO · Bogota/El Dorado' }),
    ).toBeInTheDocument()
    expect(await screen.findAllByText('30', { selector: 'td' })).toHaveLength(8)
    expect(bodyRows()[0]).toHaveTextContent(/ECMWF IFS3,0/)
    fireEvent.click(screen.getByRole('button', { name: 'Ver toda la región' }))
    expect(screen.getByRole('heading', { name: 'Ranking en toda la región' })).toBeInTheDocument()
  })

  it('sin datos lo dice y recuerda que el consenso usa pesos iguales', () => {
    render(<Harness state={{ status: 'error', message: 'HTTP 404' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Sin datos de verificación \(HTTP 404\).*pesos iguales/,
    )
  })
})
