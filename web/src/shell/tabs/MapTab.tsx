import type { ReactNode } from 'react'
import type { BasemapId } from '../../map/basemaps'
import { BasemapSwitcher } from '../../map/BasemapSwitcher'

/** Pestaña Mapa: mapa base y capas (RF-1, RF-2, RF-3). */
export function MapTab({
  basemap,
  onBasemapChange,
  clouds,
  wind,
}: {
  basemap: BasemapId
  onBasemapChange: (b: BasemapId) => void
  clouds: ReactNode
  wind: ReactNode
}) {
  return (
    <>
      <section className="tab-section">
        <h2>Mapa base</h2>
        <BasemapSwitcher value={basemap} onChange={onBasemapChange} />
      </section>
      {wind}
      {clouds}
      <p>
        Haz clic en cualquier punto del mapa, busca un lugar o usa tu ubicación para ver qué dicen
        todos los modelos. Ráfagas, lluvia y nubosidad pronosticadas: próximas versiones.
      </p>
    </>
  )
}
