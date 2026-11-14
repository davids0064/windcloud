import { useEffect, useState } from 'react'
import type { Loadable } from '../precision/usePrecision'
import { DataChip } from '../ui/DataChip'
import { SourceLine } from '../ui/SourceLine'
import { AGE_BINS, MAX_DATA_AGE_MIN, dataAgeMin, localHM, type LightningData } from './data'
import '../clouds/CloudPanel.css'
import './lightning.css'

const n0 = new Intl.NumberFormat('es-CO')

/** Capa de rayos en la pestaña Mapa (T-55, RF-5): observados por satélite, últimos 15 min. */
export function LightningPanel({
  on,
  onToggle,
  state,
}: {
  on: boolean
  onToggle: (on: boolean) => void
  state: Loadable<LightningData>
}) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const data = state.status === 'ready' ? state.data : null
  const lag = data ? dataAgeMin(data, now) : 0
  const stale = data !== null && lag > MAX_DATA_AGE_MIN

  return (
    <section className="cloud-panel" aria-labelledby="lightning-title">
      <header className="cloud-panel__header">
        <h2 id="lightning-title" className="cloud-panel__title">
          Rayos
        </h2>
        <DataChip kind="observado" />
      </header>
      <label className="lightning__toggle">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} /> Rayos
        detectados por satélite (últimos 15 min)
      </label>
      {on && state.status === 'loading' && <p className="lightning__muted">Cargando rayos…</p>}
      {on && state.status === 'error' && <p role="alert">Sin datos de rayos ({state.message}).</p>}
      {on && data && (
        <>
          {stale ? (
            <p role="alert">
              Sin datos recientes: lo último es de las {localHM(data.hasta)} (hace {lag} min). No se
              dibuja.
            </p>
          ) : (
            <p>
              <strong>{n0.format(data.rayos.length)} descargas</strong> entre las{' '}
              {localHM(new Date(Date.parse(data.hasta) - data.minutos * 60_000).toISOString())} y
              las {localHM(data.hasta)} (hace {lag} min).
            </p>
          )}
          <ul className="lightning__legend" aria-label="Antigüedad de los rayos">
            {AGE_BINS.map((b) => (
              <li key={b.label}>
                <span
                  className="lightning__dot"
                  style={{ background: b.color }}
                  aria-hidden="true"
                />
                {b.label}
              </li>
            ))}
          </ul>
          <p className="lightning__muted">
            Se actualiza cada 10 min. El satélite ve rayos dentro de las nubes y a tierra; puede
            fallar alguno pequeño.
            {data.fallidos > 0 && ` Faltan ${data.fallidos} de ${data.archivos} archivos.`}
          </p>
          <SourceLine
            source={data.source}
            time={{
              label: `hasta ${localHM(data.hasta)} (hora de Colombia)`,
              dateTime: data.hasta,
            }}
          />
        </>
      )}
    </section>
  )
}
