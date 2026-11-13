import { useEffect, useState } from 'react'
import { clockParts } from './clockFormat'

/** Reloj UTC / hora local que se actualiza cada 15 s. */
export function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  const { utc, local } = clockParts(now)
  return (
    <p className="clock" aria-label={`Hora: ${utc}, ${local} hora local`}>
      <time dateTime={now.toISOString()}>
        <strong>{utc}</strong> · {local} local
      </time>
    </p>
  )
}
