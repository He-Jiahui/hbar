'use client'

import * as React from 'react'
import {
  BarChart3,
  CreditCard,
  FileText,
  FolderKanban,
  Gauge,
  LayoutGrid,
  LifeBuoy,
  Menu,
  Settings,
  ShieldCheck,
  SquareKanban,
  UsersRound,
  X,
} from 'lucide-react'
import './app-sidebar-full.css'

const icons = {
  favorite: SquareKanban,
  overview: LayoutGrid,
  pipelines: SquareKanban,
  projects: FolderKanban,
  documents: FileText,
  customers: UsersRound,
  performance: Gauge,
  reports: BarChart3,
  security: ShieldCheck,
  members: UsersRound,
  billing: CreditCard,
  settings: Settings,
  support: LifeBuoy,
}
export type LumenAppSidebarFullIcon = keyof typeof icons
export interface LumenAppSidebarFullItem {
  readonly id: string
  readonly label: string
  readonly icon: LumenAppSidebarFullIcon
  readonly href: string
  readonly badge?: string | undefined
}
export interface LumenAppSidebarFullGroup {
  readonly id: string
  readonly label: string
  readonly items: readonly LumenAppSidebarFullItem[]
}
export interface LumenAppSidebarFullContent {
  readonly labels: {
    readonly brandMark: string
    readonly brand: string
    readonly brandSubtitle: string
    readonly navigation: string
    readonly open: string
    readonly closeOverlay: string
    readonly close: string
    readonly dialog: string
    readonly empty: string
  }
  readonly groups: readonly LumenAppSidebarFullGroup[]
  readonly footerLink: LumenAppSidebarFullItem
  readonly selectedItemId: string | null
  readonly listStrategy: { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }
  readonly profile: {
    readonly initials: string
    readonly name: string
    readonly role: string
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

function SidebarContents({
  content,
  close,
  onAction,
}: {
  readonly content: LumenAppSidebarFullContent
  readonly close?: (() => void) | undefined
  readonly onAction?: ((action: string, id?: string) => void) | undefined
}) {
  const groups = unique(content.groups)
  const items = unique(groups.flatMap((group) => group.items))
  const selected = items.some((item) => item.id === content.selectedItemId) ? content.selectedItemId : items[0]?.id
  const seenItems = new Set<string>()
  const SupportIcon = icons[content.footerLink.icon]
  return (
    <React.Fragment>
      <header className="lumen-full-header">
        <span className="lumen-full-mark">{content.labels.brandMark}</span>
        <span className="lumen-full-brand">
          <p>{content.labels.brand}</p>
          <p>{content.labels.brandSubtitle}</p>
        </span>
        {close && (
          <button type="button" aria-label={content.labels.close} onClick={close}>
            <X aria-hidden="true" />
          </button>
        )}
      </header>
      <nav
        className="lumen-full-navigation"
        aria-label={content.labels.navigation}
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
      >
        {groups.map((group) => (
          <div className="lumen-full-group" key={group.id}>
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
                        className={item.id === selected ? 'is-active' : undefined}
                        onClick={() => onAction?.('navigate', item.id)}
                      >
                        <Icon aria-hidden="true" />
                        <span>{item.label}</span>
                        {item.badge && <span className="lumen-full-badge">{item.badge}</span>}
                      </a>
                    </li>
                  )
                })}
            </ul>
          </div>
        ))}
        {!groups.length && <p className="lumen-full-empty">{content.labels.empty}</p>}
      </nav>
      <footer className="lumen-full-footer">
        <a href={content.footerLink.href} onClick={() => onAction?.('footer', content.footerLink.id)}>
          <SupportIcon aria-hidden="true" />
          <span>{content.footerLink.label}</span>
        </a>
        <div className="lumen-full-profile">
          <span className="lumen-full-avatar">{content.profile.initials}</span>
          <span>
            <p>{content.profile.name}</p>
            <p>{content.profile.role}</p>
          </span>
        </div>
      </footer>
    </React.Fragment>
  )
}

export function AppSidebarFull({
  content,
  onAction,
}: {
  readonly content: LumenAppSidebarFullContent
  readonly onAction?: ((action: string, id?: string) => void) | undefined
}) {
  const [open, setOpen] = React.useState(true)
  const close = (action: 'close' | 'overlay') => {
    setOpen(false)
    onAction?.(action)
  }
  return (
    <div className="lumen-full-root hbar-app-ui-full-canvas-owner">
      <aside className="lumen-full-desktop">
        <SidebarContents content={content} onAction={onAction} />
      </aside>
      <div className="lumen-full-mobile">
        <button
          type="button"
          className="lumen-full-trigger"
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
              className="lumen-full-scrim"
              aria-label={content.labels.closeOverlay}
              onClick={() => close('overlay')}
            />
            <div className="lumen-full-dialog" role="dialog" aria-modal="true" aria-label={content.labels.dialog}>
              <SidebarContents content={content} close={() => close('close')} onAction={onAction} />
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  )
}
