import { useState } from 'react'
import type { Loadable } from '../precision/usePrecision'
import { SourceLine } from '../ui/SourceLine'
import { FIRE_COLORS, ago, localTime, type Fire, type FiresData, type WindRow } from './data'

const n0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
const utc = (iso: string) => {
  const d = new Date(iso).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)} UTC`
}

/** Focos de calor en la pestaña Riesgo (T-52, RF-11). */
export function FiresSection({
  state,
  on,
  onToggle,
  selected,
  onSelect,
  wind,
}: {
  state: Loadable<FiresData>
  on: boolean
  onToggle: (on: boolean) => void
  selected: number | null
  onSelect: (i: number | null) => void
  wind: Loadable<WindRow[]>
}) {
  const data = state.status === 'ready' ? state.data : null
  const fire = data && selected !== null ? (data.focos[selected] ?? null) : null
  const deps = new Map<string, number>()
  data?.focos.forEach(
    (f) => f.departamento && deps.set(f.departamento, (deps.get(f.departamento) ?? 0) + 1),
  )
  const top = [...deps].sort((a, b) => b[1] - a[1]).slice(0, 6)

  return (
    <section className="risk__fires" aria-labelledby="fires-title">
      <h3 id="fires-title">Focos de calor</h3>
      <label className="risk__toggle">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} /> Ver
        focos detectados por satélite (NASA FIRMS)
      </label>
      {on && state.status === 'loading' && <p className="risk__muted">Cargando focos…</p>}
      {on && state.status === 'error' && (
        <p role="alert">Sin datos de focos de calor ({state.message}).</p>
      )}
      {on && data && (
        <>
          <p>
            <strong>{n0.format(data.focos.length)} focos</strong> en las últimas {data.ventana_h} h
            {top.length > 0 &&
              `: ${top.map(([d, n]) => `${d} (${n})`).join(', ')}${deps.size > top.length ? '…' : ''}`}
            .
          </p>
          <ul className="risk__legend" aria-label="Confianza de la detección">
            {(['alta', 'nominal', 'baja'] as const).map((c) => (
              <li key={c}>
                <span
                  className="risk__dot"
                  style={{ background: FIRE_COLORS[c] }}
                  aria-hidden="true"
                />
                confianza {c}
              </li>
            ))}
          </ul>
          <p className="risk__muted">
            Un foco es un punto caliente visto por el satélite (incendio, quema agrícola,
            industria…), no un incendio confirmado. Toca uno para ver hacia dónde lo empujaría el
            viento.
          </p>
          {fire && <FireDetail fire={fire} wind={wind} onClose={() => onSelect(null)} />}
          {Object.keys(data.fallidos).length > 0 && (
            <p className="risk__muted">Sin datos de: {Object.keys(data.fallidos).join(', ')}.</p>
          )}
          <SourceLine
            source={data.source}
            time={{ label: `actualizado ${utc(data.generatedAt)}`, dateTime: data.generatedAt }}
          />
        </>
      )}
    </section>
  )
}

function FireDetail({
  fire,
  wind,
  onClose,
}: {
  fire: Fire
  wind: Loadable<WindRow[]>
  onClose: () => void
}) {
  const [now] = useState(() => new Date())
  const first = wind.status === 'ready' ? wind.data[0] : null
  return (
    <div className="risk__fire" aria-live="polite">
      <div className="risk__fire-head">
        <strong>Foco en {fire.departamento ?? 'Colombia'}</strong>
        <button type="button" className="risk__close" onClick={onClose} aria-label="Cerrar foco">
          ×
        </button>
      </div>
      <p className="risk__muted">
        {localTime(fire.hora)} ({ago(fire.hora, now)}) · {fire.sensor} · confianza {fire.confianza}
        {fire.frp !== null && ` · potencia ${fire.frp.toLocaleString('es-CO')} MW`} ·{' '}
        {fire.lat.toFixed(3)}°, {fire.lon.toFixed(3)}°
      </p>
      {wind.status === 'loading' && <p className="risk__muted">Consultando el viento…</p>}
      {wind.status === 'error' && <p role="alert">Sin datos de viento ({wind.message}).</p>}
      {first && (
        <p>
          {first.toward === null || (first.speed ?? 0) < 2
            ? 'Ahora casi no hay viento: el fuego no tendría una dirección marcada.'
            : `Con el viento de ahora (${n0.format(first.speed ?? 0)} km/h), el fuego tendería a avanzar hacia ${first.towardName} (flecha en el mapa).`}
        </p>
      )}
      {wind.status === 'ready' && (
        <table className="risk__wind">
          <caption className="risk__muted">Viento del consenso de modelos sobre el foco</caption>
          <thead>
            <tr>
              <th scope="col">Cuándo</th>
              <th scope="col">Empuja hacia</th>
              <th scope="col">Viento</th>
              <th scope="col">Ráfagas</th>
            </tr>
          </thead>
          <tbody>
            {wind.data.map((r) => (
              <tr key={r.label}>
                <th scope="row" title={localTime(r.time)}>
                  {r.label}
                </th>
                <td>
                  {r.toward !== null && (
                    <span
                      className="risk__arrow"
                      style={{ transform: `rotate(${r.toward}deg)` }}
                      aria-hidden="true"
                    >
                      ↑
                    </span>
                  )}{' '}
                  {r.towardName}
                </td>
                <td>{r.speed === null ? '—' : `${n0.format(r.speed)} km/h`}</td>
                <td>{r.gust === null ? '—' : `${n0.format(r.gust)} km/h`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="risk__muted">
        Orientativo: la propagación real depende también del terreno, la vegetación y la humedad. Si
        ves un incendio, llama a la línea de emergencias 123.
      </p>
    </div>
  )
}
