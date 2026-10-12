import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { LumenButton } from '../primitives'
import { LumenInput } from '../forms'
import type { LumenNavbarPopup } from './content'
import { uniqueLumenNavbarItems } from './content'

/** A confirmed trigger-owned overlay; its content remains ordinary flex flow. */
export function NavbarPopup({
  label,
  items,
  children,
  onChoose,
  className,
  selectionId,
  search,
  groups,
  footer,
}: LumenNavbarPopup & {
  readonly children: ReactNode
  readonly onChoose: (id: string) => void
  readonly className?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  useEffect(() => {
    if (!open) return undefined
    root.current?.querySelector<HTMLElement>('input, [role^="menuitem"]')?.focus()
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])
  function close() {
    setOpen(false)
    trigger.current?.focus()
  }
  function option(item: LumenNavbarPopup['items'][number]) {
    return (
      <LumenButton
        className="hbar-app-ui-button lumen-navbar-menu-choice"
        type="button"
        role={selectionId !== undefined && item.id !== 'create' ? 'menuitemradio' : 'menuitem'}
        key={item.id}
        variant="text"
        aria-current={selectionId === item.id ? true : undefined}
        aria-checked={selectionId !== undefined && item.id !== 'create' ? selectionId === item.id : undefined}
        onClick={() => {
          close()
          onChoose(item.id)
        }}
      >
        <strong>{item.label}</strong>
        {item.description && <small>{item.description}</small>}
      </LumenButton>
    )
  }
  return (
    <div
      className={['lumen-navbar-menu-anchor', className].filter(Boolean).join(' ')}
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault()
          close()
        }
        if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        const options = Array.from(root.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])
        if (!options.length) return
        event.preventDefault()
        const current = document.activeElement instanceof HTMLElement ? options.indexOf(document.activeElement) : -1
        const index =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : current < 0
                ? event.key === 'ArrowUp'
                  ? options.length - 1
                  : 0
                : (current + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length
        options[index]?.focus()
      }}
    >
      <LumenButton
        ref={trigger}
        type="button"
        variant="text"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
      >
        {children}
      </LumenButton>
      {open && (
        <div className={`lumen-navbar-menu${groups ? ' is-mega' : ''}`} id={menuId} role="menu" aria-label={label}>
          {search && (
            <LumenInput
              variant="plain"
              type="search"
              aria-label={search.label}
              placeholder={search.label}
              value={search.query}
              onChange={(event) => search.onChange(event.currentTarget.value)}
            />
          )}
          {search && items.length === 0 && <p>{search.empty}</p>}
          {groups ? (
            <div className="lumen-navbar-menu-groups">
              {uniqueLumenNavbarItems(groups).map((group) => (
                <section className="lumen-navbar-menu-group" key={group.id} role="group" aria-label={group.label}>
                  <h3>{group.label}</h3>
                  {uniqueLumenNavbarItems(items)
                    .filter(({ id }) => group.itemIds.includes(id))
                    .map(option)}
                </section>
              ))}
            </div>
          ) : (
            uniqueLumenNavbarItems(items).map(option)
          )}
          {footer && (
            <div className="lumen-navbar-menu-footer">
              <p>{footer.text}</p>
              {option(footer.action)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
