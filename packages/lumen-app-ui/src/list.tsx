'use client'

import * as React from 'react'
import { LumenCheckBoxControl, LumenInput, LumenChoiceSelect } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'
import './list.css'
import './list-reference.css'
import LumenListReference from './list-reference'
import { type LumenListReferenceContent } from './list-reference-contracts'
import { LumenProgress, LumenTabs } from './ui-controls'

export interface LumenListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenListChoice {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean | undefined
}

export interface LumenListMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly description: string
  readonly formula: string
}

export interface LumenListMetricsContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly expand: (label: string) => string
    readonly collapse: (label: string) => string
    readonly empty: string
  }
  readonly items: readonly LumenListMetric[]
  readonly listStrategy: LumenListStrategy
}

export interface LumenListSpendItem {
  readonly id: string
  readonly name: string
  readonly share: number
  readonly amount: string
}

export interface LumenListSpendContent {
  readonly labels: {
    readonly title: string
    readonly detail: (period: string) => string
    readonly periods: string
    readonly progress: (name: string) => string
    readonly open: (name: string) => string
    readonly empty: string
  }
  readonly periods: readonly LumenListChoice[]
  readonly initialPeriodId: string
  readonly initialSelectedId: string
  readonly items: readonly LumenListSpendItem[]
  readonly listStrategy: LumenListStrategy
}

export interface LumenListSecurityEvent {
  readonly id: string
  readonly kindId: string
  readonly kind: string
  readonly title: string
  readonly meta: string
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger'
}

export interface LumenListSecurityContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly filters: string
    readonly empty: string
  }
  readonly filters: readonly LumenListChoice[]
  readonly allFilterId: string
  readonly initialFilterId: string
  readonly events: readonly LumenListSecurityEvent[]
  readonly listStrategy: LumenListStrategy
}

export interface LumenListQueueItem {
  readonly id: string
  readonly title: string
}

export interface LumenListQueueContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly status: string
    readonly moveUp: (title: string) => string
    readonly moveDown: (title: string) => string
    readonly instructions: string
    readonly empty: string
  }
  readonly items: readonly LumenListQueueItem[]
  readonly listStrategy: LumenListStrategy
}

export interface LumenListAsset {
  readonly id: string
  readonly kindId?: string | undefined
  readonly name: string
  readonly detail: string
}

export interface LumenListAssetsContent {
  readonly labels: {
    readonly title: string
    readonly detail: (count: number) => string
    readonly filters?: string | undefined
    readonly clear: string
    readonly select: (name: string) => string
    readonly archive: (count: number) => string
    readonly empty: string
  }
  readonly filters?: readonly LumenListChoice[] | undefined
  readonly allFilterId?: string | undefined
  readonly initialFilterId?: string | undefined
  readonly assets: readonly LumenListAsset[]
  readonly listStrategy: LumenListStrategy
}

export interface LumenListDelivery {
  readonly id: string
  readonly status: string
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger'
  readonly endpoint: string
  readonly endpointId?: string | undefined
  readonly payload: string
  readonly failed: boolean
}

export interface LumenListDeliveriesContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly failedOnly: string
    readonly endpoint?: string | undefined
    readonly expand: (id: string) => string
    readonly collapse: (id: string) => string
    readonly replay: string
    readonly empty: string
  }
  readonly endpoints?: readonly LumenListChoice[] | undefined
  readonly allEndpointId?: string | undefined
  readonly initialEndpointId?: string | undefined
  readonly deliveries: readonly LumenListDelivery[]
  readonly listStrategy: LumenListStrategy
}

export interface LumenListSupplier {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly categoryId?: string | undefined
  readonly status: string
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger'
}

export interface LumenListSuppliersContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly search: string
    readonly searchPlaceholder: string
    readonly categoryFilter: string
    readonly supplier: string
    readonly category: string
    readonly status: string
    readonly empty: string
  }
  readonly categories?: readonly LumenListChoice[] | undefined
  readonly allCategoryId?: string | undefined
  readonly initialCategoryId?: string | undefined
  readonly suppliers: readonly LumenListSupplier[]
  readonly listStrategy: LumenListStrategy
}

export interface LumenListMessage {
  readonly id: string
  readonly title: string
  readonly meta: string
  readonly avatar: string
}

export interface LumenListInboxContent {
  readonly labels: {
    readonly title: string
    readonly detail: (count: number) => string
    readonly unread: string
    readonly archive: (title: string) => string
    readonly snooze: string
    readonly archived: (title: string) => string
    readonly undo: string
    readonly empty: string
  }
  readonly messages: readonly LumenListMessage[]
  readonly listStrategy: LumenListStrategy
}

export interface LumenListContact {
  readonly id: string
  readonly name: string
  readonly letterId: string
  readonly avatar: string
  readonly meta: string
  readonly relationshipId?: string | undefined
}

export interface LumenListContactsContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly relationship: string
    readonly letters: string
    readonly empty: string
  }
  readonly relationships?: readonly LumenListChoice[] | undefined
  readonly allRelationshipId?: string | undefined
  readonly initialRelationshipId?: string | undefined
  readonly letters: readonly LumenListChoice[]
  readonly initialLetterId: string
  readonly contacts: readonly LumenListContact[]
  readonly listStrategy: LumenListStrategy
}

export interface LumenListRunbookStep {
  readonly id: string
  readonly title: string
}

export interface LumenListRunbookContent {
  readonly labels: {
    readonly title: string
    readonly detail: (done: number, total: number) => string
    readonly resolved: string
    readonly inProgress: string
    readonly progress: string
    readonly done: string
    readonly pending: string
    readonly empty: string
  }
  readonly initialCompletedCount: number
  readonly steps: readonly LumenListRunbookStep[]
  readonly listStrategy: LumenListStrategy
}

export interface LumenListLeaderboardEntry {
  readonly id: string
  readonly name: string
  readonly values: Readonly<Record<string, string>>
  readonly trend: string
  readonly trendTone: 'success' | 'danger' | 'neutral'
}

export interface LumenListLeaderboardContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly measures: string
    readonly periods?: string | undefined
    readonly empty: string
  }
  readonly measures: readonly LumenListChoice[]
  readonly initialMeasureId: string
  readonly periods?: readonly LumenListChoice[] | undefined
  readonly initialPeriodId?: string | undefined
  readonly entries: readonly LumenListLeaderboardEntry[]
  readonly listStrategy: LumenListStrategy
}

export interface LumenListTreeNode {
  readonly id: string
  readonly name: string
  readonly children?: readonly LumenListTreeNode[] | undefined
}

export interface LumenListTreeContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly expand: (name: string) => string
    readonly collapse: (name: string) => string
    readonly open: (name: string) => string
    readonly empty: string
  }
  readonly initialOpenIds: readonly string[]
  readonly nodes: readonly LumenListTreeNode[]
  readonly listStrategy: LumenListStrategy
}

export interface LumenListContent {
  readonly reference?: LumenListReferenceContent | undefined
  readonly presentation?: { readonly ownerId: string; readonly notice?: string | undefined } | undefined
  readonly metrics?: LumenListMetricsContent | undefined
  readonly spend?: LumenListSpendContent | undefined
  readonly security?: LumenListSecurityContent | undefined
  readonly queue?: LumenListQueueContent | undefined
  readonly assets?: LumenListAssetsContent | undefined
  readonly deliveries?: LumenListDeliveriesContent | undefined
  readonly suppliers?: LumenListSuppliersContent | undefined
  readonly inbox?: LumenListInboxContent | undefined
  readonly contacts?: LumenListContactsContent | undefined
  readonly runbook?: LumenListRunbookContent | undefined
  readonly leaderboard?: LumenListLeaderboardContent | undefined
  readonly tree?: LumenListTreeContent | undefined
}

export interface LumenListProviderProps {
  readonly content: LumenListContent
  readonly children: React.ReactNode
}

export interface LumenListAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenListProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenListContent | undefined
  readonly onAction?: ((event: LumenListAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenListVariantProps = Omit<LumenListProps, 'variant' | 'variantId'>

const Context = React.createContext<LumenListContent | undefined>(undefined)

export function LumenListProvider({ content, children }: LumenListProviderProps) {
  return <Context.Provider value={content}>{children}</Context.Provider>
}

export function useLumenListContent() {
  return React.useContext(Context)
}

export function uniqueLumenListItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenListItem<T extends { readonly id: string }>(
  items: readonly T[],
  id: string | undefined,
): T | undefined {
  return items.find((item) => item.id === id) ?? items[0]
}

const report = (fn: LumenListProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({
  name,
}: {
  name:
    | 'check'
    | 'chevron'
    | 'filter'
    | 'up'
    | 'down'
    | 'archive'
    | 'replay'
    | 'search'
    | 'inbox'
    | 'undo'
    | 'folder'
    | 'file'
}) {
  const paths = {
    check: 'm3 8 3 3 7-7',
    chevron: 'm6 3 5 5-5 5',
    filter: 'M2.5 3h11L9.3 8v4l-2.6 1V8z',
    up: 'm4 9 4-4 4 4',
    down: 'm4 7 4 4 4-4',
    archive: 'M2.5 5h11v8h-11zM2 3h12v2H2zm4 5h4',
    replay: 'M4 5V2L1.5 4.5 4 7V5a5 5 0 1 1-1 3',
    search: 'm11 11 3 3m-2-7a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
    inbox: 'M2.5 3.5h11v9h-11zm0 5h3l1 2h3l1-2h3',
    undo: 'M5 5H2l2.5-2.5M2.5 5A6 6 0 1 1 4 11',
    folder: 'M1.5 4h5l1.5 2h6.5v7h-13z',
    file: 'M4 1.5h5l3 3v10H4zm5 0v3h3',
  }
  return (
    <svg className="lumen-list-glyph" viewBox="0 0 16 16" aria-hidden="true">
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
}: Omit<LumenListProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const contentClassName = [
    'lumen-list',
    `hbar-app-ui-list-variant-${variant}`,
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
      className="lumen-list-surface"
      contentClassName={contentClassName}
      data-lumen-component="list"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-density={density}
      data-hbar-app-ui-surface={surface}
      data-hbar-app-ui-state={state}
      data-hbar-app-ui-visual={visualMode}
    >
      {children}
    </LumenSurface>
  )
}

function Header({ title, detail, actions }: { title: string; detail: string; actions?: React.ReactNode }) {
  return (
    <header className="lumen-list-header">
      <div>
        <LumenText as="h2" variant="title">
          {title}
        </LumenText>
        <LumenText as="p" variant="supporting" tone="muted">
          {detail}
        </LumenText>
      </div>
      {actions}
    </header>
  )
}

function Empty({ children }: { readonly children: string }) {
  return (
    <LumenText as="p" className="lumen-list-empty" tone="muted">
      {children}
    </LumenText>
  )
}

function Progress({ value, label }: { readonly value: number; readonly label: string }) {
  return <LumenProgress className="lumen-list-progress" label={label} value={value} tone="info" />
}

function Metrics(props: Omit<LumenListProps, 'content'> & { content: LumenListMetricsContent }) {
  const items = uniqueLumenListItems(props.content.items)
  const [openId, setOpenId] = React.useState<string>()
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-list-metrics" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {items.length ? (
          items.map((item) => {
            const open = item.id === openId
            return (
              <article key={item.id}>
                <LumenButton
                  variant="text"
                  aria-expanded={open}
                  aria-label={
                    open ? props.content.labels.collapse(item.label) : props.content.labels.expand(item.label)
                  }
                  onClick={() => setOpenId(open ? undefined : item.id)}
                >
                  <Glyph name="chevron" />
                  <strong>{item.label}</strong>
                  <b>{item.value}</b>
                </LumenButton>
                {open ? (
                  <div className="lumen-list-detail">
                    <LumenText as="p" tone="muted">
                      {item.description}
                    </LumenText>
                    <LumenText as="code" variant="code">
                      {item.formula}
                    </LumenText>
                  </div>
                ) : null}
              </article>
            )
          })
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}

function Spend(props: Omit<LumenListProps, 'content'> & { content: LumenListSpendContent }) {
  const periods = uniqueLumenListItems(props.content.periods ?? [])
  const items = uniqueLumenListItems(props.content.items)
  const [periodId, setPeriodId] = React.useState(props.content.initialPeriodId)
  const [selectedId, setSelectedId] = React.useState(props.content.initialSelectedId)
  const period = selectLumenListItem(periods, periodId)
  const selected = selectLumenListItem(items, selectedId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail(period?.label ?? '')} />
      <LumenTabs
        className="lumen-list-tabs"
        label={props.content.labels.periods}
        items={periods}
        selectedId={period?.id ?? null}
        onChange={setPeriodId}
      />
      <div className="lumen-list-ranked" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {items.length ? (
          items.map((item, index) => (
            <LumenButton
              key={item.id}
              variant="text"
              aria-pressed={selected?.id === item.id}
              onClick={() => setSelectedId(item.id)}
            >
              <span>{index + 1}</span>
              <strong>{item.name}</strong>
              <Progress value={item.share} label={props.content.labels.progress(item.name)} />
              <b>{item.amount}</b>
            </LumenButton>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
      {selected ? (
        <LumenButton tone="primary" onClick={() => report(props.onAction, 'open', selected.id)}>
          {props.content.labels.open(selected.name)}
        </LumenButton>
      ) : null}
    </Root>
  )
}

function Security(props: Omit<LumenListProps, 'content'> & { content: LumenListSecurityContent }) {
  const filters = uniqueLumenListItems(props.content.filters)
  const events = uniqueLumenListItems(props.content.events)
  const [filterId, setFilterId] = React.useState(props.content.initialFilterId)
  const filter = selectLumenListItem(filters, filterId)
  const visible = events.filter((event) => filter?.id === props.content.allFilterId || event.kindId === filter?.id)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-list-pills" aria-label={props.content.labels.filters}>
        {filters.map((item) => (
          <LumenButton
            key={item.id}
            size="s"
            variant={filter?.id === item.id ? 'solid' : 'outlined'}
            disabled={item.disabled}
            onClick={() => {
              setFilterId(item.id)
              report(props.onAction, 'filter', item.id)
            }}
          >
            <Glyph name="filter" />
            {item.label}
          </LumenButton>
        ))}
      </div>
      <div className="lumen-list-security" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {visible.length ? (
          visible.map((event) => (
            <article key={event.id}>
              <LumenStatus value={event.kind} tone={event.tone} />
              <div>
                <strong>{event.title}</strong>
                <small>{event.meta}</small>
              </div>
              <Glyph name="chevron" />
            </article>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}

function Queue(props: Omit<LumenListProps, 'content'> & { content: LumenListQueueContent }) {
  const [items, setItems] = React.useState(() => [...uniqueLumenListItems(props.content.items)])
  const [draggedId, setDraggedId] = React.useState<string>()
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= items.length) {
      return
    }
    const next = [...items]
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    setItems(next)
    report(props.onAction, 'reorder', next.map((item) => item.id).join('|'))
  }
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={<LumenStatus value={props.content.labels.status} tone="success" />}
      />
      {items.length ? (
        <ol className="lumen-list-queue" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
          {items.map((item, index) => (
            <li
              key={item.id}
              draggable
              onDragStart={() => setDraggedId(item.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!draggedId || draggedId === item.id) {
                  return
                }
                setItems((current) => {
                  const from = current.findIndex((entry) => entry.id === draggedId)
                  const to = current.findIndex((entry) => entry.id === item.id)
                  if (from < 0 || to < 0) {
                    return current
                  }
                  const next = [...current]
                  const [dragged] = next.splice(from, 1)
                  if (!dragged) {
                    return current
                  }
                  next.splice(to, 0, dragged)
                  report(props.onAction, 'reorder', next.map((entry) => entry.id).join('|'))
                  return next
                })
                setDraggedId(undefined)
              }}
            >
              <span>{index + 1}</span>
              <strong>{item.title}</strong>
              <LumenIconButton
                label={props.content.labels.moveUp(item.title)}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <Glyph name="up" />
              </LumenIconButton>
              <LumenIconButton
                label={props.content.labels.moveDown(item.title)}
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
              >
                <Glyph name="down" />
              </LumenIconButton>
            </li>
          ))}
        </ol>
      ) : (
        <Empty>{props.content.labels.empty}</Empty>
      )}
      <LumenText as="p" tone="muted" variant="supporting" aria-live="polite">
        {props.content.labels.instructions}
      </LumenText>
    </Root>
  )
}

function Assets(props: Omit<LumenListProps, 'content'> & { content: LumenListAssetsContent }) {
  const assets = uniqueLumenListItems(props.content.assets)
  const [selectedIds, setSelectedIds] = React.useState<readonly string[]>([])
  const filters = uniqueLumenListItems(props.content.filters ?? [])
  const [filterId, setFilterId] = React.useState(props.content.initialFilterId)
  const visibleAssets = filters.length
    ? assets.filter((asset) => filterId === props.content.allFilterId || asset.kindId === filterId)
    : assets
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail(selectedIds.length)}
        actions={
          <LumenButton variant="outlined" disabled={!selectedIds.length} onClick={() => setSelectedIds([])}>
            <Glyph name="undo" />
            {props.content.labels.clear}
          </LumenButton>
        }
      />
      {props.content.labels.filters && filters.length ? (
        <div className="lumen-list-pills" role="group" aria-label={props.content.labels.filters}>
          {filters.map((filter) => (
            <LumenButton
              key={filter.id}
              variant={filter.id === filterId ? 'solid' : 'outlined'}
              aria-pressed={filter.id === filterId}
              onClick={() => setFilterId(filter.id)}
            >
              {filter.label}
            </LumenButton>
          ))}
        </div>
      ) : null}
      <div className="lumen-list-assets" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {visibleAssets.length ? (
          visibleAssets.map((asset) => (
            <label key={asset.id} htmlFor={`lumen-list-asset-${asset.id}`}>
              <LumenCheckBoxControl
                id={`lumen-list-asset-${asset.id}`}
                aria-label={props.content.labels.select(asset.name)}
                checked={selectedIds.includes(asset.id)}
                onChange={(event) => {
                  const checked = event.currentTarget.checked
                  setSelectedIds((current) =>
                    checked
                      ? [...current.filter((id) => id !== asset.id), asset.id]
                      : current.filter((id) => id !== asset.id),
                  )
                }}
              />
              <span>
                <strong>{asset.name}</strong>
                <small>{asset.detail}</small>
              </span>
            </label>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
      {selectedIds.length ? (
        <div className="lumen-list-bulk">
          <LumenButton tone="primary" onClick={() => report(props.onAction, 'archive', selectedIds.join('|'))}>
            <Glyph name="archive" />
            {props.content.labels.archive(selectedIds.length)}
          </LumenButton>
        </div>
      ) : null}
    </Root>
  )
}

function DeliveriesLegacy(props: Omit<LumenListProps, 'content'> & { content: LumenListDeliveriesContent }) {
  const deliveries = uniqueLumenListItems(props.content.deliveries)
  const [failedOnly, setFailedOnly] = React.useState(false)
  const [openId, setOpenId] = React.useState<string>()
  const visible = failedOnly ? deliveries.filter((delivery) => delivery.failed) : deliveries
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton variant={failedOnly ? 'solid' : 'outlined'} onClick={() => setFailedOnly((value) => !value)}>
            <Glyph name="filter" />
            {props.content.labels.failedOnly}
          </LumenButton>
        }
      />
      <div className="lumen-list-deliveries" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {visible.length ? (
          visible.map((delivery) => {
            const open = openId === delivery.id
            return (
              <article key={delivery.id}>
                <LumenButton
                  variant="text"
                  aria-expanded={open}
                  aria-label={
                    open ? props.content.labels.collapse(delivery.id) : props.content.labels.expand(delivery.id)
                  }
                  onClick={() => setOpenId(open ? undefined : delivery.id)}
                >
                  <Glyph name="chevron" />
                  <code>{delivery.id}</code>
                  <LumenStatus value={delivery.status} tone={delivery.tone} />
                  <span>{delivery.endpoint}</span>
                </LumenButton>
                {open ? (
                  <div className="lumen-list-detail lumen-list-delivery-detail">
                    <pre>{delivery.payload}</pre>
                    <LumenButton variant="outlined" onClick={() => report(props.onAction, 'replay', delivery.id)}>
                      <Glyph name="replay" />
                      {props.content.labels.replay}
                    </LumenButton>
                  </div>
                ) : null}
              </article>
            )
          })
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}

function SuppliersLegacy(props: Omit<LumenListProps, 'content'> & { content: LumenListSuppliersContent }) {
  const suppliers = uniqueLumenListItems(props.content.suppliers)
  const [query, setQuery] = React.useState('')
  const normalized = query.trim().toLocaleLowerCase()
  const visible = suppliers.filter((supplier) => supplier.name.toLocaleLowerCase().includes(normalized))
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-list-tools">
        <label className="lumen-list-search">
          <span className="lumen-list-visually-hidden">{props.content.labels.search}</span>
          <Glyph name="search" />
          <LumenInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={props.content.labels.searchPlaceholder}
          />
        </label>
        <LumenButton variant="outlined" onClick={() => report(props.onAction, 'filter', 'category')}>
          <Glyph name="filter" />
          {props.content.labels.categoryFilter}
        </LumenButton>
      </div>
      <div
        className="lumen-list-directory"
        role="table"
        data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
      >
        <div role="row" className="lumen-list-directory-head">
          <span role="columnheader">{props.content.labels.supplier}</span>
          <span role="columnheader">{props.content.labels.category}</span>
          <span role="columnheader">{props.content.labels.status}</span>
        </div>
        {visible.length ? (
          visible.map((supplier) => (
            <div role="row" key={supplier.id}>
              <strong role="cell">{supplier.name}</strong>
              <span role="cell">{supplier.category}</span>
              <span role="cell">
                <LumenStatus value={supplier.status} tone={supplier.tone} />
              </span>
            </div>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}

function Inbox(props: Omit<LumenListProps, 'content'> & { content: LumenListInboxContent }) {
  const messages = uniqueLumenListItems(props.content.messages)
  const [archivedIds, setArchivedIds] = React.useState<readonly string[]>([])
  const [undoId, setUndoId] = React.useState<string>()
  const visible = messages.filter((message) => !archivedIds.includes(message.id))
  const undoMessage = messages.find((message) => message.id === undoId)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail(visible.length)}
        actions={
          <LumenButton variant="outlined" onClick={() => report(props.onAction, 'filter', 'unread')}>
            <Glyph name="inbox" />
            {props.content.labels.unread}
          </LumenButton>
        }
      />
      <div className="lumen-list-inbox" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {visible.length ? (
          visible.map((message) => (
            <article key={message.id}>
              <span className="lumen-list-avatar">{message.avatar}</span>
              <div>
                <strong>{message.title}</strong>
                <small>{message.meta}</small>
              </div>
              <LumenIconButton
                label={props.content.labels.archive(message.title)}
                onClick={() => {
                  setArchivedIds((current) => [...current, message.id])
                  setUndoId(message.id)
                  report(props.onAction, 'archive', message.id)
                }}
              >
                <Glyph name="archive" />
              </LumenIconButton>
              <LumenButton variant="text" onClick={() => report(props.onAction, 'snooze', message.id)}>
                {props.content.labels.snooze}
              </LumenButton>
            </article>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
      {undoMessage ? (
        <div className="lumen-list-undo" aria-live="polite">
          <span>{props.content.labels.archived(undoMessage.title)}</span>
          <LumenButton
            variant="text"
            onClick={() => {
              setArchivedIds((current) => current.filter((id) => id !== undoMessage.id))
              setUndoId(undefined)
            }}
          >
            <Glyph name="undo" />
            {props.content.labels.undo}
          </LumenButton>
        </div>
      ) : null}
    </Root>
  )
}

function ContactsLegacy(props: Omit<LumenListProps, 'content'> & { content: LumenListContactsContent }) {
  const letters = uniqueLumenListItems(props.content.letters)
  const contacts = uniqueLumenListItems(props.content.contacts)
  const [letterId, setLetterId] = React.useState(props.content.initialLetterId)
  const letter = selectLumenListItem(letters, letterId)
  const visible = contacts.filter((contact) => contact.letterId === letter?.id)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton variant="outlined" onClick={() => report(props.onAction, 'filter', 'relationship')}>
            {props.content.labels.relationship}
          </LumenButton>
        }
      />
      <div className="lumen-list-contacts">
        <nav aria-label={props.content.labels.letters}>
          {letters.map((item) => (
            <LumenButton
              key={item.id}
              variant="text"
              aria-current={letter?.id === item.id ? 'true' : undefined}
              onClick={() => setLetterId(item.id)}
            >
              {item.label}
            </LumenButton>
          ))}
        </nav>
        <div data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
          {visible.length ? (
            visible.map((contact) => (
              <article key={contact.id}>
                <span className="lumen-list-avatar">{contact.avatar}</span>
                <strong>{contact.name}</strong>
                <small>{contact.meta}</small>
              </article>
            ))
          ) : (
            <Empty>{props.content.labels.empty}</Empty>
          )}
        </div>
      </div>
    </Root>
  )
}

function Runbook(props: Omit<LumenListProps, 'content'> & { content: LumenListRunbookContent }) {
  const steps = uniqueLumenListItems(props.content.steps)
  const initial = Math.max(0, Math.min(steps.length, props.content.initialCompletedCount))
  const [done, setDone] = React.useState(initial)
  const resolved = steps.length > 0 && done === steps.length
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail(done, steps.length)}
        actions={
          <LumenStatus
            value={resolved ? props.content.labels.resolved : props.content.labels.inProgress}
            tone={resolved ? 'success' : 'warning'}
          />
        }
      />
      <Progress value={steps.length ? (done / steps.length) * 100 : 0} label={props.content.labels.progress} />
      <div className="lumen-list-runbook" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {steps.length ? (
          steps.map((step, index) => {
            const complete = index < done
            return (
              <LumenButton
                key={step.id}
                variant="text"
                aria-pressed={complete}
                onClick={() => {
                  setDone((value) => Math.max(value, index + 1))
                  report(props.onAction, 'step', step.id)
                }}
              >
                <span>{complete ? <Glyph name="check" /> : index + 1}</span>
                <strong>{step.title}</strong>
                <small>{complete ? props.content.labels.done : props.content.labels.pending}</small>
              </LumenButton>
            )
          })
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}

function LeaderboardLegacy(props: Omit<LumenListProps, 'content'> & { content: LumenListLeaderboardContent }) {
  const measures = uniqueLumenListItems(props.content.measures ?? [])
  const entries = uniqueLumenListItems(props.content.entries)
  const [measureId, setMeasureId] = React.useState(props.content.initialMeasureId)
  const measure = selectLumenListItem(measures, measureId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-list-tabs" role="tablist" aria-label={props.content.labels.measures}>
        {measures.map((item) => (
          <LumenButton
            key={item.id}
            role="tab"
            variant="text"
            aria-selected={measure?.id === item.id}
            onClick={() => setMeasureId(item.id)}
          >
            {item.label}
          </LumenButton>
        ))}
      </div>
      <div className="lumen-list-leaderboard" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {entries.length ? (
          entries.map((entry, index) => (
            <article key={entry.id}>
              <span>{index + 1}</span>
              <strong>{entry.name}</strong>
              <b>{entry.values[measure?.id ?? ''] ?? '—'}</b>
              <small data-tone={entry.trendTone}>{entry.trend}</small>
            </article>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}

function TreeBranch({
  nodes,
  openIds,
  setOpenIds,
  labels,
  onAction,
}: {
  readonly nodes: readonly LumenListTreeNode[]
  readonly openIds: ReadonlySet<string>
  readonly setOpenIds: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>
  readonly labels: LumenListTreeContent['labels']
  readonly onAction: LumenListProps['onAction']
}) {
  return (
    <ul>
      {uniqueLumenListItems(nodes).map((node) => {
        const branch = Boolean(node.children?.length)
        const open = openIds.has(node.id)
        let accessibleLabel = labels.open(node.name)
        if (branch) {
          accessibleLabel = open ? labels.collapse(node.name) : labels.expand(node.name)
        }
        return (
          <li key={node.id}>
            <LumenButton
              variant="text"
              aria-expanded={branch ? open : undefined}
              aria-label={accessibleLabel}
              onKeyDown={(event) => {
                if (!branch || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
                event.preventDefault()
                const expand = event.key === 'ArrowRight'
                setOpenIds((current) => {
                  const next = new Set(current)
                  if (expand) next.add(node.id)
                  else next.delete(node.id)
                  return next
                })
              }}
              onClick={() => {
                if (branch) {
                  setOpenIds((current) => {
                    const next = new Set(current)
                    if (open) {
                      next.delete(node.id)
                    } else {
                      next.add(node.id)
                    }
                    return next
                  })
                } else {
                  report(onAction, 'open', node.id)
                }
              }}
            >
              {branch ? <Glyph name="folder" /> : <Glyph name="file" />}
              {node.name}
            </LumenButton>
            {branch && open ? (
              <TreeBranch
                nodes={node.children ?? []}
                openIds={openIds}
                setOpenIds={setOpenIds}
                labels={labels}
                onAction={onAction}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function Tree(props: Omit<LumenListProps, 'content'> & { content: LumenListTreeContent }) {
  const nodes = uniqueLumenListItems(props.content.nodes)
  const [openIds, setOpenIds] = React.useState<ReadonlySet<string>>(() => new Set(props.content.initialOpenIds))
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-list-tree" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {nodes.length ? (
          <TreeBranch
            nodes={nodes}
            openIds={openIds}
            setOpenIds={setOpenIds}
            labels={props.content.labels}
            onAction={props.onAction}
          />
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}

function empty(props: LumenListProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenList(props: LumenListProps) {
  const inheritedContent = useLumenListContent()
  const content = props.content ?? inheritedContent
  if (content?.reference) {
    return (
      <Root {...props}>
        <LumenListReference content={content.reference} notice={content.presentation?.notice} />
      </Root>
    )
  }
  if (props.variant === 1) {
    return content?.metrics ? <Metrics {...props} content={content.metrics} /> : empty(props)
  }
  if (props.variant === 2) {
    return content?.spend ? <Spend {...props} content={content.spend} /> : empty(props)
  }
  if (props.variant === 3) {
    return content?.security ? <Security {...props} content={content.security} /> : empty(props)
  }
  if (props.variant === 4) {
    return content?.queue ? <Queue {...props} content={content.queue} /> : empty(props)
  }
  if (props.variant === 5) {
    return content?.assets ? <Assets {...props} content={content.assets} /> : empty(props)
  }
  if (props.variant === 6) {
    return content?.deliveries ? <Deliveries {...props} content={content.deliveries} /> : empty(props)
  }
  if (props.variant === 7) {
    return content?.suppliers ? <Suppliers {...props} content={content.suppliers} /> : empty(props)
  }
  if (props.variant === 8) {
    return content?.inbox ? <Inbox {...props} content={content.inbox} /> : empty(props)
  }
  if (props.variant === 9) {
    return content?.contacts ? <Contacts {...props} content={content.contacts} /> : empty(props)
  }
  if (props.variant === 10) {
    return content?.runbook ? <Runbook {...props} content={content.runbook} /> : empty(props)
  }
  if (props.variant === 11) {
    return content?.leaderboard ? <Leaderboard {...props} content={content.leaderboard} /> : empty(props)
  }
  if (props.variant === 12) {
    return content?.tree ? <Tree {...props} content={content.tree} /> : empty(props)
  }
  return empty(props)
}

function variant(value: number, props: LumenListVariantProps) {
  return <LumenList {...props} variant={value} variantId={`hbar-app-ui-list-${value}`} />
}

export const LumenList01 = (props: LumenListVariantProps) => variant(1, props),
  LumenList02 = (props: LumenListVariantProps) => variant(2, props),
  LumenList03 = (props: LumenListVariantProps) => variant(3, props),
  LumenList04 = (props: LumenListVariantProps) => variant(4, props),
  LumenList05 = (props: LumenListVariantProps) => variant(5, props),
  LumenList06 = (props: LumenListVariantProps) => variant(6, props),
  LumenList07 = (props: LumenListVariantProps) => variant(7, props),
  LumenList08 = (props: LumenListVariantProps) => variant(8, props),
  LumenList09 = (props: LumenListVariantProps) => variant(9, props),
  LumenList10 = (props: LumenListVariantProps) => variant(10, props),
  LumenList11 = (props: LumenListVariantProps) => variant(11, props),
  LumenList12 = (props: LumenListVariantProps) => variant(12, props)

function DeliveriesEnhanced(props: Omit<LumenListProps, 'content'> & { content: LumenListDeliveriesContent }) {
  const deliveries = uniqueLumenListItems(props.content.deliveries)
  const endpoints = uniqueLumenListItems(props.content.endpoints ?? [])
  const [failedOnly, setFailedOnly] = React.useState(false)
  const [endpointId, setEndpointId] = React.useState(props.content.initialEndpointId)
  const [openId, setOpenId] = React.useState<string>()
  const visible = deliveries.filter(
    (delivery) =>
      (!failedOnly || delivery.failed) &&
      (endpointId === props.content.allEndpointId || delivery.endpointId === endpointId),
  )
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton variant={failedOnly ? 'solid' : 'outlined'} onClick={() => setFailedOnly((value) => !value)}>
            <Glyph name="filter" />
            {props.content.labels.failedOnly}
          </LumenButton>
        }
      />
      {props.content.labels.endpoint ? (
        <LumenChoiceSelect
          id="list-deliveries-endpoint"
          label={props.content.labels.endpoint}
          options={endpoints}
          value={endpointId ?? null}
          onValueChange={setEndpointId}
        />
      ) : null}
      <div className="lumen-list-deliveries" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {visible.length ? (
          visible.map((delivery) => {
            const open = openId === delivery.id
            return (
              <article key={delivery.id}>
                <LumenButton
                  variant="text"
                  aria-expanded={open}
                  aria-label={
                    open ? props.content.labels.collapse(delivery.id) : props.content.labels.expand(delivery.id)
                  }
                  onClick={() => setOpenId(open ? undefined : delivery.id)}
                >
                  <Glyph name="chevron" />
                  <code>{delivery.id}</code>
                  <LumenStatus value={delivery.status} tone={delivery.tone} />
                  <span>{delivery.endpoint}</span>
                </LumenButton>
                {open ? (
                  <div className="lumen-list-detail lumen-list-delivery-detail">
                    <pre>{delivery.payload}</pre>
                    <LumenButton variant="outlined" onClick={() => report(props.onAction, 'replay', delivery.id)}>
                      <Glyph name="replay" />
                      {props.content.labels.replay}
                    </LumenButton>
                  </div>
                ) : null}
              </article>
            )
          })
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}
function Deliveries(props: Omit<LumenListProps, 'content'> & { content: LumenListDeliveriesContent }) {
  return props.content.endpoints ? <DeliveriesEnhanced {...props} /> : <DeliveriesLegacy {...props} />
}

function SuppliersEnhanced(props: Omit<LumenListProps, 'content'> & { content: LumenListSuppliersContent }) {
  const suppliers = uniqueLumenListItems(props.content.suppliers)
  const categories = uniqueLumenListItems(props.content.categories ?? [])
  const [query, setQuery] = React.useState('')
  const [categoryId, setCategoryId] = React.useState(props.content.initialCategoryId)
  const normalized = query.trim().toLocaleLowerCase()
  const visible = suppliers.filter(
    (supplier) =>
      supplier.name.toLocaleLowerCase().includes(normalized) &&
      (categoryId === props.content.allCategoryId || supplier.categoryId === categoryId),
  )
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-list-tools">
        <label className="lumen-list-search">
          <span className="lumen-list-visually-hidden">{props.content.labels.search}</span>
          <Glyph name="search" />
          <LumenInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={props.content.labels.searchPlaceholder}
          />
        </label>
        <LumenChoiceSelect
          id="list-suppliers-category"
          label={props.content.labels.categoryFilter}
          options={categories}
          value={categoryId ?? null}
          onValueChange={setCategoryId}
        />
      </div>
      <div
        className="lumen-list-directory"
        role="table"
        data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
      >
        <div role="row" className="lumen-list-directory-head">
          <span role="columnheader">{props.content.labels.supplier}</span>
          <span role="columnheader">{props.content.labels.category}</span>
          <span role="columnheader">{props.content.labels.status}</span>
        </div>
        {visible.length ? (
          visible.map((supplier) => (
            <div role="row" key={supplier.id}>
              <strong role="cell">{supplier.name}</strong>
              <span role="cell">{supplier.category}</span>
              <span role="cell">
                <LumenStatus value={supplier.status} tone={supplier.tone} />
              </span>
            </div>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}
function Suppliers(props: Omit<LumenListProps, 'content'> & { content: LumenListSuppliersContent }) {
  return props.content.categories ? <SuppliersEnhanced {...props} /> : <SuppliersLegacy {...props} />
}

function ContactsEnhanced(props: Omit<LumenListProps, 'content'> & { content: LumenListContactsContent }) {
  const letters = uniqueLumenListItems(props.content.letters)
  const relationships = uniqueLumenListItems(props.content.relationships ?? [])
  const contacts = uniqueLumenListItems(props.content.contacts)
  const [letterId, setLetterId] = React.useState(props.content.initialLetterId)
  const [relationshipId, setRelationshipId] = React.useState(props.content.initialRelationshipId)
  const letter = selectLumenListItem(letters, letterId)
  const visible = contacts.filter(
    (contact) =>
      contact.letterId === letter?.id &&
      (relationshipId === props.content.allRelationshipId || contact.relationshipId === relationshipId),
  )
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenChoiceSelect
            id="list-contacts-relationship"
            label={props.content.labels.relationship}
            options={relationships}
            value={relationshipId ?? null}
            onValueChange={setRelationshipId}
          />
        }
      />
      <div className="lumen-list-contacts">
        <nav aria-label={props.content.labels.letters}>
          {letters.map((item) => (
            <LumenButton
              key={item.id}
              variant="text"
              aria-current={letter?.id === item.id ? 'true' : undefined}
              onClick={() => setLetterId(item.id)}
            >
              {item.label}
            </LumenButton>
          ))}
        </nav>
        <div data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
          {visible.length ? (
            visible.map((contact) => (
              <article key={contact.id}>
                <span className="lumen-list-avatar">{contact.avatar}</span>
                <strong>{contact.name}</strong>
                <small>{contact.meta}</small>
              </article>
            ))
          ) : (
            <Empty>{props.content.labels.empty}</Empty>
          )}
        </div>
      </div>
    </Root>
  )
}
function Contacts(props: Omit<LumenListProps, 'content'> & { content: LumenListContactsContent }) {
  return props.content.relationships ? <ContactsEnhanced {...props} /> : <ContactsLegacy {...props} />
}

function LeaderboardEnhanced(props: Omit<LumenListProps, 'content'> & { content: LumenListLeaderboardContent }) {
  const measures = uniqueLumenListItems(props.content.measures ?? [])
  const periods = uniqueLumenListItems(props.content.periods ?? [])
  const entries = uniqueLumenListItems(props.content.entries)
  const [measureId, setMeasureId] = React.useState(props.content.initialMeasureId)
  const [periodId, setPeriodId] = React.useState(props.content.initialPeriodId)
  const measure = selectLumenListItem(measures, measureId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <LumenTabs
        className="lumen-list-tabs"
        label={props.content.labels.measures}
        items={measures}
        selectedId={measure?.id ?? null}
        onChange={setMeasureId}
      />
      <div className="lumen-list-pills" role="group" aria-label={props.content.labels.periods}>
        {periods.map((period) => (
          <LumenButton
            key={period.id}
            size="s"
            variant={periodId === period.id ? 'solid' : 'outlined'}
            onClick={() => setPeriodId(period.id)}
          >
            {period.label}
          </LumenButton>
        ))}
      </div>
      <div className="lumen-list-leaderboard" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {entries.length ? (
          entries.map((entry, index) => (
            <article key={entry.id}>
              <span>{index + 1}</span>
              <strong>{entry.name}</strong>
              <b>{entry.values[measure?.id ?? ''] ?? '—'}</b>
              <small data-tone={entry.trendTone}>{entry.trend}</small>
            </article>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}
function Leaderboard(props: Omit<LumenListProps, 'content'> & { content: LumenListLeaderboardContent }) {
  return props.content.measures ? <LeaderboardEnhanced {...props} /> : <LeaderboardLegacy {...props} />
}
