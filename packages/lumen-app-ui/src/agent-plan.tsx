'use client'

import * as React from 'react'
import { LumenPlanEditor } from './plan-editor'
import { LumenPlanReview, type LumenPlanReviewContent } from './plan-review'
import LumenSurface from './LumenSurface'
import { LumenButton } from './primitives'
import { LumenTextarea } from './forms'
import './agent-plan.css'
import './agent-plan-checklist.css'
import './agent-plan-tree.css'
import './agent-plan-actual.css'
import './agent-plan-board.css'
import './agent-plan-summary.css'
import './agent-plan-practical-flow.css'

export type LumenAgentPlanListStrategy =
  | { readonly kind: 'content-grown'; readonly expectedMaximum: number }
  | { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }

export type LumenAgentPlanState = 'queued' | 'running' | 'done' | 'skipped' | 'failed' | 'blocked' | 'waiting'

export interface LumenAgentPlanStep {
  readonly id: string
  readonly title: string
  readonly state: LumenAgentPlanState
  readonly stateLabel: string
  readonly detail?: string | undefined
  readonly target?: string | undefined
  readonly estimate?: string | undefined
  readonly duration?: string | undefined
  readonly dependency?: { readonly id: string; readonly label: string } | undefined
}

export interface LumenAgentPlanChecklistContent {
  readonly runId: string
  readonly paused: boolean
  readonly busy?: boolean | undefined
  readonly onPausedChange?: ((runId: string, paused: boolean) => void) | undefined
  readonly labels: {
    readonly title: string
    readonly progress: (done: number, total: number) => string
    readonly stop: string
    readonly resume: string
    readonly paused: string
    readonly target: string
    readonly estimate: string
    readonly empty: string
    readonly workingOn: (title: string) => string
    readonly pausedOn: (title: string) => string
  }
  readonly steps: readonly LumenAgentPlanStep[]
  readonly activeStepId?: string | undefined
  readonly listStrategy: LumenAgentPlanListStrategy
}

export type LumenAgentPlanEditableContent = Omit<LumenPlanReviewContent, 'steps'> & {
  readonly steps: readonly LumenAgentPlanStep[]
}

export interface LumenAgentPlanGroup {
  readonly id: string
  readonly title: string
  readonly done: number
  readonly total: number
  readonly progressLabel: string
  readonly items: readonly LumenAgentPlanStep[]
  readonly openByDefault: boolean
}

export interface LumenAgentPlanTreeContent {
  readonly runId: string
  readonly busy?: boolean | undefined
  readonly onRetry?: ((runId: string, groupId: string, stepId: string) => void) | undefined
  readonly labels: {
    readonly title: string
    readonly progress: (done: number, total: number) => string
    readonly expand: (title: string) => string
    readonly collapse: (title: string) => string
    readonly retry: string
    readonly running: string
    readonly empty: string
  }
  readonly groups: readonly LumenAgentPlanGroup[]
  readonly listStrategy: LumenAgentPlanListStrategy
}

export interface LumenAgentPlanActualRow {
  readonly id: string
  readonly title: string
  readonly durationProgress?: number | undefined
  readonly plannedProgress?: number | undefined
  readonly planned: string
  readonly actual: string
  readonly drift: string
  readonly tone?: 'neutral' | 'positive' | 'warning' | 'danger' | undefined
}

export interface LumenAgentPlanActualMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly tone?: 'neutral' | 'positive' | 'warning' | 'danger' | undefined
}

export interface LumenAgentPlanActualContent {
  readonly labels: {
    readonly title: string
    readonly remaining: string
    readonly description: string
    readonly step: string
    readonly duration: string
    readonly planned: string
    readonly actual: string
    readonly drift: string
    readonly empty: string
  }
  readonly metrics: readonly LumenAgentPlanActualMetric[]
  readonly rows: readonly LumenAgentPlanActualRow[]
  readonly listStrategy: LumenAgentPlanListStrategy
}

export interface LumenAgentPlanBoardSection {
  readonly id: string
  readonly title: string
  readonly done: number
  readonly total: number
  readonly progressLabel: string
  readonly items: readonly LumenAgentPlanStep[]
}

export interface LumenAgentPlanBoardContent {
  readonly labels: {
    readonly title: string
    readonly progress: (done: number, total: number) => string
    readonly separator: string
    readonly empty: string
  }
  readonly sections: readonly LumenAgentPlanBoardSection[]
  readonly listStrategy: LumenAgentPlanListStrategy
}

export interface LumenAgentPlanBreakdownRow {
  readonly id: string
  readonly title: string
  readonly countLabel: string
  readonly duration: string
}

export interface LumenAgentPlanSummaryMetric {
  readonly id: string
  readonly label: string
  readonly value: string
}

export interface LumenAgentPlanSummaryContent {
  readonly labels: {
    readonly title: string
    readonly stepCount: string
    readonly goal: string
    readonly tools: string
    readonly breakdown: string
    readonly review: string
    readonly edit: string
    readonly run: string
    readonly empty: string
  }
  readonly goal: string
  readonly metrics: readonly LumenAgentPlanSummaryMetric[]
  readonly tools: readonly string[]
  readonly breakdown: readonly LumenAgentPlanBreakdownRow[]
  readonly listStrategy: LumenAgentPlanListStrategy
  /** Optional controlled workflow; omitted hosts retain the legacy action callbacks. */
  readonly interaction?: {
    readonly planId: string
    readonly editing: boolean
    readonly draft: string
    readonly running: boolean
    readonly step: number
    readonly total: number
    readonly busy?: boolean
    readonly error?: string
    readonly labels: {
      readonly goalInput: string
      readonly save: string
      readonly cancel: string
      readonly stop: string
      readonly running: (step: number, total: number) => React.ReactNode
    }
    readonly onEdit: () => void
    readonly onDraftChange: (value: string) => void
    readonly onSave: () => void
    readonly onCancel: () => void
    readonly onRun: () => void
    readonly onStop: () => void
  }
}

export interface LumenAgentPlanContent {
  /** Content-grown preview styling and nearby feedback supplied by the owning Host. */
  readonly presentation?: { readonly ownerId: string; readonly notice?: string | undefined } | undefined
  readonly checklist?: LumenAgentPlanChecklistContent | undefined
  readonly editable?: LumenAgentPlanEditableContent | undefined
  readonly tree?: LumenAgentPlanTreeContent | undefined
  readonly actual?: LumenAgentPlanActualContent | undefined
  readonly board?: LumenAgentPlanBoardContent | undefined
  readonly summary?: LumenAgentPlanSummaryContent | undefined
}

export interface LumenAgentPlanProviderProps {
  readonly content: LumenAgentPlanContent
  readonly children: React.ReactNode
}

export interface LumenAgentPlanAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenAgentPlanProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenAgentPlanContent | undefined
  readonly onAction?: ((event: LumenAgentPlanAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly slots?:
    | {
        readonly header?: React.ReactNode | undefined
        readonly body?: React.ReactNode | undefined
        readonly footer?: React.ReactNode | undefined
      }
    | undefined
}

export type LumenAgentPlanVariantProps = Omit<LumenAgentPlanProps, 'variant' | 'variantId'>

const AgentPlanContentContext = React.createContext<LumenAgentPlanContent | undefined>(undefined)

const AgentPlanPresentationContext = React.createContext<LumenAgentPlanContent['presentation']>(undefined)

export function LumenAgentPlanProvider({ content, children }: LumenAgentPlanProviderProps) {
  return <AgentPlanContentContext.Provider value={content}>{children}</AgentPlanContentContext.Provider>
}

export function useLumenAgentPlanContent() {
  return React.useContext(AgentPlanContentContext)
}

export function uniqueLumenAgentPlanItems<Item extends { readonly id: string }>(
  items: readonly Item[],
): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export function selectLumenAgentPlanItem<Item extends { readonly id: string }>(
  items: readonly Item[],
  selectedId: string | undefined,
): Item | undefined {
  return items.find((item) => item.id === selectedId) ?? items[0]
}

function report(onAction: LumenAgentPlanProps['onAction'], actionId: string, value?: string) {
  onAction?.(value === undefined ? { actionId } : { actionId, value })
}

function PlanGlyph({ name }: { readonly name: 'chevron-down' | 'chevron-right' | 'edit' | 'play' | 'retry' | 'stop' }) {
  return (
    <svg className="lumen-agent-plan-glyph" data-tier="sm" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {name === 'chevron-down' ? <path d="m3 6 5 5 5-5" /> : null}
      {name === 'chevron-right' ? <path d="m6 3 5 5-5 5" /> : null}
      {name === 'edit' ? <path d="m3 11-.5 2.5L5 13l7.5-7.5-2-2ZM9.5 4.5l2 2" /> : null}
      {name === 'play' ? <path d="m5 3 8 5-8 5Z" /> : null}
      {name === 'retry' ? <path d="M4 5H1V2m0 3a6 6 0 1 1-1 5" /> : null}
      {name === 'stop' ? <rect x="2" y="2" width="12" height="12" rx="1.333" fill="currentColor" /> : null}
    </svg>
  )
}

function AgentPlanProgress({
  value,
  maximum,
  label,
}: {
  readonly value: number
  readonly maximum: number
  readonly label: string
}) {
  const safeMaximum = Math.max(1, maximum)
  const bounded = Math.max(0, Math.min(safeMaximum, Number.isFinite(value) ? value : 0))
  return (
    <div className="hbar-app-ui-agent-plan-progress">
      <div aria-hidden="true">
        <span style={{ inlineSize: `${(bounded / safeMaximum) * 100}%` }} />
      </div>
      <span>{label}</span>
    </div>
  )
}

function AgentPlanRoot({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  children,
}: Omit<LumenAgentPlanProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const presentation = React.useContext(AgentPlanPresentationContext)
  const contentClassName = [
    'lumen-agent-plan',
    presentation ? 'lumen-agent-plan-preview' : '',
    'hbar-app-ui-agent-plan-surface',
    `hbar-app-ui-agent-plan-variant-${variant}`,
    variant >= 1 && variant <= 6 ? 'hbar-app-ui-stage-padding-owner' : '',
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
      boundary={variant >= 1 && variant <= 6 ? 'none' : 'horizontal'}
      className={`lumen-agent-plan-root-surface${presentation ? ' lumen-agent-plan-preview-root' : ''}`}
      contentClassName={contentClassName}
      data-lumen-component="agent-plan"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-surface={surface}
      data-hbar-app-ui-state={state}
    >
      {presentation?.notice ? (
        <p className="lumen-agent-plan-preview-notice" role="status">
          {presentation.notice}
        </p>
      ) : null}
      {children}
    </LumenSurface>
  )
}

function ChecklistPlan(props: Omit<LumenAgentPlanProps, 'content'> & { content: LumenAgentPlanChecklistContent }) {
  const { content, onAction } = props
  const steps = React.useMemo(() => uniqueLumenAgentPlanItems(content.steps), [content.steps])
  const [openId, setOpenId] = React.useState<string | undefined>(
    () => selectLumenAgentPlanItem(steps, content.activeStepId)?.id,
  )
  const runningStep = steps.find((step) => step.state === 'running')
  const list = React.useRef<HTMLOListElement>(null)
  const [edges, setEdges] = React.useState({ top: false, bottom: false })
  React.useEffect(() => {
    if (openId !== undefined && !steps.some((step) => step.id === openId)) setOpenId(undefined)
  }, [steps, openId])
  React.useEffect(() => {
    const pane = list.current
    if (!pane) return undefined
    const update = () => {
      const next = {
        top: pane.scrollTop > 1,
        bottom: pane.scrollHeight - pane.clientHeight - pane.scrollTop > 1,
      }
      setEdges((previous) => (previous.top === next.top && previous.bottom === next.bottom ? previous : next))
    }
    const observer = new ResizeObserver(update)
    observer.observe(pane)
    pane.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      pane.removeEventListener('scroll', update)
    }
  }, [])
  const done = steps.filter((step) => step.state === 'done').length
  const progressLabel = content.labels.progress(done, steps.length)

  return (
    <AgentPlanRoot {...props} className="hbar-app-ui-agent-plan-checklist">
      <header className="hbar-app-ui-agent-plan-checklist-heading" role="banner">
        <h2>{content.labels.title}</h2>
        <AgentPlanProgress value={done} maximum={steps.length} label={progressLabel} />
        <LumenButton
          variant="outlined"
          disabled={content.busy || !runningStep}
          onClick={() => {
            content.onPausedChange?.(content.runId, !content.paused)
            report(onAction, content.paused ? 'resume-plan' : 'stop-plan', content.runId)
          }}
        >
          <PlanGlyph name={content.paused ? 'play' : 'stop'} />
          {content.paused ? content.labels.resume : content.labels.stop}
        </LumenButton>
      </header>
      <p className="hbar-app-ui-agent-plan-checklist-announcement" aria-live="polite">
        {runningStep
          ? content.paused
            ? content.labels.pausedOn(runningStep.title)
            : content.labels.workingOn(runningStep.title)
          : null}
      </p>
      <div
        className="hbar-app-ui-agent-plan-checklist-pane"
        data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
      >
        <div className="hbar-app-ui-agent-plan-checklist-scroll-frame">
          <ol ref={list} hidden={steps.length === 0}>
            {steps.map((step, index) => {
              const open = step.id === openId
              const state = step.state === 'running' && content.paused ? 'paused' : step.state
              return (
                <li data-state={state} key={step.id}>
                  <LumenButton
                    variant="text"
                    aria-expanded={open}
                    onClick={() => {
                      setOpenId((previous) => (previous === step.id ? undefined : step.id))
                      report(onAction, 'select-plan-step', step.id)
                    }}
                  >
                    <span className="hbar-app-ui-agent-plan-checklist-number">{index + 1}</span>
                    <span className="hbar-app-ui-agent-plan-step-title">{step.title}</span>
                    <span className="hbar-app-ui-agent-plan-checklist-status">
                      <span aria-hidden="true" />
                      <span>{state === 'paused' ? content.labels.paused : step.stateLabel}</span>
                    </span>
                  </LumenButton>
                  {open && (step.detail || step.target || step.estimate) ? (
                    <div className="hbar-app-ui-agent-plan-step-detail">
                      {step.detail ? <p>{step.detail}</p> : null}
                      {step.target || step.estimate ? (
                        <dl>
                          {step.target ? (
                            <div>
                              <dt>{content.labels.target}</dt>
                              <dd>{step.target}</dd>
                            </div>
                          ) : null}
                          {step.estimate ? (
                            <div>
                              <dt>{content.labels.estimate}</dt>
                              <dd>{step.estimate}</dd>
                            </div>
                          ) : null}
                        </dl>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>
          {steps.length === 0 ? <p className="hbar-app-ui-agent-plan-empty">{content.labels.empty}</p> : null}
          <div
            aria-hidden="true"
            className="hbar-app-ui-agent-plan-checklist-edge-overlay is-top"
            data-visible={edges.top}
          />
          <div
            aria-hidden="true"
            className="hbar-app-ui-agent-plan-checklist-edge-overlay is-bottom"
            data-visible={edges.bottom}
          />
        </div>
      </div>
    </AgentPlanRoot>
  )
}

function EditablePlan(props: Omit<LumenAgentPlanProps, 'content'> & { content: LumenAgentPlanEditableContent }) {
  const { content } = props
  return (
    <AgentPlanRoot {...props} className="hbar-app-ui-agent-plan-editable">
      {content.editing ? (
        <div
          className="hbar-app-ui-agent-plan-editable-content"
          data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        >
          <LumenPlanEditor {...content} />
        </div>
      ) : (
        <LumenPlanReview content={content} key={content.planId} />
      )}
    </AgentPlanRoot>
  )
}

function PlanTree(props: Omit<LumenAgentPlanProps, 'content'> & { content: LumenAgentPlanTreeContent }) {
  const { content, onAction } = props
  const groups = React.useMemo(() => uniqueLumenAgentPlanItems(content.groups), [content.groups])
  const [disclosures, setDisclosures] = React.useState<ReadonlyMap<string, boolean>>(() => new Map())
  const list = React.useRef<HTMLUListElement>(null)
  const [edges, setEdges] = React.useState({ top: false, bottom: false })
  React.useEffect(() => {
    setDisclosures((current) => {
      const next = new Map([...current].filter(([id]) => groups.some((group) => group.id === id)))
      return next.size === current.size ? current : next
    })
  }, [groups])
  React.useEffect(() => {
    const pane = list.current
    if (!pane) return undefined
    const update = () => {
      const next = {
        top: pane.scrollTop > 1,
        bottom: pane.scrollHeight - pane.clientHeight - pane.scrollTop > 1,
      }
      setEdges((previous) => (previous.top === next.top && previous.bottom === next.bottom ? previous : next))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(pane)
    pane.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      pane.removeEventListener('scroll', update)
    }
    // Like the public preview, edge hints follow native scroll/resize events;
    // disclosure itself does not recompute them before the user scrolls.
  }, [])
  const done = groups.reduce((total, group) => total + group.done, 0)
  const total = groups.reduce((count, group) => count + group.total, 0)
  return (
    <AgentPlanRoot {...props} className="hbar-app-ui-agent-plan-tree">
      <header className="lumen-plan-tree-heading" role="banner">
        <h2>{content.labels.title}</h2>
        <span>{content.labels.progress(done, total)}</span>
      </header>
      <div
        className="lumen-plan-tree-card"
        data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
      >
        <div className="lumen-plan-tree-scroll-frame">
          <ul ref={list} className="lumen-plan-tree-list" hidden={groups.length === 0}>
            {groups.map((group) => {
              const open = disclosures.get(group.id) ?? group.openByDefault
              const items = uniqueLumenAgentPlanItems(group.items)
              return (
                <li key={group.id} data-group-id={group.id}>
                  <LumenButton
                    type="button"
                    variant="text"
                    indicator="none"
                    aria-expanded={open}
                    className="lumen-plan-tree-group"
                    onClick={() => {
                      setDisclosures((current) => new Map(current).set(group.id, !open))
                      report(onAction, 'toggle-plan-group', group.id)
                    }}
                  >
                    <span className="lumen-plan-tree-number" aria-hidden="true">
                      <TreeGlyph name={open ? 'down' : 'right'} />
                    </span>
                    <span className="lumen-plan-tree-title">{group.title}</span>
                    <span className="lumen-plan-tree-count">{group.progressLabel}</span>
                  </LumenButton>
                  {open ? (
                    <ul className="lumen-plan-tree-children">
                      {items.map((item, index) => (
                        <li key={item.id} data-step-id={item.id} data-state={item.state}>
                          <span className="lumen-plan-tree-number">{index + 1}</span>
                          <span className="lumen-plan-tree-title">{item.title}</span>
                          {item.dependency ? <small>{item.dependency.label}</small> : null}
                          {item.state === 'failed' ? (
                            <LumenButton
                              type="button"
                              variant="text"
                              size="s"
                              className="lumen-plan-tree-retry"
                              disabled={content.busy}
                              onClick={() => {
                                content.onRetry?.(content.runId, group.id, item.id)
                                report(onAction, 'retry-plan-step', item.id)
                              }}
                            >
                              <TreeGlyph name="retry" />
                              {content.labels.retry}
                            </LumenButton>
                          ) : null}
                          <span className="lumen-plan-tree-status">
                            <span aria-hidden="true" />
                            <span>{item.stateLabel}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {groups.length === 0 ? <p className="hbar-app-ui-agent-plan-empty">{content.labels.empty}</p> : null}
          <div aria-hidden="true" className="lumen-plan-tree-edge-overlay is-top" data-visible={edges.top} />
          <div aria-hidden="true" className="lumen-plan-tree-edge-overlay is-bottom" data-visible={edges.bottom} />
        </div>
      </div>
    </AgentPlanRoot>
  )
}

function TreeGlyph({ name }: { readonly name: 'down' | 'right' | 'retry' }) {
  return (
    <svg className="lumen-plan-tree-glyph" data-tier="sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {name === 'down' ? <path d="m6 9 6 6 6-6" /> : null}
      {name === 'right' ? <path d="m9 6 6 6-6 6" /> : null}
      {name === 'retry' ? (
        <>
          <path d="M3 11a9 9 0 1 1 2.6 7.4M3 3v6h6" />
        </>
      ) : null}
    </svg>
  )
}

function DurationBar({
  value,
  planned,
}: {
  readonly value?: number | undefined
  readonly planned?: number | undefined
}) {
  const bounded = Math.max(0, Math.min(1, Number.isFinite(value) ? (value ?? 0) : 0))
  const marker = Math.max(0, Math.min(1, Number.isFinite(planned) ? (planned ?? 0) : 0))
  return (
    <span
      aria-hidden="true"
      className="lumen-plan-actual-duration-bar"
      data-value={bounded}
      data-planned={planned === undefined ? undefined : marker}
    >
      <svg aria-hidden="true" focusable="false">
        <rect width={`${bounded * 100}%`} height="100%" rx="2" fill="currentColor" />
        {planned !== undefined ? <line x1={`${marker * 100}%`} x2={`${marker * 100}%`} y1="0" y2="100%" /> : null}
      </svg>
    </span>
  )
}

function PlanActualValue({ value }: { value: string }) {
  return <span className="lumen-plan-actual-value">{value}</span>
}

function PlanActual(props: Omit<LumenAgentPlanProps, 'content'> & { content: LumenAgentPlanActualContent }) {
  const { content } = props
  const metrics = React.useMemo(() => uniqueLumenAgentPlanItems(content.metrics), [content.metrics])
  const rows = React.useMemo(() => uniqueLumenAgentPlanItems(content.rows), [content.rows])
  const paneRef = React.useRef<HTMLElement>(null)
  const [edges, setEdges] = React.useState({ top: false, bottom: false })
  React.useEffect(() => {
    const pane = paneRef.current
    if (!pane) return undefined
    const update = () => {
      const next = {
        top: pane.scrollTop > 1,
        bottom: pane.scrollHeight - pane.clientHeight - pane.scrollTop > 1,
      }
      setEdges((previous) => (previous.top === next.top && previous.bottom === next.bottom ? previous : next))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(pane)
    pane.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      pane.removeEventListener('scroll', update)
    }
  }, [rows])
  return (
    <AgentPlanRoot {...props} className="hbar-app-ui-agent-plan-actual">
      <header className="lumen-plan-actual-heading" role="banner">
        <h2>{content.labels.title}</h2>
        <span>{content.labels.remaining}</span>
      </header>
      <div className="lumen-plan-actual-metrics">
        {metrics.map((metric) => (
          <div data-tone={metric.tone ?? 'neutral'} key={metric.id} data-metric-id={metric.id}>
            <p>{metric.label}</p>
            <p>
              <span>{metric.value}</span>
            </p>
          </div>
        ))}
      </div>
      <div
        className="lumen-plan-actual-card"
        data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
      >
        <div className="lumen-plan-actual-scroll-frame">
          <main ref={paneRef} className="lumen-plan-actual-scroll">
            <table className="lumen-plan-actual-table">
              <caption>{content.labels.description}</caption>
              <thead>
                <tr>
                  <th scope="col">{content.labels.step}</th>
                  <th scope="col" className="lumen-plan-actual-duration-cell">
                    {content.labels.duration}
                  </th>
                  <th scope="col">
                    <PlanActualValue value={content.labels.planned} />
                  </th>
                  <th scope="col">
                    <PlanActualValue value={content.labels.actual} />
                  </th>
                  <th scope="col">
                    <PlanActualValue value={content.labels.drift} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length > 0 ? (
                  rows.map((row) => (
                    <tr data-tone={row.tone ?? 'neutral'} key={row.id} data-row-id={row.id}>
                      <th scope="row">{row.title}</th>
                      <td className="lumen-plan-actual-duration-cell">
                        <DurationBar value={row.durationProgress} planned={row.plannedProgress} />
                      </td>
                      <td>
                        <PlanActualValue value={row.planned} />
                      </td>
                      <td>
                        <PlanActualValue value={row.actual} />
                      </td>
                      <td>
                        <PlanActualValue value={row.drift} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>{content.labels.empty}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </main>
          <div aria-hidden="true" className="lumen-plan-actual-edge-overlay is-top" data-visible={edges.top} />
          <div aria-hidden="true" className="lumen-plan-actual-edge-overlay is-bottom" data-visible={edges.bottom} />
        </div>
      </div>
    </AgentPlanRoot>
  )
}

function PlanBoard(props: Omit<LumenAgentPlanProps, 'content'> & { content: LumenAgentPlanBoardContent }) {
  const { content } = props
  const sections = React.useMemo(() => uniqueLumenAgentPlanItems(content.sections), [content.sections])
  const done = sections.reduce((sum, section) => sum + section.done, 0)
  const total = sections.reduce((sum, section) => sum + section.total, 0)
  const boardRef = React.useRef<HTMLDivElement>(null)
  const edges = usePlanScrollEdges(boardRef, sections)
  return (
    <AgentPlanRoot {...props} className="hbar-app-ui-agent-plan-board-surface">
      <header className="lumen-plan-board-heading" role="banner">
        <h2>{content.labels.title}</h2>
        <span>{content.labels.progress(done, total)}</span>
      </header>
      <div
        className="lumen-plan-board-frame"
        data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
      >
        <div ref={boardRef} className="lumen-plan-board-columns">
          {sections.length ? (
            sections.map((section) => <PlanBoardColumn key={section.id} section={section} labels={content.labels} />)
          ) : (
            <p className="lumen-plan-board-empty">{content.labels.empty}</p>
          )}
        </div>
        <PlanBoardEdges edges={edges} />
      </div>
    </AgentPlanRoot>
  )
}

function usePlanScrollEdges(ref: React.RefObject<HTMLElement | null>, records: object) {
  const [edges, setEdges] = React.useState({ top: false, bottom: false })
  React.useEffect(() => {
    const pane = ref.current
    if (!pane) return undefined
    const update = () => {
      const next = {
        top: pane.scrollTop > 1,
        bottom: pane.scrollHeight - pane.clientHeight - pane.scrollTop > 1,
      }
      setEdges((previous) => (previous.top === next.top && previous.bottom === next.bottom ? previous : next))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(pane)
    pane.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      pane.removeEventListener('scroll', update)
    }
  }, [ref, records])
  return edges
}

function PlanBoardEdges({ edges }: { edges: { top: boolean; bottom: boolean } }) {
  return (
    <>
      <div aria-hidden="true" className="lumen-plan-board-edge-overlay is-top" data-visible={edges.top} />
      <div aria-hidden="true" className="lumen-plan-board-edge-overlay is-bottom" data-visible={edges.bottom} />
    </>
  )
}

function PlanBoardColumn({
  section,
  labels,
}: {
  section: LumenAgentPlanBoardSection
  labels: LumenAgentPlanBoardContent['labels']
}) {
  const items = React.useMemo(() => uniqueLumenAgentPlanItems(section.items), [section.items])
  const listRef = React.useRef<HTMLOListElement>(null)
  const edges = usePlanScrollEdges(listRef, items)
  return (
    <section className="lumen-plan-board-column" data-section-id={section.id}>
      <h3>
        <span>{section.title}</span>
        <span>{section.progressLabel}</span>
      </h3>
      <div className="lumen-plan-board-list-frame">
        <ol ref={listRef}>
          {items.length ? (
            items.map((item) => (
              <li key={item.id} data-step-id={item.id} data-state={item.state}>
                <p>{item.title}</p>
                <p>
                  <span aria-hidden="true" className="lumen-plan-board-dot" />
                  <span>{item.stateLabel}</span>
                  {item.duration ? (
                    <>
                      <span aria-hidden="true">{labels.separator}</span>
                      <span>{item.duration}</span>
                    </>
                  ) : null}
                </p>
              </li>
            ))
          ) : (
            <li className="lumen-plan-board-empty">{labels.empty}</li>
          )}
        </ol>
        <PlanBoardEdges edges={edges} />
      </div>
    </section>
  )
}

function PlanSummary(props: Omit<LumenAgentPlanProps, 'content'> & { content: LumenAgentPlanSummaryContent }) {
  const { content, onAction } = props
  const metrics = React.useMemo(() => uniqueLumenAgentPlanItems(content.metrics), [content.metrics])
  const breakdown = React.useMemo(() => uniqueLumenAgentPlanItems(content.breakdown), [content.breakdown])
  const tools = React.useMemo(() => [...new Set(content.tools)], [content.tools])
  const interaction = content.interaction
  const scroll = React.useRef<HTMLElement>(null)
  const input = React.useRef<HTMLTextAreaElement>(null)
  const edges = usePlanScrollEdges(scroll, content)
  React.useEffect(() => {
    if (interaction?.editing) input.current?.focus()
  }, [interaction?.editing])
  return (
    <AgentPlanRoot {...props} className="lumen-plan-summary hbar-app-ui-agent-plan-summary">
      <header className="lumen-plan-summary-heading" role="banner">
        <h2>{content.labels.title}</h2>
        <span>{content.labels.stepCount}</span>
      </header>
      <div className="lumen-plan-summary-frame">
        <main
          ref={scroll}
          className="lumen-plan-summary-scroll"
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
        >
          <section>
            <h3>{content.labels.goal}</h3>
            <div className="lumen-plan-summary-copy">
              {interaction?.editing ? (
                <>
                  <LumenTextarea
                    ref={input}
                    rows={3}
                    aria-label={interaction.labels.goalInput}
                    value={interaction.draft}
                    disabled={interaction.busy}
                    onChange={(event) => interaction.onDraftChange(event.currentTarget.value)}
                  />
                  <div className="lumen-plan-summary-edit-actions">
                    <LumenButton tone="primary" disabled={interaction.busy} onClick={interaction.onSave}>
                      {interaction.labels.save}
                    </LumenButton>
                    <LumenButton disabled={interaction.busy} onClick={interaction.onCancel}>
                      {interaction.labels.cancel}
                    </LumenButton>
                  </div>
                </>
              ) : (
                <p>{content.goal}</p>
              )}
              {interaction?.error ? <p role="alert">{interaction.error}</p> : null}
            </div>
          </section>
          <dl className="lumen-plan-summary-metrics">
            {metrics.map((metric) => (
              <div key={metric.id}>
                <dt>{metric.label}</dt>
                <dd>{metric.value}</dd>
              </div>
            ))}
          </dl>
          <section>
            <h3>{content.labels.tools}</h3>
            <div className="lumen-plan-summary-tools">
              <ul>
                {tools.map((tool) => (
                  <li key={tool}>{tool}</li>
                ))}
              </ul>
            </div>
          </section>
          <section>
            <h3>{content.labels.breakdown}</h3>
            <ul className="lumen-plan-summary-breakdown">
              {breakdown.length ? (
                breakdown.map((row, index) => (
                  <li key={row.id} data-step-id={row.id}>
                    <span>{index + 1}</span>
                    <span>{row.title}</span>
                    <span>{row.countLabel}</span>
                    <span>{row.duration}</span>
                  </li>
                ))
              ) : (
                <li className="lumen-plan-summary-empty">{content.labels.empty}</li>
              )}
            </ul>
          </section>
        </main>
        <div aria-hidden="true" className="lumen-plan-summary-edge-overlay is-top" data-visible={edges.top} />
        <div aria-hidden="true" className="lumen-plan-summary-edge-overlay is-bottom" data-visible={edges.bottom} />
      </div>
      <footer className="lumen-plan-summary-footer" role="contentinfo">
        <p>
          {interaction?.running
            ? interaction.labels.running(interaction.step, interaction.total)
            : content.labels.review}
        </p>
        {interaction?.running ? (
          <LumenButton variant="outlined" disabled={interaction.busy} onClick={interaction.onStop}>
            <PlanGlyph name="stop" />
            {interaction.labels.stop}
          </LumenButton>
        ) : (
          <>
            <LumenButton
              disabled={interaction?.editing || interaction?.busy}
              onClick={() => {
                interaction?.onEdit()
                report(onAction, 'edit-plan')
              }}
            >
              <PlanGlyph name="edit" />
              {content.labels.edit}
            </LumenButton>
            <LumenButton
              tone="primary"
              disabled={interaction?.editing || interaction?.busy}
              onClick={() => {
                interaction?.onRun()
                report(onAction, 'run-plan')
              }}
            >
              <PlanGlyph name="play" />
              {content.labels.run}
            </LumenButton>
          </>
        )}
      </footer>
    </AgentPlanRoot>
  )
}

function emptyPlan(props: LumenAgentPlanProps) {
  return (
    <AgentPlanRoot {...props} className="hbar-app-ui-agent-plan-empty-surface">
      {null}
    </AgentPlanRoot>
  )
}

export function LumenAgentPlan(props: LumenAgentPlanProps) {
  const providerContent = useLumenAgentPlanContent()
  if (props.slots)
    return (
      <AgentPlanRoot {...props}>
        {props.slots.header}
        {props.slots.body}
        {props.slots.footer}
      </AgentPlanRoot>
    )
  const content = props.content ?? providerContent
  return (
    <AgentPlanPresentationContext.Provider
      key={content?.presentation?.ownerId ?? props.variantId}
      value={content?.presentation}
    >
      <AgentPlanView {...props} content={content} />
    </AgentPlanPresentationContext.Provider>
  )
}

function AgentPlanView(props: LumenAgentPlanProps) {
  const content = props.content
  switch (props.variant) {
    case 1:
      return content?.checklist ? (
        <ChecklistPlan {...props} content={content.checklist} key={content.checklist.runId} />
      ) : (
        emptyPlan(props)
      )
    case 2:
      return content?.editable ? <EditablePlan {...props} content={content.editable} /> : emptyPlan(props)
    case 3:
      return content?.tree ? <PlanTree {...props} content={content.tree} key={content.tree.runId} /> : emptyPlan(props)
    case 4:
      return content?.actual ? <PlanActual {...props} content={content.actual} /> : emptyPlan(props)
    case 5:
      return content?.board ? <PlanBoard {...props} content={content.board} /> : emptyPlan(props)
    case 6:
      return content?.summary ? <PlanSummary {...props} content={content.summary} /> : emptyPlan(props)
    default:
      return emptyPlan(props)
  }
}

function agentPlanVariant(variant: number, variantProps: LumenAgentPlanVariantProps) {
  return <LumenAgentPlan {...variantProps} variant={variant} variantId={`hbar-app-ui-agent-plan-${variant}`} />
}

export function LumenAgentPlan01(props: LumenAgentPlanVariantProps) {
  return agentPlanVariant(1, props)
}

export function LumenAgentPlan02(props: LumenAgentPlanVariantProps) {
  return agentPlanVariant(2, props)
}

export function LumenAgentPlan03(props: LumenAgentPlanVariantProps) {
  return agentPlanVariant(3, props)
}

export function LumenAgentPlan04(props: LumenAgentPlanVariantProps) {
  return agentPlanVariant(4, props)
}

export function LumenAgentPlan05(props: LumenAgentPlanVariantProps) {
  return agentPlanVariant(5, props)
}

export function LumenAgentPlan06(props: LumenAgentPlanVariantProps) {
  return agentPlanVariant(6, props)
}
