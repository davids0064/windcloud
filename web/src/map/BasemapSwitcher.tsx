import { BASEMAPS, type BasemapId } from './basemaps'

interface Props {
  value: BasemapId
  onChange: (id: BasemapId) => void
  disabled?: boolean
}

export function BasemapSwitcher({ value, onChange, disabled }: Props) {
  return (
    <fieldset className="basemap-switcher" disabled={disabled}>
      <legend className="visually-hidden">Mapa base</legend>
      {BASEMAPS.map((b) => (
        <label key={b.id} className="basemap-switcher__option" title={b.description}>
          <input
            type="radio"
            name="basemap"
            value={b.id}
            checked={value === b.id}
            onChange={() => onChange(b.id)}
          />
          <span>{b.label}</span>
        </label>
      ))}
    </fieldset>
  )
}
