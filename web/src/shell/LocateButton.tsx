import { useState } from 'react'
import { locate, type Located } from './geolocation'

interface Props {
  onLocated: (where: Located) => void
}

/** Botón "Usar mi ubicación" con estados de espera y error (RF-6). */
export function LocateButton({ onLocated }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      onLocated(await locate())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="locate">
      <button type="button" className="locate__btn" onClick={run} disabled={busy}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="3" fill="currentColor" />
          <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 1v3M10 16v3M1 10h3M16 10h3" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        {busy ? 'Buscando tu ubicación…' : 'Usar mi ubicación'}
      </button>
      {error && (
        <p className="locate__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
