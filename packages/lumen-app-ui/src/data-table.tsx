'use client'

import * as React from 'react'
import { LumenCheckBoxControl, LumenInput, LumenSelect } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenStatus, LumenText } from './primitives'
import './data-table.css'
import LumenDataTableReference from './data-table-reference'
import { type LumenDataTableReferenceContent } from './data-table-reference-contracts'
import { LumenTabs } from './ui-controls'

export interface LumenDataTableListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenDataTableChoice {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean | undefined
}

export interface LumenDataTableRow {
  readonly id: string
  readonly name: string
  readonly detail: string
  readonly status: string
  readonly statusTone: 'neutral' | 'success' | 'warning' | 'danger'
  readonly value: string
  readonly group: string
  readonly owner: string
  readonly region: string
  readonly updated: string
  readonly cost: string
  readonly latency: string
}

export interface LumenDataTableFacetedContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly search: string
    readonly status: string
    readonly columns: string
    readonly fullColumns: string
    readonly compactColumns: string
    readonly name: string
    readonly rowDetail: string
    readonly rowStatus: string
    readonly rowValue: string
    readonly empty: string
  }
  readonly filters: readonly LumenDataTableChoice[]
  readonly initialFilterId: string
}

export interface LumenDataTableSelectableContent {
  readonly labels: {
    readonly title: string
    readonly detail: (selected: number) => string
    readonly selectPage: string
    readonly selectRow: (name: string) => string
    readonly archive: string
    readonly clear: string
    readonly previous: string
    readonly next: string
    readonly page: (page: number, total: number) => string
    readonly empty: string
  }
  readonly pageSize: number
  readonly initialPage: number
}

export interface LumenDataTableEditContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly saved: (count: number) => string
    readonly noChanges: string
    readonly value: (name: string) => string
    readonly save: string
    readonly edit: string
    readonly empty: string
  }
  readonly maximumRows: number
}

export interface LumenDataTableExpandableContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly collapseAll: string
    readonly openRow: (name: string) => string
    readonly recordMeta: (id: string) => string
    readonly openDetail: string
    readonly empty: string
  }
  readonly maximumRows: number
}

export interface LumenDataTableGroupedContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly density: string
    readonly name: string
    readonly status: string
    readonly value: string
    readonly empty: string
  }
  readonly densities: readonly LumenDataTableChoice[]
  readonly initialDensityId: string
}

export interface LumenDataTableMasterDetailContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly panelDetail: string
    readonly edit: string
    readonly empty: string
  }
  readonly initialRowId: string
}

export interface LumenDataTableStatesContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly states: string
    readonly emptyTitle: string
    readonly emptyBody: string
    readonly create: string
    readonly loading: string
    readonly errorTitle: string
    readonly errorBody: string
    readonly retry: string
  }
  readonly states: readonly LumenDataTableChoice[]
  readonly emptyStateId: string
  readonly loadingStateId: string
  readonly errorStateId: string
  readonly initialStateId: string
  readonly skeletonRows: number
}

export interface LumenDataTableWideContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly search: string
    readonly scrollHint: string
    readonly name: string
    readonly owner: string
    readonly region: string
    readonly updated: string
    readonly cost: string
    readonly latency: string
    readonly empty: string
  }
}

export interface LumenDataTableContent {
  readonly reference?: LumenDataTableReferenceContent | undefined
  readonly onAction?: ((event: LumenDataTableAction) => void) | undefined
  readonly presentation?: { readonly ownerId: string; readonly notice?: string | undefined } | undefined
  readonly rows: readonly LumenDataTableRow[]
  readonly listStrategy: LumenDataTableListStrategy
  readonly faceted?: LumenDataTableFacetedContent | undefined
  readonly selectable?: LumenDataTableSelectableContent | undefined
  readonly edit?: LumenDataTableEditContent | undefined
  readonly expandable?: LumenDataTableExpandableContent | undefined
  readonly grouped?: LumenDataTableGroupedContent | undefined
  readonly masterDetail?: LumenDataTableMasterDetailContent | undefined
  readonly states?: LumenDataTableStatesContent | undefined
  readonly wide?: LumenDataTableWideContent | undefined
}

export interface LumenDataTableProviderProps {
  readonly content: LumenDataTableContent
  readonly children: React.ReactNode
}

export interface LumenDataTableAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenDataTableProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenDataTableContent | undefined
  readonly onAction?: ((event: LumenDataTableAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenDataTableVariantProps = Omit<LumenDataTableProps, 'variant' | 'variantId'>

const DataTableContext = React.createContext<LumenDataTableContent | undefined>(undefined)

export function LumenDataTableProvider({ content, children }: LumenDataTableProviderProps) {
  return <DataTableContext.Provider value={content}>{children}</DataTableContext.Provider>
}

export function useLumenDataTableContent() {
  return React.useContext(DataTableContext)
}

export function uniqueLumenDataTableItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenDataTableItem<T extends { readonly id: string }>(
  items: readonly T[],
  id: string | undefined,
): T | undefined {
  return items.find((item) => item.id === id) ?? items[0]
}

const report = (fn: LumenDataTableProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({ name }: { name: 'search' | 'columns' | 'check' | 'edit' | 'chevron' | 'density' | 'loading' }) {
  const paths = {
    search: 'm11 11 3 3M7 12A5 5 0 1 1 7 2a5 5 0 0 1 0 10Z',
    columns: 'M2 3h12v10H2Zm4 0v10m4-10v10',
    check: 'm3 8 3 3 7-7',
    edit: 'M3 11.5 11.5 3 13 4.5 4.5 13H3Zm7.5-7.5 1.5 1.5',
    chevron: 'm6 3 5 5-5 5',
    density: 'M3 4h10M3 8h10M3 12h10',
    loading: 'M8 2a6 6 0 1 1-6 6',
  }
  return (
    <svg
      className={name === 'loading' ? 'lumen-data-table-glyph is-spinning' : 'lumen-data-table-glyph'}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
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
}: Omit<LumenDataTableProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const contentClassName = [
    'lumen-data-table',
    `hbar-app-ui-table-variant-${variant}`,
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
      className="lumen-data-table-surface"
      contentClassName={contentClassName}
      data-lumen-component="data-table"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function Header({ title, detail, actions }: { title: string; detail: string; actions?: React.ReactNode }) {
  return (
    <header className="lumen-data-table-header">
      <div>
        <LumenText as="h2" variant="heading">
          {title}
        </LumenText>
        <LumenText as="p" tone="muted" variant="supporting">
          {detail}
        </LumenText>
      </div>
      {actions}
    </header>
  )
}

function BasicTable({
  rows,
  labels,
  compact,
  empty,
  onOpen,
}: {
  rows: readonly LumenDataTableRow[]
  labels: { name: string; detail: string; status: string; value: string }
  compact: boolean
  empty: string
  onOpen: (id: string) => void
}) {
  return rows.length ? (
    <div className="lumen-data-table-scroll">
      <table>
        <thead>
          <tr>
            <th>{labels.name}</th>
            {compact ? null : <th>{labels.detail}</th>}
            <th>{labels.status}</th>
            <th>{labels.value}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th>
                <LumenButton variant="text" onClick={() => onOpen(row.id)}>
                  {row.name}
                </LumenButton>
              </th>
              {compact ? null : <td>{row.detail}</td>}
              <td>
                <LumenStatus value={row.status} tone={row.statusTone} />
              </td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <LumenText as="p" tone="muted">
      {empty}
    </LumenText>
  )
}

function Faceted(
  props: Omit<LumenDataTableProps, 'content'> & {
    rows: readonly LumenDataTableRow[]
    content: LumenDataTableFacetedContent
    listStrategy: LumenDataTableListStrategy
  },
) {
  const queryId = React.useId()
  const filters = uniqueLumenDataTableItems(props.content.filters)
  const [query, setQuery] = React.useState('')
  const [filterId, setFilterId] = React.useState(props.content.initialFilterId)
  const [compact, setCompact] = React.useState(false)
  const rows = props.rows.filter(
    (row) =>
      (!filterId || filterId === 'all' || row.status.toLowerCase() === filterId.toLowerCase()) &&
      `${row.name} ${row.detail}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-data-table-toolbar">
        <label className="lumen-data-table-search" htmlFor={queryId}>
          <Glyph name="search" />
          <LumenInput
            id={queryId}
            value={query}
            aria-label={props.content.labels.search}
            placeholder={props.content.labels.search}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <LumenSelect
          aria-label={props.content.labels.status}
          value={filterId}
          onChange={(event) => setFilterId(event.currentTarget.value)}
        >
          {filters.map((filter) => (
            <option key={filter.id} value={filter.id} disabled={filter.disabled}>
              {filter.label}
            </option>
          ))}
        </LumenSelect>
        <LumenButton variant="outlined" onClick={() => setCompact((value) => !value)}>
          <Glyph name="columns" />
          {compact ? props.content.labels.compactColumns : props.content.labels.fullColumns}
        </LumenButton>
      </div>
      <div data-hbar-app-ui-list-strategy={props.listStrategy.kind}>
        <BasicTable
          rows={rows}
          labels={{
            name: props.content.labels.name,
            detail: props.content.labels.rowDetail,
            status: props.content.labels.rowStatus,
            value: props.content.labels.rowValue,
          }}
          compact={compact}
          empty={props.content.labels.empty}
          onOpen={(id) => report(props.onAction, 'open', id)}
        />
      </div>
    </Root>
  )
}

function Selectable(
  props: Omit<LumenDataTableProps, 'content'> & {
    rows: readonly LumenDataTableRow[]
    content: LumenDataTableSelectableContent
    listStrategy: LumenDataTableListStrategy
  },
) {
  const selectionId = React.useId()
  const pageSize = Math.max(1, Math.floor(props.content.pageSize))
  const totalPages = Math.max(1, Math.ceil(props.rows.length / pageSize))
  const [page, setPage] = React.useState(Math.max(1, Math.min(totalPages, props.content.initialPage)))
  const [selectedIds, setSelectedIds] = React.useState<readonly string[]>([])
  const rows = props.rows.slice((page - 1) * pageSize, page * pageSize)
  const pageIds = rows.map((row) => row.id)
  const all = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id))
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail(selectedIds.length)} />
      <label className="lumen-data-table-select-page">
        <LumenCheckBoxControl
          checked={all}
          onChange={() =>
            setSelectedIds(
              all ? selectedIds.filter((id) => !pageIds.includes(id)) : [...new Set([...selectedIds, ...pageIds])],
            )
          }
        />
        {props.content.labels.selectPage}
      </label>
      {selectedIds.length ? (
        <div className="lumen-data-table-bulk">
          <LumenButton
            tone="primary"
            onClick={() => {
              report(props.onAction, 'archive', selectedIds.join(','))
              setSelectedIds([])
            }}
          >
            {props.content.labels.archive}
          </LumenButton>
          <LumenButton variant="outlined" onClick={() => setSelectedIds([])}>
            {props.content.labels.clear}
          </LumenButton>
        </div>
      ) : null}
      <div className="lumen-data-table-selectable" data-hbar-app-ui-list-strategy={props.listStrategy.kind}>
        {rows.length ? (
          rows.map((row) => (
            <label key={row.id} htmlFor={`${selectionId}-${row.id}`}>
              <LumenCheckBoxControl
                id={`${selectionId}-${row.id}`}
                checked={selectedIds.includes(row.id)}
                aria-label={props.content.labels.selectRow(row.name)}
                onChange={() =>
                  setSelectedIds((current) =>
                    current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id],
                  )
                }
              />
              <span>
                <strong>{row.name}</strong>
                <small>{row.detail}</small>
              </span>
              <LumenStatus value={row.status} tone={row.statusTone} />
            </label>
          ))
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
      <footer className="lumen-data-table-pagination">
        <LumenButton variant="outlined" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
          {props.content.labels.previous}
        </LumenButton>
        <span>{props.content.labels.page(page, totalPages)}</span>
        <LumenButton
          variant="outlined"
          disabled={page >= totalPages}
          onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
        >
          {props.content.labels.next}
        </LumenButton>
      </footer>
    </Root>
  )
}

function InlineEdit(
  props: Omit<LumenDataTableProps, 'content'> & {
    rows: readonly LumenDataTableRow[]
    content: LumenDataTableEditContent
  },
) {
  const rows = props.rows.slice(0, Math.max(0, props.content.maximumRows))
  const [editingId, setEditingId] = React.useState<string>()
  const [savedIds, setSavedIds] = React.useState<readonly string[]>([])
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenStatus
            value={savedIds.length ? props.content.labels.saved(savedIds.length) : props.content.labels.noChanges}
            tone={savedIds.length ? 'success' : 'neutral'}
          />
        }
      />
      <div className="lumen-data-table-edit-list">
        {rows.length ? (
          rows.map((row) => (
            <article key={row.id}>
              <span>
                <strong>{row.name}</strong>
                <small>{row.status}</small>
              </span>
              {editingId === row.id ? (
                <React.Fragment>
                  <LumenInput defaultValue={row.value} aria-label={props.content.labels.value(row.name)} />
                  <LumenButton
                    tone="primary"
                    onClick={() => {
                      setSavedIds((current) => [...new Set([...current, row.id])])
                      setEditingId(undefined)
                      report(props.onAction, 'save', row.id)
                    }}
                  >
                    <Glyph name="check" />
                    {props.content.labels.save}
                  </LumenButton>
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <strong>{row.value}</strong>
                  <LumenButton variant="outlined" onClick={() => setEditingId(row.id)}>
                    <Glyph name="edit" />
                    {props.content.labels.edit}
                  </LumenButton>
                </React.Fragment>
              )}
            </article>
          ))
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
    </Root>
  )
}

function Expandable(
  props: Omit<LumenDataTableProps, 'content'> & {
    rows: readonly LumenDataTableRow[]
    content: LumenDataTableExpandableContent
  },
) {
  const rows = props.rows.slice(0, Math.max(0, props.content.maximumRows))
  const [openId, setOpenId] = React.useState<string>()
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton variant="outlined" disabled={!openId} onClick={() => setOpenId(undefined)}>
            {props.content.labels.collapseAll}
          </LumenButton>
        }
      />
      <div className="lumen-data-table-expandable">
        {rows.length ? (
          rows.map((row) => (
            <article key={row.id}>
              <LumenButton
                variant="text"
                aria-expanded={openId === row.id}
                aria-label={props.content.labels.openRow(row.name)}
                onClick={() => setOpenId((current) => (current === row.id ? undefined : row.id))}
              >
                <Glyph name="chevron" />
                <strong>{row.name}</strong>
                <LumenStatus value={row.status} tone={row.statusTone} />
                <span>{row.value}</span>
              </LumenButton>
              {openId === row.id ? (
                <div>
                  <p>{row.detail}</p>
                  <code>{props.content.labels.recordMeta(row.id)}</code>
                  <LumenButton variant="outlined" onClick={() => report(props.onAction, 'open', row.id)}>
                    {props.content.labels.openDetail}
                  </LumenButton>
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
    </Root>
  )
}

function Grouped(
  props: Omit<LumenDataTableProps, 'content'> & {
    rows: readonly LumenDataTableRow[]
    content: LumenDataTableGroupedContent
    listStrategy: LumenDataTableListStrategy
  },
) {
  const densities = uniqueLumenDataTableItems(props.content.densities)
  const [densityId, setDensityId] = React.useState(props.content.initialDensityId)
  const density = selectLumenDataTableItem(densities, densityId)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton
            variant="outlined"
            onClick={() => {
              const index = Math.max(
                0,
                densities.findIndex((item) => item.id === density?.id),
              )
              const next = densities[(index + 1) % Math.max(1, densities.length)]
              if (next) {
                setDensityId(next.id)
              }
            }}
          >
            <Glyph name="density" />
            {density?.label ?? props.content.labels.density}
          </LumenButton>
        }
      />
      <div
        className="lumen-data-table-grouped"
        data-density={density?.id}
        data-hbar-app-ui-list-strategy={props.listStrategy.kind}
      >
        {props.rows.length ? (
          <table>
            <thead>
              <tr>
                <th>{props.content.labels.name}</th>
                <th>{props.content.labels.status}</th>
                <th>{props.content.labels.value}</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, index) => (
                <React.Fragment key={row.id}>
                  {index === 0 || props.rows[index - 1]?.group !== row.group ? (
                    <tr className="lumen-data-table-group">
                      <th colSpan={3}>{row.group}</th>
                    </tr>
                  ) : null}
                  <tr>
                    <th>{row.name}</th>
                    <td>
                      <LumenStatus value={row.status} tone={row.statusTone} />
                    </td>
                    <td>{row.value}</td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
    </Root>
  )
}

function MasterDetail(
  props: Omit<LumenDataTableProps, 'content'> & {
    rows: readonly LumenDataTableRow[]
    content: LumenDataTableMasterDetailContent
    listStrategy: LumenDataTableListStrategy
  },
) {
  const [rowId, setRowId] = React.useState(props.content.initialRowId)
  const row = selectLumenDataTableItem(props.rows, rowId)
  return (
    <Root {...props}>
      <div className="lumen-data-table-master-detail">
        <aside data-hbar-app-ui-list-strategy={props.listStrategy.kind}>
          <Header title={props.content.labels.title} detail={props.content.labels.detail} />
          {props.rows.map((item) => (
            <LumenButton
              key={item.id}
              variant={row?.id === item.id ? 'solid' : 'text'}
              onClick={() => {
                setRowId(item.id)
                report(props.onAction, 'open', item.id)
              }}
            >
              <span>{item.name}</span>
              <small>{item.status}</small>
            </LumenButton>
          ))}
        </aside>
        <main>
          {row ? (
            <React.Fragment>
              <Header title={row.name} detail={props.content.labels.panelDetail} />
              <LumenStatus value={row.status} tone={row.statusTone} />
              <article>
                <LumenText as="strong" variant="title">
                  {row.value}
                </LumenText>
                <LumenText as="p" tone="muted">
                  {row.detail}
                </LumenText>
                <LumenButton tone="primary" onClick={() => report(props.onAction, 'edit', row.id)}>
                  {props.content.labels.edit}
                </LumenButton>
              </article>
            </React.Fragment>
          ) : (
            <LumenText as="p" tone="muted">
              {props.content.labels.empty}
            </LumenText>
          )}
        </main>
      </div>
    </Root>
  )
}

function States(props: Omit<LumenDataTableProps, 'content'> & { content: LumenDataTableStatesContent }) {
  const states = uniqueLumenDataTableItems(props.content.states)
  const [stateId, setStateId] = React.useState(props.content.initialStateId)
  const selected = selectLumenDataTableItem(states, stateId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <LumenTabs
        className="lumen-data-table-tabs"
        label={props.content.labels.states}
        items={states}
        selectedId={selected?.id ?? null}
        onChange={setStateId}
      />
      {selected?.id === props.content.emptyStateId ? (
        <div className="lumen-data-table-state">
          <LumenText as="strong" variant="heading">
            {props.content.labels.emptyTitle}
          </LumenText>
          <LumenText as="p" tone="muted">
            {props.content.labels.emptyBody}
          </LumenText>
          <LumenButton tone="primary" onClick={() => report(props.onAction, 'create')}>
            {props.content.labels.create}
          </LumenButton>
        </div>
      ) : null}
      {selected?.id === props.content.loadingStateId ? (
        <div className="lumen-data-table-skeleton" aria-label={props.content.labels.loading} role="status">
          {Array.from({ length: Math.max(0, props.content.skeletonRows) }, (_, index) => (
            <span key={index}>
              <i />
              <i />
              <i />
            </span>
          ))}
          <Glyph name="loading" />
        </div>
      ) : null}
      {selected?.id === props.content.errorStateId ? (
        <div className="lumen-data-table-state is-error">
          <LumenText as="strong" variant="heading">
            {props.content.labels.errorTitle}
          </LumenText>
          <LumenText as="p" tone="muted">
            {props.content.labels.errorBody}
          </LumenText>
          <LumenButton
            tone="primary"
            onClick={() => {
              setStateId(props.content.loadingStateId)
              report(props.onAction, 'retry')
            }}
          >
            {props.content.labels.retry}
          </LumenButton>
        </div>
      ) : null}
    </Root>
  )
}

function Wide(
  props: Omit<LumenDataTableProps, 'content'> & {
    rows: readonly LumenDataTableRow[]
    content: LumenDataTableWideContent
    listStrategy: LumenDataTableListStrategy
  },
) {
  const queryId = React.useId()
  const [query, setQuery] = React.useState('')
  const rows = props.rows.filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-data-table-toolbar">
        <label className="lumen-data-table-search" htmlFor={queryId}>
          <Glyph name="search" />
          <LumenInput
            id={queryId}
            value={query}
            aria-label={props.content.labels.search}
            placeholder={props.content.labels.search}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <LumenButton variant="outlined" onClick={() => report(props.onAction, 'scroll-hint')}>
          {props.content.labels.scrollHint}
        </LumenButton>
      </div>
      <div className="lumen-data-table-wide" data-hbar-app-ui-list-strategy={props.listStrategy.kind}>
        {rows.length ? (
          <table>
            <thead>
              <tr>
                <th>{props.content.labels.name}</th>
                <th>{props.content.labels.owner}</th>
                <th>{props.content.labels.region}</th>
                <th>{props.content.labels.updated}</th>
                <th>{props.content.labels.cost}</th>
                <th>{props.content.labels.latency}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th>{row.name}</th>
                  <td>{row.owner}</td>
                  <td>{row.region}</td>
                  <td>{row.updated}</td>
                  <td>{row.cost}</td>
                  <td>{row.latency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
    </Root>
  )
}

function empty(props: LumenDataTableProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenDataTable(props: LumenDataTableProps) {
  const inheritedContent = useLumenDataTableContent()
  const content = props.content ?? inheritedContent
  const controlled = content?.onAction ? { ...props, onAction: content.onAction } : props
  const result = content?.reference ? (
    <Root {...controlled} className={[props.className, 'lumen-data-table-reference'].filter(Boolean).join(' ')}>
      <LumenDataTableReference content={content.reference} onAction={controlled.onAction} />
    </Root>
  ) : (
    renderTable(controlled, content)
  )
  return content?.presentation ? (
    <div className="lumen-data-table-preview-owner" data-hbar-preview-owner={content.presentation.ownerId}>
      {content.presentation.notice && (
        <p className="lumen-data-table-preview-notice" role="status">
          {content.presentation.notice}
        </p>
      )}
      {result}
    </div>
  ) : (
    result
  )
}

function renderTable(props: LumenDataTableProps, content: LumenDataTableContent | undefined) {
  if (!content) {
    return empty(props)
  }
  const rows = uniqueLumenDataTableItems(content.rows)
  if (props.variant === 1) {
    return content.faceted ? (
      <Faceted {...props} rows={rows} content={content.faceted} listStrategy={content.listStrategy} />
    ) : (
      empty(props)
    )
  }
  if (props.variant === 2) {
    return content.selectable ? (
      <Selectable {...props} rows={rows} content={content.selectable} listStrategy={content.listStrategy} />
    ) : (
      empty(props)
    )
  }
  if (props.variant === 3) {
    return content.edit ? <InlineEdit {...props} rows={rows} content={content.edit} /> : empty(props)
  }
  if (props.variant === 4) {
    return content.expandable ? <Expandable {...props} rows={rows} content={content.expandable} /> : empty(props)
  }
  if (props.variant === 5) {
    return content.grouped ? (
      <Grouped {...props} rows={rows} content={content.grouped} listStrategy={content.listStrategy} />
    ) : (
      empty(props)
    )
  }
  if (props.variant === 6) {
    return content.masterDetail ? (
      <MasterDetail {...props} rows={rows} content={content.masterDetail} listStrategy={content.listStrategy} />
    ) : (
      empty(props)
    )
  }
  if (props.variant === 7) {
    return content.states ? <States {...props} content={content.states} /> : empty(props)
  }
  if (props.variant === 8) {
    return content.wide ? (
      <Wide {...props} rows={rows} content={content.wide} listStrategy={content.listStrategy} />
    ) : (
      empty(props)
    )
  }
  return empty(props)
}

function variant(value: number, props: LumenDataTableVariantProps) {
  return <LumenDataTable {...props} variant={value} variantId={`hbar-app-ui-data-table-${value}`} />
}

export const LumenDataTable01 = (props: LumenDataTableVariantProps) => variant(1, props)

export const LumenDataTable02 = (props: LumenDataTableVariantProps) => variant(2, props)

export const LumenDataTable03 = (props: LumenDataTableVariantProps) => variant(3, props)

export const LumenDataTable04 = (props: LumenDataTableVariantProps) => variant(4, props)

export const LumenDataTable05 = (props: LumenDataTableVariantProps) => variant(5, props)

export const LumenDataTable06 = (props: LumenDataTableVariantProps) => variant(6, props)

export const LumenDataTable07 = (props: LumenDataTableVariantProps) => variant(7, props)

export const LumenDataTable08 = (props: LumenDataTableVariantProps) => variant(8, props)
