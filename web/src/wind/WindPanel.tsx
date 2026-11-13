import { useState } from 'react'
import { formatRunUtc } from '../core/runs'
import { DataChip } from '../ui/DataChip'
import { SourceLine } from '../ui/SourceLine'
import { rampGradient, SPEED_MAX_MS } from './colorRamp'
import { runAgeHours, STALE_GRID_HOURS } from './meta'
import type { useWindField } from './useWindField'

type WindState = ReturnType<typeof useWindField>

const fmtValid = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', {
    weekday: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

/** Sección "Viento" de la pestaña Mapa (RF-2): encender/apagar, leyenda, fuente y hora (P2, P4). */
export function WindPanel({
  on,
  onToggle,
  state,
}: {
  on: boolean
  onToggle: (on: boolean) => void
  state: WindState
}) {
  const maxKmh = Math.round(SPEED_MAX_MS['10m'] * 3.6)
  const [now] = useState(() => new Date())
  return (
    <section className="tab-section wind-panel" aria-labelledby="wind-panel-title">
      <div className="wind-panel__head">
        <h2 id="wind-panel-title">Viento a 10 m</h2>
        <DataChip kind="pronostico" />
      </div>
      <label className="wind-panel__toggle">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />{' '}
        Partículas animadas
      </label>
      {on && state.status === 'loading' && <p>Cargando rejilla de viento…</p>}
      {on && state.status === 'error' && (
        <p className="wind-panel__warn" role="alert">
          Sin datos de viento: aún no hay rejillas publicadas ({state.message}).
        </p>
      )}
      {on && state.status === 'ready' && (
        <>
          <div
            className="wind-panel__legend"
            aria-label={`Escala de velocidad de 0 a ${maxKmh} km/h o más`}
          >
            <span className="wind-panel__bar" style={{ background: rampGradient() }} />
            <span className="wind-panel__ticks">
              <span>0</span>
              <span>{Math.round(maxKmh / 2)}</span>
              <span>≥ {maxKmh} km/h</span>
            </span>
          </div>
          <p>
            Válido {fmtValid(state.loaded.meta.validTimes[state.stepIndex])} (hora local). Altura y
            hora elegibles en la siguiente versión.
          </p>
          {runAgeHours(state.loaded.meta, now) > STALE_GRID_HOURS && (
            <p className="wind-panel__warn">
              ⚠ El run tiene más de {STALE_GRID_HOURS} h: puede estar desactualizado.
            </p>
          )}
          <SourceLine
            source={state.loaded.meta.modelLabel}
            time={{
              label: `run ${formatRunUtc(new Date(state.loaded.meta.run))}`,
              dateTime: state.loaded.meta.run,
            }}
          />
        </>
      )}
    </section>
  )
}
