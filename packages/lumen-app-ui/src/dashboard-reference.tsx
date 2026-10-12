'use client'

import * as React from 'react'
import { LumenInput, LumenSelect } from './forms'
import { LumenButton, LumenIconButton } from './primitives'
import type {
  LumenDashboardReferenceAction,
  LumenDashboardReferenceChart,
  LumenDashboardReferenceContent,
  LumenDashboardReferenceChoice,
  LumenDashboardReferenceEntry,
  LumenDashboardReferenceMetric,
  LumenDashboardReferenceRow,
  LumenDashboardReferenceTable,
} from './dashboard-reference-contracts'

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
function Glyph({ name }: { readonly name: 'more' | 'star' | 'document' | 'search' | 'arrow' }) {
  const paths = {
    more: 'M3 8h.01M8 8h.01M13 8h.01',
    star: 'm8 2 1.8 3.8 4.2.6-3 3 .7 4.2L8 11.6l-3.7 2 .7-4.2-3-3 4.2-.6Z',
    document: 'M4 2h5l3 3v9H4Zm5 0v4h3M6 9h4M6 11h4',
    search: 'm11 11 3 3M7 12A5 5 0 1 1 7 2a5 5 0 0 1 0 10Z',
    arrow: 'm6 3 5 5-5 5',
  }
  return (
    <svg className="lumen-dashboard-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
function line(points: readonly number[], maximum: number): string {
  return points
    .map(
      (point, index) => `${(index * 100) / Math.max(1, points.length - 1)},${42 - (Math.max(0, point) / maximum) * 40}`,
    )
    .join(' ')
}
function Spark({ points }: { readonly points: readonly number[] }) {
  const maximum = Math.max(1, ...points.filter(Number.isFinite))
  return (
    <svg className="lumen-dashboard-reference-spark" viewBox="0 0 100 44" aria-hidden="true">
      <polyline points={line(points, maximum)} />
    </svg>
  )
}
function Progress({ value, label }: { readonly value: number; readonly label: string }) {
  const bounded = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <span
      className="lumen-dashboard-reference-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={bounded}
    >
      <i style={{ inlineSize: `${bounded}%` }} />
    </span>
  )
}
function Empty({
  content,
  unavailable = false,
}: {
  readonly content: LumenDashboardReferenceContent
  readonly unavailable?: boolean | undefined
}) {
  return (
    <p className="lumen-dashboard-empty" role="status">
      {unavailable ? content.labels.unavailable : content.labels.empty}
    </p>
  )
}
function Action({
  action,
  content,
  menu = false,
}: {
  readonly action: LumenDashboardReferenceAction
  readonly content: LumenDashboardReferenceContent
  readonly menu?: boolean | undefined
}) {
  return (
    <LumenButton
      variant={action.primary ? 'contained' : 'outlined'}
      disabled={action.disabled}
      role={menu ? 'menuitem' : undefined}
      onClick={() => content.onRequest(action)}
      data-hbar-app-ui-action={action.id}
    >
      {action.label}
    </LumenButton>
  )
}
function Header({
  content,
  children,
}: {
  readonly content: LumenDashboardReferenceContent
  readonly children?: React.ReactNode
}) {
  return (
    <header className="lumen-dashboard-reference-header">
      <div>
        <h2>{content.title}</h2>
        {content.subtitle && <p>{content.subtitle}</p>}
      </div>
      <div className="lumen-dashboard-actions">
        {content.period && <small>{content.period}</small>}
        {children}
      </div>
    </header>
  )
}
function Choices({
  content,
  choices,
  selectedId,
  label,
  slot,
}: {
  readonly content: LumenDashboardReferenceContent
  readonly choices: readonly LumenDashboardReferenceChoice[]
  readonly selectedId: string
  readonly label: string
  readonly slot: string
}) {
  const values = unique(choices)
  const groupId = React.useId()
  function move(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const enabled = values.filter((item) => !item.disabled)
    const current = enabled.findIndex((item) => item.id === values[index]?.id)
    let nextIndex: number
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (current + 1) % enabled.length
        break
      case 'ArrowLeft':
        nextIndex = (current - 1 + enabled.length) % enabled.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = enabled.length - 1
        break
      default:
        return
    }
    const next = enabled[nextIndex]
    if (!next) {
      return
    }
    event.preventDefault()
    content.onSelect(slot, next.id)
    document.getElementById(`${groupId}-${next.id}`)?.focus()
  }
  return (
    <div className="lumen-dashboard-reference-choices" role="tablist" aria-label={label}>
      {values.map((item, index) => (
        <LumenButton
          key={item.id}
          id={`${groupId}-${item.id}`}
          role="tab"
          variant="text"
          disabled={item.disabled}
          aria-selected={item.id === selectedId}
          tabIndex={item.id === selectedId ? 0 : -1}
          onKeyDown={(event) => move(event, index)}
          onClick={() => content.onSelect(slot, item.id)}
        >
          {item.label}
        </LumenButton>
      ))}
    </div>
  )
}
function Metrics({
  values,
  content,
}: {
  readonly values: readonly LumenDashboardReferenceMetric[]
  readonly content: LumenDashboardReferenceContent
}) {
  return (
    <section className="lumen-dashboard-reference-metrics">
      {unique(values).length ? (
        unique(values).map((metric) => (
          <article key={metric.id} data-tone={metric.tone}>
            <span className="lumen-dashboard-reference-metric-label">{metric.label}</span>
            <div className="lumen-dashboard-reference-metric-value">
              <strong>{metric.value}</strong>
              {metric.points && <Spark points={metric.points} />}
            </div>
            {metric.delta && <span className="lumen-dashboard-reference-delta">{metric.delta}</span>}
            {metric.detail && <small>{metric.detail}</small>}
          </article>
        ))
      ) : (
        <Empty content={content} />
      )}
    </section>
  )
}
function Chart({ chart }: { readonly chart: LumenDashboardReferenceChart }) {
  const points = chart.points.map((value) => (Number.isFinite(value) ? value : 0))
  const secondary = chart.secondary?.map((value) => (Number.isFinite(value) ? value : 0)) ?? []
  const maximum = Math.max(1, ...points, ...secondary)
  const isBars = chart.type === 'bar' || chart.type === 'demand'
  return (
    <section className="lumen-dashboard-reference-panel lumen-dashboard-reference-chart">
      <header>
        <div>
          <h3>{chart.title}</h3>
          {chart.detail && <p>{chart.detail}</p>}
          {chart.value && <strong>{chart.value}</strong>}
          {chart.delta && <small className="lumen-dashboard-reference-delta">{chart.delta}</small>}
        </div>
        <div className="lumen-dashboard-reference-chart-meta">
          {chart.unit && <small>{chart.unit}</small>}
          {chart.legend?.map((label, index) => (
            <span key={`${index}-${label}`} data-series={index}>
              {label}
            </span>
          ))}
        </div>
      </header>
      <div className="lumen-dashboard-reference-plot">
        <div className="lumen-dashboard-reference-ticks">
          {chart.ticks.map((tick, index) => (
            <span key={`${index}-${tick}`}>{tick}</span>
          ))}
        </div>
        <div className="lumen-dashboard-reference-plot-body">
          <svg viewBox="0 0 100 44" preserveAspectRatio="none" role="img" aria-label={chart.label}>
            {isBars ? (
              points.map((value, index) => (
                <rect
                  key={index}
                  x={(index * 100) / Math.max(1, points.length) + 0.5}
                  y={42 - (value / maximum) * 40}
                  width={Math.max(0.3, 100 / Math.max(1, points.length) - 1)}
                  height={Math.max(0, (value / maximum) * 40)}
                />
              ))
            ) : (
              <React.Fragment>
                <polygon points={`0,42 ${line(points, maximum)} 100,42`} />
                <polyline points={line(points, maximum)} />
              </React.Fragment>
            )}
            {secondary.length > 0 && <polyline className="is-secondary" points={line(secondary, maximum)} />}
          </svg>
          <div className="lumen-dashboard-reference-axis">
            {chart.axis.map((label, index) => (
              <span key={`${index}-${label}`}>{label}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
function Entries({
  values,
  content,
}: {
  readonly values: readonly LumenDashboardReferenceEntry[]
  readonly content: LumenDashboardReferenceContent
}) {
  return (
    <ul className="lumen-dashboard-reference-entries">
      {unique(values).length ? (
        unique(values).map((entry) => (
          <li key={entry.id} data-tone={entry.tone}>
            <div>
              <strong>{entry.title}</strong>
              {entry.detail && <small>{entry.detail}</small>}
              {entry.progress !== undefined && <Progress value={entry.progress} label={entry.title} />}
            </div>
            {entry.value && <span>{entry.value}</span>}
            {entry.action && <Action action={entry.action} content={content} />}
          </li>
        ))
      ) : (
        <li>
          <Empty content={content} />
        </li>
      )}
    </ul>
  )
}
function Table({
  table,
  content,
  actions,
  sort,
}: {
  readonly table: LumenDashboardReferenceTable
  readonly content: LumenDashboardReferenceContent
  readonly actions?: ((row: LumenDashboardReferenceRow) => React.ReactNode) | undefined
  readonly sort?: Extract<LumenDashboardReferenceContent, { kind: 'modules' }> | undefined
}) {
  const direction = sort?.descending ? 'descending' : 'ascending'
  return (
    <section className="lumen-dashboard-reference-panel lumen-dashboard-reference-table">
      <header>
        <div>
          <h3>{table.title}</h3>
          {table.detail && <p>{table.detail}</p>}
        </div>
      </header>
      <div
        className="lumen-dashboard-reference-table-scroll"
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
      >
        <table aria-label={table.title}>
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th
                  key={column.id}
                  className={column.narrow === false ? 'is-wide' : undefined}
                  aria-sort={sort?.sortColumnId === column.id ? direction : undefined}
                >
                  {sort && column.id !== 'actions' ? (
                    <LumenButton
                      variant="text"
                      aria-label={sort.toolbar.sort(column.label)}
                      onClick={() => content.onSelect('sort', column.id)}
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
            {unique(table.rows).map((row) => (
              <tr key={row.id} data-row-id={row.id}>
                {row.cells.map((cell, index) => (
                  <td
                    key={table.columns[index]?.id ?? index}
                    className={table.columns[index]?.narrow === false ? 'is-wide' : undefined}
                    data-tone={cell.tone}
                  >
                    <div>
                      {cell.progress !== undefined && <Progress value={cell.progress} label={cell.text} />}
                      {cell.points ? <Spark points={cell.points} /> : <span>{cell.text}</span>}
                      {cell.detail && <small>{cell.detail}</small>}
                    </div>
                  </td>
                ))}
                {actions && <td className="is-wide">{actions(row)}</td>}
              </tr>
            ))}
            {table.rows.length === 0 && (
              <tr>
                <td colSpan={table.columns.length}>
                  <Empty content={content} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {table.footer && <footer>{table.footer}</footer>}
    </section>
  )
}
function Search({
  content,
  label,
}: {
  readonly content: Extract<LumenDashboardReferenceContent, { kind: 'modules' | 'service' }>
  readonly label: string
}) {
  const id = React.useId()
  return (
    <label className="lumen-effect lumen-input-group lumen-dashboard-reference-search" htmlFor={id}>
      <Glyph name="search" />
      <LumenInput
        id={id}
        variant="plain"
        aria-label={label}
        placeholder={label}
        value={content.query}
        onChange={(event) => content.onQuery(event.target.value)}
      />
    </label>
  )
}
function Basic({
  content,
}: {
  readonly content: Extract<LumenDashboardReferenceContent, { kind: 'revenue' | 'signups' | 'channels' | 'recurring' }>
}) {
  const revenue = content.kind === 'revenue'
  const slots = { revenue: 'range', signups: 'range', channels: 'metric', recurring: 'state' }
  return (
    <React.Fragment>
      <Header content={content}>
        {revenue ? (
          <LumenSelect
            aria-label={content.choiceLabel}
            value={content.selectedId}
            onChange={(event) => content.onSelect('range', event.target.value)}
          >
            {unique(content.choices).map((choice) => (
              <option key={choice.id} value={choice.id} disabled={choice.disabled}>
                {choice.label}
              </option>
            ))}
          </LumenSelect>
        ) : (
          <Choices
            content={content}
            choices={content.choices}
            selectedId={content.selectedId}
            label={content.choiceLabel}
            slot={slots[content.kind]}
          />
        )}
      </Header>
      <BasicBody content={content} />
    </React.Fragment>
  )
}
function BasicBody({
  content,
}: {
  readonly content: Extract<LumenDashboardReferenceContent, { kind: 'revenue' | 'signups' | 'channels' | 'recurring' }>
}) {
  if (content.kind === 'channels') {
    return (
      <React.Fragment>
        <div className="lumen-dashboard-reference-toolbar">
          <span>{content.subtitle}</span>
          <LumenButton
            variant="text"
            role="switch"
            aria-checked={content.compare}
            onClick={() => content.onFlag('compare', !content.compare)}
          >
            {content.compareLabel}
            <span className="lumen-dashboard-reference-switch" data-on={content.compare} aria-hidden="true">
              <i />
            </span>
          </LumenButton>
        </div>
        {content.table ? <Table table={content.table} content={content} /> : <Empty content={content} unavailable />}
      </React.Fragment>
    )
  }
  if (content.kind === 'recurring') {
    if (content.mode === 'empty') {
      return (
        <section className="lumen-dashboard-reference-empty">
          <h3>{content.emptyTitle}</h3>
          <p>{content.emptyBody}</p>
        </section>
      )
    }
    if (content.mode === 'loading') {
      return (
        <section className="lumen-dashboard-reference-skeleton" role="status" aria-label={content.loadingLabel}>
          <i />
          <i />
          <i />
        </section>
      )
    }
    return (
      <React.Fragment>
        <Chart chart={content.chart} />
        <Metrics values={content.metrics} content={content} />
      </React.Fragment>
    )
  }
  return (
    <React.Fragment>
      {content.kind === 'revenue' && <Metrics values={content.metrics} content={content} />}
      {content.chart ? <Chart chart={content.chart} /> : <Empty content={content} unavailable />}
      {content.kind === 'signups' &&
        (content.breakdown ? (
          <Table table={content.breakdown} content={content} />
        ) : (
          <Empty content={content} unavailable />
        ))}
    </React.Fragment>
  )
}
function WebAnalytics({
  content,
}: {
  readonly content: Extract<LumenDashboardReferenceContent, { kind: 'web-analytics' }>
}) {
  function panel(title: string, children: React.ReactNode, id: string) {
    if (content.hiddenWidgetIds.includes(id)) {
      return null
    }
    return (
      <section className="lumen-dashboard-reference-panel">
        <header>
          <h3>{title}</h3>
          <LumenIconButton
            label={content.titles.menu(title)}
            aria-expanded={content.menuId === id}
            onClick={() => content.onSelect('menu', content.menuId === id ? 'closed' : id)}
          >
            <Glyph name="more" />
          </LumenIconButton>
        </header>
        {content.menuId === id && (
          <div
            className="lumen-dashboard-reference-menu"
            role="menu"
            tabIndex={-1}
            aria-label={content.titles.menu(title)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                content.onSelect('menu', 'closed')
              }
            }}
          >
            {content.menuActions.map((action) => (
              <Action key={action.id} menu action={{ ...action, value: id }} content={content} />
            ))}
          </div>
        )}
        {children}
      </section>
    )
  }
  return (
    <React.Fragment>
      <Header content={content} />
      <Metrics values={content.metrics} content={content} />
      <div className="lumen-dashboard-reference-web-grid">
        {panel(content.chart.title, <Chart chart={content.chart} />, 'sessions')}
        {panel(content.titles.pages, <Entries values={content.pages} content={content} />, 'pages')}
        {panel(content.titles.devices, <Entries values={content.devices} content={content} />, 'devices')}
        {panel(content.titles.funnel, <Entries values={content.funnel} content={content} />, 'funnel')}
      </div>
    </React.Fragment>
  )
}
function Modules({ content }: { readonly content: Extract<LumenDashboardReferenceContent, { kind: 'modules' }> }) {
  return (
    <React.Fragment>
      <Header content={content}>
        {content.actions.map((action) => (
          <Action key={action.id} action={action} content={content} />
        ))}
      </Header>
      <Metrics values={content.metrics} content={content} />
      <div className="lumen-dashboard-reference-toolbar">
        <Search content={content} label={content.toolbar.search} />
        <LumenButton variant="outlined" onClick={() => content.onFlag('descending', !content.descending)}>
          {content.descending ? content.toolbar.descending : content.toolbar.ascending}
        </LumenButton>
        <LumenButton
          variant="outlined"
          aria-expanded={content.filterOpen}
          onClick={() => content.onFlag('filter-open', !content.filterOpen)}
        >
          {content.toolbar.filters}
        </LumenButton>
      </div>
      {content.filterOpen && content.filters.length === 0 && <Empty content={content} unavailable />}
      {content.filterOpen && content.filters.length > 0 && (
        <Choices
          content={content}
          choices={content.filters}
          selectedId={content.selectedFilterId}
          label={content.toolbar.filters}
          slot="filter"
        />
      )}
      {content.table.rows.length === 0 && (
        <section className="lumen-dashboard-reference-empty">
          <h3>{content.emptyTitle(content.query)}</h3>
          <p>{content.emptyBody}</p>
          <LumenButton variant="outlined" onClick={() => content.onQuery('')}>
            {content.clearSearch}
          </LumenButton>
        </section>
      )}
      <Table
        table={content.table}
        content={content}
        sort={content}
        actions={(row) => (
          <div className="lumen-dashboard-reference-row-actions">
            <LumenIconButton
              label={content.toolbar.document(row.cells[1]?.text ?? '')}
              onClick={() =>
                content.onRequest({
                  id: 'open-spec',
                  label: content.toolbar.document(row.cells[1]?.text ?? ''),
                  value: row.id,
                })
              }
            >
              <Glyph name="document" />
            </LumenIconButton>
            <LumenIconButton
              label={content.toolbar.star(row.cells[1]?.text ?? '')}
              aria-pressed={content.starredIds.includes(row.id)}
              onClick={() => content.onFlag(`star-${row.id}`, !content.starredIds.includes(row.id))}
            >
              <Glyph name="star" />
            </LumenIconButton>
            <LumenIconButton
              label={content.toolbar.more(row.cells[1]?.text ?? '')}
              aria-expanded={content.menuRowId === row.id}
              onClick={() => content.onSelect('module-menu', content.menuRowId === row.id ? 'closed' : row.id)}
            >
              <Glyph name="more" />
            </LumenIconButton>
          </div>
        )}
      />
      {content.menuRowId && (
        <div
          className="lumen-dashboard-reference-menu"
          role="menu"
          tabIndex={-1}
          aria-label={content.toolbar.more(
            content.table.rows.find(({ id }) => id === content.menuRowId)?.cells[1]?.text ?? '',
          )}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              content.onSelect('module-menu', 'closed')
            }
          }}
        >
          {content.menuActions.map((action) => (
            <Action key={action.id} menu action={{ ...action, value: content.menuRowId }} content={content} />
          ))}
        </div>
      )}
    </React.Fragment>
  )
}
function Delivery({ content }: { readonly content: Extract<LumenDashboardReferenceContent, { kind: 'delivery' }> }) {
  const weekIndex = content.weeks.findIndex((week) => week.id === content.selectedWeekId)
  const currentWeek = content.weeks[weekIndex]
  return (
    <React.Fragment>
      <Header content={content}>
        <LumenIconButton
          label={content.bookmarkLabel}
          aria-pressed={content.bookmarked}
          onClick={() => content.onFlag('bookmark', !content.bookmarked)}
        >
          <Glyph name="star" />
        </LumenIconButton>
      </Header>
      <Choices
        content={content}
        choices={content.choices}
        selectedId={content.selectedId}
        label={content.choiceLabel}
        slot="tab"
      />
      <Metrics values={content.metrics} content={content} />
      <div className="lumen-dashboard-reference-toolbar">
        <LumenButton
          variant="outlined"
          aria-label={content.previous}
          disabled={weekIndex <= 0}
          onClick={() => {
            const week = content.weeks[weekIndex - 1]
            if (week) {
              content.onSelect('week', week.id)
            }
          }}
        >
          {content.previous}
        </LumenButton>
        <span aria-label={content.weekLabel}>{currentWeek?.label}</span>
        <LumenButton
          variant="outlined"
          aria-label={content.next}
          disabled={weekIndex >= content.weeks.length - 1}
          onClick={() => {
            const week = content.weeks[weekIndex + 1]
            if (week) {
              content.onSelect('week', week.id)
            }
          }}
        >
          {content.next}
        </LumenButton>
      </div>
      {content.worklog ? <Table table={content.worklog} content={content} /> : <Empty content={content} unavailable />}
    </React.Fragment>
  )
}
function Explorer({ content }: { readonly content: Extract<LumenDashboardReferenceContent, { kind: 'explorer' }> }) {
  const measure = unique(content.measures).find((item) => item.id === content.selectedId)
  return (
    <React.Fragment>
      <div className="lumen-dashboard-reference-measures" role="tablist" aria-label={content.measureLabel}>
        {unique(content.measures).map((item) => (
          <LumenButton
            key={item.id}
            variant="text"
            role="tab"
            aria-selected={content.selectedId === item.id}
            onClick={() => content.onSelect('measure', item.id)}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </LumenButton>
        ))}
      </div>
      {measure && (
        <React.Fragment>
          <div className="lumen-dashboard-reference-toolbar">
            <span>{content.rangeLabel(measure.minimum, measure.maximum)}</span>
            <Action action={content.report} content={content} />
          </div>
          {measure.chart.points.length ? <Chart chart={measure.chart} /> : <Empty content={content} unavailable />}
        </React.Fragment>
      )}
      <div className="lumen-dashboard-reference-columns">
        <section className="lumen-dashboard-reference-panel">
          <header>
            <div>
              <h3>{content.titles.agents}</h3>
              <p>{content.titles.agentDetail}</p>
            </div>
          </header>
          <Entries values={content.agents} content={content} />
        </section>
        <section className="lumen-dashboard-reference-panel">
          <header>
            <div>
              <h3>{content.titles.integrations}</h3>
              <p>{content.titles.integrationDetail}</p>
            </div>
            <Action action={content.manage} content={content} />
          </header>
          <Entries values={content.integrations} content={content} />
        </section>
      </div>
    </React.Fragment>
  )
}
function Coverage({ content }: { readonly content: Extract<LumenDashboardReferenceContent, { kind: 'coverage' }> }) {
  return (
    <React.Fragment>
      <Header content={content}>
        <Action action={content.export} content={content} />
      </Header>
      <Metrics values={content.metrics} content={content} />
      <div className="lumen-dashboard-reference-columns is-coverage">
        <div>
          <Table table={content.review} content={content} />
          <Chart chart={content.chart} />
        </div>
        <section className="lumen-dashboard-reference-panel">
          <header>
            <div>
              <h3>{content.queueTitle}</h3>
              <p>{content.queueDetail}</p>
            </div>
          </header>
          <Entries values={content.queue} content={content} />
          <footer>{content.queueFooter}</footer>
        </section>
      </div>
    </React.Fragment>
  )
}
function Payout({ content }: { readonly content: Extract<LumenDashboardReferenceContent, { kind: 'payout' }> }) {
  return (
    <React.Fragment>
      <Header content={content}>
        <Action action={content.export} content={content} />
      </Header>
      <section className="lumen-dashboard-reference-panel">
        <small>
          <span>{content.desk.category}</span> <span>{content.desk.date}</span>
        </small>
        <div className="lumen-dashboard-reference-toolbar">
          <div>
            <h3>{content.desk.title}</h3>
            <p>{content.desk.detail}</p>
          </div>
          <div className="lumen-dashboard-reference-balance">
            <small>{content.desk.balanceLabel}</small>
            <strong>{content.desk.balance}</strong>
            <small>{content.desk.pending}</small>
          </div>
          <div className="lumen-dashboard-actions">
            {content.actions.map((action) => (
              <Action key={action.id} action={action} content={content} />
            ))}
          </div>
        </div>
        <Metrics values={content.metrics} content={content} />
      </section>
      <div className="lumen-dashboard-reference-columns is-payout">
        <div>
          <Chart chart={content.chart} />
          <Table table={content.moves} content={content} />
        </div>
        <section className="lumen-dashboard-reference-panel">
          <header>
            <div>
              <h3>{content.release.title}</h3>
              <p>{content.release.detail}</p>
            </div>
            <small>{content.release.badge}</small>
          </header>
          <div className="lumen-dashboard-reference-toolbar">
            <span>{content.release.label}</span>
            <strong>{content.release.value}</strong>
          </div>
          <Progress value={content.release.progress} label={content.release.label} />
          <div className="lumen-dashboard-reference-toolbar">
            <small>{content.release.held}</small>
            <small>{content.release.limit}</small>
          </div>
          <Action action={content.release.action} content={content} />
          <Entries values={content.release.lanes} content={content} />
          <footer>
            <span>{content.release.footer}</span>
            <strong>{content.release.total}</strong>
          </footer>
        </section>
      </div>
    </React.Fragment>
  )
}
function Goals({ content }: { readonly content: Extract<LumenDashboardReferenceContent, { kind: 'goals' }> }) {
  const objectives = unique(content.objectives)
  const selected = objectives.find((objective) => objective.id === content.selectedId)
  return (
    <React.Fragment>
      <Header content={content} />
      <Metrics values={content.metrics} content={content} />
      <div className="lumen-dashboard-reference-columns is-goals">
        <section className="lumen-dashboard-reference-panel">
          <header>
            <h3>{content.titles.objectives}</h3>
            <span>{objectives.length}</span>
          </header>
          <div
            className="lumen-dashboard-reference-objectives"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {objectives.map((objective) => (
              <LumenButton
                variant="text"
                key={objective.id}
                aria-pressed={objective.id === content.selectedId}
                onClick={() => content.onSelect('objective', objective.id)}
                data-tone={objective.tone}
              >
                <div>
                  <strong>{objective.title}</strong>
                  <small>{objective.detail}</small>
                  {objective.progress !== undefined && <Progress value={objective.progress} label={objective.title} />}
                </div>
                <span>{objective.value}</span>
                <Glyph name="arrow" />
              </LumenButton>
            ))}
          </div>
          <footer>{content.titles.footer}</footer>
        </section>
        <div>
          {selected?.chart ? <Chart chart={selected.chart} /> : <Empty content={content} unavailable />}
          <section className="lumen-dashboard-reference-panel">
            <header>
              <h3>{content.titles.results}</h3>
              <small>{content.titles.resultDetail}</small>
            </header>
            <Entries values={selected?.results ?? []} content={content} />
            <footer>{content.titles.resultFooter}</footer>
          </section>
        </div>
      </div>
    </React.Fragment>
  )
}
function Service({ content }: { readonly content: Extract<LumenDashboardReferenceContent, { kind: 'service' }> }) {
  const services = unique(content.services)
  const selected = services.find((service) => service.id === content.selectedId)
  return (
    <React.Fragment>
      <Header content={content}>
        <small>{content.live}</small>
        <Action action={content.refresh} content={content} />
      </Header>
      <div className="lumen-dashboard-reference-columns is-service">
        <aside className="lumen-dashboard-reference-panel">
          <Search content={content} label={content.search} />
          <div
            className="lumen-dashboard-reference-service-list"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {services.map((service) => (
              <LumenButton
                variant="text"
                key={service.id}
                aria-pressed={service.id === content.selectedId}
                onClick={() => content.onSelect('service', service.id)}
                data-tone={service.tone}
              >
                <div>
                  <strong>{service.title}</strong>
                  <small>{service.detail}</small>
                </div>
                <Spark points={service.points} />
              </LumenButton>
            ))}
            {services.length === 0 && <Empty content={content} />}
          </div>
        </aside>
        <section className="lumen-dashboard-reference-service-detail lumen-dashboard-reference-panel">
          {selected ? (
            <React.Fragment>
              <header>
                <div>
                  <h3>
                    {selected.title} <small data-tone={selected.tone}>{selected.value}</small>
                  </h3>
                  <p>{selected.metadata}</p>
                </div>
                <div className="lumen-dashboard-actions">
                  {content.actions.map((action) => (
                    <Action key={action.id} action={{ ...action, value: selected.id }} content={content} />
                  ))}
                </div>
              </header>
              {selected.metrics ? (
                <Metrics values={selected.metrics} content={content} />
              ) : (
                <Empty content={content} unavailable />
              )}
              {selected.chart && <Chart chart={selected.chart} />}
              <h3>{content.activityTitle}</h3>
              {selected.activity && <Entries values={selected.activity} content={content} />}
            </React.Fragment>
          ) : (
            <Empty content={content} />
          )}
        </section>
      </div>
    </React.Fragment>
  )
}
export default function LumenDashboardReference({ content }: { readonly content: LumenDashboardReferenceContent }) {
  switch (content.kind) {
    case 'revenue':
    case 'signups':
    case 'channels':
    case 'recurring':
      return <Basic content={content} />
    case 'web-analytics':
      return <WebAnalytics content={content} />
    case 'status':
      return (
        <React.Fragment>
          <Header content={content}>
            <Action action={content.refresh} content={content} />
          </Header>
          <Metrics values={content.metrics} content={content} />
          <div className="lumen-dashboard-reference-columns">
            <Table table={content.services} content={content} />
            <section className="lumen-dashboard-reference-panel">
              <h3>{content.incidentTitle}</h3>
              <Entries values={content.incidents} content={content} />
            </section>
          </div>
        </React.Fragment>
      )
    case 'usage':
      return (
        <React.Fragment>
          <Header content={content} />
          <section className="lumen-dashboard-reference-panel">
            <div className="lumen-dashboard-reference-toolbar">
              <div>
                <h3>{content.plan.title}</h3>
                <p>{content.plan.detail}</p>
              </div>
              <Action action={content.plan.action} content={content} />
            </div>
          </section>
          <section className="lumen-dashboard-reference-panel">
            <h3>{content.quotaTitle}</h3>
            <Entries values={content.quotas} content={content} />
          </section>
          <Chart chart={content.chart} />
        </React.Fragment>
      )
    case 'modules':
      return <Modules content={content} />
    case 'delivery':
      return <Delivery content={content} />
    case 'explorer':
      return <Explorer content={content} />
    case 'coverage':
      return <Coverage content={content} />
    case 'payout':
      return <Payout content={content} />
    case 'goals':
      return <Goals content={content} />
    case 'service':
      return <Service content={content} />
    default:
      return null
  }
}
