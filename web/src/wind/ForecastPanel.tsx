import { useState } from 'react'
import { formatRunUtc } from '../core/runs'
import {
  legendGradient,
  SCALAR_STYLES,
  tickPosition,
  type ScalarName,
} from '../layers/scalarStyles'
import { DataChip } from '../ui/DataChip'
import { SourceLine } from '../ui/SourceLine'
import { rampGradient, SPEED_MAX_MS } from './colorRamp'
import { runAgeHours, staleHours, type WindLevel } from './meta'
import { LEVEL_LABELS, leadLabel, nowPosition, relativeLabel, validLabel } from './timeline'
import type { GridModel, useForecastGrid } from './useForecastGrid'

type GridState = ReturnType<typeof useForecastGrid>

const LEVELS: WindLevel[] = ['10m', '850', '500']
const SCALAR_OPTIONS: { value: ScalarName | null; label: string }[] = [
  { value: null, label: 'Ninguna' },
  { value: 'gust', label: 'Ráfagas' },
  { value: 'tcc', label: 'Nubes' },
  { value: 'prate', label: 'Lluvia' },
  { value: 't2m', label: 'Temp.' },
]
const num = (x: number) => x.toLocaleString('es-CO', { maximumFractionDigits: 1 })

const MODELS: { value: GridModel; label: string; title: string }[] = [
  { value: 'gfs', label: 'GFS', title: 'GFS 0,25° de NOAA (EE. UU.)' },
  { value: 'ecmwf', label: 'ECMWF', title: 'IFS 0,25° del Centro Europeo (Open Data)' },
]

interface Props {
  model: GridModel
  onModel: (m: GridModel) => void
  state: GridState
  windOn: boolean
  onWindOn: (on: boolean) => void
  scalar: ScalarName | null
  onScalar: (s: ScalarName | null) => void
  isobarsOn: boolean
  onIsobarsOn: (on: boolean) => void
}

/**
 * Capas de pronóstico de la pestaña Mapa (RF-2, RF-4, RF-5): una línea de tiempo común (0–72 h) para el viento,
 * la capa de color y las isobaras, con fuente y run visibles (P2) y aviso de antigüedad (P4).
 */
export function ForecastPanel(props: Props) {
  const { state, windOn, scalar, isobarsOn } = props
  const [now] = useState(() => new Date())
  const anyOn = windOn || scalar !== null || isobarsOn
  const ready = state.status === 'ready' ? state : null
  const level = ready?.level ?? '10m'
  const maxKmh = Math.round(SPEED_MAX_MS[level] * 3.6)
  const scale = ready && scalar ? ready.loaded.meta.scalars[scalar] : null

  return (
    <section className="tab-section forecast-panel" aria-labelledby="forecast-panel-title">
      <div className="wind-panel__head">
        <h2 id="forecast-panel-title">Pronóstico</h2>
        <DataChip kind="pronostico" />
      </div>

      <div className="segmented" role="radiogroup" aria-label="Modelo de pronóstico">
        {MODELS.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={props.model === m.value}
            title={m.title}
            onClick={() => props.onModel(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {anyOn && state.status === 'loading' && <p>Cargando rejillas de pronóstico…</p>}
      {anyOn && state.status === 'error' && (
        <p className="wind-panel__warn" role="alert">
          Sin datos de pronóstico: aún no hay rejillas publicadas ({state.message}).
        </p>
      )}

      {anyOn && ready && (
        <>
          <div className="wind-panel__timeline">
            <button
              type="button"
              className="wind-panel__play"
              onClick={ready.togglePlay}
              aria-label={ready.playing ? 'Pausar' : 'Reproducir las próximas 72 horas'}
            >
              {ready.playing ? '❚❚' : '▶'}
            </button>
            <div className="wind-panel__track">
              <input
                type="range"
                min={0}
                max={ready.loaded.meta.steps.length - 1}
                step={1}
                value={ready.stepIndex}
                onChange={(e) => ready.setStepIndex(Number(e.target.value))}
                aria-label="Hora del pronóstico"
                aria-valuetext={`${validLabel(ready.loaded.meta.validTimes[ready.stepIndex])}, ${leadLabel(
                  ready.loaded.meta.steps[ready.stepIndex],
                )}`}
              />
              {(() => {
                const pos = nowPosition(ready.loaded.meta, now)
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
            <strong>{validLabel(ready.loaded.meta.validTimes[ready.stepIndex])}</strong> ·{' '}
            {relativeLabel(ready.loaded.meta.validTimes[ready.stepIndex], now)} ·{' '}
            {leadLabel(ready.loaded.meta.steps[ready.stepIndex])} del run
          </p>
        </>
      )}

      {/* Viento */}
      <div className="forecast-panel__group">
        <label className="wind-panel__toggle">
          <input
            type="checkbox"
            checked={windOn}
            onChange={(e) => props.onWindOn(e.target.checked)}
          />{' '}
          Viento (partículas)
        </label>
        {windOn && ready && (
          <>
            <div className="segmented" role="radiogroup" aria-label="Altura del viento">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={ready.level === l}
                  title={LEVEL_LABELS[l].long}
                  onClick={() => ready.setLevel(l)}
                >
                  {LEVEL_LABELS[l].short}
                </button>
              ))}
            </div>
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
          </>
        )}
      </div>

      {/* Capa de color */}
      <div className="forecast-panel__group">
        <span className="forecast-panel__label" id="scalar-label">
          Capa de color
        </span>
        <div
          className="segmented segmented--small"
          role="radiogroup"
          aria-labelledby="scalar-label"
        >
          {SCALAR_OPTIONS.map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={scalar === o.value}
              onClick={() => props.onScalar(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        {scalar && scale && (
          <div
            className="wind-panel__legend"
            aria-label={`${SCALAR_STYLES[scalar].label} en ${SCALAR_STYLES[scalar].units}`}
          >
            <span
              className="wind-panel__bar"
              style={{ background: legendGradient(SCALAR_STYLES[scalar], scale) }}
            />
            <span className="forecast-panel__ticks">
              {SCALAR_STYLES[scalar].ticks.map((t) => (
                <span key={t} style={{ left: `${tickPosition(t, scale) * 100}%` }}>
                  {num(t)}
                </span>
              ))}
            </span>
            <span className="forecast-panel__units">
              {SCALAR_STYLES[scalar].label} ({SCALAR_STYLES[scalar].units})
              {SCALAR_STYLES[scalar].note ? ` · ${SCALAR_STYLES[scalar].note}` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Isobaras */}
      <div className="forecast-panel__group">
        <label className="wind-panel__toggle">
          <input
            type="checkbox"
            checked={isobarsOn}
            onChange={(e) => props.onIsobarsOn(e.target.checked)}
          />{' '}
          Isobaras (cada {ready?.loaded.meta.isobars?.every ?? 2} hPa)
        </label>
        {isobarsOn && ready?.loaded.meta.isobars && (
          <p className="forecast-panel__units">{ready.loaded.meta.isobars.note}.</p>
        )}
        {isobarsOn && ready && !ready.loaded.meta.isobars && (
          <p className="wind-panel__warn">Este run no trae presión: isobaras no disponibles.</p>
        )}
      </div>

      {anyOn && ready && (
        <>
          {runAgeHours(ready.loaded.meta, now) > staleHours(ready.loaded.meta.model) && (
            <p className="wind-panel__warn">
              ⚠ El run tiene más de {staleHours(ready.loaded.meta.model)} h: puede estar
              desactualizado.
            </p>
          )}
          <SourceLine
            source={ready.loaded.meta.modelLabel}
            time={{
              label: `run ${formatRunUtc(new Date(ready.loaded.meta.run))}`,
              dateTime: ready.loaded.meta.run,
            }}
          />
        </>
      )}
    </section>
  )
}
