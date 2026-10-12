'use client'

import * as React from 'react'
import { LumenTextarea, LumenChoiceSelect, LumenSelect } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenStatus, LumenText } from './primitives'
import { type LumenMonitoringReferenceContent } from './monitoring-reference-contracts'
import LumenMonitoringReference from './monitoring-reference'
import './monitoring.css'
import { LumenChart, LumenList, type LumenChartPoint } from './ui-compositions'
import { LumenProgress, LumenTabs } from './ui-controls'

export interface LumenMonitoringListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenMonitoringChoice {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean | undefined
}

export interface LumenMonitoringMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly detail?: string | undefined
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' | undefined
}

export interface LumenMonitoringSeriesPoint {
  readonly id: string
  readonly label?: string | undefined
  readonly value: number
}

export interface LumenMonitoringEvent {
  readonly id: string
  readonly title: string
  readonly meta: string
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger'
}

export interface LumenMonitoringHealthContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly refresh: string
    readonly chart: string
    readonly incidents: string
    readonly empty: string
  }
  readonly metrics: readonly LumenMonitoringMetric[]
  readonly series: readonly LumenMonitoringSeriesPoint[]
  readonly incidents: readonly LumenMonitoringEvent[]
  readonly listStrategy: LumenMonitoringListStrategy
}

export interface LumenMonitoringLiveContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly pause: string
    readonly resume: string
    readonly threshold: (value: number) => string
    readonly chart: string
  }
  readonly thresholds: readonly number[]
  readonly initialThreshold: number
  readonly series: readonly LumenMonitoringSeriesPoint[]
  readonly metrics: readonly LumenMonitoringMetric[]
}

export interface LumenMonitoringTimelineItem {
  readonly id: string
  readonly time: string
  readonly label: string
}

export interface LumenMonitoringIncidentContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly status: string
    readonly responders?: string | undefined
    readonly updatePlaceholder: string
    readonly emptyTimeline: string
  }
  readonly statuses: readonly LumenMonitoringChoice[]
  readonly initialStatusId: string
  readonly summary: { readonly title: string; readonly body: string }
  readonly responders?: readonly string[] | undefined
  readonly timeline: readonly LumenMonitoringTimelineItem[]
  readonly listStrategy: LumenMonitoringListStrategy
}

export interface LumenMonitoringAlert {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly stateId: string
  readonly series: readonly LumenMonitoringSeriesPoint[]
}

export interface LumenMonitoringAlertsContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly states: string
    readonly silence: string
    readonly empty: string
  }
  readonly states: readonly LumenMonitoringChoice[]
  readonly initialStateId: string
  readonly alerts: readonly LumenMonitoringAlert[]
  readonly listStrategy: LumenMonitoringListStrategy
}

export interface LumenMonitoringLogLine {
  readonly id: string
  readonly levelId?: string | undefined
  readonly time: string
  readonly message: string
  readonly context: string
}

export interface LumenMonitoringLogsContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly levels: string
    readonly pause: string
    readonly follow: string
    readonly log: string
    readonly expand: (id: string) => string
    readonly collapse?: ((id: string) => string) | undefined
    readonly empty: string
  }
  readonly levels: readonly LumenMonitoringChoice[]
  readonly initialLevelId: string
  readonly lines: readonly LumenMonitoringLogLine[]
  readonly listStrategy: LumenMonitoringListStrategy
}

export interface LumenMonitoringServiceDay {
  readonly id: string
  readonly label: string
  readonly tone: 'success' | 'warning' | 'danger'
}

export interface LumenMonitoringService {
  readonly id: string
  readonly name: string
  readonly days: readonly LumenMonitoringServiceDay[]
}

export interface LumenMonitoringUptimeContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly windows: string
    readonly day: (service: string, day: string) => string
    readonly empty: string
  }
  readonly windows: readonly LumenMonitoringChoice[]
  readonly initialWindowId: string
  readonly services: readonly LumenMonitoringService[]
  readonly listStrategy: LumenMonitoringListStrategy
}

export interface LumenMonitoringNode {
  readonly id: string
  readonly name: string
  readonly region: string
  readonly utilisation: number
  readonly status: string
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger'
}

export interface LumenMonitoringFleetContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly regions: string
    readonly node: string
    readonly region: string
    readonly utilisation: string
    readonly status: string
    readonly progress: (node: string) => string
    readonly empty: string
  }
  readonly regions: readonly LumenMonitoringChoice[]
  readonly initialRegionId: string
  readonly nodes: readonly LumenMonitoringNode[]
  readonly listStrategy: LumenMonitoringListStrategy
}

export interface LumenMonitoringEndpoint {
  readonly id: string
  readonly path: string
  readonly value: string
}

export interface LumenMonitoringResponseContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly sort: (label: string) => string
    readonly histogram: string
    readonly endpoints: string
    readonly empty: string
  }
  readonly sorts: readonly LumenMonitoringChoice[]
  readonly initialSortId: string
  readonly metrics: readonly LumenMonitoringMetric[]
  readonly series: readonly LumenMonitoringSeriesPoint[]
  readonly endpoints: readonly LumenMonitoringEndpoint[]
}

export interface LumenMonitoringRun {
  readonly id: string
  readonly name: string
  readonly detail: string
  readonly stateId: string
  readonly status: string
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger'
  readonly progress?: number | undefined
}

export interface LumenMonitoringQueueContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly attention: string
    readonly count: (count: number) => string
    readonly progress: (run: string) => string
    readonly progressValue?: ((value: number) => string) | undefined
    readonly unavailableProgress?: string | undefined
    readonly empty: string
  }
  readonly states: readonly LumenMonitoringChoice[]
  readonly attentionStateId: string
  readonly runs: readonly LumenMonitoringRun[]
  readonly listStrategy: LumenMonitoringListStrategy
}

export interface LumenMonitoringObjective {
  readonly id: string
  readonly title: string
  readonly target: string
  readonly budget: number
  readonly budgetLabel: string
  readonly tone: 'success' | 'warning' | 'danger'
}

export interface LumenMonitoringSloContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly windows: string
    readonly chart?: string | undefined
    readonly progress: (objective: string) => string
    readonly empty: string
  }
  readonly windows: readonly LumenMonitoringChoice[]
  readonly initialWindowId: string
  readonly series?: readonly LumenMonitoringSeriesPoint[] | undefined
  readonly objectives: readonly LumenMonitoringObjective[]
  readonly listStrategy: LumenMonitoringListStrategy
}

export interface LumenMonitoringContent {
  readonly reference?: LumenMonitoringReferenceContent | undefined
  readonly health?: LumenMonitoringHealthContent | undefined
  readonly live?: LumenMonitoringLiveContent | undefined
  readonly incident?: LumenMonitoringIncidentContent | undefined
  readonly alerts?: LumenMonitoringAlertsContent | undefined
  readonly logs?: LumenMonitoringLogsContent | undefined
  readonly uptime?: LumenMonitoringUptimeContent | undefined
  readonly fleet?: LumenMonitoringFleetContent | undefined
  readonly response?: LumenMonitoringResponseContent | undefined
  readonly queue?: LumenMonitoringQueueContent | undefined
  readonly slo?: LumenMonitoringSloContent | undefined
}

export interface LumenMonitoringProviderProps {
  readonly content: LumenMonitoringContent
  readonly children: React.ReactNode
}

export interface LumenMonitoringAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenMonitoringProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenMonitoringContent | undefined
  readonly onAction?: ((event: LumenMonitoringAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenMonitoringVariantProps = Omit<LumenMonitoringProps, 'variant' | 'variantId'>

const Context = React.createContext<LumenMonitoringContent | undefined>(undefined)

export function LumenMonitoringProvider({ content, children }: LumenMonitoringProviderProps) {
  return <Context.Provider value={content}>{children}</Context.Provider>
}

export function useLumenMonitoringContent() {
  return React.useContext(Context)
}

export function uniqueLumenMonitoringItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenMonitoringItem<T extends { readonly id: string }>(
  items: readonly T[],
  id: string | undefined,
): T | undefined {
  return items.find((item) => item.id === id) ?? items[0]
}

const report = (fn: LumenMonitoringProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({
  name,
}: {
  name: 'refresh' | 'pause' | 'play' | 'alert' | 'check' | 'filter' | 'chevron' | 'bell' | 'shield'
}) {
  const d = {
    refresh: 'M13 5V2l-2 2a5 5 0 1 0 1 7',
    pause: 'M5 3v10m6-10v10',
    play: 'M5 3l8 5-8 5Z',
    alert: 'M8 2 14 13H2Zm0 4v3m0 2h.01',
    check: 'm3 8 3 3 7-7',
    filter: 'M2 3h12L9.5 8v4l-3 1V8Z',
    chevron: 'm4 6 4 4 4-4',
    bell: 'M4 7a4 4 0 0 1 8 0v3l1.5 2h-11L4 10Zm2.5 7h3',
    shield: 'M8 2l5 2v4c0 3-2 5-5 6-3-1-5-3-5-6V4Zm-2 6 1.5 1.5L11 7',
  }[name]
  return (
    <svg className="lumen-monitoring-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d={d} />
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
}: Omit<LumenMonitoringProps, 'content' | 'onAction'> & { children: React.ReactNode }) {
  const contentClassName = [
    'lumen-monitoring',
    `hbar-app-ui-monitoring-variant-${variant}`,
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
      className="lumen-monitoring-surface"
      contentClassName={contentClassName}
      data-lumen-component="monitoring"
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
    <header className="lumen-monitoring-header">
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

function Metrics({ metrics }: { metrics: readonly LumenMonitoringMetric[] }) {
  return (
    <dl className="lumen-monitoring-metrics">
      {uniqueLumenMonitoringItems(metrics).map((item) => (
        <div key={item.id} data-tone={item.tone}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          {item.detail ? <small>{item.detail}</small> : null}
        </div>
      ))}
    </dl>
  )
}

function Bars({
  points,
  label,
  threshold,
}: {
  points: readonly LumenMonitoringSeriesPoint[]
  label: string
  threshold?: number | undefined
}) {
  const values = uniqueLumenMonitoringItems(points)
  return (
    <div
      className="lumen-monitoring-bars"
      aria-label={label}
      data-threshold={threshold !== undefined}
      style={
        threshold === undefined
          ? undefined
          : ({
              '--lumen-monitoring-threshold-position': `${100 - Math.max(0, Math.min(100, threshold))}%`,
            } as React.CSSProperties)
      }
    >
      {values.map((point) => (
        <i key={point.id} style={{ blockSize: `${Math.max(2, Math.min(100, point.value))}%` }} />
      ))}
    </div>
  )
}

function Health(props: Omit<LumenMonitoringProps, 'content'> & { content: LumenMonitoringHealthContent }) {
  const incidents = uniqueLumenMonitoringItems(props.content.incidents)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton variant="outlined" onClick={() => report(props.onAction, 'refresh')}>
            <Glyph name="refresh" />
            {props.content.labels.refresh}
          </LumenButton>
        }
      />
      <Metrics metrics={props.content.metrics} />
      <LumenChart
        kind="area"
        label={props.content.labels.chart}
        series={[
          {
            id: 'throughput',
            label: props.content.labels.chart,
            points: chartPoints(props.content.series),
            tone: 'info',
          },
        ]}
        empty={props.content.labels.empty}
      />
      <div className="lumen-monitoring-events" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        <LumenText as="strong" variant="label">
          {props.content.labels.incidents}
        </LumenText>
        {incidents.length ? (
          incidents.map((event) => (
            <article key={event.id}>
              <Glyph name={event.tone === 'success' ? 'check' : 'alert'} />
              <span>{event.title}</span>
              <small>{event.meta}</small>
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

function Live(props: Omit<LumenMonitoringProps, 'content'> & { content: LumenMonitoringLiveContent }) {
  const thresholds = [...new Set(props.content.thresholds)].filter(Number.isFinite)
  const [paused, setPaused] = React.useState(false)
  const [thresholdIndex, setThresholdIndex] = React.useState(
    Math.max(0, thresholds.indexOf(props.content.initialThreshold)),
  )
  const threshold = thresholds[thresholdIndex] ?? props.content.initialThreshold
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <div className="lumen-monitoring-actions">
            <LumenButton
              variant="outlined"
              onClick={() => {
                const next = !paused
                setPaused(next)
                report(props.onAction, next ? 'pause' : 'resume')
              }}
            >
              <Glyph name={paused ? 'play' : 'pause'} />
              {paused ? props.content.labels.resume : props.content.labels.pause}
            </LumenButton>
            <LumenButton
              variant="outlined"
              onClick={() => setThresholdIndex((value) => (value + 1) % Math.max(1, thresholds.length))}
            >
              {props.content.labels.threshold(threshold)}
            </LumenButton>
          </div>
        }
      />
      <div data-paused={paused || undefined}>
        <Bars points={props.content.series} label={props.content.labels.chart} threshold={threshold} />
      </div>
      <Metrics metrics={props.content.metrics} />
    </Root>
  )
}

function Incident(props: Omit<LumenMonitoringProps, 'content'> & { content: LumenMonitoringIncidentContent }) {
  const statuses = uniqueLumenMonitoringItems(props.content.statuses)
  const timeline = uniqueLumenMonitoringItems(props.content.timeline)
  const [statusId, setStatusId] = React.useState(props.content.initialStatusId)
  const status = selectLumenMonitoringItem(statuses, statusId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <LumenSelect
        aria-label={props.content.labels.status}
        value={status?.id ?? ''}
        onChange={(event) => {
          setStatusId(event.currentTarget.value)
          report(props.onAction, 'status', event.currentTarget.value)
        }}
      >
        {statuses.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </LumenSelect>
      <article className="lumen-monitoring-incident">
        <Glyph name="alert" />
        <div>
          <strong>{props.content.summary.title}</strong>
          <p>{props.content.summary.body}</p>
        </div>
        <LumenStatus value={status?.label ?? ''} tone={status?.id === 'resolved' ? 'success' : 'warning'} />
      </article>
      <ol className="lumen-monitoring-timeline" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {timeline.length ? (
          timeline.map((item) => (
            <li key={item.id}>
              <b>{item.time}</b>
              <span>{item.label}</span>
            </li>
          ))
        ) : (
          <li>{props.content.labels.emptyTimeline}</li>
        )}
      </ol>
      <LumenTextarea
        placeholder={props.content.labels.updatePlaceholder}
        aria-label={props.content.labels.updatePlaceholder}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            report(props.onAction, 'update', event.currentTarget.value)
            event.currentTarget.value = ''
          }
        }}
      />
    </Root>
  )
}

function Alerts(props: Omit<LumenMonitoringProps, 'content'> & { content: LumenMonitoringAlertsContent }) {
  const states = uniqueLumenMonitoringItems(props.content.states)
  const alerts = uniqueLumenMonitoringItems(props.content.alerts)
  const [stateId, setStateId] = React.useState(props.content.initialStateId)
  const state = selectLumenMonitoringItem(states, stateId)
  const visible = alerts.filter((alert) => alert.stateId === state?.id)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <LumenTabs
        className="lumen-monitoring-tabs"
        label={props.content.labels.states}
        items={states}
        selectedId={state?.id ?? null}
        onChange={setStateId}
      />
      <div className="lumen-monitoring-alerts" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {visible.length ? (
          visible.map((alert) => (
            <article key={alert.id}>
              <div>
                <strong>{alert.title}</strong>
                <small>{alert.detail}</small>
              </div>
              <Bars points={alert.series} label={alert.title} />
              <LumenButton variant="outlined" onClick={() => report(props.onAction, 'silence', alert.id)}>
                {props.content.labels.silence}
              </LumenButton>
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

function Logs(props: Omit<LumenMonitoringProps, 'content'> & { content: LumenMonitoringLogsContent }) {
  const levels = uniqueLumenMonitoringItems(props.content.levels)
  const lines = uniqueLumenMonitoringItems(props.content.lines)
  const [levelId, setLevelId] = React.useState(props.content.initialLevelId)
  const [paused, setPaused] = React.useState(false)
  const [expandedIds, setExpandedIds] = React.useState<ReadonlySet<string>>(() => new Set())
  const level = selectLumenMonitoringItem(levels, levelId)
  const visible = level?.id === 'all' ? lines : lines.filter((line) => line.levelId === level?.id)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton
            variant="outlined"
            onClick={() => {
              const next = !paused
              setPaused(next)
              report(props.onAction, next ? 'pause' : 'resume')
            }}
          >
            {paused ? props.content.labels.follow : props.content.labels.pause}
          </LumenButton>
        }
      />
      <div className="lumen-monitoring-pills" role="group" aria-label={props.content.labels.levels}>
        {levels.map((item) => (
          <LumenButton
            key={item.id}
            variant={level?.id === item.id ? 'solid' : 'outlined'}
            onClick={() => setLevelId(item.id)}
          >
            <Glyph name="filter" />
            {item.label}
          </LumenButton>
        ))}
      </div>
      <div
        className="lumen-monitoring-logs"
        role="log"
        aria-label={props.content.labels.log}
        data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
      >
        {visible.length ? (
          visible.map((line) => {
            const expanded = expandedIds.has(line.id)
            return (
              <article className="lumen-monitoring-log-entry" key={line.id}>
                <LumenButton
                  variant="text"
                  aria-expanded={expanded}
                  aria-label={
                    expanded ? props.content.labels.collapse?.(line.id) : props.content.labels.expand?.(line.id)
                  }
                  onClick={() => {
                    setExpandedIds((current) => {
                      const next = new Set(current)
                      if (next.has(line.id)) {
                        next.delete(line.id)
                      } else {
                        next.add(line.id)
                      }
                      return next
                    })
                    report(props.onAction, expanded ? 'collapse-log' : 'expand-log', line.id)
                  }}
                >
                  <code>{line.time}</code>
                  <b>{levels.find((item) => item.id === line.levelId)?.label ?? line.levelId}</b>
                  <span>{line.message}</span>
                  <Glyph name="chevron" />
                </LumenButton>
                {expanded ? <code className="lumen-monitoring-log-context">{line.context}</code> : null}
              </article>
            )
          })
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
    </Root>
  )
}

function Uptime(props: Omit<LumenMonitoringProps, 'content'> & { content: LumenMonitoringUptimeContent }) {
  const windows = uniqueLumenMonitoringItems(props.content.windows)
  const services = uniqueLumenMonitoringItems(props.content.services)
  const [windowId, setWindowId] = React.useState(props.content.initialWindowId)
  const window = selectLumenMonitoringItem(windows, windowId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <LumenTabs
        className="lumen-monitoring-tabs"
        label={props.content.labels.windows}
        items={windows}
        selectedId={window?.id ?? null}
        onChange={setWindowId}
      />
      <div className="lumen-monitoring-uptime" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {services.length ? (
          services.map((service) => (
            <div key={service.id}>
              <strong>{service.name}</strong>
              {uniqueLumenMonitoringItems(service.days).map((day) => (
                <LumenButton
                  key={day.id}
                  className="lumen-monitoring-day"
                  data-tone={day.tone}
                  aria-label={props.content.labels.day(service.name, day.label)}
                  onClick={() => report(props.onAction, 'open-day', `${service.id}:${day.id}`)}
                />
              ))}
            </div>
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

function Progress({ value, label, tone = 'neutral' }: { value: number; label: string; tone?: string | undefined }) {
  return (
    <LumenProgress
      className="lumen-monitoring-progress"
      label={label}
      value={value}
      tone={tone === 'success' || tone === 'warning' || tone === 'danger' ? tone : 'info'}
    />
  )
}

function Fleet(props: Omit<LumenMonitoringProps, 'content'> & { content: LumenMonitoringFleetContent }) {
  const regions = uniqueLumenMonitoringItems(props.content.regions)
  const nodes = uniqueLumenMonitoringItems(props.content.nodes)
  const [regionId, setRegionId] = React.useState(props.content.initialRegionId)
  const region = selectLumenMonitoringItem(regions, regionId)
  const visible = nodes.filter((node) => region?.id === 'all' || node.region === region?.id)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenChoiceSelect
            id="monitoring-fleet-region"
            label={props.content.labels.regions}
            options={regions}
            value={region?.id ?? null}
            onValueChange={(id) => {
              setRegionId(id)
              report(props.onAction, 'region', id)
            }}
          />
        }
      />
      <div className="lumen-monitoring-fleet" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        <header>
          <span>{props.content.labels.node}</span>
          <span>{props.content.labels.region}</span>
          <span>{props.content.labels.utilisation}</span>
          <span>{props.content.labels.status}</span>
        </header>
        {visible.length ? (
          visible.map((node) => (
            <article key={node.id}>
              <strong>{node.name}</strong>
              <span>{node.region}</span>
              <Progress value={node.utilisation} label={props.content.labels.progress(node.name)} tone={node.tone} />
              <LumenStatus value={node.status} tone={node.tone} />
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

function Response(props: Omit<LumenMonitoringProps, 'content'> & { content: LumenMonitoringResponseContent }) {
  const sorts = uniqueLumenMonitoringItems(props.content.sorts)
  const endpoints = uniqueLumenMonitoringItems(props.content.endpoints)
  const [sortId, setSortId] = React.useState(props.content.initialSortId)
  const sort = selectLumenMonitoringItem(sorts, sortId)
  const orderedEndpoints = React.useMemo(() => {
    const next = [...endpoints]
    if (sortId === 'path') {
      return next.sort((left, right) => left.path.localeCompare(right.path))
    }
    const direction = sortId === 'fastest' ? 1 : -1
    return next.sort((left, right) => (Number.parseFloat(left.value) - Number.parseFloat(right.value)) * direction)
  }, [endpoints, sortId])
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
                sorts.findIndex((item) => item.id === sort?.id),
              )
              const next = sorts[(index + 1) % Math.max(1, sorts.length)]
              if (next) {
                setSortId(next.id)
                report(props.onAction, 'sort', next.id)
              }
            }}
          >
            {props.content.labels.sort(sort?.label ?? '')}
          </LumenButton>
        }
      />
      <Metrics metrics={props.content.metrics} />
      <LumenChart
        kind="bar"
        label={props.content.labels.histogram}
        series={[
          {
            id: 'latency',
            label: props.content.labels.histogram,
            points: chartPoints(props.content.series),
            tone: 'info',
          },
        ]}
        empty={props.content.labels.empty}
      />
      <LumenList
        className="lumen-monitoring-endpoints"
        label={props.content.labels.endpoints}
        items={orderedEndpoints.map((item) => ({
          id: item.id,
          primary: <code>{item.path}</code>,
          trailing: <span>{item.value}</span>,
        }))}
        empty={
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        }
      />
    </Root>
  )
}

function Queue(props: Omit<LumenMonitoringProps, 'content'> & { content: LumenMonitoringQueueContent }) {
  const states = uniqueLumenMonitoringItems(props.content.states)
  const runs = uniqueLumenMonitoringItems(props.content.runs)
  const [attention, setAttention] = React.useState(false)
  const visibleStates = attention ? states.filter((state) => state.id === props.content.attentionStateId) : states
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton
            variant={attention ? 'solid' : 'outlined'}
            onClick={() => {
              setAttention((value) => !value)
              report(props.onAction, 'attention', String(!attention))
            }}
          >
            <Glyph name="bell" />
            {props.content.labels.attention}
          </LumenButton>
        }
      />
      <div className="lumen-monitoring-queue" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {visibleStates.map((state) => {
          const group = runs.filter((run) => run.stateId === state.id)
          return (
            <section key={state.id}>
              <header>
                <strong>{state.label}</strong>
                <small>{props.content.labels.count(group.length)}</small>
              </header>
              {group.map((run) => (
                <article key={run.id}>
                  {run.progress === undefined ? (
                    <span className="lumen-monitoring-run-progress">—</span>
                  ) : (
                    <span className="lumen-monitoring-run-progress">
                      <i
                        style={
                          {
                            '--progress': `${Math.max(0, Math.min(100, run.progress))}%`,
                          } as React.CSSProperties
                        }
                      />
                      {run.progress}%
                    </span>
                  )}
                  <div>
                    <strong>{run.name}</strong>
                    <small>{run.detail}</small>
                  </div>
                  <LumenStatus value={run.status} tone={run.tone} />
                </article>
              ))}
            </section>
          )
        })}
        {visibleStates.length ? null : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
    </Root>
  )
}

function Slo(props: Omit<LumenMonitoringProps, 'content'> & { content: LumenMonitoringSloContent }) {
  const windows = uniqueLumenMonitoringItems(props.content.windows)
  const objectives = uniqueLumenMonitoringItems(props.content.objectives)
  const [windowId, setWindowId] = React.useState(props.content.initialWindowId)
  const window = selectLumenMonitoringItem(windows, windowId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-monitoring-tabs" role="tablist" aria-label={props.content.labels.windows}>
        {windows.map((item) => (
          <LumenButton
            key={item.id}
            role="tab"
            variant="text"
            aria-selected={window?.id === item.id}
            onClick={() => setWindowId(item.id)}
          >
            {item.label}
          </LumenButton>
        ))}
      </div>
      {props.content.series && props.content.labels.chart ? (
        <LumenChart
          kind="area"
          label={props.content.labels.chart}
          series={[
            {
              id: 'budget',
              label: props.content.labels.chart,
              points: chartPoints(props.content.series),
              tone: 'warning',
            },
          ]}
          empty={props.content.labels.empty}
        />
      ) : null}
      <div className="lumen-monitoring-slo" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {objectives.length ? (
          objectives.map((objective) => (
            <article key={objective.id}>
              <div>
                <Glyph name="shield" />
                <strong>{objective.title}</strong>
                <small>
                  <span>{window?.label}</span> · {objective.target}
                </small>
              </div>
              <Progress
                value={objective.budget}
                label={props.content.labels.progress(objective.title)}
                tone={objective.tone}
              />
              <span>{objective.budgetLabel}</span>
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

function empty(props: LumenMonitoringProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenMonitoring(props: LumenMonitoringProps) {
  const inheritedContent = useLumenMonitoringContent()
  const content = props.content ?? inheritedContent
  if (content?.reference) {
    return (
      <Root {...props}>
        <LumenMonitoringReference content={content.reference} />
      </Root>
    )
  }
  if (props.variant === 1) {
    return content?.health ? <Health {...props} content={content.health} /> : empty(props)
  }
  if (props.variant === 2) {
    return content?.live ? <Live {...props} content={content.live} /> : empty(props)
  }
  if (props.variant === 3) {
    return content?.incident ? <Incident {...props} content={content.incident} /> : empty(props)
  }
  if (props.variant === 4) {
    return content?.alerts ? <Alerts {...props} content={content.alerts} /> : empty(props)
  }
  if (props.variant === 5) {
    return content?.logs ? <Logs {...props} content={content.logs} /> : empty(props)
  }
  if (props.variant === 6) {
    return content?.uptime ? <Uptime {...props} content={content.uptime} /> : empty(props)
  }
  if (props.variant === 7) {
    return content?.fleet ? <Fleet {...props} content={content.fleet} /> : empty(props)
  }
  if (props.variant === 8) {
    return content?.response ? <Response {...props} content={content.response} /> : empty(props)
  }
  if (props.variant === 9) {
    return content?.queue ? <Queue {...props} content={content.queue} /> : empty(props)
  }
  if (props.variant === 10) {
    return content?.slo ? <Slo {...props} content={content.slo} /> : empty(props)
  }
  return empty(props)
}

function variant(value: number, props: LumenMonitoringVariantProps) {
  return <LumenMonitoring {...props} variant={value} variantId={`hbar-app-ui-monitoring-${value}`} />
}

export const LumenMonitoring01 = (props: LumenMonitoringVariantProps) => variant(1, props),
  LumenMonitoring02 = (props: LumenMonitoringVariantProps) => variant(2, props),
  LumenMonitoring03 = (props: LumenMonitoringVariantProps) => variant(3, props),
  LumenMonitoring04 = (props: LumenMonitoringVariantProps) => variant(4, props),
  LumenMonitoring05 = (props: LumenMonitoringVariantProps) => variant(5, props),
  LumenMonitoring06 = (props: LumenMonitoringVariantProps) => variant(6, props),
  LumenMonitoring07 = (props: LumenMonitoringVariantProps) => variant(7, props),
  LumenMonitoring08 = (props: LumenMonitoringVariantProps) => variant(8, props),
  LumenMonitoring09 = (props: LumenMonitoringVariantProps) => variant(9, props),
  LumenMonitoring10 = (props: LumenMonitoringVariantProps) => variant(10, props)

function chartPoints(points: readonly LumenMonitoringSeriesPoint[]): readonly LumenChartPoint[] {
  return uniqueLumenMonitoringItems(points).map((point) => ({
    id: point.id,
    label: point.label,
    value: point.value,
  }))
}
