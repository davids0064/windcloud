import { lazy, Suspense, useMemo, useState } from 'react'
import { ENSEMBLES } from '../api/ensemble'
import { OPEN_METEO_SOURCE } from '../api/openMeteo'
import { LOW_AGREEMENT_WARNING } from '../core/agreement'
import { formatRunRange, formatRunUtc, isRunStale, runRange } from '../core/runs'
import { MODELS } from '../core/models'
import { officialNetworkAt } from '../data/cityNetworks'
import { normalizedWeights, type ConsensusWeights } from '../core/verifiedWeights'
import { LABELS, UNITS, type VariableId } from '../core/variables'
import type { LatLon } from '../map/MapView'
import { DataChip } from '../ui/DataChip'
import { SourceLine } from '../ui/SourceLine'
import { AgreementBadge } from './AgreementBadge'
import { modelColor } from './colors'
import { cardinal, cardNow, currentIndex, formatValue, rainNext24h, type CardData } from './summary'
import { formatPct, rainDays } from './rain'
import { RainProbability } from './RainProbability'
import { usePointEnsemble } from './usePointEnsemble'
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

/** Panel de punto multi-modelo (RF-6, RF-7, RF-8). Datos rotulados como "Pronóstico" (P3). */
export default function PointPanel({ point, onClose }: Props) {
  const { status, data, error, retry } = usePointForecast(point)
  const ensemble = usePointEnsemble(point)
  const [variable, setVariable] = useState<VariableId>('temperature_2m')
  const [now] = useState(() => new Date())
  const network = officialNetworkAt(point.lat, point.lon)

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

  const rain = useMemo(
    () => (ensemble.data ? rainDays(ensemble.data, now) : null),
    [ensemble.data, now],
  )
  const today = rain?.[0]

  // Fuente + hora de los datos del panel (P2): rango de runs de los modelos usados.
  const runList = data ? data.forecast.models.map((m) => data.runs[m.model.apiId] ?? null) : []
  const modelRuns = {
    label: formatRunRange(runList),
    newest: runRange(runList)?.newest.toISOString(),
  }
  const fetchedLabel = data
    ? data.forecast.fetchedAt.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
    : ''
  const staleModels = data
    ? data.forecast.models.filter((m) => isRunStale(data.runs[m.model.apiId] ?? null, now))
    : []

  return (
    <aside className="point-panel" aria-labelledby="point-panel-title">
      <header className="point-panel__header">
        <div>
          <DataChip kind="pronostico" />
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

      {network && (
        <p className="point-panel__network">
          <DataChip kind="observado" />{' '}
          <a href={network.url} target="_blank" rel="noopener noreferrer">
            Red oficial de lluvias de {network.ciudad}: ver en vivo →
          </a>
          <span className="point-panel__network-op">
            {network.red} · {network.operador} (sitio externo)
          </span>
        </p>
      )}

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
            {data.weights.weighted && ' · ponderado por precisión'}
          </p>
          <SourceLine
            source="Open-Meteo Forecast API"
            time={{ label: modelRuns.label, dateTime: modelRuns.newest }}
            extra={`consultado ${fetchedLabel}`}
          />
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
            <article className={`card card--${today?.agreement ?? 'na'}`}>
              <h3 className="card__label">
                Prob. de lluvia<span className="card__period"> · resto de hoy</span>
              </h3>
              {ensemble.status === 'loading' && (
                <p className="card__range">Consultando ensambles…</p>
              )}
              {ensemble.status === 'error' && <p className="card__warn">Sin datos de ensambles.</p>}
              {today && (
                <>
                  <p className="card__value">
                    {(() => {
                      const ps = today.byEnsemble
                        .map((b) => b.prob?.p)
                        .filter((p): p is number => p != null)
                      if (!ps.length) return '—'
                      const lo = Math.min(...ps)
                      const hi = Math.max(...ps)
                      return lo === hi ? formatPct(lo) : `${Math.round(lo * 100)}–${formatPct(hi)}`
                    })()}
                  </p>
                  <p className="card__range">
                    {today.byEnsemble
                      .map(
                        (b) =>
                          `${b.ensemble.label.split(' ')[0]} ${b.prob ? `${b.prob.wet}/${b.prob.total}` : '—'}`,
                      )
                      .join(' · ')}
                  </p>
                  <AgreementBadge level={today.agreement} />
                  {today.agreement === 'bajo' && (
                    <p className="card__warn">Los ensambles no coinciden.</p>
                  )}
                </>
              )}
            </article>
          </div>

          <p className="point-panel__estimated">
            <DataChip kind="estimado" /> El <strong>acuerdo</strong> es un indicador propio de
            WindCloud (dispersión entre modelos); no es un pronóstico oficial.
          </p>

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
            <SourceLine
              source="Open-Meteo Forecast API"
              time={{ label: modelRuns.label, dateTime: modelRuns.newest }}
            />
          </section>

          {rain && ensemble.data && (
            <RainProbability
              days={rain}
              timezone={ensemble.data.timezone}
              runs={ensemble.runs}
              ensembles={ensemble.data.ensembles.map((e) => e.ensemble)}
            />
          )}
          {ensemble.status === 'error' && (
            <p className="point-panel__msg point-panel__msg--warn">
              Sin datos de probabilidad de lluvia: Open-Meteo Ensemble no respondió.
            </p>
          )}

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
                    <span
                      className={
                        isRunStale(run, now)
                          ? 'point-panel__model-run point-panel__model-run--stale'
                          : 'point-panel__model-run'
                      }
                    >
                      {run ? `run ${formatRunUtc(run)}` : 'run desconocido'}
                      {isRunStale(run, now) && ' ⚠ atrasado'}
                    </span>
                  </li>
                )
              })}
            </ul>
            {staleModels.length > 0 && (
              <p className="point-panel__note point-panel__note--warn">
                ⚠ {staleModels.map((m) => m.model.label).join(', ')}: su último run tiene más de un
                día. Se incluye en el consenso, pero puede estar desactualizado.
              </p>
            )}
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
            {data.weights.weighted && (
              <WeightsTable
                weights={data.weights}
                models={data.forecast.models.map((m) => m.model)}
              />
            )}
            <p>
              Temperatura, viento, ráfagas y nubosidad: promedio
              {data.weights.weighted ? ' ponderado' : ''} de los modelos con dato en esa hora.
              Lluvia: mediana (un modelo que exagera no la dispara). Dirección del viento: promedio
              de componentes, no de grados. Acuerdo: dispersión entre modelos (umbrales en la página
              de Metodología).
            </p>
          </details>

          <p className="point-panel__source">
            Fuente: {OPEN_METEO_SOURCE} (Forecast y Ensemble API, {ENSEMBLES.length} ensambles) ·
            consultado{' '}
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

const pct = (x: number) => `${Math.round(x * 100)} %`

/** Peso de cada modelo en temperatura y viento (RF-7: «¿Por qué este número?» con los pesos usados). */
function WeightsTable({
  weights,
  models,
}: {
  weights: ConsensusWeights
  models: { apiId: string; label: string }[]
}) {
  const ids = models.map((m) => m.apiId)
  const t = weights.byVariable.temperature_2m
  const w = weights.byVariable.wind_speed_10m
  const tn = t ? normalizedWeights(t, ids) : null
  const wn = w ? normalizedWeights(w, ids) : null
  const igual = pct(1 / ids.length)
  return (
    <table className="point-panel__weights">
      <caption>Peso de cada modelo (igual sería {igual})</caption>
      <thead>
        <tr>
          <th scope="col">Modelo</th>
          <th scope="col">Temperatura</th>
          <th scope="col">Viento</th>
        </tr>
      </thead>
      <tbody>
        {models.map((m) => (
          <tr key={m.apiId}>
            <td>{m.label}</td>
            <td>{tn ? pct(tn[m.apiId]) : igual}</td>
            <td>{wn ? pct(wn[m.apiId]) : igual}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
