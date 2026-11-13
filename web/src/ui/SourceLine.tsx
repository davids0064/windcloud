/**
 * "Fuente + hora" de un dato visible (constitución P2, RNF-9). La hora va en un <time> legible por máquinas.
 */
interface Props {
  source: string
  /** Texto de la hora ya formateado (p. ej. "run 13/11 06:00 UTC"); `dateTime` para el atributo. */
  time?: { label: string; dateTime?: string }
  /** Texto adicional al final. */
  extra?: string
  className?: string
}

export function SourceLine({ source, time, extra, className }: Props) {
  return (
    <p className={className ? `source-line ${className}` : 'source-line'}>
      Fuente: {source}
      {time && (
        <>
          {' · '}
          <time dateTime={time.dateTime}>{time.label}</time>
        </>
      )}
      {extra && ` · ${extra}`}
    </p>
  )
}
