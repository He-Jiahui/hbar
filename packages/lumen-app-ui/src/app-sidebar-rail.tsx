'use client'

import * as React from 'react'
import {
  Activity,
  Blocks,
  Boxes,
  CircleHelp,
  Database,
  Gauge,
  KeyRound,
  LifeBuoy,
  Rocket,
  Server,
  Shield,
  Workflow,
} from 'lucide-react'
import './app-sidebar-rail.css'

const icons = {
  overview: Gauge,
  automation: Workflow,
  services: Boxes,
  data: Database,
  integrations: Blocks,
  governance: Shield,
  monitoring: Activity,
  releases: Rocket,
  environments: Server,
  credentials: KeyRound,
  support: LifeBuoy,
  help: CircleHelp,
}
export type LumenAppSidebarRailIcon = keyof typeof icons
export interface LumenAppSidebarRailOption {
  readonly id: string
  readonly label: string
}
export interface LumenAppSidebarRailItem {
  readonly id: string
  readonly label: string
  readonly icon: LumenAppSidebarRailIcon
  readonly options: readonly LumenAppSidebarRailOption[]
}
export interface LumenAppSidebarRailGroup {
  readonly id: string
  readonly items: readonly LumenAppSidebarRailItem[]
}
export interface LumenAppSidebarRailContent {
  readonly labels: {
    readonly brandMark: string
    readonly navigation: string
    readonly support: string
    readonly account: string
    readonly accountMenu: string
    readonly empty: string
  }
  readonly groups: readonly LumenAppSidebarRailGroup[]
  readonly selectedItemId: string | null
  readonly support: readonly LumenAppSidebarRailOption[]
  readonly account: {
    readonly initials: string
    readonly name: string
    readonly detail: string
    readonly actions: readonly LumenAppSidebarRailOption[]
  }
}
const unique = <T extends { readonly id: string }>(items: readonly T[]) => {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function AppSidebarRail({
  content,
  onAction,
}: {
  readonly content: LumenAppSidebarRailContent
  readonly onAction?: ((action: string, id?: string) => void) | undefined
}) {
  const [flyoutId, setFlyoutId] = React.useState<string | null>(null)
  const [accountOpen, setAccountOpen] = React.useState(false)
  const [flyoutAnchor, setFlyoutAnchor] = React.useState({ top: 0, left: 0 })
  const railRef = React.useRef<HTMLElement>(null)
  const isLong = content.groups.reduce((count, group) => count + group.items.length, 0) > 12
  const showFlyout = (id: string, element: HTMLElement) => {
    if (isLong) {
      const rect = element.getBoundingClientRect()
      setFlyoutAnchor({
        top: Math.max(8, Math.min(rect.top, window.innerHeight - 136)),
        left: rect.right + 8,
      })
    }
    setFlyoutId(id)
    setAccountOpen(false)
  }
  React.useEffect(() => {
    if (!flyoutId && !accountOpen) {
      return undefined
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFlyoutId(null)
        setAccountOpen(false)
      }
    }
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !railRef.current?.contains(event.target)) {
        setFlyoutId(null)
        setAccountOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [flyoutId, accountOpen])
  const menu = (label: string, options: readonly LumenAppSidebarRailOption[], scope: string) => (
    <div
      role="menu"
      tabIndex={-1}
      aria-label={label}
      className="lumen-rail-flyout"
      style={isLong && scope === 'open-option' ? flyoutAnchor : undefined}
    >
      <p>{label}</p>
      {unique(options).map((item) => (
        <button
          type="button"
          role="menuitem"
          key={item.id}
          onClick={() => {
            onAction?.(scope, item.id)
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
  return (
    <div className="lumen-app-sidebar-rail-root hbar-app-ui-full-canvas-owner">
      <aside ref={railRef} className="lumen-rail-sidebar">
        <div className="lumen-rail-heading">
          <span>{content.labels.brandMark}</span>
        </div>
        <nav
          aria-label={content.labels.navigation}
          className={isLong ? 'lumen-rail-navigation is-long' : 'lumen-rail-navigation'}
          data-hbar-app-ui-list-strategy="pane-scroll"
        >
          {unique(content.groups).length ? (
            unique(content.groups).map((group) => (
              <ul key={group.id}>
                {unique(group.items).map((item) => {
                  const Icon = icons[item.icon]
                  const expanded = flyoutId === item.id
                  return (
                    <li
                      key={item.id}
                      onMouseEnter={(event) => showFlyout(item.id, event.currentTarget)}
                      onMouseLeave={() => setFlyoutId(null)}
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                          setFlyoutId(null)
                        }
                      }}
                    >
                      <button
                        type="button"
                        aria-label={item.label}
                        aria-expanded={expanded}
                        className={item.id === content.selectedItemId || expanded ? 'is-active' : undefined}
                        onFocus={(event) => showFlyout(item.id, event.currentTarget)}
                        onClick={() => {
                          setFlyoutId(item.id)
                          onAction?.('open', item.id)
                        }}
                      >
                        <Icon aria-hidden="true" />
                      </button>
                      {expanded && item.options.length > 0 && menu(item.label, item.options, 'open-option')}
                    </li>
                  )
                })}
              </ul>
            ))
          ) : (
            <p>{content.labels.empty}</p>
          )}
        </nav>
        <div className="lumen-rail-footer">
          <div
            className="lumen-rail-footer-item"
            onMouseEnter={() => {
              setFlyoutId('support')
              setAccountOpen(false)
            }}
            onMouseLeave={() => setFlyoutId(null)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setFlyoutId(null)
              }
            }}
          >
            <button
              type="button"
              aria-label={content.labels.support}
              aria-expanded={flyoutId === 'support'}
              className={flyoutId === 'support' ? 'is-active' : undefined}
              onFocus={() => setFlyoutId('support')}
              onClick={() => setFlyoutId(flyoutId === 'support' ? null : 'support')}
            >
              <LifeBuoy aria-hidden="true" />
            </button>
            {flyoutId === 'support' &&
              content.support.length > 0 &&
              menu(content.labels.support, content.support, 'support')}
          </div>
          <div className="lumen-rail-footer-item">
            <button
              type="button"
              aria-label={content.labels.account}
              aria-expanded={accountOpen}
              className={accountOpen ? 'is-active' : undefined}
              onClick={() => {
                setAccountOpen(!accountOpen)
                setFlyoutId(null)
              }}
            >
              {content.account.initials}
            </button>
            {accountOpen && (
              <div role="menu" aria-label={content.labels.accountMenu} className="lumen-rail-account-menu">
                <p>{content.account.name}</p>
                <p>{content.account.detail}</p>
                {unique(content.account.actions).map((item) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={item.id}
                    onClick={() => {
                      onAction?.('account', item.id)
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
