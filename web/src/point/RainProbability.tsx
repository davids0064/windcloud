import type { EnsembleInfo } from '../api/ensemble'
import { RAIN_DAY_MM } from '../core/probability'
import { formatRunRange, formatRunUtc, runRange } from '../core/runs'
import { DataChip } from '../ui/DataChip'
import { SourceLine } from '../ui/SourceLine'
import { AgreementBadge } from './AgreementBadge'
import { formatPct, type RainDay } from './rain'

interface Props {
  days: RainDay[]
  timezone: string
  runs: Record<string, Date | null>
  ensembles: EnsembleInfo[]
}

/** Barras de probabilidad de lluvia por día y por ensamble (RF-6, diseño §5.4). */
export function RainProbability({ days, timezone, runs, ensembles }: Props) {
  const dayFmt = new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return (
    <section className="rain-prob" aria-labelledby="rain-prob-title">
      <div className="rain-prob__head">
        <h3 id="rain-prob-title">Probabilidad de lluvia (&gt; {RAIN_DAY_MM} mm en el día)</h3>
        <DataChip kind="pronostico" />
      </div>
      <ul className="rain-prob__days">
        {days.map((d, k) => (
          <li key={d.day} className="rain-prob__day">
            <span className="rain-prob__label">
              {k === 0 ? 'Hoy' : dayFmt.format(new Date(`${d.day}T12:00:00Z`))}
              {k === 0 && d.partial && <span className="rain-prob__hint"> resto</span>}
            </span>
            <span className="rain-prob__bars">
              {d.byEnsemble.map(({ ensemble, prob }, i) => (
                <span key={ensemble.apiId} className="rain-prob__bar-row">
                  <span className={`rain-prob__bar rain-prob__bar--${i}`} aria-hidden="true">
                    <span style={{ width: `${(prob?.p ?? 0) * 100}%` }} />
                  </span>
                  <span
                    className="rain-prob__value"
                    title={
                      prob
                        ? `${prob.wet} de ${prob.total} miembros de ${ensemble.label}`
                        : undefined
                    }
                  >
                    {formatPct(prob?.p ?? null)}
                  </span>
                </span>
              ))}
            </span>
            {d.agreement === 'bajo' && (
              <span className="rain-prob__warn" title="Los ensambles discrepan">
                ⚠
              </span>
            )}
          </li>
        ))}
      </ul>
      <ul className="rain-prob__legend">
        {ensembles.map((e, i) => {
          const run = runs[e.apiId]
          return (
            <li key={e.apiId}>
              <span className={`rain-prob__swatch rain-prob__bar--${i}`} aria-hidden="true" />
              {e.label}: {e.members} miembros ·{' '}
              {run ? `run ${formatRunUtc(run)}` : 'run desconocido'}
            </li>
          )
        })}
      </ul>
      {days.some((d) => d.agreement === 'bajo') && (
        <p className="rain-prob__note">
          ⚠ Los dos ensambles discrepan más de 30 puntos: la probabilidad es incierta.{' '}
          <AgreementBadge level="bajo" />
        </p>
      )}
      <p className="rain-prob__note">
        Cada miembro es una versión del modelo con condiciones iniciales levemente distintas; el
        porcentaje es la fracción de miembros que prevén más de {RAIN_DAY_MM} mm ese día (hora local
        de {timezone}).
      </p>
      <SourceLine
        source="Open-Meteo Ensemble API"
        time={{
          label: formatRunRange(ensembles.map((e) => runs[e.apiId] ?? null)),
          dateTime: runRange(ensembles.map((e) => runs[e.apiId] ?? null))?.newest.toISOString(),
        }}
      />
    </section>
  )
}
