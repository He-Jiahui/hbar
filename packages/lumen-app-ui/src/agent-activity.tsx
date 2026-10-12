'use client'

import * as React from 'react'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'
import './agent-activity.css'
import { type LumenAgentActivityViewModel } from './agent-activity/view-model'
import './agent-activity/controlled-flow.css'

export type LumenAgentActivityListStrategy =
  | { readonly kind: 'content-grown'; readonly expectedMaximum: number }
  | { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }

export type LumenAgentActivityState = 'complete' | 'running' | 'queued' | 'failed' | 'cancelled' | 'needs-approval'

export interface LumenAgentActivityLiveStep {
  readonly id: string
  readonly label: string
  readonly duration: string
  readonly state: LumenAgentActivityState
}

export interface LumenAgentActivityLiveContent {
  readonly labels: {
    readonly title: string
    readonly status: string
    readonly elapsed: string
    readonly separator: string
    readonly stop: string
    readonly stopped: string
  }
  readonly steps: readonly LumenAgentActivityLiveStep[]
  readonly activeStepId?: string | undefined
  readonly listStrategy: LumenAgentActivityListStrategy
}

export interface LumenAgentActivityNestedChild {
  readonly id: string
  readonly label: string
  readonly duration: string
  readonly progress: number
}

export interface LumenAgentActivityNestedGroup {
  readonly id: string
  readonly label: string
  readonly duration: string
  readonly children: readonly LumenAgentActivityNestedChild[]
  readonly openByDefault: boolean
}

export interface LumenAgentActivityNestedContent {
  readonly labels: {
    readonly title: string
    readonly status: string
    readonly elapsed: string
    readonly separator: string
    readonly expand: string
    readonly collapse: string
    readonly expandGroup: string
    readonly collapseGroup: string
  }
  readonly groups: readonly LumenAgentActivityNestedGroup[]
  readonly listStrategy: LumenAgentActivityListStrategy
}

export interface LumenAgentActivityDeploymentStep {
  readonly id: string
  readonly label: string
  readonly state: LumenAgentActivityState
  readonly stateLabel: string
}

export interface LumenAgentActivityDeploymentContent {
  readonly labels: {
    readonly title: string
    readonly status: string
    readonly currentStep: string
    readonly elapsed: string
    readonly stop: string
    readonly stopped: string
    readonly runAgain: string
  }
  readonly steps: readonly LumenAgentActivityDeploymentStep[]
  readonly activeStepId?: string | undefined
  readonly progress: number
  readonly progressLabel: string
  readonly listStrategy: LumenAgentActivityListStrategy
}

export interface LumenAgentActivityHistoryRow {
  readonly id: string
  readonly name: string
  readonly state: LumenAgentActivityState
  readonly stateLabel: string
  readonly duration: string
  readonly cost: string
  readonly started: string
}

export interface LumenAgentActivityHistoryContent {
  readonly labels: {
    readonly title: string
    readonly count: string
    readonly description: string
    readonly run: string
    readonly status: string
    readonly duration: string
    readonly cost: string
    readonly started: string
    readonly actions: string
    readonly rerun: string
    readonly empty?: string | undefined
  }
  readonly rows: readonly LumenAgentActivityHistoryRow[]
  readonly listStrategy: LumenAgentActivityListStrategy
}

export type LumenAgentActivityLogLevel = 'info' | 'warning' | 'error'

export interface LumenAgentActivityLogFilter {
  readonly id: string
  readonly label: string
  readonly compactLabel: string
  readonly level?: LumenAgentActivityLogLevel | undefined
}

export interface LumenAgentActivityLogEntry {
  readonly id: string
  readonly time: string
  readonly level: LumenAgentActivityLogLevel
  readonly message: string
}

export interface LumenAgentActivityLogContent {
  readonly labels: {
    readonly title: string
    readonly lineCount: string
    readonly filters: string
    readonly stop: string
    readonly jumpToLatest: string
    readonly lineCountTemplate: string
  }
  readonly filters: readonly LumenAgentActivityLogFilter[]
  readonly activeFilterId: string
  readonly entries: readonly LumenAgentActivityLogEntry[]
  readonly listStrategy: LumenAgentActivityListStrategy
}

export interface LumenAgentActivityWorker {
  readonly id: string
  readonly name: string
  readonly rate: string
  readonly task: string
  readonly state: LumenAgentActivityState
  readonly stateLabel: string
  readonly progress: number
  readonly progressLabel: string
}

export interface LumenAgentActivityWorkersContent {
  readonly labels: {
    readonly title: string
    readonly activeSummary: string
    readonly queuedSummary: string
  }
  readonly workers: readonly LumenAgentActivityWorker[]
  readonly listStrategy: LumenAgentActivityListStrategy
}

export interface LumenAgentActivityInput {
  readonly id: string
  readonly label: string
  readonly value: string
}

export interface LumenAgentActivityAttempt {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly duration: string
}

export interface LumenAgentActivityOutput {
  readonly id: string
  readonly name: string
  readonly detail: string
  readonly downloadLabel: string
}

export interface LumenAgentActivityFailureContent {
  readonly labels: {
    readonly title: string
    readonly status: string
    readonly duration: string
    readonly separator: string
    readonly viewLog: string
    readonly errorTitle: string
    readonly inputs: string
    readonly attempts: string
    readonly output: string
    readonly retry: string
    readonly cancelRetry: string
    readonly download: string
  }
  readonly summaryTitle: string
  readonly summaryDescription: string
  readonly retryQueuedTitle: string
  readonly retryQueuedDescription: string
  readonly attemptsNote: string
  readonly inputs: readonly LumenAgentActivityInput[]
  readonly attempts: readonly LumenAgentActivityAttempt[]
  readonly outputs: readonly LumenAgentActivityOutput[]
  readonly listStrategy: LumenAgentActivityListStrategy
}

export interface LumenAgentActivityContent {
  readonly viewModel?: LumenAgentActivityViewModel | undefined
  readonly live?: LumenAgentActivityLiveContent | undefined
  readonly nested?: LumenAgentActivityNestedContent | undefined
  readonly deployment?: LumenAgentActivityDeploymentContent | undefined
  readonly history?: LumenAgentActivityHistoryContent | undefined
  readonly log?: LumenAgentActivityLogContent | undefined
  readonly workers?: LumenAgentActivityWorkersContent | undefined
  readonly failure?: LumenAgentActivityFailureContent | undefined
}

export interface LumenAgentActivityProviderProps {
  readonly content: LumenAgentActivityContent
  readonly children: React.ReactNode
}

export interface LumenAgentActivityAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenAgentActivityProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenAgentActivityContent | undefined
  readonly viewModel?: LumenAgentActivityViewModel | undefined
  readonly onAction?: ((event: LumenAgentActivityAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly controlled?: { readonly body: React.ReactNode } | undefined
}

export type LumenAgentActivityVariantProps = Omit<LumenAgentActivityProps, 'variant' | 'variantId'>

const AgentActivityContentContext = React.createContext<LumenAgentActivityContent | undefined>(undefined)

const AgentActivityViewModelContext = React.createContext<LumenAgentActivityViewModel | undefined>(undefined)

export function LumenAgentActivityProvider({ content, children }: LumenAgentActivityProviderProps) {
  return <AgentActivityContentContext.Provider value={content}>{children}</AgentActivityContentContext.Provider>
}

export function useLumenAgentActivityContent(): LumenAgentActivityContent | undefined {
  return React.useContext(AgentActivityContentContext)
}

export function uniqueLumenAgentActivityItems<Item extends { readonly id: string }>(
  items: readonly Item[],
): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenAgentActivityItem<Item extends { readonly id: string }>(
  items: readonly Item[],
  selectedId: string | undefined,
): Item | undefined {
  return items.find((item) => item.id === selectedId) ?? items[0]
}

function toneForState(state: LumenAgentActivityState): 'neutral' | 'success' | 'warning' | 'danger' {
  if (state === 'complete') {
    return 'success'
  }
  if (state === 'failed') {
    return 'danger'
  }
  if (state === 'running' || state === 'needs-approval') {
    return 'warning'
  }
  return 'neutral'
}

function logLevelState(level: LumenAgentActivityLogLevel): LumenAgentActivityState {
  if (level === 'error') {
    return 'failed'
  }
  if (level === 'warning') {
    return 'needs-approval'
  }
  return 'complete'
}

function ActivityGlyph({ name }: { readonly name: 'close' | 'download' | 'down' | 'retry' | 'stop' }) {
  return (
    <svg className="lumen-agent-activity-glyph" viewBox="0 0 16 16" aria-hidden="true">
      {name === 'stop' ? <path d="M4.5 4.5h7v7h-7z" /> : null}
      {name === 'close' ? <path d="M4 4l8 8m0-8-8 8" /> : null}
      {name === 'retry' ? <path d="M3.5 5.5h3.5m-3.5 0V2M3.5 5.5a5 5 0 1 1-.5 3.5" /> : null}
      {name === 'download' ? <path d="M8 2.5v8m-3-3 3 3 3-3M3 13.5h10" /> : null}
      {name === 'down' ? <path d="M8 2.5v10m-3-3 3 3 3-3" /> : null}
    </svg>
  )
}

function ActivityStateMark({ state }: { readonly state: LumenAgentActivityState }) {
  return <i className={`lumen-agent-activity-state-mark is-${state}`} aria-hidden="true" />
}

function ActivityProgress({
  value,
  label,
  decorative = false,
}: {
  readonly value: number
  readonly label: string
  readonly decorative?: boolean | undefined
}) {
  const bounded = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <div
      className="lumen-agent-activity-progress"
      role={decorative ? undefined : 'progressbar'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : label}
      aria-valuemin={decorative ? undefined : 0}
      aria-valuemax={decorative ? undefined : 100}
      aria-valuenow={decorative ? undefined : bounded}
    >
      <span style={{ inlineSize: `${bounded}%` }} />
    </div>
  )
}

function ActivityStatus({ state, label }: { readonly state: LumenAgentActivityState; readonly label: string }) {
  return (
    <LumenStatus
      className={`hbar-app-ui-agent-activity-status is-${state}`}
      data-state={state}
      value={label}
      tone={toneForState(state)}
    />
  )
}

function ActivityFrame({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  children,
}: Omit<LumenAgentActivityProps, 'content' | 'onAction'> & {
  readonly children: React.ReactNode
}) {
  const viewModel = React.useContext(AgentActivityViewModelContext)
  const contentClassName = [
    'lumen-agent-activity',
    'hbar-app-ui-agent-activity-surface',
    `hbar-app-ui-agent-activity-variant-${variant}`,
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
      as={variant === 1 || variant === 2 || variant === 3 ? 'div' : 'section'}
      boundary={variant <= 7 ? 'none' : 'horizontal'}
      className={`lumen-agent-activity-root-surface${viewModel ? ' lumen-agent-activity-controlled' : ''}`}
      contentClassName={contentClassName}
      data-lumen-component="agent-activity"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-surface={surface}
      data-hbar-app-ui-state={state}
    >
      {children}
      {viewModel?.notice ? (
        <p className="lumen-agent-activity-notice" role="status">
          {viewModel.notice}
        </p>
      ) : null}
    </LumenSurface>
  )
}

function ActivityPane({
  strategy,
  className,
  children,
}: {
  readonly strategy: LumenAgentActivityListStrategy
  readonly className?: string | undefined
  readonly children: React.ReactNode
}) {
  return (
    <div
      className={['lumen-agent-activity-pane', 'hbar-app-ui-agent-activity-pane', className].filter(Boolean).join(' ')}
      data-hbar-app-ui-expected-maximum={strategy.expectedMaximum}
      data-hbar-app-ui-list-strategy={strategy.kind}
    >
      {children}
    </div>
  )
}

function reportAction(onAction: LumenAgentActivityProps['onAction'], actionId: string, value?: string) {
  onAction?.(value === undefined ? { actionId } : { actionId, value })
}

function LiveActivity(props: Omit<LumenAgentActivityProps, 'content'> & { content: LumenAgentActivityLiveContent }) {
  const { content } = props
  const viewModel = React.useContext(AgentActivityViewModelContext)
  const onAction = viewModel?.onAction ?? props.onAction
  const steps = uniqueLumenAgentActivityItems(content.steps)
  const activeStep = selectLumenAgentActivityItem(steps, content.activeStepId)
  const [localStopped, setStopped] = React.useState(false)
  const stopped = viewModel ? viewModel.liveStopped : localStopped

  return (
    <ActivityFrame {...props} className="hbar-app-ui-agent-activity-live">
      <header className="lumen-agent-activity-heading hbar-app-ui-agent-activity-live-heading">
        <div>
          <LumenText as="h2" variant="heading">
            {content.labels.title}
          </LumenText>
          <div className="hbar-app-ui-agent-activity-live-status">
            <ActivityStateMark state={stopped ? 'cancelled' : 'running'} />
            <span>{stopped ? content.labels.stopped : content.labels.status}</span>
            <span aria-hidden="true">{content.labels.separator}</span>
            <span>{content.labels.elapsed}</span>
          </div>
        </div>
        <LumenButton
          variant="outlined"
          size="s"
          disabled={stopped || Boolean(viewModel && !onAction)}
          onClick={() => {
            if (!viewModel) {
              setStopped(true)
            }
            reportAction(onAction, 'stop-live')
          }}
        >
          <ActivityGlyph name="stop" />
          {content.labels.stop}
        </LumenButton>
      </header>
      <ActivityPane strategy={content.listStrategy}>
        <ol className="lumen-agent-activity-list hbar-app-ui-agent-activity-live-list">
          {steps.map((step) => (
            <li className={step.id === activeStep?.id && !stopped ? 'is-active' : ''} key={step.id}>
              <ActivityStateMark state={step.state} />
              <div className="lumen-agent-activity-row hbar-app-ui-agent-activity-live-row">
                <span>{step.label}</span>
                <span className="hbar-app-ui-agent-activity-duration">
                  {stopped && step.id === activeStep?.id ? content.labels.stopped : step.duration}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </ActivityPane>
    </ActivityFrame>
  )
}

function NestedActivity(
  props: Omit<LumenAgentActivityProps, 'content'> & { content: LumenAgentActivityNestedContent },
) {
  const { content } = props
  const viewModel = React.useContext(AgentActivityViewModelContext)
  const onAction = viewModel?.onAction ?? props.onAction
  const groups = React.useMemo(() => uniqueLumenAgentActivityItems(content.groups), [content.groups])
  const defaultOpenIds = React.useMemo(
    () => groups.filter((group) => group.openByDefault).map((group) => group.id),
    [groups],
  )
  const [localOpenIds, setOpenIds] = React.useState<readonly string[]>(defaultOpenIds)
  const openIds = viewModel?.openGroupIds ?? localOpenIds
  return (
    <ActivityFrame {...props} className="hbar-app-ui-agent-activity-nested">
      <header className="lumen-agent-activity-heading hbar-app-ui-agent-activity-nested-heading">
        <LumenText as="h2" variant="heading">
          {content.labels.title}
        </LumenText>
        <div className="hbar-app-ui-agent-activity-nested-status">
          <ActivityStateMark state="complete" />
          <span>{content.labels.status}</span>
          <span className="hbar-app-ui-agent-activity-nested-elapsed">{content.labels.elapsed}</span>
        </div>
      </header>
      <div className="hbar-app-ui-agent-activity-nested-panel">
        <ActivityPane strategy={content.listStrategy}>
          <ol className="lumen-agent-activity-nested-list hbar-app-ui-agent-activity-nested-list">
            {groups.map((group) => {
              const open = openIds.includes(group.id)
              const children = uniqueLumenAgentActivityItems(group.children)
              return (
                <li key={group.id}>
                  <div className="lumen-agent-activity-group">
                    <LumenButton
                      variant="text"
                      type="button"
                      className="hbar-app-ui-agent-activity-group-row"
                      aria-expanded={open}
                      disabled={Boolean(viewModel && !onAction)}
                      onClick={() => {
                        if (!viewModel) {
                          setOpenIds((current) =>
                            current.includes(group.id)
                              ? current.filter((id) => id !== group.id)
                              : [...current, group.id],
                          )
                        }
                        reportAction(onAction, 'toggle-nested-group', group.id)
                      }}
                    >
                      <span className="hbar-app-ui-agent-activity-group-label">{group.label}</span>
                      <span className="hbar-app-ui-agent-activity-duration">{group.duration}</span>
                      <span aria-hidden="true" className="hbar-app-ui-agent-activity-chevron" />
                    </LumenButton>
                    {open ? (
                      <ol className="hbar-app-ui-agent-activity-child-list">
                        {children.map((child) => (
                          <li key={child.id}>
                            <span>{child.label}</span>
                            <ActivityProgress decorative label={child.label} value={child.progress} />
                            <span className="hbar-app-ui-agent-activity-duration">{child.duration}</span>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        </ActivityPane>
      </div>
    </ActivityFrame>
  )
}

function DeploymentActivity(
  props: Omit<LumenAgentActivityProps, 'content'> & {
    content: LumenAgentActivityDeploymentContent
  },
) {
  const { content } = props
  const viewModel = React.useContext(AgentActivityViewModelContext)
  const onAction = viewModel?.onAction ?? props.onAction
  const steps = uniqueLumenAgentActivityItems(content.steps)
  const activeStep = selectLumenAgentActivityItem(steps, content.activeStepId)
  const [localStopped, setStopped] = React.useState(false)
  const stopped = viewModel ? viewModel.deploymentStopped : localStopped

  return (
    <ActivityFrame {...props} className="hbar-app-ui-agent-activity-deployment">
      <header className="lumen-agent-activity-heading hbar-app-ui-agent-activity-deployment-heading">
        <LumenText as="h2" variant="heading">
          {content.labels.title}
        </LumenText>
        <div className="hbar-app-ui-agent-activity-deployment-summary">
          <ActivityStateMark state={stopped ? 'cancelled' : 'running'} />
          <span>{stopped ? content.labels.stopped : content.labels.status}</span>
          <span className="hbar-app-ui-agent-activity-deployment-step-count">{content.labels.currentStep}</span>
        </div>
      </header>
      <div className="hbar-app-ui-agent-activity-deployment-run">
        <ActivityPane strategy={content.listStrategy} className="hbar-app-ui-agent-activity-deployment-pane">
          <ol className="lumen-agent-activity-list hbar-app-ui-agent-activity-deployment-list">
            {steps.map((step) => (
              <li className={step.id === activeStep?.id && !stopped ? 'is-active' : ''} key={step.id}>
                <ActivityStateMark state={step.state} />
                <span className="hbar-app-ui-agent-activity-deployment-label">{step.label}</span>
                <span className="hbar-app-ui-agent-activity-deployment-state">
                  {stopped && step.id === activeStep?.id ? content.labels.stopped : step.stateLabel}
                </span>
              </li>
            ))}
          </ol>
        </ActivityPane>
        <div className="lumen-agent-activity-deployment-footer hbar-app-ui-agent-activity-deployment-footer">
          <ActivityProgress label={content.progressLabel} value={content.progress} decorative />
          <div className="hbar-app-ui-agent-activity-deployment-footer-row">
            <span>{content.labels.elapsed}</span>
            <LumenButton
              variant="outlined"
              size="s"
              aria-label={stopped ? content.labels.runAgain : content.labels.stop}
              disabled={Boolean(viewModel && !onAction)}
              onClick={() => {
                if (!viewModel) {
                  setStopped(!stopped)
                }
                reportAction(onAction, stopped ? 'run-again' : 'stop')
              }}
            >
              <ActivityGlyph name={stopped ? 'retry' : 'stop'} />
              {stopped ? content.labels.runAgain : content.labels.stop}
            </LumenButton>
          </div>
        </div>
      </div>
    </ActivityFrame>
  )
}

function HistoryActivity(
  props: Omit<LumenAgentActivityProps, 'content'> & { content: LumenAgentActivityHistoryContent },
) {
  const { content } = props
  const viewModel = React.useContext(AgentActivityViewModelContext)
  const onAction = viewModel?.onAction ?? props.onAction
  const rows = React.useMemo(() => uniqueLumenAgentActivityItems(content.rows), [content.rows])
  const [selectedId, setSelectedId] = React.useState<string | undefined>(rows[0]?.id)
  const effectiveSelectedId = rows.some((row) => row.id === selectedId) ? selectedId : rows[0]?.id
  const rerun = (id: string) => {
    setSelectedId(id)
    reportAction(onAction, 'rerun-history', id)
  }

  return (
    <ActivityFrame {...props} className="hbar-app-ui-agent-activity-history">
      <div className="hbar-app-ui-agent-activity-history-heading">
        <LumenText as="h2" variant="heading">
          {content.labels.title}
        </LumenText>
        <span>{content.labels.count}</span>
      </div>
      <div className="hbar-app-ui-agent-activity-history-run">
        <ActivityPane strategy={content.listStrategy} className="hbar-app-ui-agent-activity-history-pane">
          <ul className="hbar-app-ui-agent-activity-history-cards">
            {rows.map((row) => (
              <li key={row.id}>
                <div className="hbar-app-ui-agent-activity-history-card-top">
                  <LumenButton
                    variant="text"
                    aria-current={row.id === effectiveSelectedId ? 'true' : undefined}
                    onClick={() => setSelectedId(row.id)}
                  >
                    {row.name}
                  </LumenButton>
                  <LumenIconButton
                    size="s"
                    label={`${content.labels.rerun} ${row.name}`}
                    disabled={Boolean(viewModel && !onAction)}
                    onClick={() => rerun(row.id)}
                  >
                    <ActivityGlyph name="retry" />
                  </LumenIconButton>
                </div>
                <dl>
                  <div>
                    <dt>{content.labels.status}</dt>
                    <dd>
                      <ActivityStatus state={row.state} label={row.stateLabel} />
                    </dd>
                  </div>
                  <div>
                    <dt>{content.labels.duration}</dt>
                    <dd>{row.duration}</dd>
                  </div>
                  <div>
                    <dt>{content.labels.cost}</dt>
                    <dd>{row.cost}</dd>
                  </div>
                  <div>
                    <dt>{content.labels.started}</dt>
                    <dd>{row.started}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <table className="hbar-app-ui-agent-activity-history-table">
            <caption>{content.labels.description}</caption>
            <thead>
              <tr>
                <th scope="col">{content.labels.run}</th>
                <th scope="col">{content.labels.status}</th>
                <th scope="col">{content.labels.duration}</th>
                <th scope="col">{content.labels.cost}</th>
                <th scope="col">{content.labels.started}</th>
                <th scope="col" className="hbar-app-ui-agent-activity-history-action-label">
                  {content.labels.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} aria-selected={row.id === effectiveSelectedId}>
                  <td>
                    <LumenButton
                      variant="text"
                      aria-current={row.id === effectiveSelectedId ? 'true' : undefined}
                      onClick={() => setSelectedId(row.id)}
                    >
                      {row.name}
                    </LumenButton>
                  </td>
                  <td>
                    <ActivityStatus state={row.state} label={row.stateLabel} />
                  </td>
                  <td>{row.duration}</td>
                  <td>{row.cost}</td>
                  <td>{row.started}</td>
                  <td className="hbar-app-ui-agent-activity-history-action-cell">
                    <LumenIconButton
                      size="s"
                      label={`${content.labels.rerun} ${row.name}`}
                      disabled={Boolean(viewModel && !onAction)}
                      onClick={() => rerun(row.id)}
                    >
                      <ActivityGlyph name="retry" />
                    </LumenIconButton>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>{content.labels.empty}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </ActivityPane>
      </div>
    </ActivityFrame>
  )
}

function LogActivity(props: Omit<LumenAgentActivityProps, 'content'> & { content: LumenAgentActivityLogContent }) {
  const { content } = props
  const viewModel = React.useContext(AgentActivityViewModelContext)
  const onAction = viewModel?.onAction ?? props.onAction
  const filters = uniqueLumenAgentActivityItems(content.filters)
  const entries = uniqueLumenAgentActivityItems(content.entries)
  const [localFilterId, setActiveFilterId] = React.useState(content.activeFilterId)
  const [localVisibleCount, setVisibleCount] = React.useState(Math.max(0, entries.length - 2))
  const [localRunning, setRunning] = React.useState(entries.length > 0)
  const activeFilterId = viewModel ? (viewModel.activeFilterId ?? undefined) : localFilterId
  const visibleCount = viewModel
    ? Math.max(
        0,
        Math.min(
          entries.length,
          Number.isFinite(viewModel.log.visibleCount) ? Math.floor(viewModel.log.visibleCount) : 0,
        ),
      )
    : localVisibleCount
  const running = viewModel ? viewModel.log.running : localRunning
  const [following, setFollowing] = React.useState(true)
  const [jumpVisible, setJumpVisible] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)
  const paneRef = React.useRef<HTMLDivElement>(null)
  const stopScrollAnchor = React.useRef<{
    element: HTMLElement
    top: number
    scrollTop: number
  } | null>(null)
  const programmaticScrollTarget = React.useRef<number | null>(null)
  const activeFilter = selectLumenAgentActivityItem(filters, activeFilterId)
  const visibleEntries = activeFilter?.level
    ? entries.slice(0, visibleCount).filter((entry) => entry.level === activeFilter.level)
    : entries.slice(0, visibleCount)
  const snapshotLineCount =
    visibleCount === entries.length
      ? content.labels.lineCount
      : content.labels.lineCountTemplate.replace('{count}', String(visibleCount))
  const lineCount = viewModel?.log.lineCount ?? snapshotLineCount

  React.useEffect(() => {
    if (viewModel || !running) {
      return undefined
    }
    const timer = setTimeout(() => {
      const next = Math.min(visibleCount + 1, entries.length)
      setVisibleCount(next)
      if (next >= entries.length) {
        setRunning(false)
      }
    }, 1200)
    return () => clearTimeout(timer)
  }, [entries.length, running, visibleCount, viewModel])

  React.useLayoutEffect(() => {
    if (following && paneRef.current) {
      programmaticScrollTarget.current = Math.max(0, paneRef.current.scrollHeight - paneRef.current.clientHeight)
      paneRef.current.scrollTop = paneRef.current.scrollHeight
      setScrolled(paneRef.current.scrollTop > 0)
    }
  }, [activeFilterId, following, visibleCount])

  React.useLayoutEffect(() => {
    const anchor = stopScrollAnchor.current
    if (!running && anchor && paneRef.current) {
      const shift = anchor.element.getBoundingClientRect().top - anchor.top
      const target = Math.max(0, anchor.scrollTop + shift)
      programmaticScrollTarget.current = target
      paneRef.current.scrollTop = target
      stopScrollAnchor.current = null
    }
  }, [running])

  const onScroll = () => {
    const pane = paneRef.current
    if (!pane) {
      return
    }
    setScrolled(pane.scrollTop > 0)
    if (programmaticScrollTarget.current !== null) {
      const programmatic = Math.abs(pane.scrollTop - programmaticScrollTarget.current) <= 1
      programmaticScrollTarget.current = null
      if (programmatic) {
        return
      }
    }
    const awayFromLatest = pane.scrollHeight - pane.clientHeight - pane.scrollTop > 16
    setFollowing(!awayFromLatest)
    setJumpVisible(awayFromLatest)
  }

  return (
    <ActivityFrame {...props} className="hbar-app-ui-agent-activity-log">
      <header className="lumen-agent-activity-heading hbar-app-ui-agent-activity-heading">
        <div className="hbar-app-ui-agent-activity-log-title">
          <ActivityStateMark state={running ? 'running' : 'queued'} />
          <LumenText as="h2" variant="heading">
            {content.labels.title}
          </LumenText>
        </div>
        <div
          aria-label={content.labels.filters}
          className="lumen-agent-activity-log-filters hbar-app-ui-agent-activity-log-filters"
          role="radiogroup"
        >
          {filters.map((filter) => (
            <LumenButton
              variant="text"
              aria-checked={filter.id === activeFilter?.id}
              aria-label={filter.label}
              className={filter.id === activeFilter?.id ? 'is-selected' : ''}
              key={filter.id}
              onClick={() => {
                if (!viewModel) {
                  setActiveFilterId(filter.id)
                }
                reportAction(onAction, 'filter-log', filter.id)
              }}
              role="radio"
              type="button"
              disabled={Boolean(viewModel && !onAction)}
            >
              <span className="is-compact">{filter.compactLabel}</span>
              <span className="is-full">{filter.label}</span>
            </LumenButton>
          ))}
        </div>
        {running ? (
          <LumenButton
            variant="outlined"
            size="s"
            aria-label={content.labels.stop}
            disabled={Boolean(viewModel && !onAction)}
            onClick={() => {
              const pane = paneRef.current
              if (pane) {
                const paneTop = pane.getBoundingClientRect().top
                const anchor = Array.from(pane.querySelectorAll<HTMLElement>('li')).find(
                  (entry) => entry.getBoundingClientRect().bottom > paneTop,
                )
                if (anchor) {
                  stopScrollAnchor.current = {
                    element: anchor,
                    top: anchor.getBoundingClientRect().top,
                    scrollTop: pane.scrollTop,
                  }
                }
              }
              if (!viewModel) {
                setRunning(false)
              }
              setJumpVisible(false)
              reportAction(onAction, 'stop')
            }}
          >
            <ActivityGlyph name="stop" />
            {content.labels.stop}
          </LumenButton>
        ) : (
          <span className="hbar-app-ui-agent-activity-log-count">{lineCount}</span>
        )}
      </header>
      <div
        className="hbar-app-ui-agent-activity-log-frame"
        data-hbar-app-ui-log-phase={running ? 'running' : 'complete'}
      >
        <ActivityPane strategy={content.listStrategy} className="hbar-app-ui-agent-activity-log-pane">
          <div
            className={`hbar-app-ui-agent-activity-log-scroll${scrolled ? ' is-scrolled' : ''}`}
            ref={paneRef}
            onScroll={onScroll}
          >
            <ol
              className="lumen-agent-activity-log-list hbar-app-ui-agent-activity-log-list"
              role="log"
              aria-label={content.labels.title}
              aria-live="polite"
            >
              {visibleEntries.map((entry) => (
                <li className={`is-${entry.level}`} key={entry.id}>
                  <span className="hbar-app-ui-agent-activity-log-time">{entry.time}</span>
                  <ActivityStateMark state={logLevelState(entry.level)} />
                  <span>{entry.message}</span>
                </li>
              ))}
            </ol>
          </div>
          {jumpVisible && !running ? (
            <LumenButton
              variant="text"
              className="hbar-app-ui-agent-activity-log-jump"
              type="button"
              onClick={() => {
                paneRef.current?.scrollTo({
                  top: paneRef.current.scrollHeight,
                  behavior: 'smooth',
                })
                setFollowing(true)
                setJumpVisible(false)
                reportAction(onAction, 'jump-to-latest')
              }}
            >
              <ActivityGlyph name="down" />
              {content.labels.jumpToLatest}
            </LumenButton>
          ) : null}
        </ActivityPane>
      </div>
    </ActivityFrame>
  )
}

function WorkersActivity(
  props: Omit<LumenAgentActivityProps, 'content'> & { content: LumenAgentActivityWorkersContent },
) {
  const { content } = props
  const workers = uniqueLumenAgentActivityItems(content.workers)
  return (
    <ActivityFrame {...props} className="hbar-app-ui-agent-activity-workers">
      <header className="lumen-agent-activity-heading hbar-app-ui-agent-activity-heading" role="banner">
        <LumenText as="h2" variant="heading">
          {content.labels.title}
        </LumenText>
        <div className="lumen-agent-activity-worker-summary hbar-app-ui-agent-activity-worker-summary">
          <span>{content.labels.activeSummary}</span>
          <span>{content.labels.queuedSummary}</span>
        </div>
      </header>
      <ActivityPane strategy={content.listStrategy}>
        <ul className="lumen-agent-activity-worker-list hbar-app-ui-agent-activity-worker-list">
          {workers.map((worker) => (
            <li className={worker.progress > 0 ? 'has-progress' : 'without-progress'} key={worker.id}>
              <ActivityStateMark state={worker.state} />
              <div className="hbar-app-ui-agent-activity-worker-body">
                <div className="hbar-app-ui-agent-activity-worker-heading">
                  <span>{worker.name}</span>
                  <span>{worker.rate}</span>
                </div>
                <div className="hbar-app-ui-agent-activity-worker-detail">
                  <span>{worker.task}</span>
                  <span>{worker.stateLabel}</span>
                </div>
                {worker.progress > 0 ? (
                  <ActivityProgress label={worker.progressLabel} value={worker.progress} decorative />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </ActivityPane>
    </ActivityFrame>
  )
}

function FailureActivity(
  props: Omit<LumenAgentActivityProps, 'content'> & { content: LumenAgentActivityFailureContent },
) {
  const { content } = props
  const viewModel = React.useContext(AgentActivityViewModelContext)
  const onAction = viewModel?.onAction ?? props.onAction
  const inputs = uniqueLumenAgentActivityItems(content.inputs)
  const attempts = uniqueLumenAgentActivityItems(content.attempts)
  const outputs = uniqueLumenAgentActivityItems(content.outputs)
  const [localRetryQueued, setRetryQueued] = React.useState(false)
  const retryQueued = viewModel ? viewModel.retryQueued : localRetryQueued
  const toggleRetry = () => {
    if (!viewModel) {
      setRetryQueued(!retryQueued)
    }
    reportAction(onAction, retryQueued ? 'cancel-failure-retry' : 'retry-failure')
  }
  return (
    <ActivityFrame {...props} className="hbar-app-ui-agent-activity-failure">
      <header className="lumen-agent-activity-heading hbar-app-ui-agent-activity-heading" role="banner">
        <div>
          <LumenText as="h2" variant="heading">
            {content.labels.title}
          </LumenText>
          <div className="hbar-app-ui-agent-activity-failure-status">
            <ActivityStateMark state="failed" />
            <span>{content.labels.status}</span>
            <span aria-hidden="true">{content.labels.separator}</span>
            <span>{content.labels.duration}</span>
          </div>
        </div>
        <LumenButton
          variant="outlined"
          size="s"
          onClick={() => reportAction(onAction, 'view-failure-log')}
          disabled={Boolean(viewModel && !onAction)}
        >
          {content.labels.viewLog}
        </LumenButton>
      </header>
      <ActivityPane strategy={content.listStrategy} className="hbar-app-ui-agent-activity-failure-body">
        <div
          className={`hbar-app-ui-agent-activity-failure-summary-frame${retryQueued ? ' is-retry-queued' : ''}`}
          role="alert"
        >
          <section className="lumen-agent-activity-error-card hbar-app-ui-agent-activity-error-card">
            <div className="hbar-app-ui-agent-activity-error-title">
              <ActivityStateMark state={retryQueued ? 'queued' : 'failed'} />
              <span>{retryQueued ? content.retryQueuedTitle : content.summaryTitle}</span>
            </div>
            <p>{retryQueued ? content.retryQueuedDescription : content.summaryDescription}</p>
          </section>
          <div className="lumen-agent-activity-action-row hbar-app-ui-agent-activity-action-row">
            <LumenButton onClick={toggleRetry} disabled={Boolean(viewModel && !onAction)}>
              <ActivityGlyph name={retryQueued ? 'close' : 'retry'} />
              {retryQueued ? content.labels.cancelRetry : content.labels.retry}
            </LumenButton>
          </div>
        </div>
        <section>
          <LumenText as="h3" variant="heading">
            {content.labels.inputs}
          </LumenText>
          <dl className="hbar-app-ui-agent-activity-definition-list">
            {inputs.map((input) => (
              <div key={input.id}>
                <LumenText as="dt" tone="muted">
                  {input.label}
                </LumenText>
                <LumenText as="dd">{input.value}</LumenText>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <LumenText as="h3" variant="heading">
            {content.labels.attempts}
          </LumenText>
          <div className="lumen-agent-activity-attempt-list hbar-app-ui-agent-activity-attempt-list">
            {attempts.map((attempt) => (
              <div key={attempt.id}>
                <span>{attempt.label}</span>
                <span>{attempt.description}</span>
                <span>{attempt.duration}</span>
              </div>
            ))}
          </div>
          <p className="hbar-app-ui-agent-activity-attempt-note">{content.attemptsNote}</p>
        </section>
        <section>
          <LumenText as="h3" variant="heading">
            {content.labels.output}
          </LumenText>
          <ul className="lumen-agent-activity-output-list hbar-app-ui-agent-activity-output-list">
            {outputs.map((output) => (
              <li key={output.id}>
                <div>
                  <p>{output.name}</p>
                  <p>{output.detail}</p>
                </div>
                <LumenButton
                  variant="outlined"
                  size="s"
                  aria-label={`${content.labels.download} ${output.name}`}
                  disabled={Boolean(viewModel && !onAction)}
                  onClick={() => reportAction(onAction, 'download-failure-output', output.id)}
                >
                  <ActivityGlyph name="download" />
                  {output.downloadLabel}
                </LumenButton>
              </li>
            ))}
          </ul>
        </section>
      </ActivityPane>
    </ActivityFrame>
  )
}

export function LumenAgentActivity(props: LumenAgentActivityProps) {
  const providerContent = useLumenAgentActivityContent()
  if (props.controlled) return <ActivityFrame {...props}>{props.controlled.body}</ActivityFrame>
  const content = props.content ?? providerContent
  const viewModel = props.viewModel ?? content?.viewModel
  return (
    <AgentActivityViewModelContext.Provider
      key={`${props.variant}:${viewModel?.ownerId ?? 'legacy'}`}
      value={viewModel}
    >
      <ActivityRouter {...props} content={content} />
    </AgentActivityViewModelContext.Provider>
  )
}

function ActivityRouter({ content, ...props }: LumenAgentActivityProps) {
  switch (props.variant) {
    case 1:
      return content?.live ? (
        <LiveActivity {...props} content={content.live} />
      ) : (
        <ActivityFrame {...props} className="hbar-app-ui-agent-activity-empty">
          {null}
        </ActivityFrame>
      )
    case 2:
      return content?.nested ? (
        <NestedActivity {...props} content={content.nested} />
      ) : (
        <ActivityFrame {...props} className="hbar-app-ui-agent-activity-empty">
          {null}
        </ActivityFrame>
      )
    case 3:
      return content?.deployment ? (
        <DeploymentActivity {...props} content={content.deployment} />
      ) : (
        <ActivityFrame {...props} className="hbar-app-ui-agent-activity-empty">
          {null}
        </ActivityFrame>
      )
    case 4:
      return content?.history ? (
        <HistoryActivity {...props} content={content.history} />
      ) : (
        <ActivityFrame {...props} className="hbar-app-ui-agent-activity-empty">
          {null}
        </ActivityFrame>
      )
    case 5:
      return content?.log ? (
        <LogActivity {...props} content={content.log} />
      ) : (
        <ActivityFrame {...props} className="hbar-app-ui-agent-activity-empty">
          {null}
        </ActivityFrame>
      )
    case 6:
      return content?.workers ? (
        <WorkersActivity {...props} content={content.workers} />
      ) : (
        <ActivityFrame {...props} className="hbar-app-ui-agent-activity-empty">
          {null}
        </ActivityFrame>
      )
    case 7:
      return content?.failure ? (
        <FailureActivity {...props} content={content.failure} />
      ) : (
        <ActivityFrame {...props} className="hbar-app-ui-agent-activity-empty">
          {null}
        </ActivityFrame>
      )
    default:
      return (
        <ActivityFrame {...props} className="hbar-app-ui-agent-activity-empty">
          {null}
        </ActivityFrame>
      )
  }
}

function createAgentActivityVariant(variant: number) {
  function Component(props: LumenAgentActivityVariantProps) {
    return <LumenAgentActivity {...props} variant={variant} variantId={`hbar-app-ui-agent-activity-${variant}`} />
  }
  Component.displayName = `LumenAgentActivity${String(variant).padStart(2, '0')}`
  return Component
}

export const LumenAgentActivity01 = createAgentActivityVariant(1)

export const LumenAgentActivity02 = createAgentActivityVariant(2)

export const LumenAgentActivity03 = createAgentActivityVariant(3)

export const LumenAgentActivity04 = createAgentActivityVariant(4)

export const LumenAgentActivity05 = createAgentActivityVariant(5)

export const LumenAgentActivity06 = createAgentActivityVariant(6)

export const LumenAgentActivity07 = createAgentActivityVariant(7)
