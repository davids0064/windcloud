import type { ReactNode } from 'react'
import type { BasemapId } from '../../map/basemaps'
import { BasemapSwitcher } from '../../map/BasemapSwitcher'

/** Pestaña Mapa: mapa base y capas (RF-1, RF-3). Las capas de viento y lluvia llegan en la fase 2. */
export function MapTab({
  basemap,
  onBasemapChange,
  clouds,
}: {
  basemap: BasemapId
  onBasemapChange: (b: BasemapId) => void
  clouds: ReactNode
}) {
  return (
    <>
      <section className="tab-section">
        <h2>Mapa base</h2>
        <BasemapSwitcher value={basemap} onChange={onBasemapChange} />
      </section>
      {clouds}
      <p>
        Haz clic en cualquier punto del mapa, busca un lugar o usa tu ubicación para ver qué dicen
        todos los modelos. Capas de viento animado, ráfagas y lluvia: fase 2.
      </p>
    </>
  )
}
