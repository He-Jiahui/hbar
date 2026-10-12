'use client'
import * as React from 'react'
import { LumenCheckBoxControl, LumenInput, LumenSelect } from './forms'
import { LumenButton, LumenStatus } from './primitives'
import type { LumenDataTableAction } from './data-table'
import type {
  LumenDataTableReferenceBudget,
  LumenDataTableReferenceCell,
  LumenDataTableReferenceContent,
  LumenDataTableReferencePayments,
  LumenDataTableReferenceRow,
} from './data-table-reference-contracts'

interface ReferenceProps {
  readonly content: LumenDataTableReferenceContent
  readonly onAction?: ((event: LumenDataTableAction) => void) | undefined
}
function unique<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}
function Glyph({ name }: { readonly name: 'search' | 'chevron' | 'download' | 'columns' }) {
  const paths = {
    search: 'm11 11 3 3M7 12A5 5 0 1 1 7 2a5 5 0 0 1 0 10Z',
    chevron: 'm6 3 5 5-5 5',
    download: 'M8 2v8m-3-3 3 3 3-3M3 12v2h10v-2',
    columns: 'M2 3h12v10H2zM6 3v10M10 3v10',
  }
  return (
    <svg className="lumen-data-table-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
function Search({
  label,
  value,
  onChange,
}: {
  readonly label: string
  readonly value: string
  readonly onChange?: ((query: string) => void) | undefined
}) {
  const inputId = React.useId()
  return (
    <label className="lumen-effect lumen-input-group lumen-data-table-reference-search" htmlFor={inputId}>
      <Glyph name="search" />
      <LumenInput
        id={inputId}
        variant="plain"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value)}
      />
    </label>
  )
}
function Header({
  title,
  subtitle,
  children,
}: {
  readonly title: string
  readonly subtitle?: string | undefined
  readonly children?: React.ReactNode | undefined
}) {
  return (
    <header className="lumen-data-table-reference-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </header>
  )
}
function CellEditor({
  cell,
  label,
  content,
}: {
  readonly cell: LumenDataTableReferenceCell
  readonly label: string
  readonly content: LumenDataTableReferenceBudget
}) {
  const input = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  return (
    <span className="lumen-data-table-cell-editor">
      <LumenInput
        ref={input}
        inputMode="decimal"
        value={cell.editor?.draft ?? ''}
        aria-label={label}
        aria-invalid={Boolean(cell.editor?.error)}
        onChange={(event) => content.onDraft?.(event.currentTarget.value)}
        onBlur={() => content.onCommit?.()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            content.onCommit?.()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            content.onCancel?.()
          }
        }}
      />
      {cell.editor?.error && <small role="alert">{cell.editor.error}</small>}
    </span>
  )
}
function ValueCell({
  cell,
  row,
  content,
  label,
}: {
  readonly cell: LumenDataTableReferenceCell | undefined
  readonly row: LumenDataTableReferenceRow
  readonly content: Exclude<LumenDataTableReferenceContent, { kind: 'shipments' | 'sources' }>
  readonly label: string
}) {
  if (!cell) {
    return null
  }
  if (content.kind === 'budget') {
    const budget = content
    if (cell.editor) {
      return <CellEditor cell={cell} label={budget.labels.edit(row.name, label)} content={budget} />
    }
    if (cell.editable) {
      return (
        <LumenButton
          variant="outlined"
          disabled={row.disabled}
          aria-label={budget.labels.edit(row.name, label)}
          onClick={() => budget.onBeginEdit?.(row.id, cell.id)}
        >
          {cell.text}
        </LumenButton>
      )
    }
  }
  return cell.tone ? <LumenStatus value={cell.text} tone={cell.tone} /> : <span>{cell.text}</span>
}
function sortState(
  column: { readonly id: string; readonly sortable?: boolean | undefined },
  sort: { readonly field: string; readonly direction: 'asc' | 'desc' } | undefined,
): 'none' | 'ascending' | 'descending' | undefined {
  if (!column.sortable) {
    return undefined
  }
  if (sort?.field !== column.id) {
    return 'none'
  }
  return sort.direction === 'asc' ? 'ascending' : 'descending'
}
function AccountEmpty({
  content,
}: {
  readonly content: Extract<LumenDataTableReferenceContent, { kind: 'accounts' }>
}) {
  return (
    <div className="lumen-data-table-reference-state">
      <h3>{content.labels.noMatches}</h3>
      <p>{content.labels.noMatchesBody}</p>
      <LumenButton variant="outlined" onClick={content.onClearFilters}>
        {content.labels.clear}
      </LumenButton>
    </div>
  )
}
function EmptyRows({
  content,
}: {
  readonly content: Exclude<LumenDataTableReferenceContent, { kind: 'shipments' | 'sources' }>
}) {
  if (content.kind === 'accounts') {
    return <AccountEmpty content={content} />
  }
  if (content.kind === 'payments' && (content.page - 1) * content.pageSize < content.total) {
    return content.labels.unavailable
  }
  return content.copy.empty
}
function Rows({
  content,
}: {
  readonly content: Exclude<LumenDataTableReferenceContent, { kind: 'shipments' | 'sources' }>
}) {
  const columns = unique(content.columns).filter((column) => column.visible)
  const rows = unique(content.rows)
  const payments = content.kind === 'payments' ? content : undefined
  const checks = content.kind === 'checks' ? content : undefined
  const extra = payments || checks ? 1 : 0
  const eligibleRows = rows.filter((row) => !row.disabled)
  const all = eligibleRows.length > 0 && eligibleRows.every((row) => row.selected)
  const some = rows.some((row) => row.selected)
  return (
    <div
      className="lumen-data-table-reference-scroll"
      data-hbar-app-ui-list-strategy={content.listStrategy.kind}
      data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
      data-density={content.kind === 'dispatch' ? content.densityId : undefined}
    >
      <table aria-label={content.caption}>
        <thead>
          <tr>
            {payments && (
              <th scope="col">
                <LumenCheckBoxControl
                  checked={all}
                  disabled={eligibleRows.length === 0}
                  indeterminate={some && !all}
                  aria-label={payments.labels.selectPage}
                  onChange={() => payments.onSelectPage?.(!all)}
                />
              </th>
            )}
            {checks && <th scope="col">{checks.labels.expand}</th>}
            {columns.map((column) => (
              <th key={column.id} scope="col" aria-sort={sortState(column, content.sort)}>
                {column.sortable ? (
                  <LumenButton
                    variant="text"
                    aria-label={content.copy.sort(column.label)}
                    onClick={() => content.onSort?.(column.id)}
                  >
                    {column.label}
                  </LumenButton>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <React.Fragment key={row.id}>
                {content.kind === 'dispatch' && (index === 0 || rows[index - 1]?.groupId !== row.groupId) && (
                  <tr className="lumen-data-table-group">
                    <th colSpan={columns.length}>
                      {content.groups.find((group) => group.id === row.groupId)?.label}
                      <small>{rows.filter((item) => item.groupId === row.groupId).length}</small>
                    </th>
                  </tr>
                )}
                <tr data-selected={row.selected}>
                  {payments && (
                    <td>
                      <LumenCheckBoxControl
                        checked={Boolean(row.selected)}
                        disabled={row.disabled}
                        aria-label={payments.labels.selectRow(row.name)}
                        onChange={() => payments.onSelect?.(row.id, !row.selected)}
                      />
                    </td>
                  )}
                  {checks && (
                    <td>
                      <LumenButton
                        variant="outlined"
                        aria-label={checks.labels.toggle(row.name, Boolean(row.expanded))}
                        aria-expanded={Boolean(row.expanded)}
                        disabled={row.disabled}
                        onClick={() => checks.onExpand?.(row.id, !row.expanded)}
                      >
                        <Glyph name="chevron" />
                      </LumenButton>
                    </td>
                  )}
                  {columns.map((column, columnIndex) =>
                    columnIndex === 0 ? (
                      <th key={column.id} scope="row">
                        <strong>{row.name}</strong>
                        {row.subline && <small>{row.subline}</small>}
                      </th>
                    ) : (
                      <td key={column.id} data-numeric={column.numeric}>
                        <ValueCell
                          cell={row.cells.find((cell) => cell.id === column.id)}
                          row={row}
                          content={content}
                          label={column.label}
                        />
                      </td>
                    ),
                  )}
                </tr>
                {checks && row.expanded && (
                  <tr className="lumen-data-table-check-detail">
                    <td colSpan={columns.length + extra}>
                      {row.detail && (
                        <div>
                          <p>{row.detail.body}</p>
                          <ul>
                            {unique(row.detail.tags).map((tag) => (
                              <li key={tag.id}>{tag.label}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length + extra}>
                <EmptyRows content={content} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
function AccountCards({
  content,
}: {
  readonly content: Extract<LumenDataTableReferenceContent, { kind: 'accounts' }>
}) {
  return (
    <ul className="lumen-data-table-account-cards" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
      {unique(content.rows).map((row) => {
        const cell = (id: string) => row.cells.find((value) => value.id === id)
        return (
          <li key={row.id}>
            <div>
              <strong>{row.name}</strong>
              <span>{cell('mrr')?.text}</span>
            </div>
            <div>
              {cell('status') && <LumenStatus value={cell('status')?.text ?? ''} tone={cell('status')?.tone} />}
              <small>
                {cell('plan')?.text}
                <span>{content.labels.renews(cell('renewal')?.text ?? '')}</span>
              </small>
            </div>
          </li>
        )
      })}
      {!content.rows.length && (
        <li>
          <AccountEmpty content={content} />
        </li>
      )}
    </ul>
  )
}
function PaymentsFooter({ content }: { readonly content: LumenDataTableReferencePayments }) {
  const pages = Math.max(1, Math.ceil(content.total / content.pageSize))
  return (
    <footer className="lumen-data-table-reference-footer">
      <label>
        {content.labels.rowsPerPage}
        <LumenSelect
          value={content.pageSize}
          aria-label={content.labels.rowsPerPage}
          onChange={(event) => content.onPageSize?.(Number(event.currentTarget.value))}
        >
          {content.pageSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </LumenSelect>
      </label>
      <span>
        {content.labels.range(
          content.total ? (content.page - 1) * content.pageSize + 1 : 0,
          Math.min(content.page * content.pageSize, content.total),
          content.total,
        )}
      </span>
      <nav className="lumen-data-table-pagination" aria-label={content.caption}>
        <LumenButton
          variant="outlined"
          disabled={content.page <= 1}
          aria-label={content.labels.previous}
          onClick={() => content.onPage?.(content.page - 1)}
        >
          <Glyph name="chevron" />
        </LumenButton>
        {Array.from({ length: pages }, (_, index) => index + 1).map((page) => (
          <LumenButton
            key={page}
            variant="text"
            aria-label={content.labels.page(page)}
            aria-current={page === content.page ? 'page' : undefined}
            onClick={() => content.onPage?.(page)}
          >
            {page}
          </LumenButton>
        ))}
        <LumenButton
          variant="outlined"
          disabled={content.page >= pages}
          aria-label={content.labels.next}
          onClick={() => content.onPage?.(content.page + 1)}
        >
          <Glyph name="chevron" />
        </LumenButton>
      </nav>
    </footer>
  )
}
function StandardReference({
  content,
  onAction,
}: {
  readonly content: Exclude<LumenDataTableReferenceContent, { kind: 'shipments' | 'sources' }>
  readonly onAction: ReferenceProps['onAction']
}) {
  const request = (actionId: string) => onAction?.({ actionId })
  return (
    <React.Fragment>
      <Header title={content.title} subtitle={content.subtitle}>
        {content.kind === 'accounts' && (
          <LumenButton variant="outlined" onClick={() => request('export')}>
            <Glyph name="download" />
            {content.labels.export}
          </LumenButton>
        )}
        {content.kind === 'payments' && <small>{content.labels.pending(content.total)}</small>}
        {content.kind === 'dispatch' && (
          <div className="lumen-data-table-tabs" role="group" aria-label={content.densityLabel}>
            {unique(content.densities).map((density) => (
              <LumenButton
                key={density.id}
                variant={density.id === content.densityId ? 'solid' : 'text'}
                aria-pressed={density.id === content.densityId}
                disabled={density.disabled}
                onClick={() => content.onDensity?.(density.id)}
              >
                {density.label}
              </LumenButton>
            ))}
          </div>
        )}
        {(content.kind === 'checks' || content.kind === 'capacity') && content.copy.search && (
          <Search label={content.copy.search} value={content.query ?? ''} onChange={content.onQuery} />
        )}
      </Header>
      {content.kind === 'accounts' && (
        <div className="lumen-data-table-reference-toolbar">
          {content.copy.search && (
            <Search label={content.copy.search} value={content.query ?? ''} onChange={content.onQuery} />
          )}
          <div className="lumen-data-table-tabs" role="group" aria-label={content.labels.filters}>
            {unique(content.filters).map((filter) => (
              <LumenButton
                key={filter.id}
                variant={content.filterId === filter.id ? 'solid' : 'text'}
                aria-pressed={content.filterId === filter.id}
                disabled={filter.disabled}
                onClick={() => content.onFilter?.(filter.id)}
              >
                {filter.label}
              </LumenButton>
            ))}
          </div>
          <details className="lumen-data-table-columns">
            <summary>
              <Glyph name="columns" />
              {content.labels.columns}
            </summary>
            <div>
              {unique(content.columns)
                .filter((column) => column.toggleable)
                .map((column) => (
                  <label key={column.id}>
                    <LumenCheckBoxControl
                      checked={column.visible}
                      onChange={() => content.onColumn?.(column.id, !column.visible)}
                    />
                    {column.label}
                  </label>
                ))}
            </div>
          </details>
        </div>
      )}
      {content.kind === 'payments' && content.selectedCount > 0 && (
        <div className="lumen-data-table-bulk">
          <strong>{content.labels.selected(content.selectedCount)}</strong>
          <span>{content.selectedAmount}</span>
          <LumenButton variant="outlined" onClick={() => request('hold')}>
            {content.labels.hold}
          </LumenButton>
          <LumenButton variant="outlined" onClick={() => request('export')}>
            {content.labels.export}
          </LumenButton>
          <LumenButton variant="text" onClick={content.onClear}>
            {content.labels.clear}
          </LumenButton>
        </div>
      )}
      <Rows content={content} />
      {content.kind === 'accounts' && <AccountCards content={content} />}
      {content.kind === 'payments' ? (
        <PaymentsFooter content={content} />
      ) : (
        <footer className="lumen-data-table-reference-footer">
          <span>{content.copy.count(content.rows.length, content.total)}</span>
          {content.kind === 'budget' && (
            <span>
              {content.labels.total}
              <strong>{content.totalBudget}</strong>
            </span>
          )}
        </footer>
      )}
    </React.Fragment>
  )
}
function Shipments({
  content,
  onAction,
}: {
  readonly content: Extract<LumenDataTableReferenceContent, { kind: 'shipments' }>
  readonly onAction: ReferenceProps['onAction']
}) {
  const items = unique(content.items)
  const selected = items.find((item) => item.id === content.selectedId)
  return (
    <React.Fragment>
      <Header title={content.title}>
        <small>{content.labels.count(content.total)}</small>
      </Header>
      <div className="lumen-data-table-shipment-layout">
        <aside className="lumen-data-table-shipment-list">
          <Search label={content.labels.search} value={content.query} onChange={content.onQuery} />
          <ul data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            {items.length ? (
              items.map((item) => (
                <li key={item.id}>
                  <LumenButton
                    variant={item.id === selected?.id ? 'outlined' : 'text'}
                    aria-pressed={item.id === selected?.id}
                    disabled={item.disabled}
                    onClick={() => content.onSelect?.(item.id)}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.route}</small>
                    </span>
                    <LumenStatus value={item.status} tone={item.tone} />
                  </LumenButton>
                </li>
              ))
            ) : (
              <li>{content.labels.empty}</li>
            )}
          </ul>
        </aside>
        <main className="lumen-data-table-shipment-detail">
          {selected ? (
            <React.Fragment>
              <header>
                {selected.displayId && <small>{selected.displayId}</small>}
                <LumenStatus value={selected.status} tone={selected.tone} />
                <h3>{selected.name}</h3>
                <p>{selected.route}</p>
              </header>
              {selected.detail ? (
                <React.Fragment>
                  <dl>
                    {unique(selected.detail.metadata).map((item) => (
                      <div key={item.id}>
                        <dt>{item.label}</dt>
                        <dd>{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <section>
                    <h3>{content.labels.notes}</h3>
                    <p>{selected.detail.notes}</p>
                  </section>
                  <section>
                    <h3>{content.labels.activity}</h3>
                    <ul>
                      {unique(selected.detail.activity).map((item) => (
                        <li key={item.id}>
                          <span>{item.text}</span>
                          <small>{item.time}</small>
                        </li>
                      ))}
                    </ul>
                  </section>
                </React.Fragment>
              ) : (
                <p>{content.labels.unavailable}</p>
              )}
              <footer>
                <LumenButton variant="outlined" onClick={() => onAction?.({ actionId: 'message', value: selected.id })}>
                  {content.labels.message}
                </LumenButton>
                <LumenButton onClick={() => onAction?.({ actionId: 'deliver', value: selected.id })}>
                  {content.labels.deliver}
                </LumenButton>
              </footer>
            </React.Fragment>
          ) : (
            <p>{content.labels.empty}</p>
          )}
        </main>
      </div>
    </React.Fragment>
  )
}
function Sources({
  content,
  onAction,
}: {
  readonly content: Extract<LumenDataTableReferenceContent, { kind: 'sources' }>
  readonly onAction: ReferenceProps['onAction']
}) {
  const states = unique(content.states)
  const selected =
    states.find((item) => item.id === content.selectedStateId && !item.disabled) ??
    states.find((item) => !item.disabled)
  return (
    <React.Fragment>
      <Header title={content.title}>
        <div className="lumen-data-table-tabs" role="group" aria-label={content.labels.states}>
          {states.map((state) => (
            <LumenButton
              key={state.id}
              variant={state.id === selected?.id ? 'solid' : 'text'}
              aria-pressed={state.id === selected?.id}
              disabled={state.disabled}
              onClick={() => content.onState?.(state.id)}
            >
              {state.label}
            </LumenButton>
          ))}
        </div>
      </Header>
      <div className="lumen-data-table-reference-scroll">
        <table aria-label={content.caption} aria-busy={selected?.id === 'loading'}>
          <thead>
            <tr>
              {unique(content.columns).map((column) => (
                <th key={column.id} scope="col" aria-label={column.label}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selected?.id === 'loading' ? (
              Array.from({ length: Math.max(0, Math.min(80, content.skeletonRows)) }, (_, index) => (
                <tr key={index} className="lumen-data-table-reference-skeleton">
                  {unique(content.columns).map((column) => (
                    <td key={column.id} aria-label={column.label}>
                      <i aria-hidden="true" />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={content.columns.length}>
                  <div className="lumen-data-table-reference-state">
                    <h3>{selected?.id === 'error' ? content.labels.errorTitle : content.labels.emptyTitle}</h3>
                    <p>{selected?.id === 'error' ? content.labels.errorBody : content.labels.emptyBody}</p>
                    <LumenButton
                      onClick={() => onAction?.({ actionId: selected?.id === 'error' ? 'retry' : 'connect' })}
                    >
                      {selected?.id === 'error' ? content.labels.retry : content.labels.connect}
                    </LumenButton>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selected?.id === 'loading' && (
        <footer className="lumen-data-table-reference-footer" role="status">
          {content.labels.loading}
        </footer>
      )}
    </React.Fragment>
  )
}
export default function LumenDataTableReference({ content, onAction }: ReferenceProps) {
  switch (content.kind) {
    case 'shipments':
      return <Shipments content={content} onAction={onAction} />
    case 'sources':
      return <Sources content={content} onAction={onAction} />
    case 'checks':
    case 'budget':
    case 'dispatch':
    case 'accounts':
    case 'capacity':
    case 'payments':
      return <StandardReference content={content} onAction={onAction} />
  }
}
