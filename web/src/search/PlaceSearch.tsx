import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { flagEmoji, GEOCODING_SOURCE, searchPlaces, type Place } from '../api/geocoding'
import './PlaceSearch.css'

interface Props {
  onSelect: (place: Place) => void
  debounceMs?: number
}

type Status = 'idle' | 'loading' | 'done' | 'error'

const KIND_LABEL: Record<Place['kind'], string> = {
  pais: 'País',
  region: 'Región',
  ciudad: 'Ciudad',
  lugar: 'Lugar',
}

/** Buscador de ciudad o país (patrón combobox ARIA). → RF-13, RF-6 */
export function PlaceSearch({ onSelect, debounceMs = 300 }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return // con menos de 2 letras no se busca (la lista se oculta al renderizar)
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setStatus('loading')
      try {
        const places = await searchPlaces(q, controller.signal)
        setResults(places)
        setActive(places.length ? 0 : -1)
        setStatus('done')
      } catch {
        if (!controller.signal.aborted) setStatus('error')
      }
    }, debounceMs)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, debounceMs])

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  const choose = (place: Place) => {
    onSelect(place)
    setQuery(place.name)
    setOpen(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && results[active]) {
        e.preventDefault()
        choose(results[active])
      }
    } else if (e.key === 'Escape') {
      if (open) setOpen(false)
      else setQuery('')
    }
  }

  const searchable = query.trim().length >= 2
  const showPanel = open && searchable && status !== 'idle'
  const optionId = (i: number) => `${listId}-op-${i}`

  return (
    <div className="place-search" ref={rootRef}>
      <svg className="place-search__icon" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="m13 13 4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        className="place-search__input"
        placeholder="Buscar ciudad o país"
        aria-label="Buscar ciudad o país"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-activedescendant={showPanel && active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {showPanel && (
        <div className="place-search__panel">
          {status === 'loading' && results.length === 0 && (
            <p className="place-search__msg">Buscando…</p>
          )}
          {status === 'error' && (
            <p className="place-search__msg" role="alert">
              No se pudo buscar. Revisa tu conexión e inténtalo de nuevo.
            </p>
          )}
          {status === 'done' && results.length === 0 && (
            <p className="place-search__msg">Sin resultados para “{query.trim()}”.</p>
          )}
          <ul id={listId} role="listbox" aria-label="Resultados" className="place-search__list">
            {results.map((p, i) => (
              <li
                key={p.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                className="place-search__option"
                onPointerEnter={() => setActive(i)}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
              >
                <span className="place-search__flag" aria-hidden="true">
                  {flagEmoji(p.countryCode)}
                </span>
                <span className="place-search__text">
                  <span className="place-search__name">{p.name}</span>
                  {p.context && <span className="place-search__context">{p.context}</span>}
                </span>
                <span className="place-search__kind">{KIND_LABEL[p.kind]}</span>
              </li>
            ))}
          </ul>
          {results.length > 0 && <p className="place-search__source">Fuente: {GEOCODING_SOURCE}</p>}
        </div>
      )}
    </div>
  )
}
