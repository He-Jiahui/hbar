'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  Bell,
  Building2,
  CalendarClock,
  ChartColumn,
  FileText,
  LayoutTemplate,
  Library,
  LifeBuoy,
  Megaphone,
  Menu,
  PanelLeft,
  Plus,
  Search,
  Settings,
  SquareCheckBig,
  X,
} from 'lucide-react'
import { LumenInput } from './forms'
import LumenField from './LumenField'
import { LumenButton, LumenIconButton } from './primitives'
import './app-shell-contracts.css'

export interface LumenShellContractLink {
  readonly id: string
  readonly label: string
  readonly href: string
  readonly icon:
    'contracts' | 'renewals' | 'templates' | 'library' | 'counterparties' | 'approvals' | 'reports' | 'help' | 'news'
  readonly count?: string | undefined
}
export interface LumenShellContractRecord {
  readonly id: string
  readonly title: string
  readonly counterparty: string
  readonly href: string
  readonly owner: string
  readonly value: string
  readonly renews: string
  readonly status: string
  readonly tone: 'neutral' | 'muted' | 'warning' | 'danger'
}
export interface LumenAppShellContractsContent {
  readonly brand: { readonly mark: string; readonly name: string }
  readonly labels: {
    readonly navigation: string
    readonly navigationDialog: string
    readonly openNavigation: string
    readonly closeNavigation: string
    readonly closeOverlay: string
    readonly collapseSidebar: string
    readonly expandSidebar: string
    readonly search: string
    readonly openSearch: string
    readonly closeSearch: string
    readonly searchShortcut: string
    readonly notifications: string
    readonly workspaceSettings: string
    readonly create: string
    readonly createAccessible: string
    readonly accountMenu: string
    readonly title: string
    readonly recordsTitle: string
    readonly recordsCount: string
    readonly recordsCaption: string
    readonly filters: string
    readonly emptyTitle: string
    readonly emptyDetail: string
    readonly clearSearch: string
    readonly emptyNavigation: string
    readonly emptyMetrics: string
  }
  /** Independently scrolling navigation; hosts group inventories above 50 links. */
  readonly sections: readonly {
    readonly id: string
    readonly label: string
    readonly links: readonly LumenShellContractLink[]
  }[]
  readonly footerLinks: readonly LumenShellContractLink[]
  readonly currentLinkId: string | null
  readonly sidebarExpanded: boolean
  readonly onSidebarExpandedChange: (expanded: boolean) => void
  readonly searchValue: string
  readonly onSearchChange: (value: string) => void
  readonly onClearSearch: () => void
  readonly metrics: readonly {
    readonly id: string
    readonly label: string
    readonly value: string
  }[]
  readonly filters: readonly { readonly id: string; readonly label: string }[]
  readonly filterId: string | null
  readonly onFilterChange: (id: string) => void
  readonly columns: Readonly<Record<'contract' | 'owner' | 'value' | 'renews' | 'status', string>>
  /** Host-projected rows in the main scroll pane. Page histories above 100 records. */
  readonly records: readonly LumenShellContractRecord[]
  readonly account: {
    readonly initials: string
    readonly label: string
    readonly name: string
    readonly email: string
  }
  readonly accountActions: readonly {
    readonly id: string
    readonly label: string
    readonly onInvoke: () => void
  }[]
  readonly onNavigate: (id: string) => void
  readonly onRecord: (id: string) => void
  readonly onNotifications: () => void
  readonly onWorkspaceSettings: () => void
  readonly onCreate: () => void
}
const stable = <T extends { readonly id: string }>(items: readonly T[]): T[] => [
  ...new Map(items.map((item) => [item.id, item])).values(),
]
const icons = {
  contracts: FileText,
  renewals: CalendarClock,
  templates: LayoutTemplate,
  library: Library,
  counterparties: Building2,
  approvals: SquareCheckBig,
  reports: ChartColumn,
  help: LifeBuoy,
  news: Megaphone,
}
function Navigation({
  content,
  collapsed,
}: {
  readonly content: LumenAppShellContractsContent
  readonly collapsed: boolean
}) {
  const link = (item: LumenShellContractLink) => {
    const Icon = icons[item.icon]
    return (
      <li key={item.id}>
        <a
          href={item.href}
          aria-label={collapsed ? item.label : undefined}
          aria-current={item.id === content.currentLinkId ? 'page' : undefined}
          onClick={() => content.onNavigate(item.id)}
        >
          <Icon className="lumen-contracts-icon" aria-hidden="true" />
          <span
            className={collapsed ? 'lumen-contracts-sr' : 'lumen-contracts-truncate'}
            title={collapsed ? undefined : item.label}
          >
            {item.label}
          </span>
          {!collapsed && item.count ? <span className="lumen-contracts-nav-count">{item.count}</span> : null}
        </a>
      </li>
    )
  }
  return (
    <div className="lumen-contracts-nav-frame">
      <nav aria-label={content.labels.navigation} data-lumen-list-strategy="pane-scroll" data-collapsed={collapsed}>
        <div>
          {stable(content.sections).map((section) => (
            <div className="lumen-contracts-nav-section" key={section.id}>
              {collapsed ? null : <p>{section.label}</p>}
              <ul>{stable(section.links).map(link)}</ul>
            </div>
          ))}
          {content.sections.length ? null : (
            <p className="lumen-contracts-empty-nav">{content.labels.emptyNavigation}</p>
          )}
        </div>
        <ul className="lumen-contracts-nav-footer">{stable(content.footerLinks).map(link)}</ul>
      </nav>
    </div>
  )
}
function Account({ content }: { readonly content: LumenAppShellContractsContent }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const document = trigger.current?.ownerDocument
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !trigger.current?.contains(event.target) &&
        !menu.current?.contains(event.target)
      )
        setOpen(false)
    }
    document?.addEventListener('pointerdown', dismiss)
    return () => document?.removeEventListener('pointerdown', dismiss)
  }, [open])
  return (
    <div
      className="lumen-contracts-account"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          close()
        }
      }}
    >
      <LumenButton
        ref={trigger}
        size="s"
        variant="text"
        indicator="none"
        className="lumen-contracts-avatar"
        aria-label={content.account.label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {content.account.initials}
      </LumenButton>
      {open ? (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={content.labels.accountMenu}
          className="lumen-contracts-account-menu"
          onKeyDown={(event) => {
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
            const index = buttons.findIndex((button) => button === event.target)
            if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) && buttons.length) {
              event.preventDefault()
              buttons[
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? buttons.length - 1
                    : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
              ]?.focus()
            }
            if (event.key === 'Tab') setOpen(false)
          }}
        >
          <div role="presentation">
            <p>{content.account.name}</p>
            <p title={content.account.email}>{content.account.email}</p>
          </div>
          {stable(content.accountActions).map((item) => (
            <LumenButton
              key={item.id}
              size="s"
              variant="text"
              indicator="none"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close()
                item.onInvoke()
              }}
            >
              <span>{item.label}</span>
            </LumenButton>
          ))}
        </div>
      ) : null}
    </div>
  )
}
function SearchField({
  content,
  mobile,
}: {
  readonly content: LumenAppShellContractsContent
  readonly mobile?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (mobile) input.current?.focus()
  }, [mobile])
  return (
    <LumenField boundary="horizontal">
      <div className="lumen-contracts-search-field">
        <Search className="lumen-contracts-icon" aria-hidden="true" />
        <LumenInput
          ref={input}
          type="text"
          role="searchbox"
          variant="plain"
          aria-label={content.labels.search}
          placeholder={content.labels.search}
          value={content.searchValue}
          onChange={(event) => content.onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') content.onSearchChange('')
          }}
        />
        {mobile ? null : <kbd>{content.labels.searchShortcut}</kbd>}
      </div>
    </LumenField>
  )
}
function Status({ record }: { readonly record: LumenShellContractRecord }) {
  return (
    <span className="lumen-contracts-status">
      <span className="lumen-contracts-dot" data-tone={record.tone} aria-hidden="true" />
      {record.status}
    </span>
  )
}
function Records({ content }: { readonly content: LumenAppShellContractsContent }) {
  const rows = stable(content.records)
  const fields = ['owner', 'value', 'renews', 'status'] as const
  const title = (row: LumenShellContractRecord) => (
    <a href={row.href} title={row.title} onClick={() => content.onRecord(row.id)}>
      {row.title}
    </a>
  )
  if (!rows.length)
    return (
      <div className="lumen-contracts-empty">
        <p>{content.labels.emptyTitle}</p>
        <p>{content.labels.emptyDetail}</p>
        <LumenButton size="s" variant="text" indicator="none" onClick={content.onClearSearch}>
          {content.labels.clearSearch}
        </LumenButton>
      </div>
    )
  return (
    <>
      <div className="lumen-contracts-table-frame">
        <table>
          <caption className="lumen-contracts-sr">{content.labels.recordsCaption}</caption>
          <thead>
            <tr>
              {(['contract', ...fields] as const).map((field) => (
                <th key={field} scope="col" data-column={field}>
                  {content.columns[field]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-record-id={row.id}>
                <td data-column="contract">
                  <div>
                    {title(row)}
                    <p title={row.counterparty}>{row.counterparty}</p>
                  </div>
                </td>
                {fields.map((field) => (
                  <td key={field} data-column={field} title={field === 'status' ? undefined : row[field]}>
                    {field === 'status' ? <Status record={row} /> : row[field]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="lumen-contracts-cards">
        {rows.map((row) => (
          <li key={row.id} data-record-id={row.id}>
            {title(row)}
            <p title={row.counterparty}>{row.counterparty}</p>
            <dl>
              {fields.map((field) => (
                <div key={field}>
                  <dt>{content.columns[field]}</dt>
                  <dd data-column={field} title={field === 'status' ? undefined : row[field]}>
                    {field === 'status' ? <Status record={row} /> : row[field]}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}
function Drawer({
  content,
  onClose,
}: {
  readonly content: LumenAppShellContractsContent
  readonly onClose: () => void
}) {
  const pane = useRef<HTMLElement>(null)
  useEffect(() => {
    pane.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [])
  return (
    <div className="lumen-contracts-overlay">
      <button
        type="button"
        className="lumen-contracts-backdrop"
        aria-label={content.labels.closeOverlay}
        onClick={onClose}
      />
      <aside
        ref={pane}
        className="lumen-contracts-drawer"
        role="dialog"
        aria-label={content.labels.navigationDialog}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
        }}
      >
        <div className="lumen-contracts-drawer-heading">
          <span className="lumen-contracts-mark">{content.brand.mark}</span>
          <p>{content.brand.name}</p>
          <LumenIconButton size="s" label={content.labels.closeNavigation} onClick={onClose}>
            <X className="lumen-contracts-icon" aria-hidden="true" />
          </LumenIconButton>
        </div>
        <Navigation content={content} collapsed={false} />
      </aside>
    </div>
  )
}
export function AppShellContracts({ content }: { readonly content: LumenAppShellContractsContent }) {
  const [drawerOpen, setDrawerOpen] = useState(true),
    [narrow, setNarrow] = useState(false),
    [searchOpen, setSearchOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null),
    navigationTrigger = useRef<HTMLButtonElement>(null),
    searchTrigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = root.current
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
  const closeDrawer = () => {
    setDrawerOpen(false)
    navigationTrigger.current?.focus()
  }
  const filters = stable(content.filters)
  return (
    <div className="lumen-contracts-shell" ref={root}>
      <header className="lumen-contracts-header" role="banner">
        <LumenIconButton
          ref={navigationTrigger}
          size="s"
          className="lumen-contracts-open-nav"
          label={content.labels.openNavigation}
          aria-expanded={narrow && drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="lumen-contracts-icon" aria-hidden="true" />
        </LumenIconButton>
        <span className="lumen-contracts-mark">{content.brand.mark}</span>
        <p className="lumen-contracts-brand-name">{content.brand.name}</p>
        <LumenIconButton
          size="s"
          className="lumen-contracts-collapse"
          label={content.sidebarExpanded ? content.labels.collapseSidebar : content.labels.expandSidebar}
          aria-expanded={content.sidebarExpanded}
          onClick={() => content.onSidebarExpandedChange(!content.sidebarExpanded)}
        >
          <PanelLeft className="lumen-contracts-icon" aria-hidden="true" />
        </LumenIconButton>
        <div className="lumen-contracts-desktop-search">
          <SearchField content={content} />
        </div>
        <div className="lumen-contracts-header-actions">
          <LumenIconButton
            ref={searchTrigger}
            size="s"
            className="lumen-contracts-open-search"
            label={content.labels.openSearch}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search className="lumen-contracts-icon" aria-hidden="true" />
          </LumenIconButton>
          <LumenIconButton
            size="s"
            className="lumen-contracts-secondary-action"
            label={content.labels.notifications}
            onClick={content.onNotifications}
          >
            <Bell className="lumen-contracts-icon" aria-hidden="true" />
          </LumenIconButton>
          <LumenIconButton
            size="s"
            className="lumen-contracts-secondary-action"
            label={content.labels.workspaceSettings}
            onClick={content.onWorkspaceSettings}
          >
            <Settings className="lumen-contracts-icon" aria-hidden="true" />
          </LumenIconButton>
          <LumenButton
            size="s"
            variant="solid"
            className="lumen-contracts-create"
            aria-label={content.labels.createAccessible}
            onClick={content.onCreate}
          >
            <Plus className="lumen-contracts-icon" aria-hidden="true" />
            <span>{content.labels.create}</span>
          </LumenButton>
          <Account content={content} />
        </div>
      </header>
      {searchOpen ? (
        <div className="lumen-contracts-mobile-search">
          <SearchField content={content} mobile />
          <LumenIconButton
            size="s"
            label={content.labels.closeSearch}
            onClick={() => {
              setSearchOpen(false)
              searchTrigger.current?.focus()
            }}
          >
            <X className="lumen-contracts-icon" aria-hidden="true" />
          </LumenIconButton>
        </div>
      ) : null}
      <div className="lumen-contracts-body">
        <aside className="lumen-contracts-sidebar" data-collapsed={!content.sidebarExpanded}>
          <Navigation content={content} collapsed={!content.sidebarExpanded} />
        </aside>
        <div className="lumen-contracts-main-frame">
          <main data-lumen-list-strategy="pane-scroll">
            <h1>{content.labels.title}</h1>
            <div className="lumen-contracts-metrics">
              {stable(content.metrics).map((metric) => (
                <div key={metric.id}>
                  <p title={metric.label}>{metric.label}</p>
                  <p>{metric.value}</p>
                </div>
              ))}
              {content.metrics.length ? null : <p>{content.labels.emptyMetrics}</p>}
            </div>
            <div className="lumen-contracts-record-heading">
              <div>
                <h2>{content.labels.recordsTitle}</h2>
                <span>{content.labels.recordsCount}</span>
              </div>
              <div
                role="radiogroup"
                aria-label={content.labels.filters}
                className="lumen-contracts-filters"
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !filters.length) return
                  event.preventDefault()
                  const index = filters.findIndex((filter) => filter.id === content.filterId)
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? filters.length - 1
                        : (index + (event.key === 'ArrowRight' ? 1 : -1) + filters.length) % filters.length
                  const filter = filters[next]
                  if (filter) {
                    content.onFilterChange(filter.id)
                    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button')
                    buttons[next]?.focus()
                  }
                }}
              >
                {filters.map((filter) => (
                  <LumenButton
                    key={filter.id}
                    size="s"
                    variant="text"
                    indicator="none"
                    role="radio"
                    aria-checked={filter.id === content.filterId}
                    tabIndex={filter.id === content.filterId ? 0 : -1}
                    onClick={() => content.onFilterChange(filter.id)}
                  >
                    {filter.label}
                  </LumenButton>
                ))}
              </div>
            </div>
            <Records content={content} />
          </main>
        </div>
      </div>
      {narrow && drawerOpen ? <Drawer content={content} onClose={closeDrawer} /> : null}
    </div>
  )
}
