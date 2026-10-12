'use client'

import * as React from 'react'
import {
  Bell,
  Check,
  ChevronDown,
  ChevronsUpDown,
  CircleHelp,
  Database,
  GitBranch,
  Globe,
  KeyRound,
  LayoutDashboard,
  Logs,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react'
import { LumenButton, LumenIconButton } from './primitives'
import './app-shell-scope.css'

export interface LumenScopeOption {
  readonly id: string
  readonly label: string
}
interface LumenScopeMenuOption extends LumenScopeOption {
  readonly icon?: 'settings' | 'notifications' | 'help' | 'signout'
}
const menuIcons = { settings: Settings, notifications: Bell, help: CircleHelp, signout: LogOut }
export type LumenScopeKind = 'organisation' | 'project' | 'environment'
export interface LumenScopePicker {
  readonly label: string
  readonly triggerLabel: (value: string) => string
  readonly create: string
  /** Short, bounded menu; hosts paginate/search inventories above 50 options. */
  readonly options: readonly LumenScopeOption[]
  readonly selectedId: string | null
}
export interface LumenScopeDatabase {
  readonly id: string
  readonly name: string
  readonly region: string
  readonly status: string
  readonly tone: 'active' | 'degraded' | 'syncing' | 'paused'
  readonly connections: string
  readonly backup: string
}
const navigationIcons = {
  overview: LayoutDashboard,
  data: Database,
  deployments: GitBranch,
  logs: Logs,
  variables: KeyRound,
  domains: Globe,
  access: Users,
}
export interface LumenScopeNavigation extends LumenScopeOption {
  readonly icon?: keyof typeof navigationIcons
  readonly children?: readonly LumenScopeOption[]
}
export interface LumenAppShellScopeContent {
  readonly brand: string
  readonly brandMark: string
  readonly labels: {
    readonly scope: string
    readonly separator: string
    readonly combined: string
    readonly navigation: string
    readonly openNavigation: string
    readonly closeNavigation: string
    readonly closeOverlay: string
    readonly search: string
    readonly searchPlaceholder: string
    readonly project: string
    readonly environment: string
    readonly databases: string
    readonly createDatabase: string
    readonly createShort: string
    readonly table: string
    readonly columns: readonly [string, string, string, string, string]
    readonly empty: string
    readonly missingScope: string
    readonly account: string
    readonly count: (value: number) => string
  }
  readonly pickers: Readonly<Record<LumenScopeKind, LumenScopePicker>>
  readonly navigation: readonly LumenScopeNavigation[]
  readonly environmentNavigation: readonly LumenScopeNavigation[]
  readonly currentNavigationId: string
  readonly query: string
  /** Pane-owned scroll, with hosts providing pages of at most 100 records. */
  readonly databases: readonly LumenScopeDatabase[]
  readonly status: {
    readonly label: string
    readonly triggerLabel: string
    readonly dialogLabel: string
    readonly description: string
    readonly degraded: boolean
    readonly regions: readonly (LumenScopeOption & {
      readonly status: string
      readonly degraded: boolean
    })[]
  }
  readonly notice: {
    readonly title: string
    readonly description: string
    readonly readMore: string
    readonly dismiss: string
  }
  readonly account: {
    readonly initials: string
    readonly name: string
    readonly email: string
    readonly items: readonly LumenScopeMenuOption[]
  }
  readonly onScope: (kind: LumenScopeKind, id: string) => void
  readonly onQuery: (value: string) => void
  readonly onAction: (action: 'create' | 'navigate' | 'read-more' | 'account', id?: string) => void
}
const unique = <T extends { readonly id: string }>(items: readonly T[]): T[] => [
  ...new Map(items.map((item) => [item.id, item])).values(),
]

function ScopeMenu({
  label,
  triggerLabel,
  children,
  groups,
  action,
  className = '',
  onSelect,
  onAction,
}: {
  readonly label: string
  readonly triggerLabel?: string
  readonly children: React.ReactNode
  readonly groups: readonly {
    readonly id: string
    readonly label: string
    readonly showLabel?: boolean
    readonly options: readonly LumenScopeMenuOption[]
    readonly selectedId?: string | null
  }[]
  readonly action?: string
  readonly className?: string
  readonly onSelect: (group: string, id: string) => void
  readonly onAction?: () => void
}) {
  const [open, setOpen] = React.useState(false),
    [active, setActive] = React.useState(0),
    [highlight, setHighlight] = React.useState(false)
  const anchor = React.useRef<HTMLDivElement>(null),
    trigger = React.useRef<HTMLButtonElement>(null),
    menu = React.useRef<HTMLDivElement>(null)
  const uid = React.useId()
  const entries = groups.flatMap((group) => unique(group.options).map((option) => ({ group: group.id, ...option })))
  const size = entries.length + (action ? 1 : 0)
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  const choose = (index: number) => {
    const item = entries[index]
    if (item) onSelect(item.group, item.id)
    else if (index === entries.length && action) onAction?.()
    close()
  }
  React.useEffect(() => {
    if (!open) return
    menu.current?.focus()
    const owner = anchor.current?.ownerDocument
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target)) setOpen(false)
    }
    owner?.addEventListener('pointerdown', outside)
    return () => owner?.removeEventListener('pointerdown', outside)
  }, [open])
  return (
    <div ref={anchor} className={`lumen-scope-menu-anchor ${className}`}>
      <LumenButton
        ref={trigger}
        size="s"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setActive(
            Math.max(
              0,
              entries.findIndex((item) =>
                groups.some((group) => group.id === item.group && group.selectedId === item.id),
              ),
            ),
          )
          setHighlight(groups.some((group) => group.selectedId !== undefined))
          setOpen(!open)
        }}
      >
        {children}
      </LumenButton>
      {open ? (
        <div
          ref={menu}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          aria-activedescendant={size ? `${uid}-${active}` : undefined}
          className="lumen-scope-menu"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              close()
            } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault()
              setActive((current) =>
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? Math.max(0, size - 1)
                    : (current + (event.key === 'ArrowDown' ? 1 : size - 1)) % Math.max(1, size),
              )
              setHighlight(true)
            } else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              choose(active)
            } else if (event.key === 'Tab') setOpen(false)
          }}
        >
          {groups.map((group) => (
            <div key={group.id} role="group" aria-label={group.label}>
              {group.showLabel ? <p className="lumen-scope-menu-label">{group.label}</p> : null}
              {unique(group.options).map((option) => {
                const index = entries.findIndex((item) => item.group === group.id && item.id === option.id)
                return (
                  <button
                    key={option.id}
                    id={`${uid}-${index}`}
                    type="button"
                    role={group.selectedId === undefined ? 'menuitem' : 'menuitemradio'}
                    aria-checked={group.selectedId === undefined ? undefined : group.selectedId === option.id}
                    tabIndex={-1}
                    data-active={highlight && index === active}
                    onPointerMove={() => {
                      setActive(index)
                      setHighlight(true)
                    }}
                    onClick={() => choose(index)}
                  >
                    {option.icon
                      ? React.createElement(menuIcons[option.icon], {
                          className: 'lumen-scope-icon',
                          'aria-hidden': true,
                        })
                      : null}
                    <span>{option.label}</span>
                    {group.selectedId === option.id ? (
                      <Check className="lumen-scope-icon-sm" aria-hidden="true" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          ))}
          {action ? (
            <button
              id={`${uid}-${entries.length}`}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="lumen-scope-create-option"
              data-active={highlight && active === entries.length}
              onPointerMove={() => {
                setActive(entries.length)
                setHighlight(true)
              }}
              onClick={() => choose(entries.length)}
            >
              <Plus className="lumen-scope-icon-sm" aria-hidden="true" />
              {action}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ScopeStatus({ status }: { readonly status: LumenAppShellScopeContent['status'] }) {
  const [open, setOpen] = React.useState(false),
    anchor = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!open) return
    const owner = anchor.current?.ownerDocument
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target)) setOpen(false)
    }
    owner?.addEventListener('pointerdown', outside)
    return () => owner?.removeEventListener('pointerdown', outside)
  }, [open])
  return (
    <div
      className="lumen-scope-status-anchor"
      ref={anchor}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <LumenButton
        size="s"
        aria-label={status.triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <i className="lumen-scope-dot" data-degraded={status.degraded} />
        <span>{status.label}</span>
      </LumenButton>
      {open ? (
        <div role="dialog" aria-label={status.dialogLabel} className="lumen-scope-status-popover">
          <p>{status.description}</p>
          <div>
            {unique(status.regions).map((region) => (
              <div key={region.id}>
                <span>{region.label}</span>
                <span>
                  <i className="lumen-scope-dot" data-degraded={region.degraded} />
                  {region.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ScopeSidebar({
  content,
  drawer,
  close,
  dataOpen,
  setDataOpen,
  notice,
  dismiss,
}: {
  readonly content: LumenAppShellScopeContent
  readonly drawer: boolean
  readonly close: () => void
  readonly dataOpen: boolean
  readonly setDataOpen: (open: boolean) => void
  readonly notice: boolean
  readonly dismiss: () => void
}) {
  const searchId = React.useId()
  const link = (item: LumenScopeOption, icon?: keyof typeof navigationIcons) => {
    const Icon = icon ? navigationIcons[icon] : null
    return (
      <a
        href="#databases"
        aria-current={content.currentNavigationId === item.id ? 'page' : undefined}
        onClick={() => content.onAction('navigate', item.id)}
      >
        {Icon ? <Icon className="lumen-scope-icon" aria-hidden="true" /> : null}
        <span>{item.label}</span>
      </a>
    )
  }
  return (
    <>
      <div className="lumen-scope-search-row">
        <label htmlFor={searchId} className="lumen-scope-search">
          <Search className="lumen-scope-icon" aria-hidden="true" />
          <span className="lumen-scope-sr-only">{content.labels.search}</span>
          <input
            id={searchId}
            type="search"
            value={content.query}
            placeholder={content.labels.searchPlaceholder}
            onChange={(event) => content.onQuery(event.target.value)}
          />
        </label>
        {drawer ? (
          <LumenIconButton label={content.labels.closeNavigation} onClick={close}>
            <X className="lumen-scope-icon" aria-hidden="true" />
          </LumenIconButton>
        ) : null}
      </div>
      <nav className="lumen-scope-navigation" aria-label={content.labels.project}>
        <p>{content.labels.project}</p>
        <ul>
          {unique(content.navigation).map((item) => (
            <li key={item.id}>
              {item.children ? (
                <>
                  <button type="button" aria-expanded={dataOpen} onClick={() => setDataOpen(!dataOpen)}>
                    <Database className="lumen-scope-icon" aria-hidden="true" />
                    <span>{item.label}</span>
                    <ChevronDown className="lumen-scope-icon-sm" data-open={dataOpen} aria-hidden="true" />
                  </button>
                  <ul hidden={!dataOpen}>
                    {unique(item.children).map((child) => (
                      <li key={child.id}>{link(child)}</li>
                    ))}
                  </ul>
                </>
              ) : (
                link(item, item.icon)
              )}
            </li>
          ))}
        </ul>
        <p>{content.labels.environment}</p>
        <ul>
          {unique(content.environmentNavigation).map((item) => (
            <li key={item.id}>{link(item, item.icon)}</li>
          ))}
        </ul>
      </nav>
      {notice ? (
        <div className="lumen-scope-notice">
          <p>{content.notice.title}</p>
          <p>{content.notice.description}</p>
          <div>
            <LumenButton size="s" onClick={() => content.onAction('read-more')}>
              {content.notice.readMore}
            </LumenButton>
            <LumenButton size="s" onClick={dismiss}>
              {content.notice.dismiss}
            </LumenButton>
          </div>
        </div>
      ) : null}
      <div className="lumen-scope-account">
        <ScopeMenu
          label={content.labels.account}
          className="lumen-scope-account-menu"
          groups={[{ id: 'account', label: content.labels.account, options: content.account.items }]}
          onSelect={(_group, id) => content.onAction('account', id)}
        >
          <span className="lumen-scope-avatar">{content.account.initials}</span>
          <span className="lumen-scope-user">
            <span>{content.account.name}</span>
            <span>{content.account.email}</span>
          </span>
          <ChevronsUpDown className="lumen-scope-icon-sm" aria-hidden="true" />
        </ScopeMenu>
      </div>
    </>
  )
}

function DatabasePane({ content }: { readonly content: LumenAppShellScopeContent }) {
  const records = unique(content.databases),
    pane = React.useRef<HTMLDivElement>(null)
  const [edges, setEdges] = React.useState({ top: false, bottom: false })
  const measure = React.useCallback(() => {
    const element = pane.current
    if (element)
      setEdges((current) => {
        const top = element.scrollTop > 1,
          bottom = element.scrollHeight > element.clientHeight + element.scrollTop + 1
        return current.top === top && current.bottom === bottom ? current : { top, bottom }
      })
  }, [])
  React.useEffect(() => {
    const element = pane.current
    if (!element) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const child of element.children) observer.observe(child)
    return () => observer.disconnect()
  }, [content.databases, measure])
  const status = (record: LumenScopeDatabase) => (
    <span className="lumen-scope-record-status">
      <i className="lumen-scope-dot" data-degraded={record.tone === 'degraded'} data-tone={record.tone} />
      {record.status}
    </span>
  )
  return (
    <main className="lumen-scope-main">
      <div className="lumen-scope-heading">
        <h1 id="databases">{content.labels.databases}</h1>
        <span>{content.labels.count(records.length)}</span>
        <LumenButton
          variant="solid"
          indicator="none"
          aria-label={content.labels.createDatabase}
          onClick={() => content.onAction('create', 'database')}
        >
          <Plus className="lumen-scope-icon" aria-hidden="true" />
          <span className="lumen-scope-create-short">{content.labels.createShort}</span>
          <span className="lumen-scope-create-full">{content.labels.createDatabase}</span>
        </LumenButton>
      </div>
      <div className="lumen-scope-scroll-frame" data-top={edges.top} data-bottom={edges.bottom}>
        <div className="lumen-scope-records" ref={pane} onScroll={measure}>
          {records.length ? (
            <>
              <table>
                <caption className="lumen-scope-sr-only">{content.labels.table}</caption>
                <thead>
                  <tr>
                    {content.labels.columns.map((column, index) => (
                      <th key={index} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td title={record.name}>{record.name}</td>
                      <td>{record.region}</td>
                      <td>{status(record)}</td>
                      <td>{record.connections}</td>
                      <td>{record.backup}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="lumen-scope-cards">
                {records.map((record) => (
                  <li key={record.id}>
                    <p title={record.name}>{record.name}</p>
                    <div>
                      {status(record)}
                      <span>{record.region}</span>
                    </div>
                    <div>
                      <span>
                        {content.labels.columns[3]} <span>{record.connections}</span>
                      </span>
                      <span>{record.backup}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="lumen-scope-empty">{content.labels.empty}</p>
          )}
        </div>
      </div>
    </main>
  )
}

export function AppShellScope({ content }: { readonly content: LumenAppShellScopeContent }) {
  const root = React.useRef<HTMLDivElement>(null),
    trigger = React.useRef<HTMLButtonElement>(null)
  const [narrow, setNarrow] = React.useState(false),
    [open, setOpen] = React.useState(true),
    [dataOpen, setDataOpen] = React.useState(true),
    [notice, setNotice] = React.useState(true)
  React.useEffect(() => {
    const element = root.current
    if (!element) return
    const update = () => setNarrow(element.clientWidth < 1024)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  const select = (kind: string, id: string) => {
    if (
      (kind === 'organisation' || kind === 'project' || kind === 'environment') &&
      content.pickers[kind].options.some((option) => option.id === id)
    )
      content.onScope(kind, id)
  }
  const picker = (kind: LumenScopeKind) => {
    const item = content.pickers[kind],
      current = unique(item.options).find((option) => option.id === item.selectedId),
      label = current?.label ?? content.labels.missingScope
    return (
      <ScopeMenu
        label={item.label}
        triggerLabel={item.triggerLabel(label)}
        groups={[{ id: kind, ...item }]}
        action={item.create}
        onSelect={select}
        onAction={() => content.onAction('create', kind)}
      >
        <span>{label}</span>
        <ChevronsUpDown className="lumen-scope-icon-xs" aria-hidden="true" />
      </ScopeMenu>
    )
  }
  const sidebar = (drawer: boolean) => (
    <ScopeSidebar
      content={content}
      drawer={drawer}
      close={close}
      dataOpen={dataOpen}
      setDataOpen={setDataOpen}
      notice={notice}
      dismiss={() => setNotice(false)}
    />
  )
  return (
    <div ref={root} className="lumen-scope-shell">
      <header role="banner" className="lumen-scope-header">
        <LumenIconButton
          ref={trigger}
          size="s"
          className="lumen-scope-open"
          label={content.labels.openNavigation}
          aria-expanded={narrow && open}
          onClick={() => setOpen(!open)}
        >
          <Menu className="lumen-scope-icon" aria-hidden="true" />
        </LumenIconButton>
        <span className="lumen-scope-brand">{content.brandMark}</span>
        <span className="lumen-scope-sr-only">{content.brand}</span>
        <nav aria-label={content.labels.scope}>
          <div className="lumen-scope-wide-pickers">
            {picker('organisation')}
            <span aria-hidden="true">{content.labels.separator}</span>
            {picker('project')}
          </div>
          <div className="lumen-scope-combined">
            <ScopeMenu
              label={content.labels.combined}
              triggerLabel={content.labels.combined}
              groups={(['organisation', 'project'] as const).map((kind) => ({
                id: kind,
                ...content.pickers[kind],
                showLabel: true,
              }))}
              onSelect={select}
            >
              <MoreHorizontal className="lumen-scope-icon" aria-hidden="true" />
            </ScopeMenu>
          </div>
          <span aria-hidden="true">{content.labels.separator}</span>
          {picker('environment')}
        </nav>
        <ScopeStatus status={content.status} />
      </header>
      <div className="lumen-scope-body">
        <aside className="lumen-scope-sidebar">{sidebar(false)}</aside>
        <DatabasePane content={content} />
      </div>
      {narrow && open ? (
        <div className="lumen-scope-overlay">
          <button
            type="button"
            className="lumen-scope-backdrop"
            aria-label={content.labels.closeOverlay}
            onClick={close}
          />
          <aside
            className="lumen-scope-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={content.labels.navigation}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                close()
              }
            }}
          >
            {sidebar(true)}
          </aside>
        </div>
      ) : null}
    </div>
  )
}
