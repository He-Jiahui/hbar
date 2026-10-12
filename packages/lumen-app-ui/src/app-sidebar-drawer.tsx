'use client'

import * as React from 'react'
import {
  Bell,
  BarChart3,
  BookOpen,
  CalendarDays,
  CircleCheck,
  FileText,
  House,
  Inbox,
  LifeBuoy,
  Menu,
  Settings,
  UsersRound,
  X,
} from 'lucide-react'
import './app-sidebar-drawer.css'

const icons = {
  home: House,
  inbox: Inbox,
  schedule: CalendarDays,
  tasks: CircleCheck,
  customers: UsersRound,
  documents: FileText,
  reports: BarChart3,
  knowledge: BookOpen,
  team: UsersRound,
  notifications: Bell,
  settings: Settings,
  support: LifeBuoy,
}

export type LumenAppSidebarDrawerIcon = keyof typeof icons
export interface LumenAppSidebarDrawerItem {
  readonly id: string
  readonly label: string
  readonly icon: LumenAppSidebarDrawerIcon
  readonly href: string
  readonly badge?: string | undefined
}
export interface LumenAppSidebarDrawerGroup {
  readonly id: string
  readonly label: string
  readonly items: readonly LumenAppSidebarDrawerItem[]
}
export interface LumenAppSidebarDrawerContent {
  readonly labels: {
    readonly open: string
    readonly closeOverlay: string
    readonly close: string
    readonly dialog: string
    readonly navigation: string
    readonly brand: string
    readonly brandSubtitle: string
    readonly brandMark: string
    readonly empty: string
  }
  readonly groups: readonly LumenAppSidebarDrawerGroup[]
  readonly listStrategy: { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }
  readonly selectedItemId: string | null
  readonly profile: {
    readonly initials: string
    readonly name: string
    readonly detail: string
  }
}

function unique<T extends { readonly id: string }>(items: readonly T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export function AppSidebarDrawer({
  content,
  onAction,
}: {
  readonly content: LumenAppSidebarDrawerContent
  readonly onAction?: ((action: string, id?: string) => void) | undefined
}) {
  const [open, setOpen] = React.useState(true)
  const groups = unique(content.groups)
  const allItems = unique(groups.flatMap((group) => group.items))
  const selectedItemId = allItems.some((item) => item.id === content.selectedItemId)
    ? content.selectedItemId
    : allItems[0]?.id
  const seenItems = new Set<string>()
  const close = (action: 'close' | 'overlay') => {
    setOpen(false)
    onAction?.(action)
  }
  return (
    <div className="lumen-drawer-root hbar-app-ui-full-canvas-owner">
      <button
        type="button"
        className="lumen-drawer-trigger"
        aria-label={content.labels.open}
        aria-expanded={open}
        onClick={() => {
          setOpen(true)
          onAction?.('open')
        }}
      >
        <Menu aria-hidden="true" />
      </button>
      {open && (
        <React.Fragment>
          <button
            type="button"
            className="lumen-drawer-scrim"
            aria-label={content.labels.closeOverlay}
            onClick={() => close('overlay')}
          />
          <div className="lumen-drawer-panel" role="dialog" aria-modal="true" aria-label={content.labels.dialog}>
            <header className="lumen-drawer-header">
              <span className="lumen-drawer-mark">{content.labels.brandMark}</span>
              <span className="lumen-drawer-brand">
                <p>{content.labels.brand}</p>
                <p>{content.labels.brandSubtitle}</p>
              </span>
              <button type="button" aria-label={content.labels.close} onClick={() => close('close')}>
                <X aria-hidden="true" />
              </button>
            </header>
            <nav
              className="lumen-drawer-navigation"
              aria-label={content.labels.navigation}
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            >
              {groups.map((group) => (
                <div className="lumen-drawer-group" key={group.id}>
                  <p>{group.label}</p>
                  <ul>
                    {group.items
                      .filter((item) => {
                        if (seenItems.has(item.id)) return false
                        seenItems.add(item.id)
                        return true
                      })
                      .map((item) => {
                        const Icon = icons[item.icon]
                        return (
                          <li key={item.id}>
                            <a
                              href={item.href}
                              className={item.id === selectedItemId ? 'is-active' : undefined}
                              onClick={() => onAction?.('navigate', item.id)}
                            >
                              <Icon aria-hidden="true" />
                              <span>{item.label}</span>
                              {item.badge && <span className="lumen-drawer-badge">{item.badge}</span>}
                            </a>
                          </li>
                        )
                      })}
                  </ul>
                </div>
              ))}
              {!content.groups.length && <p className="lumen-drawer-empty">{content.labels.empty}</p>}
            </nav>
            <div className="lumen-drawer-profile">
              <span className="lumen-drawer-avatar">{content.profile.initials}</span>
              <span>
                <p>{content.profile.name}</p>
                <p>{content.profile.detail}</p>
              </span>
            </div>
          </div>
        </React.Fragment>
      )}
    </div>
  )
}
