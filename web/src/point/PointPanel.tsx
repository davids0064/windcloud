import { lazy, Suspense, useMemo, useState } from 'react'
import { OPEN_METEO_SOURCE } from '../api/openMeteo'
import { LOW_AGREEMENT_WARNING } from '../core/agreement'
import { MODELS } from '../core/models'
import { LABELS, UNITS, type VariableId } from '../core/variables'
import type { LatLon } from '../map/MapView'
import { AgreementBadge } from './AgreementBadge'
import { modelColor } from './colors'
import { cardinal, cardNow, currentIndex, formatValue, rainNext24h, type CardData } from './summary'
import { usePointForecast } from './usePointForecast'
import './PointPanel.css'

// uPlot solo se descarga al abrir el panel (RNF-2).
const ModelChart = lazy(() => import('./ModelChart').then((m) => ({ default: m.ModelChart })))

interface Props {
  point: LatLon & { label?: string }
  onClose: () => void
}

const CHART_VARIABLES: VariableId[] = [
  'temperature_2m',
  'wind_speed_10m',
  'wind_gusts_10m',
  'cloud_cover',
  'precipitation',
]

const coordFmt = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const runFmt = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
})

/** Panel de punto multi-modelo (RF-6, RF-7, RF-8). Datos rotulados como "Pronóstico" (P3). */
export default function PointPanel({ point, onClose }: Props) {
  const { status, data, error, retry } = usePointForecast(point)
  const [variable, setVariable] = useState<VariableId>('temperature_2m')
  const [now] = useState(() => new Date())

  const view = useMemo(() => {
    if (!data) return null
    const { forecast, consensus } = data
    const i = currentIndex(forecast.times, now)
    const hourFmt = new Intl.DateTimeFormat('es-CO', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: forecast.timezone,
    })
    const cards: CardData[] = [
      cardNow(forecast, consensus, 'temperature_2m', i),
      cardNow(forecast, consensus, 'wind_speed_10m', i),
      cardNow(forecast, consensus, 'wind_gusts_10m', i),
      cardNow(forecast, consensus, 'cloud_cover', i),
      rainNext24h(forecast, consensus, i),
    ]
    return {
      i,
      cards,
      hour: hourFmt.format(forecast.times[i]),
      direction: consensus.wind_direction_10m[i],
    }
  }, [data, now])

  return (
    <aside className="point-panel" aria-labelledby="point-panel-title">
      <header className="point-panel__header">
        <div>
          <span className="chip chip--forecast">Pronóstico</span>
          <h2 id="point-panel-title" className="point-panel__title">
            {point.label ?? 'Punto seleccionado'}
          </h2>
          <p className="point-panel__coords">
            {coordFmt.format(point.lat)}°, {coordFmt.format(point.lon)}°
            {data &&
              ` · ${data.forecast.point.elevation.toLocaleString('es-CO')} m (altura del modelo)`}
          </p>
        </div>
        <button
          type="button"
          className="point-panel__close"
          onClick={onClose}
          aria-label="Cerrar panel"
        >
          ×
        </button>
      </header>

      {status === 'loading' && (
        <p className="point-panel__msg" role="status">
          Consultando {MODELS.length} modelos…
        </p>
      )}

      {status === 'error' && (
        <div className="point-panel__msg point-panel__msg--warn" role="alert">
          <p>Sin datos de pronóstico: Open-Meteo no respondió ({error}).</p>
          <button type="button" onClick={retry}>
            Reintentar
          </button>
        </div>
      )}

      {data && view && (
        <div className="point-panel__body">
          <p className="point-panel__when">
            Ahora ({view.hour} hora local) · consenso de {data.consensus.count[view.i]} modelos
          </p>
          <div className="point-panel__cards">
            {view.cards.map((c) => (
              <article
                key={`${c.variable}-${c.period}`}
                className={`card card--${c.level ?? 'na'}`}
              >
                <h3 className="card__label">
                  {LABELS[c.variable]}
                  {c.period === '24h' && <span className="card__period"> · próx. 24 h</span>}
                </h3>
                <p className="card__value">
                  {formatValue(c.variable, c.value)}
                  <span className="card__unit"> {UNITS[c.variable]}</span>
                  {c.variable === 'wind_speed_10m' && (
                    <span className="card__dir" title="Dirección de donde viene el viento">
                      {view.direction !== null && (
                        <span
                          className="card__arrow"
                          style={{ transform: `rotate(${view.direction + 180}deg)` }}
                          aria-hidden="true"
                        >
                          ↑
                        </span>
                      )}{' '}
                      del {cardinal(view.direction)}
                    </span>
                  )}
                </p>
                <p className="card__range">
                  {c.n >= 2
                    ? `Modelos: ${formatValue(c.variable, c.min)}–${formatValue(c.variable, c.max)} (${c.n})`
                    : `Solo ${c.n} modelo con dato`}
                </p>
                <AgreementBadge level={c.level} />
                {c.level === 'bajo' && <p className="card__warn">{LOW_AGREEMENT_WARNING}</p>}
              </article>
            ))}
          </div>

          <section className="point-panel__chart">
            <div className="point-panel__chart-head">
              <h3>Próximos 7 días</h3>
              <div className="tabs" role="tablist" aria-label="Variable de la gráfica">
                {CHART_VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={variable === v}
                    onClick={() => setVariable(v)}
                  >
                    {LABELS[v]}
                  </button>
                ))}
              </div>
            </div>
            <Suspense fallback={<p className="point-panel__msg">Cargando gráfica…</p>}>
              <ModelChart
                forecast={data.forecast}
                consensus={data.consensus}
                variable={variable}
                nowIndex={view.i}
              />
            </Suspense>
            <p className="point-panel__note">
              Línea blanca: consenso · banda: rango entre modelos · línea punteada: ahora. Toca un
              modelo en la leyenda para ocultarlo.
            </p>
          </section>

          <section className="point-panel__models">
            <h3>Modelos y hora de su run</h3>
            <ul>
              {data.forecast.models.map((m, k) => {
                const run = data.runs[m.model.apiId]
                return (
                  <li key={m.model.apiId}>
                    <span
                      className="swatch"
                      style={{ background: modelColor(k) }}
                      aria-hidden="true"
                    />
                    <span className="point-panel__model-name">{m.model.label}</span>
                    <span className="point-panel__model-org">{m.model.org}</span>
                    <span className="point-panel__model-run">
                      {run ? `run ${runFmt.format(run)} UTC` : 'run desconocido'}
                    </span>
                  </li>
                )
              })}
            </ul>
            {data.forecast.excluded.length > 0 && (
              <p className="point-panel__note">
                No incluidos aquí:{' '}
                {data.forecast.excluded
                  .map((e) =>
                    e.reason === 'duplicado'
                      ? `${e.model.label} (repite a ${e.of})`
                      : `${e.model.label} (sin cobertura)`,
                  )
                  .join(', ')}
                .
              </p>
            )}
          </section>

          <details className="point-panel__why">
            <summary>¿Por qué este número?</summary>
            <p>{data.weights.reason}</p>
            <p>
              Temperatura, viento, ráfagas y nubosidad: promedio de los modelos con dato en esa
              hora. Lluvia: mediana (un modelo que exagera no la dispara). Dirección del viento:
              promedio de componentes, no de grados. Acuerdo: dispersión entre modelos (umbrales en
              la página de Metodología).
            </p>
          </details>

          <p className="point-panel__source">
            Fuente: {OPEN_METEO_SOURCE} · consultado{' '}
            {data.forecast.fetchedAt.toLocaleTimeString('es-CO', {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </div>
      )}
    </aside>
  )
}
