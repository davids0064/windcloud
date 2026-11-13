/**
 * Radar de lluvia (T-37, RF-4): no hay radar gratuito con cobertura en Colombia. Se dice, se ofrecen las
 * alternativas disponibles y se enlaza a los radares oficiales locales (solo enlace: sus datos no tienen API
 * abierta confirmada, ver T-46).
 *
 * Evaluado el 2026-11-13: la API gratuita de RainViewer (uso personal/educativo, zoom máx. 7, 100 pet./min/IP)
 * no cubre Bogotá, Medellín, Cali, Barranquilla, Cartagena, Bucaramanga, Cúcuta, Pereira, Villavicencio ni San
 * Andrés según su propia máscara de cobertura (solo Leticia, por un radar de Brasil).
 */
import { OFFICIAL_RADARS } from './officialRadars'

export function RadarNotice() {
  return (
    <section className="tab-section radar-notice" aria-labelledby="radar-title">
      <h2 id="radar-title">Radar de lluvia</h2>
      <p>
        <strong className="radar-notice__status">No disponible para Colombia.</strong> El único
        radar mundial gratuito (RainViewer) no tiene hoy cobertura sobre las ciudades colombianas.
      </p>
      <p>
        Mientras tanto: la capa <em>Lluvia</em> del pronóstico (modelo GFS) y las nubes en{' '}
        <em>Infrarrojo</em>, donde los colores marcan tormentas.
      </p>
      <p>Radares oficiales locales:</p>
      <ul>
        {OFFICIAL_RADARS.map((r) => (
          <li key={r.url}>
            {r.city}:{' '}
            <a href={r.url} target="_blank" rel="noopener noreferrer">
              {r.name}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
