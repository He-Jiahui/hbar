'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  Bell,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  FileWarning,
  Keyboard,
  LayoutGrid,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Truck,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react'
import { LumenInput } from './forms'
import LumenField from './LumenField'
import { LumenButton, LumenIconButton } from './primitives'
import './app-shell-sidebar.css'

export type LumenShellSidebarIcon =
  | 'dashboard'
  | 'shipments'
  | 'claims'
  | 'carriers'
  | 'settings'
  | 'invite'
  | 'documentation'
  | 'account'
  | 'notifications'
  | 'shortcuts'
  | 'sign-out'
export interface LumenShellSidebarLink {
  readonly id: string
  readonly label: string
  readonly href: string
  readonly icon?: LumenShellSidebarIcon | undefined
  readonly badge?: string | undefined
  readonly muted?: boolean | undefined
  readonly dot?: 'neutral' | 'warning' | undefined
  readonly dotLabel?: string | undefined
}
export interface LumenShellSidebarGroup {
  readonly id: string
  readonly label: string
  readonly icon: LumenShellSidebarIcon
  readonly initiallyExpanded: boolean
  readonly children: readonly LumenShellSidebarLink[]
}
export interface LumenShellSidebarRecord {
  readonly id: string
  readonly reference: string
  readonly consignee: string
  readonly carrier: string
  readonly status: string
  readonly tone: 'neutral' | 'muted' | 'danger'
  readonly eta: string
  readonly value: string
}
export interface LumenAppShellSidebarContent {
  readonly brand: { readonly mark: string; readonly name: string; readonly detail: string }
  readonly labels: {
    readonly primaryNavigation: string
    readonly navigationDialog: string
    readonly openNavigation: string
    readonly closeNavigation: string
    readonly closeOverlay: string
    readonly workspaceOptions: string
    readonly breadcrumb: string
    readonly search: string
    readonly book: string
    readonly accountMenu: string
    readonly recordsTitle: string
    readonly recordsCount: string
    readonly recordsCaption: string
    readonly emptyNavigation: string
    readonly emptyRecords: string
    readonly emptyMetrics: string
  }
  /** Sidebar pane scrolls. Hosts group inventories above 50 links. */
  readonly sections: readonly {
    readonly id: string
    readonly label: string
    readonly items: readonly (LumenShellSidebarLink | LumenShellSidebarGroup)[]
  }[]
  readonly currentLinkId: string | null
  readonly footerLinks: readonly LumenShellSidebarLink[]
  readonly account: { readonly initials: string; readonly name: string; readonly detail: string }
  readonly accountActions: readonly {
    readonly id: string
    readonly label: string
    readonly icon: LumenShellSidebarIcon
    readonly disabled?: boolean | undefined
    readonly onInvoke: () => void
  }[]
  readonly breadcrumbs: readonly {
    readonly id: string
    readonly label: string
    readonly href?: string | undefined
  }[]
  readonly searchValue: string
  readonly onSearchChange: (value: string) => void
  readonly onNavigate?: ((id: string) => void) | undefined
  readonly onWorkspaceOptions: () => void
  readonly onBook: () => void
  /** Metrics wrap and grow; never silently slice content above the normal four. */
  readonly metrics: readonly {
    readonly id: string
    readonly label: string
    readonly value: string
    readonly detail: string
  }[]
  readonly columns: Readonly<Record<'reference' | 'consignee' | 'carrier' | 'status' | 'eta' | 'value', string>>
  /** Read-only records in a bounded main pane. Hosts page histories above 100 records. */
  readonly records: readonly LumenShellSidebarRecord[]
}
function stable<T extends { readonly id: string }>(items: readonly T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}
const icons = {
  dashboard: LayoutGrid,
  shipments: Truck,
  claims: FileWarning,
  carriers: Building2,
  settings: Settings,
  invite: UserPlus,
  documentation: BookOpen,
  account: UserRound,
  notifications: Bell,
  shortcuts: Keyboard,
  'sign-out': LogOut,
}
function Icon({ name }: { readonly name: LumenShellSidebarIcon }) {
  const Component = icons[name]
  return <Component className="lumen-sidebar-icon" aria-hidden="true" />
}
function NavigationLink({
  item,
  content,
}: {
  readonly item: LumenShellSidebarLink
  readonly content: LumenAppShellSidebarContent
}) {
  return (
    <a
      className="lumen-sidebar-link"
      href={item.href}
      aria-current={item.id === content.currentLinkId ? 'page' : undefined}
      data-muted={item.muted || undefined}
      onClick={() => content.onNavigate?.(item.id)}
    >
      {item.icon ? <Icon name={item.icon} /> : null}
      {item.dot ? <span className="lumen-sidebar-dot" data-tone={item.dot} aria-hidden="true" /> : null}
      <span className="lumen-sidebar-truncate" title={item.label}>
        {item.label}
      </span>
      {item.dotLabel ? <span className="lumen-sidebar-sr">{item.dotLabel}</span> : null}
      {item.badge ? <span className="lumen-sidebar-badge">{item.badge}</span> : null}
    </a>
  )
}
function NavigationGroup({
  group,
  content,
}: {
  readonly group: LumenShellSidebarGroup
  readonly content: LumenAppShellSidebarContent
}) {
  const [expanded, setExpanded] = useState(group.initiallyExpanded)
  const id = useId()
  return (
    <li>
      <LumenButton
        variant="text"
        size="s"
        indicator="none"
        className="lumen-sidebar-link"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded(!expanded)}
      >
        <Icon name={group.icon} />
        <span className="lumen-sidebar-truncate">{group.label}</span>
        {expanded ? (
          <ChevronDown className="lumen-sidebar-small-icon" aria-hidden="true" />
        ) : (
          <ChevronRight className="lumen-sidebar-small-icon" aria-hidden="true" />
        )}
      </LumenButton>
      <ul id={id} className="lumen-sidebar-subnav" hidden={!expanded}>
        {stable(group.children).map((item) => (
          <li key={item.id}>
            <NavigationLink item={item} content={content} />
          </li>
        ))}
      </ul>
    </li>
  )
}
function SidebarPane({
  content,
  mobile,
  onClose,
}: {
  readonly content: LumenAppShellSidebarContent
  readonly mobile?: boolean
  readonly onClose: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const pane = useRef<HTMLElement>(null)
  const accountButton = useRef<HTMLButtonElement>(null)
  const accountMenu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const menuItems = stable(content.accountActions)
  const sections = stable(content.sections)
  const closeMenu = () => {
    setMenuOpen(false)
    accountButton.current?.focus()
  }
  useEffect(() => {
    if (!menuOpen) return
    accountMenu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const onPointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !accountMenu.current?.contains(event.target) &&
        !accountButton.current?.contains(event.target)
      )
        setMenuOpen(false)
    }
    const document = pane.current?.ownerDocument
    document?.addEventListener('pointerdown', onPointer)
    return () => document?.removeEventListener('pointerdown', onPointer)
  }, [menuOpen])
  useEffect(() => {
    if (mobile) pane.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [mobile])
  return (
    <aside
      ref={pane}
      className={`lumen-sidebar-pane ${mobile ? 'lumen-sidebar-mobile' : 'lumen-sidebar-desktop'}`}
      role={mobile ? 'dialog' : undefined}
      aria-label={mobile ? content.labels.navigationDialog : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          if (menuOpen) closeMenu()
          else if (mobile) onClose()
        }
      }}
    >
      <div className="lumen-sidebar-brand">
        <span className="lumen-sidebar-mark" aria-hidden="true">
          {content.brand.mark}
        </span>
        <div>
          <p title={content.brand.name}>{content.brand.name}</p>
          <p title={content.brand.detail}>{content.brand.detail}</p>
        </div>
        <LumenIconButton
          size="s"
          label={mobile ? content.labels.closeNavigation : content.labels.workspaceOptions}
          onClick={mobile ? onClose : content.onWorkspaceOptions}
        >
          {mobile ? (
            <X className="lumen-sidebar-small-icon" aria-hidden="true" />
          ) : (
            <MoreHorizontal className="lumen-sidebar-small-icon" aria-hidden="true" />
          )}
        </LumenIconButton>
      </div>
      <div className="lumen-sidebar-nav-frame">
        <nav aria-label={content.labels.primaryNavigation} data-lumen-list-strategy="pane-scroll">
          {sections.length ? (
            sections.map((section) => (
              <div className="lumen-sidebar-nav-section" key={section.id}>
                <p>{section.label}</p>
                <ul>
                  {stable(section.items).map((item) =>
                    'children' in item ? (
                      <NavigationGroup key={item.id} group={item} content={content} />
                    ) : (
                      <li key={item.id}>
                        <NavigationLink item={item} content={content} />
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))
          ) : (
            <p className="lumen-sidebar-empty">{content.labels.emptyNavigation}</p>
          )}
        </nav>
      </div>
      <div className="lumen-sidebar-footer">
        {stable(content.footerLinks).map((item) => (
          <NavigationLink key={item.id} item={item} content={content} />
        ))}
        <LumenButton
          ref={accountButton}
          size="s"
          variant="text"
          indicator="none"
          className="lumen-sidebar-account"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span className="lumen-sidebar-avatar" aria-hidden="true">
            {content.account.initials}
          </span>
          <span>
            <span title={content.account.name}>{content.account.name}</span>
            <span title={content.account.detail}>{content.account.detail}</span>
          </span>
          {menuOpen ? (
            <ChevronUp className="lumen-sidebar-small-icon" aria-hidden="true" />
          ) : (
            <ChevronDown className="lumen-sidebar-small-icon" aria-hidden="true" />
          )}
        </LumenButton>
        {menuOpen ? (
          <div
            ref={accountMenu}
            id={menuId}
            className="lumen-sidebar-account-menu"
            role="menu"
            aria-label={content.labels.accountMenu}
            onKeyDown={(event) => {
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
              )
              const index = buttons.indexOf(event.target as HTMLButtonElement)
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && buttons.length) {
                event.preventDefault()
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? buttons.length - 1
                      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
                buttons[next]?.focus()
              }
              if (event.key === 'Tab') setMenuOpen(false)
            }}
          >
            {menuItems.map((item) => (
              <LumenButton
                key={item.id}
                size="s"
                variant="text"
                indicator="none"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  closeMenu()
                  item.onInvoke()
                }}
              >
                <Icon name={item.icon} />
                <span className="lumen-sidebar-truncate">{item.label}</span>
              </LumenButton>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  )
}
function Status({ record }: { readonly record: LumenShellSidebarRecord }) {
  return (
    <span className="lumen-sidebar-status">
      <span className="lumen-sidebar-dot" data-tone={record.tone} aria-hidden="true" />
      {record.status}
    </span>
  )
}
function Records({ content }: { readonly content: LumenAppShellSidebarContent }) {
  const records = stable(content.records)
  const columns = ['reference', 'consignee', 'carrier', 'status', 'eta', 'value'] as const
  return (
    <>
      <div className="lumen-sidebar-record-heading">
        <h2>{content.labels.recordsTitle}</h2>
        <span>{content.labels.recordsCount}</span>
      </div>
      {records.length ? (
        <>
          <table className="lumen-sidebar-table">
            <caption className="lumen-sidebar-sr">{content.labels.recordsCaption}</caption>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col" data-column={column}>
                    {content.columns[column]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} data-record-id={record.id}>
                  {columns.map((column) => (
                    <td key={column} data-column={column}>
                      {column === 'status' ? (
                        <Status record={record} />
                      ) : (
                        <span title={record[column]}>{record[column]}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="lumen-sidebar-record-cards">
            {records.map((record) => (
              <li key={record.id} data-record-id={record.id}>
                <div>
                  <p title={record.consignee}>{record.consignee}</p>
                  <span>{record.value}</span>
                </div>
                <div>
                  <Status record={record} />
                  <span>{record.reference}</span>
                </div>
                <div>
                  <span title={record.carrier}>{record.carrier}</span>
                  <span>{record.eta}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="lumen-sidebar-empty">{content.labels.emptyRecords}</p>
      )}
    </>
  )
}
export function AppShellSidebar({ content }: { readonly content: LumenAppShellSidebarContent }) {
  const [navigationOpen, setNavigationOpen] = useState(true)
  const [narrow, setNarrow] = useState(false)
  const shell = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = shell.current
    if (!element) return
    const observe = () =>
      setNarrow(
        element.clientWidth < 64 * Number.parseFloat(getComputedStyle(element.ownerDocument.documentElement).fontSize),
      )
    observe()
    const observer = new ResizeObserver(observe)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const close = () => {
    setNavigationOpen(false)
    trigger.current?.focus()
  }
  return (
    <div className="lumen-sidebar-shell" ref={shell}>
      <SidebarPane content={content} onClose={close} />
      <div className="lumen-sidebar-main-column">
        <header className="lumen-sidebar-header" role="banner">
          <LumenIconButton
            ref={trigger}
            size="s"
            className="lumen-sidebar-open"
            label={content.labels.openNavigation}
            aria-expanded={navigationOpen && narrow}
            onClick={() => setNavigationOpen(true)}
          >
            <Menu className="lumen-sidebar-icon" aria-hidden="true" />
          </LumenIconButton>
          <nav aria-label={content.labels.breadcrumb}>
            <ol>
              {stable(content.breadcrumbs).map((item, index) => (
                <li key={item.id}>
                  {index ? <ChevronRight className="lumen-sidebar-small-icon" aria-hidden="true" /> : null}
                  {item.href ? (
                    <a href={item.href} title={item.label}>
                      {item.label}
                    </a>
                  ) : (
                    <span aria-current="page" title={item.label}>
                      {item.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <label className="lumen-sidebar-search">
            <span className="lumen-sidebar-sr">{content.labels.search}</span>
            <LumenField boundary="horizontal">
              <div className="lumen-sidebar-search-content">
                <Search className="lumen-sidebar-icon" aria-hidden="true" />
                <LumenInput
                  variant="plain"
                  type="search"
                  placeholder={content.labels.search}
                  value={content.searchValue}
                  onChange={(event) => content.onSearchChange(event.target.value)}
                />
              </div>
            </LumenField>
          </label>
          <LumenButton
            size="s"
            variant="solid"
            className="lumen-sidebar-book"
            aria-label={content.labels.book}
            onClick={content.onBook}
          >
            <Plus className="lumen-sidebar-icon" aria-hidden="true" />
            <span>{content.labels.book}</span>
          </LumenButton>
        </header>
        <div className="lumen-sidebar-main-frame">
          <main data-lumen-list-strategy="pane-scroll">
            <div className="lumen-sidebar-metrics">
              {stable(content.metrics).map((metric) => (
                <div key={metric.id}>
                  <p>{metric.label}</p>
                  <p title={metric.value}>{metric.value}</p>
                  <p>{metric.detail}</p>
                </div>
              ))}
              {content.metrics.length ? null : <p className="lumen-sidebar-empty">{content.labels.emptyMetrics}</p>}
            </div>
            <Records content={content} />
          </main>
        </div>
      </div>
      {navigationOpen && narrow ? (
        <div className="lumen-sidebar-overlay">
          <button
            type="button"
            className="lumen-sidebar-backdrop"
            aria-label={content.labels.closeOverlay}
            onClick={close}
          />
          <SidebarPane mobile content={content} onClose={close} />
        </div>
      ) : null}
    </div>
  )
}
