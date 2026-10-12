'use client'
import * as React from 'react'
import { LumenInput, LumenSelect, LumenTextarea } from './forms'
import { LumenButton } from './primitives'
import type {
  LumenMonitoringReferenceActionId,
  LumenMonitoringReferenceChart,
  LumenMonitoringReferenceChoice,
  LumenMonitoringReferenceContent,
  LumenMonitoringReferenceMetric,
  LumenMonitoringReferenceNode,
  LumenMonitoringReferenceTone,
} from './monitoring-reference-contracts'
import './monitoring-reference.css'

const glyphs = {
  refresh: 'M13 5V2l-2 2a5 5 0 1 0 1 7',
  pause: 'M5 3v10m6-10v10',
  play: 'M5 3l8 5-8 5Z',
  alert: 'M8 2 14 13H2Zm0 4v3m0 2h.01',
  chevron: 'm5 3 5 5-5 5',
  dots: 'M3 8h.01M8 8h.01M13 8h.01',
  search: 'M11 11l3 3M12 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  check: 'm3 8 3 3 7-7',
  bell: 'M4 7a4 4 0 0 1 8 0v3l1.5 2h-11L4 10Zm2.5 7h3M2 2l12 12',
  filter: 'M2 3h12L9.5 8v4l-3 1V8Z',
  plus: 'M8 2v12M2 8h12',
  send: 'm2 2 12 5-6 3-2 4Zm0 0 6 8',
  clear: 'm3 9 6-6 5 5-6 6H6Zm5 5h6',
  down: 'M8 2v9m-3-3 3 3 3-3M3 14h10',
  up: 'M8 14V3m-3 3 3-3 3 3',
  run: 'M3 4h10v8H3ZM3 7h10',
}
function Glyph({ name }: { readonly name: keyof typeof glyphs }) {
  return (
    <svg className="lumen-monitoring-reference-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d={glyphs[name]} />
    </svg>
  )
}
function first<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter(({ id }) => {
    if (!id.trim() || seen.has(id)) {
      return false
    }
    seen.add(id)
    return true
  })
}
function Dot({ tone = 'neutral' }: { readonly tone?: LumenMonitoringReferenceTone | undefined }) {
  return <i className="lumen-monitoring-reference-dot" data-tone={tone} aria-hidden="true" />
}
function Header({
  content,
  actions,
  children,
}: {
  readonly content: LumenMonitoringReferenceContent
  readonly actions?: React.ReactNode
  readonly children?: React.ReactNode
}) {
  return (
    <header className="lumen-monitoring-reference-header">
      <div className="lumen-monitoring-reference-header-copy">
        <div className="lumen-monitoring-reference-heading">
          <h2>{content.header.title}</h2>
          {content.header.status ? (
            <span className="lumen-monitoring-reference-status">
              <Dot tone={content.header.tone} />
              {content.header.status}
            </span>
          ) : null}
        </div>
        <p>{content.header.detail}</p>
      </div>
      {actions ? <div className="lumen-monitoring-reference-actions">{actions}</div> : null}
      {children}
    </header>
  )
}
function Tabs({
  choices,
  selectedId,
  label,
  field,
  content,
}: {
  readonly choices: readonly LumenMonitoringReferenceChoice[]
  readonly selectedId: string
  readonly label: string
  readonly field: LumenMonitoringReferenceActionId
  readonly content: LumenMonitoringReferenceContent
}) {
  const tabs = first(choices)
  const move = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | undefined
    if (event.key === 'ArrowRight') {
      next = (index + 1) % tabs.length
    }
    if (event.key === 'ArrowLeft') {
      next = (index + tabs.length - 1) % tabs.length
    }
    if (event.key === 'Home') {
      next = 0
    }
    if (event.key === 'End') {
      next = tabs.length - 1
    }
    const target = next === undefined ? undefined : tabs[next]
    if (next === undefined || !target) {
      return
    }
    event.preventDefault()
    content.onAction(field, target.id)
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[next]?.focus()
  }
  return (
    <div className="lumen-monitoring-reference-tabs" role="tablist" aria-label={label}>
      {tabs.map((choice, index) => (
        <button
          type="button"
          className="lumen-monitoring-reference-tab"
          role="tab"
          aria-selected={choice.id === selectedId}
          tabIndex={choice.id === selectedId ? 0 : -1}
          key={choice.id}
          onClick={() => content.onAction(field, choice.id)}
          onKeyDown={(event) => move(event, index)}
        >
          {choice.label}
          {choice.count === undefined ? null : <small>{choice.count}</small>}
        </button>
      ))}
    </div>
  )
}
function Metrics({
  items,
  content,
}: {
  readonly items: readonly LumenMonitoringReferenceMetric[]
  readonly content: LumenMonitoringReferenceContent
}) {
  return (
    <dl className="lumen-monitoring-reference-metrics">
      {first(items).map((item) => (
        <div className="lumen-monitoring-reference-metric" key={item.id} data-tone={item.tone}>
          <dt>
            {item.label}
            {item.optionsLabel ? (
              <button type="button" aria-label={item.optionsLabel} onClick={() => content.onAction('options', item.id)}>
                <Glyph name="dots" />
              </button>
            ) : null}
          </dt>
          <dd>
            {item.value}
            {item.delta ? (
              <small data-tone={item.tone}>
                <Glyph name={item.direction === 'up' ? 'up' : 'down'} />
                {item.delta}
              </small>
            ) : null}
          </dd>
          {item.detail ? <p>{item.detail}</p> : null}
        </div>
      ))}
    </dl>
  )
}
function coordinates(points: readonly number[]): string {
  const finite = points.filter(Number.isFinite).slice(0, 140)
  return finite
    .map(
      (value, index) =>
        `${index === 0 ? 'M' : 'L'}${(index / Math.max(1, finite.length - 1)) * 600},${170 - Math.min(100, Math.max(0, value)) * 1.5}`,
    )
    .join(' ')
}
function Chart({
  chart,
  spark = false,
}: {
  readonly chart: LumenMonitoringReferenceChart
  readonly spark?: boolean | undefined
}) {
  const gradientId = React.useId()
  const path = coordinates(chart.points)
  return (
    <div
      className={spark ? 'lumen-monitoring-reference-spark' : 'lumen-monitoring-reference-chart-wrap'}
      data-tone={chart.tone}
    >
      <svg
        className="lumen-monitoring-reference-chart"
        viewBox="0 0 600 180"
        preserveAspectRatio="none"
        role="img"
        aria-label={chart.label}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[40, 90, 140].map((y) => (
          <path key={y} d={`M0,${y}H600`} className="lumen-monitoring-reference-chart-guide" />
        ))}
        {chart.threshold === undefined ? null : (
          <path className="lumen-monitoring-reference-chart-threshold" d={`M0,${170 - chart.threshold * 1.5}H600`} />
        )}
        {chart.planned ? (
          <path className="lumen-monitoring-reference-chart-planned" d={coordinates(chart.planned)} />
        ) : null}
        {path ? (
          <React.Fragment>
            <path d={`${path}L600,180H0Z`} fill={`url(#${gradientId})`} stroke="none" />
            <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" />
          </React.Fragment>
        ) : null}
      </svg>
      {!spark && chart.axis.length ? (
        <div className="lumen-monitoring-reference-axis">
          {chart.axis.map((label, index) => (
            <span key={`${index}:${label}`}>{label}</span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
function Progress({
  value,
  label,
  tone,
}: {
  readonly value: number
  readonly label: string
  readonly tone?: LumenMonitoringReferenceTone | undefined
}) {
  const bounded = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
  return (
    <span
      className="lumen-monitoring-reference-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={bounded}
      data-tone={tone}
    >
      <i style={{ inlineSize: `${bounded}%` }} />
    </span>
  )
}
function Query({
  value,
  label,
  placeholder,
  content,
}: {
  readonly value: string
  readonly label: string
  readonly placeholder: string
  readonly content: LumenMonitoringReferenceContent
}) {
  return (
    <div className="lumen-monitoring-reference-query">
      <Glyph name="search" />
      <LumenInput
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => content.onAction('query', event.currentTarget.value)}
      />
    </div>
  )
}
function Empty({
  content,
  unavailable = false,
  searchable = false,
}: {
  readonly content: LumenMonitoringReferenceContent
  readonly unavailable?: boolean | undefined
  readonly searchable?: boolean | undefined
}) {
  return (
    <div className="lumen-monitoring-reference-empty">
      <p>{unavailable ? content.labels.unavailable : content.labels.empty}</p>
      {searchable ? (
        <LumenButton variant="outlined" onClick={() => content.onAction('query', '')}>
          {content.labels.clearSearch}
        </LumenButton>
      ) : null}
    </div>
  )
}
function Resource({
  value,
  label,
  percent,
}: {
  readonly value: number
  readonly label: string
  readonly percent: (value: number) => string
}) {
  let tone: LumenMonitoringReferenceTone = 'neutral'
  if (value >= 85) {
    tone = 'danger'
  } else if (value >= 70) {
    tone = 'warning'
  }
  return (
    <div className="lumen-monitoring-reference-resource">
      <span>
        {label}
        <strong data-tone={tone}>{percent(value)}</strong>
      </span>
      <Progress value={value} label={label} tone={tone} />
    </div>
  )
}
function Sort({
  id,
  label,
  content,
}: {
  readonly id: string
  readonly label: string
  readonly content: Extract<LumenMonitoringReferenceContent, { kind: 'fleet' | 'response' }>
}) {
  return (
    <button
      type="button"
      onClick={() => content.onAction('sort', `${id}:${content.sortId === id ? !content.descending : true}`)}
    >
      {label}
      {content.sortId === id ? <Glyph name={content.descending ? 'down' : 'up'} /> : null}
    </button>
  )
}
function sortState(
  content: Extract<LumenMonitoringReferenceContent, { kind: 'fleet' | 'response' }>,
  id: string,
): 'none' | 'ascending' | 'descending' {
  if (content.sortId !== id) {
    return 'none'
  }
  return content.descending ? 'descending' : 'ascending'
}
function legendTone(id: string): LumenMonitoringReferenceTone {
  if (id === 'outage') {
    return 'danger'
  }
  return id === 'degraded' ? 'warning' : 'neutral'
}
function NodeRow({
  node,
  content,
}: {
  readonly node: LumenMonitoringReferenceNode
  readonly content: Extract<LumenMonitoringReferenceContent, { kind: 'fleet' }>
}) {
  const expanded = content.expandedIds.includes(node.id)
  return (
    <tr>
      <td colSpan={5}>
        <button
          type="button"
          className="lumen-monitoring-reference-node-trigger"
          aria-expanded={expanded}
          onClick={() => content.onAction('expand', node.id)}
        >
          <span className="lumen-monitoring-reference-node-copy">
            <strong>{node.name}</strong>
            <small>{content.labels.metadata(node.role, node.region)}</small>
          </span>
          <span className="lumen-monitoring-reference-node-status">
            <Dot tone={node.tone} />
            {node.status}
          </span>
          {['cpu', 'memory', 'disk'].map((id) => {
            const column = content.columns.find((item) => item.id === id)
            let value = node.disk
            if (id === 'cpu') {
              value = node.cpu
            } else if (id === 'memory') {
              value = node.memory
            }
            return <Resource key={id} value={value} label={column?.label ?? ''} percent={content.labels.percent} />
          })}
        </button>
        {expanded ? (
          <p className="lumen-monitoring-reference-node-detail">{node.detail ?? content.labels.unavailable}</p>
        ) : null}
      </td>
    </tr>
  )
}

export default function LumenMonitoringReference({ content }: { readonly content: LumenMonitoringReferenceContent }) {
  let body: React.ReactNode
  switch (content.kind) {
    case 'health':
      body = (
        <React.Fragment>
          <Header
            content={content}
            actions={
              <React.Fragment>
                <Tabs
                  choices={content.ranges}
                  selectedId={content.rangeId}
                  label={content.rangeLabel}
                  field="range"
                  content={content}
                />
                <LumenButton
                  variant="outlined"
                  aria-label={content.refreshLabel}
                  onClick={() => content.onAction('refresh')}
                >
                  <Glyph name="refresh" />
                </LumenButton>
              </React.Fragment>
            }
          />
          {content.available ? (
            <React.Fragment>
              <Metrics items={content.metrics} content={content} />
              <div className="lumen-monitoring-reference-split">
                <section className="lumen-monitoring-reference-panel">
                  <div className="lumen-monitoring-reference-panel-heading">
                    <div>
                      <h3>{content.chartTitle}</h3>
                      <strong className="lumen-monitoring-reference-panel-value">{content.chartValue}</strong>
                    </div>
                    <p>{content.chartDetail}</p>
                  </div>
                  <Chart chart={content.chart} />
                </section>
                <section className="lumen-monitoring-reference-panel">
                  <h3>{content.activityLabel}</h3>
                  <ul className="lumen-monitoring-reference-events" data-hbar-app-ui-list-strategy="pane-scroll">
                    {first(content.events).map((event) => (
                      <li key={event.id}>
                        <p>
                          <strong>{event.title}</strong>
                          <Dot tone={event.tone} />
                          <span>{event.severity}</span>
                        </p>
                        <small>{event.meta}</small>
                        <p>{event.body}</p>
                      </li>
                    ))}
                    {content.events.length ? null : (
                      <li>
                        <Empty content={content} />
                      </li>
                    )}
                  </ul>
                </section>
              </div>
            </React.Fragment>
          ) : (
            <Empty content={content} unavailable />
          )}
        </React.Fragment>
      )
      break
    case 'live':
      body = (
        <React.Fragment>
          <Header
            content={content}
            actions={
              <React.Fragment>
                <Tabs
                  choices={content.choices}
                  selectedId={content.metricId}
                  label={content.metricLabel}
                  field="metric"
                  content={content}
                />
                <LumenButton variant="outlined" aria-pressed={content.paused} onClick={() => content.onAction('pause')}>
                  <Glyph name={content.paused ? 'play' : 'pause'} />
                  {content.paused ? content.resumeLabel : content.pauseLabel}
                </LumenButton>
              </React.Fragment>
            }
          />
          {content.available ? (
            <React.Fragment>
              <section className="lumen-monitoring-reference-panel">
                <div className="lumen-monitoring-reference-panel-heading">
                  <p className="lumen-monitoring-reference-live-value">
                    <strong>{content.value}</strong>
                    <small>{content.unit}</small>
                  </p>
                  <p>
                    <Dot />
                    {content.thresholdLabel}
                  </p>
                </div>
                <Chart chart={content.chart} />
              </section>
              <Metrics items={content.metrics} content={content} />
            </React.Fragment>
          ) : (
            <Empty content={content} unavailable />
          )}
        </React.Fragment>
      )
      break
    case 'incident':
      body = (
        <React.Fragment>
          <Header
            content={content}
            actions={
              <React.Fragment>
                <LumenSelect
                  aria-label={content.statusLabel}
                  value={content.statusId}
                  onChange={(event) => content.onAction('status', event.currentTarget.value)}
                >
                  {first(content.statuses).map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.label}
                    </option>
                  ))}
                </LumenSelect>
                <LumenButton
                  variant="contained"
                  disabled={content.statusId === 'resolved'}
                  onClick={() => content.onAction('incident-resolve')}
                >
                  {content.resolveLabel}
                </LumenButton>
              </React.Fragment>
            }
          >
            <Metrics items={content.metrics} content={content} />
          </Header>
          <div className="lumen-monitoring-reference-incident-body">
            <div className="lumen-monitoring-reference-incident-main">
              <section className="lumen-monitoring-reference-panel">
                <h3>{content.updatesLabel}</h3>
                <ol className="lumen-monitoring-reference-updates" data-hbar-app-ui-list-strategy="pane-scroll">
                  {first(content.updates).map((update) => (
                    <li key={update.id}>
                      <span className="lumen-monitoring-reference-avatar">{update.initials}</span>
                      <div className="lumen-monitoring-reference-update-copy">
                        <p>
                          <strong>{update.author}</strong>
                          <Dot tone={update.tone} />
                          <span>{update.status}</span>
                          <time>{update.time}</time>
                        </p>
                        <p>{update.body}</p>
                      </div>
                    </li>
                  ))}
                  {content.updates.length ? null : (
                    <li>
                      <Empty content={content} />
                    </li>
                  )}
                </ol>
              </section>
              <section className="lumen-monitoring-reference-composer">
                <LumenTextarea
                  aria-label={content.draftLabel}
                  placeholder={content.draftPlaceholder}
                  value={content.draft}
                  maxLength={4000}
                  onChange={(event) => content.onAction('draft', event.currentTarget.value)}
                />
                <div className="lumen-monitoring-reference-composer-footer">
                  <p>{content.draftDetail}</p>
                  <LumenButton
                    variant="contained"
                    disabled={!content.draft.trim()}
                    onClick={() => content.onAction('post')}
                  >
                    <Glyph name="send" />
                    {content.postLabel}
                  </LumenButton>
                </div>
              </section>
            </div>
            <aside className="lumen-monitoring-reference-panel">
              <h3>{content.affectedLabel}</h3>
              <ul className="lumen-monitoring-reference-affected">
                {first(content.affected).map((item) => (
                  <li key={item.id}>
                    <span>{item.name}</span>
                    <span>
                      <Dot tone={item.tone} />
                      {item.status}
                    </span>
                  </li>
                ))}
              </ul>
              <h3>{content.respondersLabel}</h3>
              <ul className="lumen-monitoring-reference-responders">
                {first(content.responders).map((item) => (
                  <li key={item.id}>
                    <span className="lumen-monitoring-reference-avatar">{item.initials}</span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.role}</small>
                    </div>
                  </li>
                ))}
              </ul>
              <h3>{content.budgetLabel}</h3>
              <Progress value={content.budget} label={content.budgetLabel} tone="warning" />
              <p>{content.budgetDetail}</p>
            </aside>
          </div>
        </React.Fragment>
      )
      break
    case 'alerts':
      body = (
        <React.Fragment>
          <Header
            content={content}
            actions={
              <LumenButton variant="outlined" onClick={() => content.onAction('silence-firing')}>
                <Glyph name="bell" />
                {content.silenceFiringLabel}
              </LumenButton>
            }
          >
            <div className="lumen-monitoring-reference-toolbar">
              <Tabs
                choices={content.states}
                selectedId={content.stateId}
                label={content.stateLabel}
                field="state"
                content={content}
              />
              <Query
                value={content.query}
                label={content.queryLabel}
                placeholder={content.queryPlaceholder}
                content={content}
              />
            </div>
          </Header>
          <ul className="lumen-monitoring-reference-alerts" data-hbar-app-ui-list-strategy="pane-scroll">
            {first(content.rows).map((row) => (
              <li
                className="lumen-monitoring-reference-alert-row"
                key={row.id}
                data-hbar-app-ui-target={row.id}
                data-hbar-app-ui-state={row.muted ? 'muted' : row.stateId}
              >
                <button
                  type="button"
                  className="lumen-monitoring-reference-alert-trigger"
                  aria-expanded={content.expandedIds.includes(row.id)}
                  onClick={() => content.onAction('expand', row.id)}
                >
                  <Glyph name="chevron" />
                  <span className="lumen-monitoring-reference-alert-copy">
                    <strong>
                      {row.title}
                      <span>
                        <Dot tone={row.tone} />
                        {row.severity}
                      </span>
                    </strong>
                    <small>{row.meta}</small>
                  </span>
                  <Chart chart={{ label: row.title, points: row.points, axis: [], tone: row.tone }} spark />
                  <span className="lumen-monitoring-reference-alert-value">
                    <strong data-tone={row.tone}>{row.value}</strong>
                    <small>{row.duration}</small>
                  </span>
                </button>
                {content.expandedIds.includes(row.id) ? (
                  <div className="lumen-monitoring-reference-alert-detail">
                    <p>{row.body ?? content.labels.unavailable}</p>
                    <div className="lumen-monitoring-reference-actions">
                      <LumenButton
                        variant="outlined"
                        disabled={row.stateId === 'resolved'}
                        onClick={() => content.onAction('resolve', row.id)}
                      >
                        <Glyph name="check" />
                        {content.resolveLabel}
                      </LumenButton>
                      <LumenButton
                        variant="text"
                        aria-pressed={row.muted}
                        onClick={() => content.onAction('silence', row.id)}
                      >
                        <Glyph name="bell" />
                        {row.muted ? content.mutedLabel : content.silenceLabel}
                      </LumenButton>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
            {content.rows.length ? null : (
              <li>
                <Empty
                  content={content}
                  searchable={Boolean(content.query)}
                  unavailable={
                    !content.query && (content.states.find(({ id }) => id === content.stateId)?.count ?? 0) > 0
                  }
                />
              </li>
            )}
          </ul>
          <footer className="lumen-monitoring-reference-footer">
            <p>{content.labels.shown(content.rows.length, content.total)}</p>
            <LumenButton variant="text" onClick={() => content.onAction('reset-alerts')}>
              {content.resetLabel}
            </LumenButton>
          </footer>
        </React.Fragment>
      )
      break
    case 'logs':
      body = (
        <React.Fragment>
          <Header
            content={content}
            actions={
              <React.Fragment>
                <LumenButton
                  variant={content.follow ? 'contained' : 'outlined'}
                  aria-pressed={content.follow}
                  onClick={() => content.onAction('follow')}
                >
                  <Glyph name="down" />
                  {content.followLabel}
                </LumenButton>
                <LumenButton variant="outlined" aria-pressed={content.paused} onClick={() => content.onAction('pause')}>
                  <Glyph name={content.paused ? 'play' : 'pause'} />
                  {content.paused ? content.resumeLabel : content.pauseLabel}
                </LumenButton>
                <LumenButton
                  variant="text"
                  aria-label={content.clearLabel}
                  disabled={!content.total}
                  onClick={() => content.onAction('clear')}
                >
                  <Glyph name="clear" />
                </LumenButton>
              </React.Fragment>
            }
          >
            <div className="lumen-monitoring-reference-toolbar">
              <Tabs
                choices={content.levels}
                selectedId={content.levelId}
                label={content.levelLabel}
                field="level"
                content={content}
              />
              <Query
                value={content.query}
                label={content.queryLabel}
                placeholder={content.queryPlaceholder}
                content={content}
              />
            </div>
          </Header>
          <LogFeed content={content} />
          <footer className="lumen-monitoring-reference-footer">
            <p>{content.footer}</p>
            <p>{content.rate}</p>
          </footer>
        </React.Fragment>
      )
      break
    case 'uptime':
      body = (
        <React.Fragment>
          <Header
            content={content}
            actions={
              <Tabs
                choices={content.windows}
                selectedId={content.windowId}
                label={content.windowLabel}
                field="window"
                content={content}
              />
            }
          />
          <ul className="lumen-monitoring-reference-uptime" data-hbar-app-ui-list-strategy="pane-scroll">
            {first(content.services).map((service) => (
              <li key={service.id}>
                <div className="lumen-monitoring-reference-service-heading">
                  <button
                    type="button"
                    aria-expanded={content.expandedIds.includes(service.id)}
                    onClick={() => content.onAction('expand', service.id)}
                  >
                    <Glyph name="chevron" />
                    {service.name}
                  </button>
                  <p>{service.uptime}</p>
                </div>
                <div className="lumen-monitoring-reference-days" role="img" aria-label={service.chartLabel}>
                  {first(service.days).map((day) => (
                    <i key={day.id} data-tone={day.tone} title={day.label} />
                  ))}
                </div>
                {content.expandedIds.includes(service.id) ? (
                  <div>
                    <p>{service.detail ?? content.labels.unavailable}</p>
                    {service.history?.length ? (
                      <ul>
                        {service.history.map((entry) => (
                          <li key={entry.id}>
                            <time>{entry.time}</time>
                            <p>{entry.body}</p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
            {content.services.length ? null : (
              <li>
                <Empty content={content} />
              </li>
            )}
          </ul>
          <footer className="lumen-monitoring-reference-footer">
            <p>{content.startLabel}</p>
            <ul className="lumen-monitoring-reference-legend">
              {content.legend.map((entry) => (
                <li key={entry.id}>
                  <Dot tone={legendTone(entry.id)} />
                  {entry.label}
                </li>
              ))}
            </ul>
            <p>{content.endLabel}</p>
          </footer>
        </React.Fragment>
      )
      break
    case 'fleet':
      body = (
        <React.Fragment>
          <Header
            content={content}
            actions={
              <React.Fragment>
                <LumenSelect
                  aria-label={content.regionLabel}
                  value={content.regionId}
                  onChange={(event) => content.onAction('region', event.currentTarget.value)}
                >
                  {first(content.regions).map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.label}
                    </option>
                  ))}
                </LumenSelect>
                <Query
                  value={content.query}
                  label={content.queryLabel}
                  placeholder={content.queryPlaceholder}
                  content={content}
                />
              </React.Fragment>
            }
          />
          <div className="lumen-monitoring-reference-table-scroll" data-hbar-app-ui-list-strategy="pane-scroll">
            <table className="lumen-monitoring-reference-fleet-table">
              <thead>
                <tr>
                  {content.columns.map((column, index) => (
                    <React.Fragment key={column.id}>
                      <th aria-sort={sortState(content, column.id)}>
                        <Sort id={column.id} label={column.label} content={content} />
                      </th>
                      {index === 0 ? <th>{content.statusLabel}</th> : null}
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {first(content.nodes).map((node) => (
                  <NodeRow key={node.id} node={node} content={content} />
                ))}
              </tbody>
            </table>
            {content.nodes.length ? null : <Empty content={content} searchable={Boolean(content.query)} />}
          </div>
          <footer className="lumen-monitoring-reference-footer">
            <p>{content.labels.shown(content.nodes.length, content.total)}</p>
            <p>{content.refreshDetail}</p>
          </footer>
        </React.Fragment>
      )
      break
    case 'response':
      body = (
        <React.Fragment>
          <Header
            content={content}
            actions={
              <p data-tone="danger">
                <Dot tone="danger" />
                {content.budgetLabel}
              </p>
            }
          />
          <Metrics items={content.metrics} content={content} />
          <section className="lumen-monitoring-reference-panel">
            <div className="lumen-monitoring-reference-panel-heading">
              <h3>{content.histogramTitle}</h3>
              <p>{content.histogramDetail}</p>
            </div>
            {content.buckets.length ? (
              <div className="lumen-monitoring-reference-histogram" role="group" aria-label={content.histogramLabel}>
                {first(content.buckets).map((bucket) => (
                  <button
                    type="button"
                    className="lumen-monitoring-reference-bucket"
                    key={bucket.id}
                    aria-label={bucket.accessibleLabel}
                    onClick={() => content.onAction('bucket', bucket.id)}
                  >
                    <svg viewBox="0 0 40 100" preserveAspectRatio="none" aria-hidden="true" data-tone={bucket.tone}>
                      <rect
                        x="1"
                        y={
                          100 -
                          Math.max(1, (bucket.value / Math.max(1, ...content.buckets.map(({ value }) => value))) * 92)
                        }
                        width="38"
                        height={Math.max(
                          1,
                          (bucket.value / Math.max(1, ...content.buckets.map(({ value }) => value))) * 92,
                        )}
                        rx="2"
                      />
                    </svg>
                    <small>{bucket.label}</small>
                  </button>
                ))}
              </div>
            ) : (
              <Empty content={content} unavailable />
            )}
          </section>
          <div className="lumen-monitoring-reference-table-scroll" data-hbar-app-ui-list-strategy="pane-scroll">
            <table className="lumen-monitoring-reference-response-table">
              <thead>
                <tr>
                  <th>{content.routeLabel}</th>
                  {content.columns.map((column) => (
                    <th key={column.id} data-column={column.id} aria-sort={sortState(content, column.id)}>
                      <Sort id={column.id} label={column.label} content={content} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {first(content.routes).map((route) => (
                  <tr key={route.id}>
                    <td>
                      <button
                        type="button"
                        aria-pressed={content.selectedId === route.id}
                        onClick={() => content.onAction('select', route.id)}
                      >
                        <small>{route.method}</small>
                        <strong>{route.path}</strong>
                      </button>
                    </td>
                    <td data-column="requests">{route.requests}</td>
                    <td data-column="p50">{route.p50Label}</td>
                    <td data-column="p90">{route.p90Label}</td>
                    <td data-column="p99" data-tone={route.p99 > 1000 ? 'danger' : 'neutral'}>
                      {route.p99Label}
                    </td>
                    <td data-column="errors">{route.errorsLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {content.routes.length ? null : <Empty content={content} />}
          </div>
        </React.Fragment>
      )
      break
    case 'queue':
      body = (
        <React.Fragment>
          <Header
            content={content}
            actions={
              <dl className="lumen-monitoring-reference-summary">
                {first(content.summary).map((item) => (
                  <div key={item.id}>
                    <dt>{item.label}</dt>
                    <dd data-tone={item.tone}>{item.value}</dd>
                  </div>
                ))}
              </dl>
            }
          >
            <div className="lumen-monitoring-reference-queue-toolbar">
              <Query
                value={content.query}
                label={content.queryLabel}
                placeholder={content.queryPlaceholder}
                content={content}
              />
              <div className="lumen-monitoring-reference-actions">
                <LumenButton
                  variant="outlined"
                  aria-pressed={content.attention}
                  onClick={() => content.onAction('attention')}
                >
                  <Glyph name="filter" />
                  {content.attentionLabel}
                </LumenButton>
                <LumenButton
                  variant="outlined"
                  onClick={() => content.onAction('all-groups', content.expandedGroupIds.length ? 'false' : 'true')}
                >
                  {content.expandedGroupIds.length ? content.collapseLabel : content.expandLabel}
                </LumenButton>
                <LumenButton variant="contained" onClick={() => content.onAction('new-run')}>
                  <Glyph name="plus" />
                  {content.newLabel}
                </LumenButton>
              </div>
            </div>
          </Header>
          <div className="lumen-monitoring-reference-queue" data-hbar-app-ui-list-strategy="pane-scroll">
            {first(content.groups).map((group) => {
              const runs = first(content.runs).filter(({ groupId }) => groupId === group.id)
              return (
                <section key={group.id}>
                  <button
                    type="button"
                    className="lumen-monitoring-reference-group-heading"
                    aria-expanded={content.expandedGroupIds.includes(group.id)}
                    onClick={() => content.onAction('group', group.id)}
                  >
                    <Glyph name="chevron" />
                    <strong>{group.title}</strong>
                    <span>{runs.length}</span>
                    <small className="lumen-monitoring-reference-group-detail">{group.detail}</small>
                  </button>
                  {content.expandedGroupIds.includes(group.id) ? (
                    <ul>
                      {runs.map((run) => (
                        <li className="lumen-monitoring-reference-run-row" key={run.id}>
                          <Glyph name="run" />
                          <div className="lumen-monitoring-reference-run-copy">
                            <strong>{run.title}</strong>
                            <p>{run.detail}</p>
                          </div>
                          <span className="lumen-monitoring-reference-run-owner">
                            <span className="lumen-monitoring-reference-avatar">{run.initials}</span>
                            <span>{run.environment}</span>
                          </span>
                          {run.progress === undefined ? (
                            <span className="lumen-monitoring-reference-run-progress" aria-hidden="true">
                              {content.labels.missingValue}
                            </span>
                          ) : (
                            <span
                              className="lumen-monitoring-reference-run-progress"
                              role="progressbar"
                              aria-label={content.labels.progress(run.title)}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={run.progress}
                            >
                              {content.labels.percent(run.progress)}
                            </span>
                          )}
                          <span className="lumen-monitoring-reference-run-status" data-tone={run.tone}>
                            {run.status}
                          </span>
                          <button
                            type="button"
                            aria-label={content.labels.options(run.title)}
                            onClick={() => content.onAction('run-actions', run.id)}
                          >
                            <Glyph name="dots" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              )
            })}
            {content.runs.length ? null : <Empty content={content} searchable={Boolean(content.query)} />}
          </div>
        </React.Fragment>
      )
      break
    case 'slo': {
      const selected = content.objectives.find(({ id }) => id === content.selectedId)
      body = (
        <React.Fragment>
          <Header
            content={content}
            actions={
              <Tabs
                choices={content.windows}
                selectedId={content.windowId}
                label={content.windowLabel}
                field="window"
                content={content}
              />
            }
          />
          {selected ? (
            <section className="lumen-monitoring-reference-panel">
              <div className="lumen-monitoring-reference-slo-chart-header">
                <div>
                  <h3>{content.chartTitle(selected.title)}</h3>
                  <p>{selected.detail}</p>
                </div>
                <dl>
                  <div>
                    <dt>{content.remainingLabel}</dt>
                    <dd data-tone={selected.tone}>{content.labels.percent(selected.remaining)}</dd>
                  </div>
                  <div>
                    <dt>{content.burnLabel}</dt>
                    <dd>{selected.burn}</dd>
                  </div>
                </dl>
              </div>
              {selected.chart.points.length ? (
                <Chart chart={selected.chart} />
              ) : (
                <Empty content={content} unavailable />
              )}
            </section>
          ) : (
            <Empty content={content} />
          )}
          <ul className="lumen-monitoring-reference-slo" data-hbar-app-ui-list-strategy="pane-scroll">
            {first(content.objectives).map((objective) => (
              <li key={objective.id}>
                <button
                  type="button"
                  className="lumen-monitoring-reference-objective-trigger"
                  aria-pressed={objective.id === content.selectedId}
                  onClick={() => content.onAction('select', objective.id)}
                >
                  <span className="lumen-monitoring-reference-objective-copy">
                    <strong>{objective.title}</strong>
                    <small>{objective.target}</small>
                  </span>
                  <span className="lumen-monitoring-reference-objective-budget">
                    <Progress
                      value={objective.remaining}
                      label={content.labels.progress(objective.title)}
                      tone={objective.tone}
                    />
                    <small>{objective.remainingLabel}</small>
                  </span>
                  <span>{objective.burn}</span>
                  <span className="lumen-monitoring-reference-objective-status">
                    <Dot tone={objective.tone} />
                    {objective.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </React.Fragment>
      )
      break
    }
    default:
      body = null
      break
  }
  return (
    <div className="lumen-monitoring-reference" data-reference-kind={content.kind}>
      {body}
      {content.notice ? (
        <p className="lumen-monitoring-reference-notice" role="status">
          {content.notice}
        </p>
      ) : null}
    </div>
  )
}
function LogFeed({ content }: { readonly content: Extract<LumenMonitoringReferenceContent, { kind: 'logs' }> }) {
  const list = React.useRef<HTMLUListElement>(null)
  React.useEffect(() => {
    if (content.follow && list.current) {
      list.current.scrollTop = list.current.scrollHeight
    }
  }, [content.follow, content.lines])
  return (
    <ul
      ref={list}
      className="lumen-monitoring-reference-logs"
      data-hbar-app-ui-list-strategy="pane-scroll"
      data-paused={content.paused}
    >
      {first(content.lines)
        .slice(-140)
        .map((line) => (
          <li key={line.id}>
            <button
              type="button"
              className="lumen-monitoring-reference-log-trigger"
              aria-expanded={content.expandedIds.includes(line.id)}
              onClick={() => content.onAction('expand', line.id)}
            >
              <time className="lumen-monitoring-reference-log-time">{line.time}</time>
              <span className="lumen-monitoring-reference-log-level">
                <Dot tone={line.tone} />
                {line.level}
              </span>
              <span className="lumen-monitoring-reference-log-service">{line.service}</span>
              <span className="lumen-monitoring-reference-log-message" data-tone={line.tone}>
                {line.message}
              </span>
            </button>
            {content.expandedIds.includes(line.id) ? (
              <pre className="lumen-monitoring-reference-log-context">{line.context ?? content.labels.unavailable}</pre>
            ) : null}
          </li>
        ))}
      {content.lines.length ? null : (
        <li>
          <Empty content={content} searchable={Boolean(content.query)} />
        </li>
      )}
    </ul>
  )
}
