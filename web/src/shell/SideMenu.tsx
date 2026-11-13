import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Clock } from './Clock'
import { useOnline } from './useOnline'
import './SideMenu.css'
import { TABS, type TabId } from './menuTabs'

interface Props {
  open: boolean
  onToggle: () => void
  tab: TabId
  onTabChange: (tab: TabId) => void
  /** Buscador y "Usar mi ubicación", siempre visibles. */
  tools: ReactNode
  children: ReactNode
}

/** Menú lateral colapsable con pestañas (diseño §9, RNF-4). En móvil es un cajón. */
export function SideMenu({ open, onToggle, tab, onTabChange, tools, children }: Props) {
  const online = useOnline()
  const menuId = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const onTabKey = (e: KeyboardEvent, i: number) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    if (!delta) return
    e.preventDefault()
    const next = (i + delta + TABS.length) % TABS.length
    onTabChange(TABS[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <>
      <button
        type="button"
        className={open ? 'menu-toggle menu-toggle--open' : 'menu-toggle'}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? 'Ocultar menú' : 'Mostrar menú'}
      >
        <span aria-hidden="true">{open ? '‹' : '☰'}</span>
        {!open && <span className="menu-toggle__label">WindCloud</span>}
      </button>

      <nav
        id={menuId}
        className={open ? 'side-menu side-menu--open' : 'side-menu'}
        aria-label="Menú principal"
        hidden={!open}
      >
        <header className="side-menu__header">
          <div className="side-menu__brand">
            <h1 className="side-menu__title">WindCloud</h1>
            <span className="side-menu__tagline">Observatorio meteorológico abierto</span>
          </div>
          <div className="side-menu__status">
            <Clock />
            <span className={online ? 'conn conn--on' : 'conn conn--off'} role="status">
              <span aria-hidden="true">●</span>{' '}
              {online ? 'Conectado' : 'Sin conexión: los datos pueden estar desactualizados'}
            </span>
          </div>
        </header>

        <div className="side-menu__tools">{tools}</div>

        <div className="side-menu__tabs" role="tablist" aria-label="Secciones">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => onTabChange(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          className="side-menu__content"
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
        >
          {children}
        </div>
      </nav>
    </>
  )
}
