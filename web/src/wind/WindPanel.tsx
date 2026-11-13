import { useState } from 'react'
import { formatRunUtc } from '../core/runs'
import { DataChip } from '../ui/DataChip'
import { SourceLine } from '../ui/SourceLine'
import { rampGradient, SPEED_MAX_MS } from './colorRamp'
import { runAgeHours, STALE_GRID_HOURS, type WindLevel } from './meta'
import { LEVEL_LABELS, leadLabel, nowPosition, relativeLabel, validLabel } from './timeline'
import type { useWindField } from './useWindField'

type WindState = ReturnType<typeof useWindField>

const LEVELS: WindLevel[] = ['10m', '850', '500']

/** Sección "Viento" de la pestaña Mapa (RF-2): modelo, altura, hora (0–72 h), leyenda, fuente y run (P2, P4). */
export function WindPanel({
  on,
  onToggle,
  state,
}: {
  on: boolean
  onToggle: (on: boolean) => void
  state: WindState
}) {
  const [now] = useState(() => new Date())
  const level = state.status === 'ready' ? state.level : '10m'
  const maxKmh = Math.round(SPEED_MAX_MS[level] * 3.6)

  return (
    <section className="tab-section wind-panel" aria-labelledby="wind-panel-title">
      <div className="wind-panel__head">
        <h2 id="wind-panel-title">Viento</h2>
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
          <p className="wind-panel__model">
            Modelo: <strong>{state.loaded.meta.modelLabel}</strong> · ECMWF llegará en una próxima
            versión
          </p>

          <div className="segmented" role="radiogroup" aria-label="Altura del viento">
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={state.level === l}
                title={LEVEL_LABELS[l].long}
                onClick={() => state.setLevel(l)}
              >
                {LEVEL_LABELS[l].short}
              </button>
            ))}
          </div>

          <div className="wind-panel__timeline">
            <button
              type="button"
              className="wind-panel__play"
              onClick={state.togglePlay}
              aria-label={state.playing ? 'Pausar' : 'Reproducir las próximas 72 horas'}
            >
              {state.playing ? '❚❚' : '▶'}
            </button>
            <div className="wind-panel__track">
              <input
                type="range"
                min={0}
                max={state.loaded.meta.steps.length - 1}
                step={1}
                value={state.stepIndex}
                onChange={(e) => state.setStepIndex(Number(e.target.value))}
                aria-label="Hora del pronóstico de viento"
                aria-valuetext={`${validLabel(state.loaded.meta.validTimes[state.stepIndex])}, ${leadLabel(
                  state.loaded.meta.steps[state.stepIndex],
                )}`}
              />
              {(() => {
                const pos = nowPosition(state.loaded.meta, now)
                return pos === null ? null : (
                  <span
                    className="wind-panel__now"
                    style={{ left: `${pos * 100}%` }}
                    title="Ahora"
                  />
                )
              })()}
            </div>
          </div>
          <p className="wind-panel__when">
            <strong>{validLabel(state.loaded.meta.validTimes[state.stepIndex])}</strong> ·{' '}
            {relativeLabel(state.loaded.meta.validTimes[state.stepIndex], now)} ·{' '}
            {leadLabel(state.loaded.meta.steps[state.stepIndex])} del run
          </p>

          <div
            className="wind-panel__legend"
            aria-label={`${LEVEL_LABELS[level].long}: escala de 0 a ${maxKmh} km/h o más`}
          >
            <span className="wind-panel__bar" style={{ background: rampGradient() }} />
            <span className="wind-panel__ticks">
              <span>0</span>
              <span>{Math.round(maxKmh / 2)}</span>
              <span>≥ {maxKmh} km/h</span>
            </span>
          </div>

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
