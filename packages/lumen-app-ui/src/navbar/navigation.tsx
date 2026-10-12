import { useRef, useState, type ReactNode } from 'react'
import { LumenButton } from '../primitives'
import type { LumenNavbarChoice, LumenNavbarNavigation, LumenNavbarPopup } from './content'
import { uniqueLumenNavbarItems } from './content'

/** A bounded, host-described navigation drawer shared by narrow header compositions. */
export function NavbarNavigationOwner({
  navigation,
  items,
  menus,
  onChoose,
  children,
}: {
  readonly navigation?: LumenNavbarNavigation | undefined
  readonly items: readonly LumenNavbarChoice[]
  readonly menus?: readonly (LumenNavbarPopup & { readonly id: string })[] | undefined
  readonly onChoose: (id: string, menuId?: string) => void
  readonly children: (state: { readonly open: boolean; readonly toggle: () => void }) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({})
  const owner = useRef<HTMLDivElement>(null)
  const content = children({ open, toggle: () => setOpen(!open) })
  function close() {
    setOpen(false)
    owner.current?.querySelector<HTMLElement>('[data-navbar-navigation-trigger]')?.focus()
  }
  if (!navigation) return content
  return (
    <div
      className="lumen-navbar-drawer-anchor"
      ref={owner}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.preventDefault()
          close()
        }
      }}
    >
      {content}
      {open && (
        <div className="lumen-navbar-drawer-layer">
          <LumenButton className="lumen-navbar-drawer-backdrop" aria-label={navigation.close} onClick={close} />
          <aside className="lumen-navbar-drawer-panel" role="dialog" aria-modal="true" aria-label={navigation.label}>
            <header>
              <h2>{navigation.title}</h2>
              <LumenButton className="hbar-app-ui-button" autoFocus onClick={close}>
                {navigation.close}
              </LumenButton>
            </header>
            <nav aria-label={navigation.label}>
              {uniqueLumenNavbarItems(items).map((item) => {
                const menu = menus?.find((entry) => entry.label === item.label)
                return menu ? (
                  <div key={item.id} data-expanded={expandedMenus[menu.id] ?? menu.id === menus?.[0]?.id}>
                    <LumenButton
                      type="button"
                      variant="text"
                      aria-expanded={expandedMenus[menu.id] ?? menu.id === menus?.[0]?.id}
                      onClick={() =>
                        setExpandedMenus((current) => ({
                          ...current,
                          [menu.id]: !(current[menu.id] ?? menu.id === menus?.[0]?.id),
                        }))
                      }
                    >
                      {item.label}
                    </LumenButton>
                    {(expandedMenus[menu.id] ?? menu.id === menus?.[0]?.id) &&
                      uniqueLumenNavbarItems(menu.items).map((option) => (
                        <LumenButton
                          className="hbar-app-ui-button"
                          key={option.id}
                          onClick={() => {
                            close()
                            onChoose(option.id, menu.id)
                          }}
                        >
                          {option.label}
                        </LumenButton>
                      ))}
                  </div>
                ) : (
                  <LumenButton
                    className="hbar-app-ui-button"
                    key={item.id}
                    onClick={() => {
                      close()
                      onChoose(item.id)
                    }}
                  >
                    {item.label}
                  </LumenButton>
                )
              })}
            </nav>
          </aside>
        </div>
      )}
    </div>
  )
}
