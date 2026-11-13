import { useEffect, useState } from 'react'
import { CLOUD_LAYERS, GIBS_SOURCE, type CloudKind } from '../api/gibs'
import { formatAge, formatLocal, formatUtc, isStale } from './time'
import type { CloudStatus } from './useCloudAnimation'
import './CloudPanel.css'

interface Props {
  kind: CloudKind | null
  onKindChange: (kind: CloudKind | null) => void
  status: CloudStatus
  frames: Date[]
  index: number
  onIndexChange: (i: number) => void
  playing: boolean
  onTogglePlay: () => void
}

const OPTIONS: { value: CloudKind | null; label: string }[] = [
  { value: null, label: 'Apagado' },
  { value: 'visible', label: CLOUD_LAYERS.visible.label },
  { value: 'infrarrojo', label: CLOUD_LAYERS.infrarrojo.label },
]

/** Panel de la capa de nubes observadas (RF-3). Muestra fuente, hora y antigüedad (P2, P4). */
export function CloudPanel(props: Props) {
  const { kind, status, frames, index } = props
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const frame = frames[index]
  const latest = frames[frames.length - 1]

  return (
    <section className="cloud-panel" aria-labelledby="cloud-panel-title">
      <header className="cloud-panel__header">
        <h2 id="cloud-panel-title" className="cloud-panel__title">
          Nubes
        </h2>
        <span className="chip chip--observed">Observado</span>
      </header>

      <div
        className="cloud-panel__segmented"
        role="radiogroup"
        aria-label="Tipo de imagen de nubes"
      >
        {OPTIONS.map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={kind === o.value}
            className="cloud-panel__seg"
            onClick={() => props.onKindChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>

      {status === 'loading' && <p className="cloud-panel__msg">Buscando imágenes recientes…</p>}
      {status === 'error' && (
        <p className="cloud-panel__msg cloud-panel__msg--warn" role="alert">
          Sin datos de nubes: NASA GIBS no respondió. No se muestra ninguna imagen vieja.
        </p>
      )}

      {status === 'ready' && frame && (
        <>
          <div className="cloud-panel__timeline">
            <button
              type="button"
              className="cloud-panel__play"
              onClick={props.onTogglePlay}
              aria-label={props.playing ? 'Pausar animación' : 'Reproducir últimas 3 horas'}
            >
              {props.playing ? '❚❚' : '▶'}
            </button>
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              step={1}
              value={index}
              onChange={(e) => props.onIndexChange(Number(e.target.value))}
              aria-label="Hora de la imagen"
              aria-valuetext={`${formatUtc(frame)}, ${formatAge(frame, now)}`}
            />
          </div>
          <p className="cloud-panel__time">
            <strong>{formatUtc(frame)}</strong> · {formatLocal(frame)} hora local ·{' '}
            {formatAge(frame, now)}
          </p>
          {latest && isStale(latest, now) && (
            <p className="cloud-panel__msg cloud-panel__msg--warn">
              Imagen atrasada: la más reciente es de {formatAge(latest, now)}.
            </p>
          )}
          {kind && <p className="cloud-panel__desc">{CLOUD_LAYERS[kind].description}</p>}
          <p className="cloud-panel__source">Fuente: {GIBS_SOURCE}</p>
        </>
      )}
    </section>
  )
}
