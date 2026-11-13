import type { ReactNode } from 'react'
import type { BasemapId } from '../../map/basemaps'
import { BasemapSwitcher } from '../../map/BasemapSwitcher'
import { RadarNotice } from './RadarNotice'

/** Pestaña Mapa: mapa base y capas (RF-1 a RF-5). */
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
      <RadarNotice />
      <p>
        Haz clic en cualquier punto del mapa, busca un lugar o usa tu ubicación para ver qué dicen
        todos los modelos en ese punto.
      </p>
    </>
  )
}
