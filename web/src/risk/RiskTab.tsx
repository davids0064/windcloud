import type { Loadable } from '../precision/usePrecision'
import { DataChip } from '../ui/DataChip'
import { Segmented } from '../ui/Segmented'
import { SourceLine } from '../ui/SourceLine'
import {
  RISK_COLORS,
  RISK_VIEWS,
  localLabel,
  nearestStep,
  summarize,
  utcLabel,
  type RiskData,
  type RiskView,
  type RiskWhen,
} from './data'
import './risk.css'

export interface RiskSelection {
  view: RiskView
  when: RiskWhen
}

interface Props {
  state: Loadable<RiskData>
  selection: RiskSelection
  onSelection: (s: RiskSelection) => void
  /** Niveles ya calculados por App para el mapa (se reutilizan para el resumen). */
  levels: number[] | null
}

const IDEAM_ALERTS = 'https://www.ideam.gov.co/'

/** Pestaña Riesgo (T-51, RF-10): indicador propio por celda, con aviso y enlace a las alertas oficiales. */
export default function RiskTab({ state, selection, onSelection, levels }: Props) {
  const official = state.status === 'ready' ? state.data.oficial : IDEAM_ALERTS
  const header = (
    <>
      <header className="risk__head">
        <h2>Riesgo meteorológico</h2>
        <DataChip kind="estimado" />
      </header>
      <p className="risk__notice" role="note">
        <strong>Indicador propio de WindCloud, no una alerta oficial.</strong> Para alertas y avisos
        oficiales consulta el{' '}
        <a href={official} target="_blank" rel="noopener noreferrer">
          IDEAM
        </a>
        .
      </p>
    </>
  )
  if (state.status === 'off' || state.status === 'loading') {
    return (
      <section className="tab-section risk">
        {header}
        <p>Cargando el riesgo…</p>
      </section>
    )
  }
  if (state.status === 'error') {
    return (
      <section className="tab-section risk">
        {header}
        <p role="alert">Sin datos de riesgo ({state.message}).</p>
      </section>
    )
  }
  const data = state.data
  const { view, when } = selection
  const set = (patch: Partial<RiskSelection>) => onSelection({ ...selection, ...patch })
  const summary = levels ? summarize(data, levels) : null
  const last = data.pasos.length - 1
  const stepIndex = when === 'max' ? null : when
  const u = data.umbrales
  const period =
    when === 'max'
      ? `${localLabel(data.pasos[0].valid)} – ${localLabel(data.pasos[last].valid)}`
      : localLabel(data.pasos[when].valid)

  return (
    <section className="tab-section risk">
      {header}

      <div className="risk__controls">
        <Segmented
          label="Qué ver"
          value={view}
          options={RISK_VIEWS}
          onChange={(v) => set({ view: v })}
        />
        <Segmented
          label="Cuándo"
          value={when === 'max' ? 'max' : 'hora'}
          options={[
            { id: 'max', label: 'Peor de 72 h' },
            { id: 'hora', label: 'Una hora' },
          ]}
          onChange={(v) => set({ when: v === 'max' ? 'max' : nearestStep(data, new Date()) })}
        />
        {stepIndex !== null && (
          <label className="risk__slider">
            <span className="seg-field__label">
              Hora: <strong>{localLabel(data.pasos[stepIndex].valid)}</strong> (hora de Colombia)
            </span>
            <input
              type="range"
              min={0}
              max={last}
              value={stepIndex}
              aria-label="Hora del pronóstico de riesgo"
              aria-valuetext={localLabel(data.pasos[stepIndex].valid)}
              onChange={(e) => set({ when: Number(e.target.value) })}
            />
          </label>
        )}
      </div>

      <Legend data={data} view={view} />

      {summary && (
        <div className="risk__summary" aria-live="polite">
          <p>
            <strong>{summaryTitle(view, summary.cells)}</strong>{' '}
            <span className="risk__muted">({period})</span>
          </p>
          {view === 'incendio' && summary.cells > 0 && (
            <p className="risk__muted">
              {u.ffwi_clases
                .slice(1)
                .map((c, k) => `${c.clase}: ${summary.byLevel[k + 1] ?? 0}`)
                .join(' · ')}
            </p>
          )}
          {summary.departments.length > 0 && (
            <p>
              {summary.departments
                .slice(0, 8)
                .map((d) => `${d.name} (${d.cells})`)
                .join(', ')}
              {summary.departments.length > 8 && ` y ${summary.departments.length - 8} más`}
            </p>
          )}
          <p className="risk__muted">
            Celdas de 0,25° (≈ 28 × 28 km). Pasa el cursor por una para ver sus valores.
          </p>
        </div>
      )}

      <details className="risk__help">
        <summary>¿Cómo se calcula?</summary>
        <ul>
          <li>
            <strong>Incendio:</strong> índice de Fosberg (0–100) con temperatura, humedad relativa y
            viento. Solo mira el tiempo de esa hora: no sabe cuántos días lleva sin llover ni qué
            tan seca está la vegetación, así que en temporada seca puede quedarse corto.
          </li>
          <li>
            <strong>Viento:</strong> ráfagas de más de {u.rafaga_kmh} km/h.
          </li>
          <li>
            <strong>Lluvia:</strong> más de {u.lluvia_mm_3h} mm en 3 horas (la primera hora del run
            no tiene acumulado).
          </li>
          <li>
            <strong>Calor:</strong> más de {u.calor_c} °C a 2 m del suelo.
          </li>
        </ul>
        <p>
          Todo sale de un solo modelo (GFS, celdas de 0,25°): no ve tormentas locales ni
          microclimas. Úsalo como orientación, no para decisiones de seguridad.
        </p>
      </details>

      <SourceLine
        source={`${data.source}`}
        time={{ label: `run ${utcLabel(data.run)}`, dateTime: data.run }}
        extra="pasos cada 3 h hasta 72 h"
      />
    </section>
  )
}

function summaryTitle(view: RiskView, cells: number): string {
  if (cells === 0) {
    return {
      incendio: 'Sin celdas con riesgo de incendio moderado o mayor',
      viento: 'Sin ráfagas fuertes previstas',
      lluvia: 'Sin lluvia intensa prevista',
      calor: 'Sin calor extremo previsto',
    }[view]
  }
  const what = {
    incendio: 'con riesgo de incendio moderado o mayor',
    viento: 'con ráfagas fuertes',
    lluvia: 'con lluvia intensa',
    calor: 'con calor extremo',
  }[view]
  return `${cells.toLocaleString('es-CO')} ${cells === 1 ? 'celda' : 'celdas'} ${what}`
}

function Legend({ data, view }: { data: RiskData; view: RiskView }) {
  const u = data.umbrales
  const items =
    view === 'incendio'
      ? u.ffwi_clases.slice(1).map((c, k) => ({
          color: RISK_COLORS.incendio[k + 1],
          label: `${c.clase} (≥ ${c.desde})`,
        }))
      : [
          {
            color: RISK_COLORS[view][1],
            label: {
              viento: `ráfaga > ${u.rafaga_kmh} km/h`,
              lluvia: `> ${u.lluvia_mm_3h} mm en 3 h`,
              calor: `> ${u.calor_c} °C`,
            }[view],
          },
        ]
  return (
    <ul className="risk__legend" aria-label="Leyenda del mapa de riesgo">
      {items.map((it) => (
        <li key={it.label}>
          <span className="risk__swatch" style={{ background: it.color }} aria-hidden="true" />
          {it.label}
        </li>
      ))}
    </ul>
  )
}
