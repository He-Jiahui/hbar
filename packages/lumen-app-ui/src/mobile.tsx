'use client'

import * as React from 'react'
import { LumenInput } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenText } from './primitives'
import { LumenTabs } from './ui-controls'
import './mobile.css'

export interface LumenMobileListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenMobileTab {
  readonly id: string
  readonly label: string
  readonly badge?: string | undefined
  readonly icon?: LumenMobileIcon | undefined
}

export type LumenMobileIcon =
  | 'filter'
  | 'chevron'
  | 'arrow'
  | 'search'
  | 'plus'
  | 'menu'
  | 'close'
  | 'play'
  | 'home'
  | 'inbox'
  | 'calendar'
  | 'reports'
  | 'bell'
  | 'bookmark'
  | 'user'
  | 'box'
  | 'message'
  | 'more'

export interface LumenMobileSelection {
  readonly id: string | undefined
  readonly onChange: (id: string) => void
}

export interface LumenMobileActionItem {
  readonly id: string
  readonly label: string
  readonly detail?: string | undefined
  readonly icon?: LumenMobileIcon | undefined
  readonly avatar?: string | undefined
}

export interface LumenMobileActionMenu {
  readonly label: string
  readonly close: string
  readonly dismiss: string
  readonly items: readonly LumenMobileActionItem[]
}

export interface LumenMobileNavigationGroup {
  readonly id: string
  readonly label: string
  readonly items?: readonly LumenMobileActionItem[] | undefined
  readonly expanded?: boolean | undefined
}

export interface LumenMobileFeedItem {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly description?: string | undefined
  readonly area?: string | undefined
}

export interface LumenMobileActivityContent {
  readonly pages?:
    | readonly {
        readonly id: string
        readonly title: string
        readonly description: string
        readonly items: readonly LumenMobileFeedItem[]
      }[]
    | undefined
  readonly selection?: LumenMobileSelection | undefined
  readonly filter?: { readonly value: boolean; readonly onChange: (value: boolean) => void } | undefined
  readonly labels: {
    readonly brand: string
    readonly filterAll: string
    readonly filterArea: string
    readonly title: string
    readonly detailAll: string
    readonly detailFiltered: string
    readonly navigation: string
    readonly open: (title: string) => string
    readonly route: (label: string) => string
    readonly empty: string
  }
  readonly avatar: string
  readonly filterAreaId: string
  readonly items: readonly LumenMobileFeedItem[]
  readonly tabs: readonly LumenMobileTab[]
  readonly initialTabId: string
  readonly listStrategy: LumenMobileListStrategy
}

export interface LumenMobileTask {
  readonly id: string
  readonly title: string
  readonly due: string
  readonly complete: boolean
}

export interface LumenMobileTasksContent {
  readonly quickActions?: LumenMobileActionMenu | undefined
  readonly searchEnabled?: boolean | undefined
  readonly draft?: { readonly query: string; readonly onChange: (query: string) => void } | undefined
  readonly onComplete?: ((id: string, value: boolean) => void) | undefined
  readonly labels: {
    readonly title: string
    readonly searchOpen: string
    readonly searchClose: string
    readonly searchPlaceholder: string
    readonly openCount: (count: number) => string
    readonly toggle: (title: string) => string
    readonly noResults: string
    readonly add: string
    readonly newTask: string
    readonly noDue: string
  }
  readonly tasks: readonly LumenMobileTask[]
  readonly listStrategy: LumenMobileListStrategy
}

export interface LumenMobileHomeContent {
  readonly search?:
    | {
        readonly tabId: string
        readonly label: string
        readonly placeholder: string
        readonly close: string
        readonly noResults: string
      }
    | undefined
  readonly draft?: { readonly query: string; readonly onChange: (query: string) => void } | undefined
  readonly selection?: LumenMobileSelection | undefined
  readonly labels: {
    readonly title: string
    readonly navigation: string
    readonly open: (title: string) => string
    readonly empty: string
  }
  readonly avatar: string
  readonly cards: readonly LumenMobileFeedItem[]
  readonly tabs: readonly LumenMobileTab[]
  readonly initialTabId: string
  readonly listStrategy: LumenMobileListStrategy
}

export interface LumenMobileOrder {
  readonly id: string
  readonly account: string
  readonly detail: string
}

export interface LumenMobileOrdersContent {
  readonly more?:
    | (LumenMobileActionMenu & {
        readonly moreId: string
        readonly expand: string
        readonly expanded: string
        readonly links: readonly LumenMobileActionItem[]
      })
    | undefined
  readonly selection?: LumenMobileSelection | undefined
  readonly labels: {
    readonly title: string
    readonly recent: string
    readonly navigation: string
    readonly open: (account: string, detail: string) => string
    readonly empty: string
  }
  readonly avatar: string
  readonly orders: readonly LumenMobileOrder[]
  readonly tabs: readonly LumenMobileTab[]
  readonly initialTabId: string
  readonly listStrategy: LumenMobileListStrategy
}

export interface LumenMobileRun {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly stateId: string
}

export interface LumenMobileRunsContent {
  readonly navigation?:
    | {
        readonly label: string
        readonly title: string
        readonly sectionsLabel: string
        readonly groups: readonly LumenMobileNavigationGroup[]
        readonly profile: LumenMobileActionItem
      }
    | undefined
  readonly selection?: LumenMobileSelection | undefined
  readonly labels: {
    readonly title: string
    readonly openMenu: string
    readonly closeMenu: string
    readonly newRun: string
    readonly statuses: string
    readonly menu: string
    readonly empty: (label: string) => string
    readonly queuedTitle: string
    readonly queuedDetail: string
    readonly open: (title: string) => string
  }
  readonly states: readonly LumenMobileTab[]
  readonly initialStateId: string
  readonly runs: readonly LumenMobileRun[]
  readonly listStrategy: LumenMobileListStrategy
}

export interface LumenMobileContent {
  readonly onAction?: ((event: LumenMobileAction) => void) | undefined
  readonly presentation?: { readonly ownerId: string; readonly notice?: string | undefined } | undefined
  readonly activity?: LumenMobileActivityContent | undefined
  readonly tasks?: LumenMobileTasksContent | undefined
  readonly home?: LumenMobileHomeContent | undefined
  readonly orders?: LumenMobileOrdersContent | undefined
  readonly runs?: LumenMobileRunsContent | undefined
  readonly tabBar?: LumenMobileTabBarContent | undefined
  readonly actions?: LumenMobileActionContent | undefined
  readonly search?: LumenMobileSearchContent | undefined
  readonly sheet?: LumenMobileSheetContent | undefined
  readonly menu?: LumenMobileMenuContent | undefined
}

export interface LumenMobileProviderProps {
  readonly content: LumenMobileContent
  readonly children: React.ReactNode
}

export interface LumenMobileAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenMobileProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenMobileContent | undefined
  readonly onAction?: ((event: LumenMobileAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenMobileVariantProps = Omit<LumenMobileProps, 'variant' | 'variantId'>

const Context = React.createContext<LumenMobileContent | undefined>(undefined)

export function LumenMobileProvider({ content, children }: LumenMobileProviderProps) {
  return <Context.Provider value={content}>{children}</Context.Provider>
}

export function useLumenMobileContent() {
  return React.useContext(Context)
}

export function uniqueLumenMobileItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export function selectLumenMobileItem<T extends { readonly id: string }>(
  items: readonly T[],
  id: string | undefined,
): T | undefined {
  const valid = uniqueLumenMobileItems(items)
  return valid.find((item) => item.id === id) ?? valid[0]
}

const report = (fn: LumenMobileProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({ name, tier = 'md' }: { readonly name: LumenMobileIcon; readonly tier?: 'sm' | 'md' | 'lg' }) {
  const paths: Record<LumenMobileIcon, string> = {
    filter: 'M2.5 3h11M2.5 8h11M2.5 13h11M6 1v4M10 6v4M5 11v4',
    chevron: 'm6 3 5 5-5 5',
    arrow: 'M4 12 12 4M5 4h7v7',
    search: 'm11 11 3 3m-2-7a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
    plus: 'M8 3v10M3 8h10',
    menu: 'M2 4h12M2 8h12M2 12h12',
    close: 'M3 3l10 10M13 3 3 13',
    play: 'M5 3l8 5-8 5z',
    home: 'm2 7 6-5 6 5v7H2zM6 14V9h4v5',
    inbox: 'M3 3h10l2 10H1zM1.8 9H5l1 2h4l1-2h3.2',
    calendar: 'M3 3h10v11H3zM5 1v4M11 1v4M3 7h10M5 9h1M9 9h1M5 12h1M9 12h1',
    reports: 'M3 14V8M8 14V2M13 14V5',
    bell: 'M3 11h10l-1-2V6a4 4 0 0 0-8 0v3zM6 14h4',
    bookmark: 'M4 2h8v12l-4-3-4 3z',
    user: 'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 14a5 5 0 0 1 10 0',
    box: 'm2 5 6-3 6 3v7l-6 3-6-3zM2 5l6 3 6-3M8 8v7M5 3.5l6 3',
    message: 'M2 2h12v9H6l-4 3z',
    more: 'm4 10 4-4 4 4',
  }
  return (
    <svg className={`lumen-mobile-glyph lumen-mobile-icon-${tier}`} viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

function Root({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  children,
}: Omit<LumenMobileProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const contentClassName = [
    'lumen-mobile-stage',
    `hbar-app-ui-mobile-variant-${variant}`,
    density ? `hbar-app-ui-density-${density}` : '',
    surface ? `hbar-app-ui-surface-${surface}` : '',
    state ? `hbar-app-ui-state-${state}` : '',
    visualMode ? `hbar-app-ui-visual-${visualMode}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <LumenSurface
      as="section"
      boundary="horizontal"
      className="lumen-mobile-stage-surface"
      contentClassName={contentClassName}
      data-lumen-component="mobile"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function Phone({ children }: { readonly children: React.ReactNode }) {
  return <div className="lumen-mobile-phone">{children}</div>
}

function Header({
  title,
  avatar,
  actions,
}: {
  readonly title: string
  readonly avatar?: string | undefined
  readonly actions?: React.ReactNode
}) {
  return (
    <header className="lumen-mobile-header">
      <strong>{title}</strong>
      <div>
        {actions}
        {avatar ? <span className="lumen-mobile-avatar">{avatar}</span> : null}
      </div>
    </header>
  )
}

function Empty({ children }: { readonly children: string }) {
  return (
    <LumenText as="p" className="lumen-mobile-empty" tone="muted">
      {children}
    </LumenText>
  )
}

function Tabs({
  tabs,
  value,
  label,
  onChange,
  iconOnly = false,
  asTabs = true,
  expandedId,
  moreId,
}: {
  readonly tabs: readonly LumenMobileTab[]
  readonly value: string | undefined
  readonly label: string
  readonly onChange: (id: string) => void
  readonly iconOnly?: boolean
  readonly asTabs?: boolean
  readonly expandedId?: string | undefined
  readonly moreId?: string | undefined
}) {
  return (
    <nav
      className={`lumen-mobile-tabs${iconOnly ? ' is-icon-only' : ''}`}
      aria-label={label}
      role={asTabs ? 'tablist' : undefined}
      onKeyDown={asTabs ? (event) => moveTab(event, tabs, value, onChange) : undefined}
    >
      {tabs.map((tab) => (
        <LumenButton
          key={tab.id}
          variant="text"
          role={asTabs ? 'tab' : undefined}
          aria-selected={asTabs ? value === tab.id : undefined}
          tabIndex={asTabs ? (value === tab.id ? 0 : -1) : undefined}
          aria-label={tab.label}
          aria-current={value === tab.id ? 'page' : undefined}
          aria-expanded={tab.id === moreId ? expandedId === tab.id : undefined}
          data-mobile-more-trigger={tab.id === moreId ? '' : undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon && (
            <span className="lumen-mobile-tab-symbol">
              <Glyph name={tab.icon} tier="lg" />
              {tab.badge ? <small>{tab.badge}</small> : null}
            </span>
          )}
          {(!iconOnly || !tab.icon) && <span>{tab.label}</span>}
          {!tab.icon && tab.badge ? <small>{tab.badge}</small> : null}
        </LumenButton>
      ))}
    </nav>
  )
}

function moveTab(
  event: React.KeyboardEvent<HTMLElement>,
  tabs: readonly LumenMobileTab[],
  value: string | undefined,
  onChange: (id: string) => void,
) {
  if (!tabs.length || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const current = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === value),
  )
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
  const next = tabs[index]
  if (!next) return
  onChange(next.id)
  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus()
}

function Feed({
  items,
  empty,
  open,
  onAction,
  strategy,
  cards = false,
  interactive = true,
}: {
  readonly items: readonly LumenMobileFeedItem[]
  readonly empty: string
  readonly open: (title: string) => string
  readonly onAction: LumenMobileProps['onAction']
  readonly strategy: LumenMobileListStrategy
  readonly cards?: boolean
  readonly interactive?: boolean
}) {
  const values = uniqueLumenMobileItems(items)
  return (
    <div
      className={`lumen-mobile-feed${cards ? ' lumen-mobile-card-feed' : ''}`}
      data-hbar-app-ui-list-strategy={strategy.kind}
      data-hbar-app-ui-expected-maximum={strategy.expectedMaximum}
    >
      {values.length ? (
        values.map((item) =>
          interactive ? (
            <LumenButton
              key={item.id}
              variant="text"
              aria-label={open(item.title)}
              onClick={() => report(onAction, 'open', item.id)}
            >
              <span>
                <strong>{item.title}</strong>
                {item.description ? (
                  <LumenText as="small" tone="muted">
                    {item.description}
                  </LumenText>
                ) : null}
                <small>{item.detail}</small>
              </span>
              <Glyph name={cards ? 'arrow' : 'chevron'} tier="sm" />
            </LumenButton>
          ) : (
            <div key={item.id} className="lumen-mobile-card">
              <span>
                <LumenText as="p">
                  <strong>{item.title}</strong>
                </LumenText>
                {item.description && (
                  <LumenText as="p" tone="muted">
                    {item.description}
                  </LumenText>
                )}
                <LumenText as="p" tone="muted">
                  {item.detail}
                </LumenText>
              </span>
              <Glyph name="arrow" tier="sm" />
            </div>
          ),
        )
      ) : (
        <Empty>{empty}</Empty>
      )}
    </div>
  )
}

function Activity(props: Omit<LumenMobileProps, 'content'> & { content: LumenMobileActivityContent }) {
  const tabs = uniqueLumenMobileItems(props.content.tabs)
  const items = uniqueLumenMobileItems(props.content.items)
  const [localTabId, setTabId] = React.useState(props.content.initialTabId)
  const [localFiltered, setFiltered] = React.useState(false)
  const tabId = props.content.selection ? props.content.selection.id : localTabId
  const filtered = props.content.filter?.value ?? localFiltered
  const visible = items.filter((item) => !filtered || item.area === props.content.filterAreaId)
  const tab = selectLumenMobileItem(tabs, tabId)
  const page = props.content.pages?.find((entry) => entry.id === tab?.id)
  return (
    <Root {...props}>
      <Phone>
        <Header
          title={props.content.labels.brand}
          avatar={props.content.avatar}
          actions={
            <LumenIconButton
              label={filtered ? props.content.labels.filterAll : props.content.labels.filterArea}
              aria-pressed={filtered}
              onClick={() => {
                if (props.content.filter) {
                  props.content.filter.onChange(!filtered)
                  return
                }
                setFiltered((value) => !value)
                report(props.onAction, 'filter', filtered ? 'all' : props.content.filterAreaId)
              }}
            >
              <Glyph name="filter" />
            </LumenIconButton>
          }
        />
        <main className="lumen-mobile-content">
          {page ? (
            <>
              <section className="lumen-mobile-heading">
                <LumenText as="h2" variant="title">
                  {page.title}
                </LumenText>
                <LumenText as="p" tone="muted">
                  {page.description}
                </LumenText>
              </section>
              <Feed
                items={page.items}
                empty={props.content.labels.empty}
                open={props.content.labels.open}
                onAction={props.onAction}
                strategy={props.content.listStrategy}
              />
            </>
          ) : tab?.id === props.content.initialTabId ? (
            <>
              <section className="lumen-mobile-heading">
                <LumenText as="h2" variant="title">
                  {props.content.labels.title}
                </LumenText>
                <LumenText as="p" tone="muted">
                  {filtered ? props.content.labels.detailFiltered : props.content.labels.detailAll}
                </LumenText>
              </section>
              <Feed
                items={visible}
                empty={props.content.labels.empty}
                open={props.content.labels.open}
                onAction={props.onAction}
                strategy={props.content.listStrategy}
              />
            </>
          ) : (
            <section className="lumen-mobile-route">
              <LumenText as="h2" variant="title">
                {tab?.label ?? ''}
              </LumenText>
              <LumenText as="p" tone="muted">
                {props.content.labels.route(tab?.label ?? '')}
              </LumenText>
            </section>
          )}
        </main>
        <Tabs
          tabs={tabs}
          value={tab?.id}
          label={props.content.labels.navigation}
          onChange={(id) => {
            if (props.content.selection) {
              props.content.selection.onChange(id)
              return
            }
            setTabId(id)
            report(props.onAction, 'tabs', id)
          }}
        />
      </Phone>
    </Root>
  )
}

function Tasks(props: Omit<LumenMobileProps, 'content'> & { content: LumenMobileTasksContent }) {
  const source = uniqueLumenMobileItems(props.content.tasks)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [actionsOpen, setActionsOpen] = React.useState(false)
  const actionTrigger = React.useRef<HTMLButtonElement>(null)
  const closeActions = () => {
    setActionsOpen(false)
    actionTrigger.current?.focus()
  }
  const [localQuery, setQuery] = React.useState('')
  const tasks = source
  const query = props.content.draft?.query ?? localQuery
  const open = tasks.filter((task) => !task.complete)
  const visible = open.filter((task) => task.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return (
    <Root {...props}>
      <Phone>
        <Header
          title={props.content.labels.title}
          actions={
            <LumenIconButton
              label={searchOpen ? props.content.labels.searchClose : props.content.labels.searchOpen}
              aria-pressed={searchOpen}
              onClick={() =>
                props.content.searchEnabled === false
                  ? report(props.onAction, 'search')
                  : setSearchOpen((value) => !value)
              }
            >
              <Glyph name="search" />
            </LumenIconButton>
          }
        />
        <main className="lumen-mobile-content">
          {searchOpen ? (
            <label className="lumen-mobile-search">
              <Glyph name="search" />
              <LumenInput
                autoFocus
                value={query}
                onChange={(event) =>
                  props.content.draft
                    ? props.content.draft.onChange(event.currentTarget.value)
                    : setQuery(event.currentTarget.value)
                }
                placeholder={props.content.labels.searchPlaceholder}
                aria-label={props.content.labels.searchPlaceholder}
              />
            </label>
          ) : null}
          <LumenText as="p" tone="muted" variant="supporting">
            {props.content.labels.openCount(open.length)}
          </LumenText>
          <div
            className="lumen-mobile-tasks"
            data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
            data-hbar-app-ui-expected-maximum={props.content.listStrategy.expectedMaximum}
          >
            {visible.length ? (
              visible.map((task) => (
                <LumenButton
                  key={task.id}
                  variant="text"
                  aria-pressed={task.complete}
                  aria-label={props.content.labels.toggle(task.title)}
                  onClick={() => {
                    if (props.content.onComplete) props.content.onComplete(task.id, !task.complete)
                    else report(props.onAction, 'confirm', task.id)
                  }}
                >
                  <i />
                  <span>
                    <strong>{task.title}</strong>
                    <small>{task.due}</small>
                  </span>
                </LumenButton>
              ))
            ) : (
              <Empty>{props.content.labels.noResults}</Empty>
            )}
          </div>
        </main>
        {actionsOpen && props.content.quickActions && (
          <div
            className="lumen-mobile-action-layer"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                closeActions()
              }
            }}
          >
            <LumenButton
              className="lumen-mobile-action-backdrop"
              aria-label={props.content.quickActions.dismiss}
              onClick={closeActions}
            />
            <nav className="lumen-mobile-quick-action-panel" aria-label={props.content.quickActions.label}>
              {uniqueLumenMobileItems(props.content.quickActions.items).map((item, index) => (
                <LumenButton
                  key={item.id}
                  autoFocus={index === 0}
                  variant="text"
                  onClick={() => {
                    closeActions()
                    report(props.onAction, 'quick-action', item.id)
                  }}
                >
                  <span>{item.label}</span>
                  {item.icon && <Glyph name={item.icon} />}
                </LumenButton>
              ))}
            </nav>
          </div>
        )}
        <footer className="lumen-mobile-floating">
          <LumenIconButton
            ref={actionTrigger}
            label={
              actionsOpen && props.content.quickActions ? props.content.quickActions.close : props.content.labels.add
            }
            aria-expanded={props.content.quickActions ? actionsOpen : undefined}
            onClick={() =>
              props.content.quickActions
                ? actionsOpen
                  ? closeActions()
                  : setActionsOpen(true)
                : report(props.onAction, 'quick-actions')
            }
          >
            <Glyph name="plus" />
          </LumenIconButton>
        </footer>
      </Phone>
    </Root>
  )
}

function Home(props: Omit<LumenMobileProps, 'content'> & { content: LumenMobileHomeContent }) {
  const tabs = uniqueLumenMobileItems(props.content.tabs)
  const [localTabId, setTabId] = React.useState(props.content.initialTabId)
  const tabId = props.content.selection ? props.content.selection.id : localTabId
  const [localQuery, setQuery] = React.useState('')
  const query = props.content.draft?.query ?? localQuery
  const search = props.content.search
  const searching = Boolean(search && search.tabId === tabId)
  const changeTab = (id: string) => {
    if (props.content.selection) props.content.selection.onChange(id)
    else {
      setTabId(id)
      report(props.onAction, 'tabs', id)
    }
  }
  const matches = uniqueLumenMobileItems(props.content.cards).filter((item) =>
    `${item.title} ${item.description ?? ''} ${item.detail}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  )
  return (
    <Root {...props}>
      <Phone>
        <Header title={props.content.labels.title} avatar={props.content.avatar} />
        <main className="lumen-mobile-content">
          <Feed
            items={props.content.cards}
            empty={props.content.labels.empty}
            open={props.content.labels.open}
            onAction={props.onAction}
            strategy={props.content.listStrategy}
            cards
            interactive={false}
          />
        </main>
        <div className={`lumen-mobile-home-dock${searching ? ' is-searching' : ''}`}>
          {searching && search ? (
            <>
              <section className="lumen-mobile-search-results" aria-label={search.label}>
                {matches.length ? (
                  matches.map((item) => (
                    <LumenButton
                      key={item.id}
                      variant="text"
                      aria-label={props.content.labels.open(item.title)}
                      onClick={() => report(props.onAction, 'open', item.id)}
                    >
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </LumenButton>
                  ))
                ) : (
                  <Empty>{search.noResults}</Empty>
                )}
              </section>
              <div className="lumen-mobile-home-search">
                <Glyph name="search" />
                <LumenInput
                  autoFocus
                  aria-label={search.label}
                  placeholder={search.placeholder}
                  value={query}
                  onChange={(event) => {
                    if (props.content.draft) props.content.draft.onChange(event.currentTarget.value)
                    else setQuery(event.currentTarget.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      changeTab(props.content.initialTabId)
                    }
                  }}
                />
                <LumenIconButton label={search.close} onClick={() => changeTab(props.content.initialTabId)}>
                  <Glyph name="close" />
                </LumenIconButton>
              </div>
            </>
          ) : (
            <Tabs
              tabs={tabs}
              value={selectLumenMobileItem(tabs, tabId)?.id}
              label={props.content.labels.navigation}
              iconOnly
              asTabs={false}
              onChange={changeTab}
            />
          )}
        </div>
      </Phone>
    </Root>
  )
}

function Orders(props: Omit<LumenMobileProps, 'content'> & { content: LumenMobileOrdersContent }) {
  const tabs = uniqueLumenMobileItems(props.content.tabs)
  const orders = uniqueLumenMobileItems(props.content.orders)
  const [localTabId, setTabId] = React.useState(props.content.initialTabId)
  const tabId = props.content.selection ? props.content.selection.id : localTabId
  const [moreOpen, setMoreOpen] = React.useState(false)
  const [moreExpanded, setMoreExpanded] = React.useState(false)
  const phone = React.useRef<HTMLDivElement>(null)
  const more = props.content.more
  const closeMore = () => {
    setMoreOpen(false)
    setMoreExpanded(false)
    phone.current?.querySelector<HTMLButtonElement>('[data-mobile-more-trigger]')?.focus()
  }
  const chooseMore = (id: string) => {
    closeMore()
    report(props.onAction, 'destination', id)
  }
  return (
    <Root {...props}>
      <div className="lumen-mobile-phone" ref={phone}>
        <Header title={props.content.labels.title} avatar={props.content.avatar} />
        <main className="lumen-mobile-content">
          <LumenText as="p" tone="muted" variant="supporting">
            {props.content.labels.recent}
          </LumenText>
          <div
            className="lumen-mobile-feed lumen-mobile-card-feed"
            data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
            data-hbar-app-ui-expected-maximum={props.content.listStrategy.expectedMaximum}
          >
            {orders.length ? (
              orders.map((order) => (
                <LumenButton
                  key={order.id}
                  variant="text"
                  aria-label={props.content.labels.open(order.account, order.detail)}
                  onClick={() => report(props.onAction, 'open', order.id)}
                >
                  <span>
                    <strong>{order.account}</strong>
                    <small>{order.detail}</small>
                  </span>
                  <Glyph name="arrow" tier="sm" />
                </LumenButton>
              ))
            ) : (
              <Empty>{props.content.labels.empty}</Empty>
            )}
          </div>
        </main>
        {moreOpen && more && (
          <div
            className="lumen-mobile-more-layer"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                closeMore()
              }
            }}
          >
            <LumenButton
              type="button"
              className="lumen-mobile-action-backdrop"
              aria-label={more.dismiss}
              onClick={closeMore}
            />
            <section
              className={`lumen-mobile-more-panel${moreExpanded ? ' is-expanded' : ''}`}
              role="dialog"
              aria-modal="true"
              aria-label={more.label}
            >
              <header>
                <LumenIconButton
                  label={moreExpanded ? more.expanded : more.expand}
                  aria-expanded={moreExpanded}
                  autoFocus
                  onClick={() => setMoreExpanded((value) => !value)}
                >
                  <Glyph name="more" />
                </LumenIconButton>
                <LumenIconButton label={more.close} onClick={closeMore}>
                  <Glyph name="close" />
                </LumenIconButton>
              </header>
              <nav className="lumen-mobile-more-shortcuts" aria-label={more.label}>
                {uniqueLumenMobileItems(more.items).map((item) => (
                  <LumenButton key={item.id} variant="text" onClick={() => chooseMore(item.id)}>
                    {item.icon && <Glyph name={item.icon} tier="lg" />}
                    <strong>{item.label}</strong>
                    {item.detail && <small>{item.detail}</small>}
                  </LumenButton>
                ))}
              </nav>
              <nav className="lumen-mobile-more-links" aria-label={more.label}>
                {uniqueLumenMobileItems(more.links).map((item) => (
                  <LumenButton key={item.id} variant="text" onClick={() => chooseMore(item.id)}>
                    {item.label}
                    <Glyph name="chevron" tier="sm" />
                  </LumenButton>
                ))}
              </nav>
            </section>
          </div>
        )}
        <Tabs
          tabs={tabs}
          value={selectLumenMobileItem(tabs, tabId)?.id}
          label={props.content.labels.navigation}
          asTabs={false}
          expandedId={moreOpen ? more?.moreId : undefined}
          moreId={more?.moreId}
          onChange={(id) => {
            if (more?.moreId === id) {
              setMoreOpen((value) => !value)
              setMoreExpanded(false)
              return
            }
            setMoreOpen(false)
            if (props.content.selection) {
              props.content.selection.onChange(id)
              return
            }
            setTabId(id)
            report(props.onAction, 'tabs', id)
          }}
        />
      </div>
    </Root>
  )
}

function Runs(props: Omit<LumenMobileProps, 'content'> & { content: LumenMobileRunsContent }) {
  const states = uniqueLumenMobileItems(props.content.states)
  const source = uniqueLumenMobileItems(props.content.runs)
  const runs = source
  const [localStateId, setStateId] = React.useState(props.content.initialStateId)
  const stateId = props.content.selection ? props.content.selection.id : localStateId
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({})
  const menuTrigger = React.useRef<HTMLButtonElement>(null)
  const navigation = props.content.navigation
  const closeMenu = () => {
    setMenuOpen(false)
    menuTrigger.current?.focus()
  }
  const navigate = (id: string) => {
    closeMenu()
    report(props.onAction, 'navigate', id)
  }
  const state = selectLumenMobileItem(states, stateId)
  const visible = runs.filter((run) => run.stateId === state?.id)
  const changeState = (id: string) => {
    if (props.content.selection) props.content.selection.onChange(id)
    else {
      setStateId(id)
      report(props.onAction, 'tabs', id)
    }
  }
  return (
    <Root {...props}>
      <Phone>
        <header className="lumen-mobile-header lumen-mobile-run-header">
          <LumenIconButton
            ref={menuTrigger}
            label={props.content.labels.openMenu}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Glyph name="menu" />
          </LumenIconButton>
          <strong>{props.content.labels.title}</strong>
          <LumenIconButton label={props.content.labels.newRun} onClick={() => report(props.onAction, 'new-run')}>
            <Glyph name="plus" />
          </LumenIconButton>
        </header>
        <div
          className="lumen-mobile-run-tabs"
          role="tablist"
          aria-label={props.content.labels.statuses}
          onKeyDown={(event) => moveTab(event, states, state?.id, changeState)}
        >
          {states.map((item) => (
            <LumenButton
              key={item.id}
              role="tab"
              variant="text"
              aria-selected={state?.id === item.id}
              tabIndex={state?.id === item.id ? 0 : -1}
              onClick={() => changeState(item.id)}
            >
              {item.label}
            </LumenButton>
          ))}
        </div>
        <main className="lumen-mobile-content">
          <div
            className="lumen-mobile-runs"
            data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
            data-hbar-app-ui-expected-maximum={props.content.listStrategy.expectedMaximum}
          >
            {visible.length ? (
              visible.map((run) => (
                <LumenButton
                  key={run.id}
                  variant="text"
                  aria-label={props.content.labels.open(run.title)}
                  onClick={() => report(props.onAction, 'open', run.id)}
                >
                  <span className="lumen-mobile-run-icon">
                    <Glyph name="play" />
                  </span>
                  <span>
                    <strong>{run.title}</strong>
                    <small>{run.detail}</small>
                  </span>
                </LumenButton>
              ))
            ) : (
              <section className="lumen-mobile-route">
                <LumenText as="h2" variant="title">
                  {state?.label ?? ''}
                </LumenText>
                <LumenText as="p" tone="muted">
                  {props.content.labels.empty(state?.label ?? '')}
                </LumenText>
              </section>
            )}
          </div>
        </main>
        {menuOpen ? (
          <section
            className="lumen-mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label={navigation?.label ?? props.content.labels.menu}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                closeMenu()
              }
            }}
          >
            <header>
              <strong>{navigation?.title ?? props.content.labels.menu}</strong>
              <LumenIconButton label={props.content.labels.closeMenu} autoFocus onClick={closeMenu}>
                <Glyph name="close" />
              </LumenIconButton>
            </header>
            {navigation ? (
              <>
                <nav className="lumen-mobile-section-list" aria-label={navigation.sectionsLabel}>
                  {uniqueLumenMobileItems(navigation.groups).map((group) =>
                    group.items?.length ? (
                      <div key={group.id} data-expanded={expandedGroups[group.id] ?? group.expanded}>
                        <LumenButton
                          type="button"
                          variant="text"
                          aria-expanded={expandedGroups[group.id] ?? group.expanded}
                          onClick={() =>
                            setExpandedGroups((current) => ({
                              ...current,
                              [group.id]: !(current[group.id] ?? group.expanded),
                            }))
                          }
                        >
                          {group.label}
                          <Glyph name="chevron" tier="sm" />
                        </LumenButton>
                        {(expandedGroups[group.id] ?? group.expanded) &&
                          uniqueLumenMobileItems(group.items).map((item) => (
                            <LumenButton key={item.id} variant="text" onClick={() => navigate(item.id)}>
                              {item.label}
                            </LumenButton>
                          ))}
                      </div>
                    ) : (
                      <LumenButton
                        key={group.id}
                        variant="text"
                        aria-expanded={group.items ? false : undefined}
                        onClick={() => navigate(group.id)}
                      >
                        {group.label}
                        {group.items && <Glyph name="chevron" tier="sm" />}
                      </LumenButton>
                    ),
                  )}
                </nav>
                <LumenButton
                  className="lumen-mobile-menu-profile"
                  variant="text"
                  onClick={() => navigate(navigation.profile.id)}
                >
                  <span className="lumen-mobile-avatar">
                    {navigation.profile.avatar ?? <Glyph name={navigation.profile.icon ?? 'user'} />}
                  </span>
                  <span>
                    <strong>{navigation.profile.label}</strong>
                    <small>{navigation.profile.detail}</small>
                  </span>
                  <Glyph name="chevron" tier="sm" />
                </LumenButton>
              </>
            ) : (
              states.map((item) => (
                <LumenButton
                  key={item.id}
                  variant="text"
                  onClick={() => {
                    if (props.content.selection) props.content.selection.onChange(item.id)
                    else setStateId(item.id)
                    setMenuOpen(false)
                  }}
                >
                  {item.label}
                </LumenButton>
              ))
            )}
          </section>
        ) : null}
      </Phone>
    </Root>
  )
}

function empty(props: LumenMobileProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenMobile(props: LumenMobileProps) {
  const inheritedContent = useLumenMobileContent()
  const content = props.content ?? inheritedContent
  const controlled = content?.onAction ? { ...props, onAction: content.onAction } : props
  const result = renderMobile(controlled, content)
  const presentation = content?.presentation
  return presentation ? (
    <div className="lumen-mobile-preview-owner" data-hbar-preview-owner={presentation.ownerId}>
      {presentation.notice && (
        <p className="lumen-mobile-preview-notice" role="status">
          {presentation.notice}
        </p>
      )}
      {result}
    </div>
  ) : (
    result
  )
}

function renderMobile(props: LumenMobileProps, content: LumenMobileContent | undefined) {
  if (props.variant === 1 && content?.tabBar) return <TabBar {...props} content={content.tabBar} />
  if (props.variant === 2 && content?.actions) return <Actions {...props} content={content.actions} />
  if (props.variant === 3 && content?.search) return <Search {...props} content={content.search} />
  if (props.variant === 4 && content?.sheet) return <Sheet {...props} content={content.sheet} />
  if (props.variant === 5 && content?.menu) return <Menu {...props} content={content.menu} />
  if (props.variant === 1) return content?.activity ? <Activity {...props} content={content.activity} /> : empty(props)
  if (props.variant === 2) return content?.tasks ? <Tasks {...props} content={content.tasks} /> : empty(props)
  if (props.variant === 3) return content?.home ? <Home {...props} content={content.home} /> : empty(props)
  if (props.variant === 4) return content?.orders ? <Orders {...props} content={content.orders} /> : empty(props)
  if (props.variant === 5) return content?.runs ? <Runs {...props} content={content.runs} /> : empty(props)
  return empty(props)
}

function variant(value: number, props: LumenMobileVariantProps) {
  return <LumenMobile {...props} variant={value} variantId={`hbar-app-ui-mobile-${value}`} />
}

export const LumenMobile01 = (props: LumenMobileVariantProps) => variant(1, props),
  LumenMobile02 = (props: LumenMobileVariantProps) => variant(2, props),
  LumenMobile03 = (props: LumenMobileVariantProps) => variant(3, props),
  LumenMobile04 = (props: LumenMobileVariantProps) => variant(4, props),
  LumenMobile05 = (props: LumenMobileVariantProps) => variant(5, props)

export interface LumenMobileNavItem {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly badge?: string | undefined
  readonly disabled?: boolean | undefined
}

export interface LumenMobileTabBarContent {
  readonly labels: {
    readonly title: string
    readonly navigation: string
    readonly open: (label: string) => string
    readonly empty: string
  }
  readonly avatar: string
  readonly tabs: readonly LumenMobileNavItem[]
  readonly panels: readonly LumenMobileNavItem[]
  readonly initialTabId: string
  readonly listStrategy: LumenMobileListStrategy
}

export interface LumenMobileActionContent {
  readonly labels: {
    readonly title: string
    readonly open: string
    readonly close: string
    readonly primary: string
    readonly quickAction: (label: string) => string
    readonly empty: string
  }
  readonly actions: readonly LumenMobileNavItem[]
  readonly listStrategy: LumenMobileListStrategy
}

export interface LumenMobileSearchContent {
  readonly labels: {
    readonly title: string
    readonly open: string
    readonly close: string
    readonly placeholder: string
    readonly result: (label: string) => string
    readonly empty: string
  }
  readonly results: readonly LumenMobileNavItem[]
  readonly listStrategy: LumenMobileListStrategy
}

export interface LumenMobileSheetContent {
  readonly labels: {
    readonly title: string
    readonly navigation: string
    readonly open: string
    readonly close: string
    readonly expand: string
    readonly collapse: string
    readonly openDestination: (label: string) => string
  }
  readonly tabs: readonly LumenMobileNavItem[]
  readonly shortcuts: readonly LumenMobileNavItem[]
  readonly destinations: readonly LumenMobileNavItem[]
  readonly initialTabId: string
  readonly listStrategy: LumenMobileListStrategy
}

export interface LumenMobileMenuSection {
  readonly id: string
  readonly label: string
  readonly items: readonly LumenMobileNavItem[]
}

export interface LumenMobileMenuContent {
  readonly labels: {
    readonly title: string
    readonly open: string
    readonly close: string
    readonly navigation: string
    readonly section: (label: string) => string
    readonly openItem: (label: string) => string
  }
  readonly segments: readonly LumenMobileNavItem[]
  readonly sections: readonly LumenMobileMenuSection[]
  readonly initialSegmentId: string
  readonly listStrategy: LumenMobileListStrategy
}

function ItemList({
  items,
  empty,
  actionLabel,
  onAction,
  strategy,
}: {
  readonly items: readonly LumenMobileNavItem[]
  readonly empty: string
  readonly actionLabel: (label: string) => string
  readonly onAction: LumenMobileProps['onAction']
  readonly strategy: LumenMobileListStrategy
}) {
  const values = uniqueLumenMobileItems(items)
  return (
    <div className="lumen-mobile-feed" data-hbar-app-ui-list-strategy={strategy.kind}>
      {values.length ? (
        values.map((item) => (
          <LumenButton
            key={item.id}
            variant="text"
            disabled={item.disabled}
            aria-label={actionLabel(item.label)}
            onClick={() => report(onAction, 'open', item.id)}
          >
            <span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
            <Glyph name="chevron" />
          </LumenButton>
        ))
      ) : (
        <LumenText as="p" className="lumen-mobile-empty" tone="muted">
          {empty}
        </LumenText>
      )}
    </div>
  )
}

function TabBar(props: Omit<LumenMobileProps, 'content'> & { readonly content: LumenMobileTabBarContent }) {
  const tabs = uniqueLumenMobileItems(props.content.tabs)
  const panels = uniqueLumenMobileItems(props.content.panels)
  const [tabId, setTabId] = React.useState(props.content.initialTabId)
  const active = selectLumenMobileItem(tabs, tabId)
  const panel = panels.find((item) => item.id === active?.id) ?? panels[0]
  return (
    <Root {...props}>
      <Phone>
        <Header title={props.content.labels.title} avatar={props.content.avatar} />
        <main className="lumen-mobile-content">
          <section className="lumen-mobile-heading">
            <LumenText as="h2" variant="title">
              {panel?.label ?? props.content.labels.title}
            </LumenText>
            <LumenText as="p" tone="muted">
              {panel?.detail ?? props.content.labels.empty}
            </LumenText>
          </section>
          <ItemList
            items={panel ? [panel] : []}
            empty={props.content.labels.empty}
            actionLabel={props.content.labels.open}
            onAction={props.onAction}
            strategy={props.content.listStrategy}
          />
        </main>
        <nav className="lumen-mobile-tabs" aria-label={props.content.labels.navigation}>
          {tabs.map((tab) => (
            <LumenButton
              key={tab.id}
              variant="text"
              aria-current={active?.id === tab.id ? 'page' : undefined}
              onClick={() => {
                setTabId(tab.id)
                report(props.onAction, 'select-tab', tab.id)
              }}
            >
              <span>{tab.label}</span>
              {tab.badge ? <small>{tab.badge}</small> : null}
            </LumenButton>
          ))}
        </nav>
      </Phone>
    </Root>
  )
}

function Actions(props: Omit<LumenMobileProps, 'content'> & { readonly content: LumenMobileActionContent }) {
  const [open, setOpen] = React.useState(false)
  const actions = uniqueLumenMobileItems(props.content.actions)
  return (
    <Root {...props}>
      <Phone>
        <Header title={props.content.labels.title} />
        <main className="lumen-mobile-content lumen-mobile-action-canvas">
          <LumenText as="h2" variant="title">
            {props.content.labels.title}
          </LumenText>
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        </main>
        {open ? <div className="lumen-mobile-scrim hbar-app-ui-dialog-backdrop" aria-hidden="true" /> : null}
        <div className={`lumen-mobile-action-dock${open ? ' is-open' : ''}`}>
          {open ? (
            <div className="lumen-mobile-action-list" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
              {actions.map((item) => (
                <LumenButton
                  key={item.id}
                  variant="outlined"
                  aria-label={props.content.labels.quickAction(item.label)}
                  onClick={() => report(props.onAction, 'quick-action', item.id)}
                >
                  <Glyph name="plus" />
                  <span>{item.label}</span>
                </LumenButton>
              ))}
            </div>
          ) : null}
          <LumenButton
            tone="primary"
            className="lumen-mobile-action-trigger"
            aria-expanded={open}
            aria-label={open ? props.content.labels.close : props.content.labels.open}
            onClick={() => {
              setOpen((value) => !value)
              report(props.onAction, open ? 'close-actions' : 'open-actions')
            }}
          >
            <Glyph name={open ? 'close' : 'plus'} />
            <span>{open ? props.content.labels.close : props.content.labels.primary}</span>
          </LumenButton>
        </div>
      </Phone>
    </Root>
  )
}

function Search(props: Omit<LumenMobileProps, 'content'> & { readonly content: LumenMobileSearchContent }) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const results = uniqueLumenMobileItems(props.content.results).filter((item) =>
    item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )
  return (
    <Root {...props}>
      <Phone>
        <Header
          title={props.content.labels.title}
          actions={
            <LumenIconButton
              label={open ? props.content.labels.close : props.content.labels.open}
              aria-pressed={open}
              onClick={() => setOpen((value) => !value)}
            >
              <Glyph name="search" />
            </LumenIconButton>
          }
        />
        <main className="lumen-mobile-content lumen-mobile-search-results">
          {open ? (
            <React.Fragment>
              <LumenText as="p" tone="muted">
                {query ? props.content.labels.result(query) : props.content.labels.open}
              </LumenText>
              <ItemList
                items={results}
                empty={props.content.labels.empty}
                actionLabel={props.content.labels.result}
                onAction={props.onAction}
                strategy={props.content.listStrategy}
              />
            </React.Fragment>
          ) : null}
        </main>
        <div className={`lumen-mobile-search-dock${open ? ' is-open' : ''}`}>
          <Glyph name="search" />
          {open ? (
            <LumenInput
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={props.content.labels.placeholder}
              aria-label={props.content.labels.placeholder}
            />
          ) : (
            <LumenText as="span" tone="muted">
              {props.content.labels.placeholder}
            </LumenText>
          )}
        </div>
      </Phone>
    </Root>
  )
}

function Sheet(props: Omit<LumenMobileProps, 'content'> & { readonly content: LumenMobileSheetContent }) {
  const tabs = uniqueLumenMobileItems(props.content.tabs)
  const [tabId, setTabId] = React.useState(props.content.initialTabId)
  const [expanded, setExpanded] = React.useState(false)
  const active = selectLumenMobileItem(tabs, tabId)
  return (
    <Root {...props}>
      <Phone>
        <Header title={props.content.labels.title} />
        <main className="lumen-mobile-content">
          <LumenText as="h2" variant="title">
            {active?.label ?? props.content.labels.title}
          </LumenText>
          <LumenText as="p" tone="muted">
            {active?.detail}
          </LumenText>
        </main>
        <section className={`lumen-mobile-sheet${expanded ? ' is-expanded' : ''}`}>
          <header>
            <strong>{props.content.labels.navigation}</strong>
            <LumenIconButton
              label={expanded ? props.content.labels.collapse : props.content.labels.expand}
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              <Glyph name={expanded ? 'close' : 'plus'} />
            </LumenIconButton>
          </header>
          {expanded ? (
            <React.Fragment>
              <div className="lumen-mobile-shortcuts" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
                {props.content.shortcuts.map((item) => (
                  <LumenButton
                    key={item.id}
                    variant="outlined"
                    onClick={() => report(props.onAction, 'shortcut', item.id)}
                  >
                    {item.label}
                  </LumenButton>
                ))}
              </div>
              <ItemList
                items={props.content.destinations}
                empty={props.content.labels.navigation}
                actionLabel={props.content.labels.openDestination}
                onAction={props.onAction}
                strategy={props.content.listStrategy}
              />
            </React.Fragment>
          ) : null}
          <nav className="lumen-mobile-tabs" aria-label={props.content.labels.navigation}>
            {tabs.map((tab) => (
              <LumenButton
                key={tab.id}
                variant="text"
                aria-current={active?.id === tab.id ? 'page' : undefined}
                onClick={() => setTabId(tab.id)}
              >
                {tab.label}
              </LumenButton>
            ))}
          </nav>
        </section>
      </Phone>
    </Root>
  )
}

function Menu(props: Omit<LumenMobileProps, 'content'> & { readonly content: LumenMobileMenuContent }) {
  const segments = uniqueLumenMobileItems(props.content.segments)
  const [segmentId, setSegmentId] = React.useState(props.content.initialSegmentId)
  const [open, setOpen] = React.useState(false)
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})
  const active = selectLumenMobileItem(segments, segmentId)
  return (
    <Root {...props}>
      <Phone>
        <Header
          title={props.content.labels.title}
          actions={
            <LumenIconButton
              label={open ? props.content.labels.close : props.content.labels.open}
              aria-pressed={open}
              onClick={() => setOpen((value) => !value)}
            >
              <Glyph name={open ? 'close' : 'menu'} />
            </LumenIconButton>
          }
        />
        <LumenTabs
          className="lumen-mobile-segmented"
          label={props.content.labels.navigation}
          items={segments}
          selectedId={active?.id ?? null}
          onChange={setSegmentId}
        />
        <main className="lumen-mobile-content">
          <LumenText as="h2" variant="title">
            {active?.label}
          </LumenText>
          <LumenText as="p" tone="muted">
            {active?.detail}
          </LumenText>
        </main>
        {open ? (
          <section
            className="lumen-mobile-menu hbar-app-ui-dialog-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={props.content.labels.open}
          >
            <header>
              <strong>{props.content.labels.title}</strong>
              <LumenIconButton label={props.content.labels.close} onClick={() => setOpen(false)}>
                <Glyph name="close" />
              </LumenIconButton>
            </header>
            <div
              className="lumen-mobile-menu-sections"
              data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
            >
              {props.content.sections.map((section) => {
                const isExpanded = expanded[section.id] ?? section.id === active?.id
                return (
                  <section key={section.id}>
                    <LumenButton
                      variant="text"
                      aria-expanded={isExpanded}
                      aria-label={props.content.labels.section(section.label)}
                      onClick={() => setExpanded((current) => ({ ...current, [section.id]: !isExpanded }))}
                    >
                      {section.label}
                      <Glyph name="chevron" />
                    </LumenButton>
                    {isExpanded ? (
                      <div>
                        {section.items.map((item) => (
                          <LumenButton
                            key={item.id}
                            variant="text"
                            aria-label={props.content.labels.openItem(item.label)}
                            onClick={() => report(props.onAction, 'menu-item', item.id)}
                          >
                            <span>{item.label}</span>
                            <small>{item.detail}</small>
                          </LumenButton>
                        ))}
                      </div>
                    ) : null}
                  </section>
                )
              })}
            </div>
          </section>
        ) : null}
      </Phone>
    </Root>
  )
}
