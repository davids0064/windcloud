import { SOURCES } from './sources'

/** Pie con la atribución y licencia de cada fuente (T-64, RF-13). Plegado para no robar espacio al menú. */
export function Attributions() {
  return (
    <footer className="attributions">
      <details>
        <summary>Fuentes y licencias ({SOURCES.length})</summary>
        <ul>
          {SOURCES.map((s) => (
            <li key={s.name}>
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.name}
              </a>{' '}
              — {s.use}. <span className="attributions__license">{s.license}</span>
            </li>
          ))}
        </ul>
        <p>
          WindCloud es un proyecto abierto sin fines de lucro. Los indicadores propios (acuerdo,
          riesgo, precisión) no son pronósticos ni alertas oficiales.
        </p>
      </details>
    </footer>
  )
}
