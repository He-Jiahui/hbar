'use client'

import * as React from 'react'
import {
  Activity,
  Bell,
  Blocks,
  ChartNoAxesColumn,
  CheckSquare,
  ChevronDown,
  CircleHelp,
  CreditCard,
  FolderKanban,
  Gauge,
  Inbox,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeft,
  Settings,
  Users,
  X,
} from 'lucide-react'
import './app-sidebar-primary.css'

const icons = {
  grid: LayoutGrid,
  inbox: Inbox,
  approval: CheckSquare,
  automation: Blocks,
  projects: FolderKanban,
  performance: Gauge,
  usage: ChartNoAxesColumn,
  activity: Activity,
  members: Users,
  billing: CreditCard,
  settings: Settings,
  notifications: Bell,
  help: CircleHelp,
  signout: LogOut,
}
export type LumenAppSidebarPrimaryIcon = keyof typeof icons
export interface LumenAppSidebarPrimaryItem {
  readonly id: string
  readonly label: string
  readonly icon: LumenAppSidebarPrimaryIcon
  readonly href: string
  readonly badge?: string
}
export interface LumenAppSidebarPrimaryGroup {
  readonly id: string
  readonly label: string
  readonly items: readonly LumenAppSidebarPrimaryItem[]
}
export interface LumenAppSidebarPrimaryAction {
  readonly id: string
  readonly label: string
  readonly icon: LumenAppSidebarPrimaryIcon
}
export interface LumenAppSidebarPrimaryContent {
  readonly labels: {
    readonly brandMark: string
    readonly brand: string
    readonly brandDetail: string
    readonly navigation: string
    readonly openNavigation: string
    readonly closeNavigation: string
    readonly closeOverlay: string
    readonly dialog: string
    readonly collapse: string
    readonly expand: string
    readonly accountMenu: string
    readonly empty: string
  }
  readonly groups: readonly LumenAppSidebarPrimaryGroup[]
  readonly activeItemId: string | null
  readonly profile: {
    readonly initials: string
    readonly name: string
    readonly detail: string
  }
  readonly accountActions: readonly LumenAppSidebarPrimaryAction[]
}
const unique = <T extends { readonly id: string }>(items: readonly T[]) => {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export function AppSidebarPrimary({
  content,
  onAction,
}: {
  readonly content: LumenAppSidebarPrimaryContent
  readonly onAction?: (action: string, id?: string) => void
}) {
  const [mobile, setMobile] = React.useState(false)
  const [open, setOpen] = React.useState(true)
  const [collapsed, setCollapsed] = React.useState(false)
  const [accountMenu, setAccountMenu] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const profileRef = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setMobile(entry.contentRect.width < 768)
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])
  React.useEffect(() => {
    if (!accountMenu && !open) return
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (accountMenu) {
        setAccountMenu(false)
        profileRef.current?.focus()
      } else if (mobile) setOpen(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [accountMenu, mobile, open])
  const sidebar = (drawer: boolean) => (
    <aside
      className={`lumen-primary-sidebar${collapsed && !drawer ? ' is-collapsed' : ''}${drawer ? ' is-drawer' : ''}`}
      role={drawer ? 'dialog' : undefined}
      aria-modal={drawer ? true : undefined}
      aria-label={drawer ? content.labels.dialog : undefined}
    >
      <div className="lumen-primary-heading">
        <span className="lumen-primary-brand-mark">{content.labels.brandMark}</span>
        {(!collapsed || drawer) && (
          <div className="lumen-primary-brand-copy">
            <p>{content.labels.brand}</p>
            <p>{content.labels.brandDetail}</p>
          </div>
        )}
        {drawer && (
          <button type="button" aria-label={content.labels.closeNavigation} onClick={() => setOpen(false)}>
            <X aria-hidden="true" />
          </button>
        )}
      </div>
      <nav
        aria-label={content.labels.navigation}
        className="lumen-primary-navigation"
        data-hbar-app-ui-list-strategy="pane-scroll"
      >
        {unique(content.groups).length ? (
          unique(content.groups).map((group) => (
            <div className="lumen-primary-group" key={group.id}>
              {(!collapsed || drawer) && <p>{group.label}</p>}
              <ul>
                {unique(group.items).map((item) => {
                  const Icon = icons[item.icon]
                  return (
                    <li key={item.id}>
                      <a
                        href={item.href}
                        title={collapsed && !drawer ? item.label : undefined}
                        className={item.id === content.activeItemId ? 'is-active' : undefined}
                        onClick={() => {
                          onAction?.('open', item.id)
                          if (drawer) setOpen(false)
                        }}
                      >
                        <Icon aria-hidden="true" />
                        {(!collapsed || drawer) && <span>{item.label}</span>}
                        {(!collapsed || drawer) && item.badge && <small>{item.badge}</small>}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        ) : (
          <p>{content.labels.empty}</p>
        )}
      </nav>
      <div className="lumen-primary-footer">
        {!drawer && (
          <button
            type="button"
            className="lumen-primary-collapse"
            aria-label={collapsed ? content.labels.expand : undefined}
            onClick={() => setCollapsed(!collapsed)}
          >
            <PanelLeft aria-hidden="true" />
            {!collapsed && <span>{content.labels.collapse}</span>}
          </button>
        )}
        <div className="lumen-primary-account-anchor">
          <button
            ref={profileRef}
            type="button"
            className="lumen-primary-profile"
            aria-expanded={accountMenu}
            onClick={() => setAccountMenu(!accountMenu)}
          >
            <span className="lumen-primary-avatar">{content.profile.initials}</span>
            {(!collapsed || drawer) && (
              <span className="lumen-primary-profile-copy">
                <span>{content.profile.name}</span>
                <small>{content.profile.detail}</small>
              </span>
            )}
            {(!collapsed || drawer) && <ChevronDown aria-hidden="true" />}
          </button>
          {accountMenu && unique(content.accountActions).length > 0 && (
            <div role="menu" aria-label={content.labels.accountMenu} className="lumen-primary-account-menu">
              {unique(content.accountActions).map((item) => {
                const Icon = icons[item.icon]
                return (
                  <button
                    type="button"
                    role="menuitem"
                    key={item.id}
                    onClick={() => {
                      onAction?.('account', item.id)
                      setAccountMenu(false)
                    }}
                  >
                    <Icon aria-hidden="true" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
  return (
    <div ref={rootRef} className="lumen-primary-sidebar-root hbar-app-ui-full-canvas-owner">
      {sidebar(false)}
      <button
        type="button"
        className="lumen-primary-mobile-trigger"
        aria-label={content.labels.openNavigation}
        aria-expanded={mobile && open}
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden="true" />
      </button>
      {mobile && open && (
        <div className="lumen-primary-drawer-layer">
          <button
            type="button"
            className="lumen-primary-backdrop"
            aria-label={content.labels.closeOverlay}
            onClick={() => setOpen(false)}
          />
          {sidebar(true)}
        </div>
      )}
    </div>
  )
}
