/**
 * Accesibilidad (T-61, RNF-7): axe-core sobre cada vista con datos de ejemplo. jsdom no calcula colores, así
 * que el contraste se comprueba aparte (`ui/contrast.test.ts`).
 */
import { act, render } from '@testing-library/react'
import axe from 'axe-core'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AlertBanner, AlertsSection } from './alerts/AlertsSection'
import { FIRES } from './fires/fixture'
import { LightningPanel } from './lightning/LightningPanel'
import { RAYOS } from './lightning/fixture'
import { SUMMARY } from './precision/fixture'
import PrecisionTab from './precision/PrecisionTab'
import { levelsFor } from './risk/data'
import { RISK } from './risk/fixture'
import RiskTab from './risk/RiskTab'
import MethodologyTab from './shell/tabs/MethodologyTab'

vi.mock('./map/MapView', () => ({
  default: () => <div role="region" aria-label="Mapa meteorológico" />,
}))

async function violations(ui: ReactElement) {
  const { container, unmount } = render(<main>{ui}</main>)
  await act(async () => {})
  const res = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  })
  unmount()
  return res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
}

const noop = () => {}
const ALERTS = {
  config: {
    point: { lat: 4.6, lon: -74.1, label: 'Bogotá' },
    thresholds: { rafaga: 50, lluvia: null, calor: null },
  },
  setConfig: noop,
  check: null,
  fresh: [
    { rule: 'rafaga' as const, threshold: 50, first: new Date(), peak: 60, peakAt: new Date() },
  ],
  dismiss: noop,
}

describe('accesibilidad (axe)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, text: async () => '<Domains/>', json: async () => ({}) }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('armazón de la app (menú, pestañas, buscador)', async () => {
    const { container } = render(<App />)
    await act(async () => {})
    const res = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(
      res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    ).toEqual([])
  })

  it('Precisión', async () => {
    expect(
      await violations(
        <PrecisionTab
          state={{ status: 'ready', data: SUMMARY }}
          selection={{ win: '7', variable: 'temperatura', lead: 1, red: 'todas' }}
          onSelection={noop}
          station={null}
          onStation={noop}
        />,
      ),
    ).toEqual([])
  })

  it('Riesgo con focos de calor', async () => {
    expect(
      await violations(
        <RiskTab
          state={{ status: 'ready', data: RISK }}
          selection={{ view: 'incendio', when: 0 }}
          onSelection={noop}
          levels={levelsFor(RISK, 'incendio', 0)}
          fires={{
            state: { status: 'ready', data: FIRES },
            on: true,
            onToggle: noop,
            selected: 0,
            onSelect: noop,
            wind: {
              status: 'ready',
              data: [
                {
                  label: 'Ahora',
                  time: new Date(),
                  speed: 10,
                  gust: 20,
                  from: 45,
                  toward: 225,
                  towardName: 'el sudoeste',
                },
              ],
            },
          }}
        />,
      ),
    ).toEqual([])
  })

  it('Rayos, alertas y Metodología', async () => {
    expect(
      await violations(
        <LightningPanel on onToggle={noop} state={{ status: 'ready', data: RAYOS }} />,
      ),
    ).toEqual([])
    expect(
      await violations(<AlertsSection point={{ lat: 4.6, lon: -74.1 }} alerts={ALERTS} />),
    ).toEqual([])
    expect(await violations(<AlertBanner alerts={ALERTS} onOpen={noop} />)).toEqual([])
    expect(await violations(<MethodologyTab />)).toEqual([])
  })
})
