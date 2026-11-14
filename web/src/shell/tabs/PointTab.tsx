import { AlertsSection } from '../../alerts/AlertsSection'
import type { AlertsState } from '../../alerts/useAlerts'
import type { LatLon } from '../../map/MapView'

const coord = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Pestaña Mi punto (RF-6): el punto elegido y cómo elegir otro. */
export function PointTab({
  point,
  panelOpen,
  onOpenPanel,
  alerts,
}: {
  point: (LatLon & { label?: string }) | null
  panelOpen: boolean
  onOpenPanel: () => void
  alerts?: AlertsState
}) {
  return (
    <section className="tab-section">
      <h2>Mi punto</h2>
      {point ? (
        <>
          <p>
            <strong style={{ color: 'var(--text)' }}>{point.label ?? 'Punto seleccionado'}</strong>
            <br />
            {coord.format(point.lat)}°, {coord.format(point.lon)}°
          </p>
          {!panelOpen && (
            <button type="button" className="locate__btn" onClick={onOpenPanel}>
              Ver pronóstico de este punto
            </button>
          )}
        </>
      ) : (
        <p>Aún no has elegido un punto.</p>
      )}
      <p>
        Para elegir otro: haz clic en el mapa, búscalo arriba o usa «Usar mi ubicación». Verás el
        consenso de 8 modelos, cuánto coinciden y la probabilidad de lluvia de los próximos 7 días.
      </p>
      <p>
        Tu ubicación solo se usa para pedir el pronóstico (redondeada a ~1 km); no se guarda ni se
        comparte con otros servicios.
      </p>
      {alerts && <AlertsSection point={point} alerts={alerts} />}
    </section>
  )
}
