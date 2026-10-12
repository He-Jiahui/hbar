'use client'

import * as React from 'react'
import { LumenCheckBox, LumenInput } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenText } from './primitives'
import './agent-approval.css'
import './agent-approval-diff.css'
import './agent-approval-queue.css'
import './agent-approval-permission.css'
import './agent-approval-cost.css'
import './agent-approval-history.css'
import './agent-approval-practical-flow.css'

export type LumenAgentApprovalListStrategy =
  | { readonly kind: 'content-grown'; readonly expectedMaximum: number }
  | { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }

export type LumenAgentApprovalState =
  'complete' | 'needs-approval' | 'queued' | 'approved' | 'skipped' | 'expired' | 'auto-approved' | 'rejected'

export interface LumenAgentApprovalInlineContent {
  readonly requestId?: string | undefined
  readonly state?: 'pending' | 'approved' | 'rejected' | undefined
  readonly busy?: boolean | undefined
  readonly onDecision?: ((requestId: string, decision: 'approved' | 'rejected') => void) | undefined
  readonly labels: {
    readonly day: string
    readonly showRequest: string
    readonly hideRequest: string
    readonly decisionTime: string
    readonly reject: string
    readonly approve: string
  }
  readonly userMessage: string
  readonly detailMessage: string
  readonly toolName: string
  readonly toolDuration: string
  readonly requestTitle: string
  readonly requestDescription: string
  readonly requestStatusLabel: string
  readonly requestText: string
  readonly outcomes: Readonly<
    Record<
      'approved' | 'rejected',
      {
        readonly summary: string
        readonly followUp?: string | undefined
        readonly announcement: string
      }
    >
  >
}

export interface LumenAgentApprovalChange {
  readonly id: string
  readonly label: string
  readonly previousValue: string
  readonly nextValue: string
}

export interface LumenAgentApprovalDiffContent {
  readonly requestId?: string | undefined
  readonly state?: 'pending' | 'approved' | 'rejected' | 'always-allow' | undefined
  readonly busy?: boolean | undefined
  readonly onDecision?: ((requestId: string, decision: 'approved' | 'rejected' | 'always-allow') => void) | undefined
  readonly labels: {
    readonly headerTitle: string
    readonly agent: string
    readonly status: string
    readonly separator: string
    readonly showDiff: string
    readonly hideDiff: string
    readonly reject: string
    readonly alwaysAllow: string
    readonly approve: string
    readonly changeSeparator: string
  }
  readonly title: string
  readonly description: string
  readonly changes: readonly LumenAgentApprovalChange[]
  readonly diffText: string
  readonly outcomes: Readonly<
    Record<
      'approved' | 'rejected' | 'always-allow',
      {
        readonly status: string
        readonly summary: string
        readonly announcement: string
      }
    >
  >
  readonly listStrategy: LumenAgentApprovalListStrategy
}

export interface LumenAgentApprovalQueueItem {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly state: LumenAgentApprovalState
  readonly stateLabel: string
  readonly when: string
  readonly expandable: boolean
  readonly requestText?: string | undefined
}

export interface LumenAgentApprovalQueueContent {
  readonly labels: {
    readonly title: string
    readonly waiting: (count: number) => string
    readonly separator: string
    readonly status: string
    readonly showRequest: string
    readonly hideRequest: string
    readonly reject: string
    readonly approve: string
  }
  readonly pending: readonly LumenAgentApprovalQueueItem[]
  readonly history: readonly LumenAgentApprovalQueueItem[]
  /** Ordered request rows remain in place after the host confirms a decision. */
  readonly onDecision: (id: string, decision: 'approved' | 'rejected') => void
  readonly announcement?: string | undefined
  readonly busyId?: string | undefined
  readonly outcomes: Readonly<
    Record<
      'approved' | 'rejected',
      {
        readonly stateLabel: string
        readonly when: string
        readonly announcement: string
      }
    >
  >
  readonly listStrategy: LumenAgentApprovalListStrategy
}

export interface LumenAgentApprovalScope {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly checked: boolean
}

export interface LumenAgentApprovalPermissionContent {
  readonly requestId: string
  readonly state: 'pending' | 'approved' | 'rejected'
  readonly busy?: boolean | undefined
  readonly labels: {
    readonly title: string
    readonly agent: string
    readonly status: string
    readonly showRequest: string
    readonly hideRequest: string
    readonly scopes: string
    readonly expires: string
    readonly reject: string
    readonly approve: string
    readonly separator: string
  }
  readonly requestTitle: string
  readonly description: string
  readonly scopes: readonly LumenAgentApprovalScope[]
  readonly expiry: string
  readonly requestText: string
  readonly onScopeChange: (requestId: string, scopeId: string, checked: boolean) => void
  readonly onDecision: (requestId: string, decision: 'approved' | 'rejected') => void
  readonly outcomes: Readonly<
    Record<
      'approved' | 'rejected',
      {
        readonly status: string
        readonly summary: (selected: number, total: number) => string
        readonly announcement: (selected: number) => string
      }
    >
  >
  readonly listStrategy: LumenAgentApprovalListStrategy
}

export interface LumenAgentApprovalCostMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly detail: string
}

export interface LumenAgentApprovalCostContent {
  readonly requestId: string
  readonly state: 'pending' | 'approved' | 'rejected'
  readonly busy?: boolean | undefined
  readonly onDecision: (requestId: string, decision: 'approved' | 'rejected') => void
  readonly labels: {
    readonly badge: string
    readonly agent: string
    readonly title: string
    readonly runtime: string
    readonly background: string
    readonly usage: string
    readonly cap: string
    readonly queries: string
    readonly readOnly: string
    readonly projected: string
    readonly separator: string
    readonly showRequest: string
    readonly hideRequest: string
    readonly reject: string
    readonly approve: string
  }
  readonly description: string
  readonly metrics: readonly LumenAgentApprovalCostMetric[]
  readonly projectedValue: string
  readonly progress: number
  readonly progressLabel: string
  readonly requestText: string
  readonly outcomes: Readonly<
    Record<
      'approved' | 'rejected',
      {
        readonly status: string
        readonly summary: string
        readonly announcement: string
      }
    >
  >
  readonly listStrategy: LumenAgentApprovalListStrategy
}

export interface LumenAgentApprovalHistoryEntry {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly state: LumenAgentApprovalState
  readonly stateLabel: string
  readonly when: string
  readonly filterIds: readonly string[]
}

export interface LumenAgentApprovalHistoryFilter {
  readonly id: string
  readonly label: string
}

export interface LumenAgentApprovalHistoryContent {
  readonly historyId: string
  readonly labels: {
    readonly title: string
    readonly export: string
    readonly searchLabel: string
    readonly filtersLabel: string
    readonly emptyTitle: string
    readonly emptyDescription: string
    readonly clearFilters: string
  }
  readonly searchPlaceholder: string
  readonly filters: readonly LumenAgentApprovalHistoryFilter[]
  readonly activeFilterId: string
  readonly query: string
  readonly onQueryChange?: ((historyId: string, query: string) => void) | undefined
  readonly onFilterChange?: ((historyId: string, filterId: string) => void) | undefined
  readonly onClearFilters?: ((historyId: string) => void) | undefined
  readonly onExport?: ((historyId: string) => void) | undefined
  readonly entries: readonly LumenAgentApprovalHistoryEntry[]
  readonly listStrategy: LumenAgentApprovalListStrategy
}

export interface LumenAgentApprovalContent {
  /** Opt-in content-grown presentation with feedback supplied by the owning Host. */
  readonly presentation?: { readonly ownerId: string; readonly notice?: string | undefined } | undefined
  readonly inline?: LumenAgentApprovalInlineContent | undefined
  readonly diff?: LumenAgentApprovalDiffContent | undefined
  readonly queue?: LumenAgentApprovalQueueContent | undefined
  readonly permission?: LumenAgentApprovalPermissionContent | undefined
  readonly cost?: LumenAgentApprovalCostContent | undefined
  readonly history?: LumenAgentApprovalHistoryContent | undefined
}

export interface LumenAgentApprovalProviderProps {
  readonly content: LumenAgentApprovalContent
  readonly children: React.ReactNode
}

export interface LumenAgentApprovalAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenAgentApprovalProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenAgentApprovalContent | undefined
  readonly onAction?: ((event: LumenAgentApprovalAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly controlled?: { readonly body: React.ReactNode } | undefined
}

export type LumenAgentApprovalVariantProps = Omit<LumenAgentApprovalProps, 'variant' | 'variantId'>

const ApprovalContentContext = React.createContext<LumenAgentApprovalContent | undefined>(undefined)

const ApprovalPresentationContext = React.createContext<LumenAgentApprovalContent['presentation']>(undefined)

export function LumenAgentApprovalProvider({ content, children }: LumenAgentApprovalProviderProps) {
  return <ApprovalContentContext.Provider value={content}>{children}</ApprovalContentContext.Provider>
}

export function useLumenAgentApprovalContent() {
  return React.useContext(ApprovalContentContext)
}

export function uniqueLumenAgentApprovalItems<Item extends { readonly id: string }>(
  items: readonly Item[],
): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export function selectLumenAgentApprovalItem<Item extends { readonly id: string }>(
  items: readonly Item[],
  selectedId: string | undefined,
): Item | undefined {
  return items.find((item) => item.id === selectedId) ?? items[0]
}

function report(onAction: LumenAgentApprovalProps['onAction'], actionId: string, value?: string) {
  onAction?.(value === undefined ? { actionId } : { actionId, value })
}

function ApprovalGlyph({ name }: { readonly name: 'chevron' | 'chevron-down' | 'download' | 'search' | 'approve' }) {
  return (
    <svg className="lumen-agent-approval-glyph" viewBox="0 0 16 16" aria-hidden="true">
      {name === 'chevron' ? <path d="m6 3 5 5-5 5" /> : null}
      {name === 'chevron-down' ? <path d="m3 6 5 5 5-5" /> : null}
      {name === 'download' ? <path d="M8 2.5v8m-3-3 3 3 3-3M3 13.5h10" /> : null}
      {name === 'search' ? <path d="M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm4-1 3 3" /> : null}
      {name === 'approve' ? <path d="m3.5 8 3 3 6-6" /> : null}
    </svg>
  )
}

function StateMark({ state }: { readonly state: LumenAgentApprovalState }) {
  return (
    <i
      aria-hidden="true"
      className={`lumen-agent-approval-state-mark hbar-app-ui-agent-approval-state-mark is-${state}`}
    />
  )
}

function ApprovalProgress({ value }: { readonly value: number }) {
  const bounded = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <div aria-hidden="true" className="lumen-agent-approval-progress hbar-app-ui-agent-approval-progress">
      <span style={{ inlineSize: `${bounded}%` }} />
    </div>
  )
}

function ApprovalRoot({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  children,
}: Omit<LumenAgentApprovalProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const presentation = React.useContext(ApprovalPresentationContext)
  const contentClassName = [
    'lumen-agent-approval',
    presentation ? 'lumen-agent-approval-preview' : '',
    'hbar-app-ui-agent-approval-surface',
    `hbar-app-ui-agent-approval-variant-${variant}`,
    variant === 5 ? 'hbar-app-ui-stage-padding-owner' : '',
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
      boundary="none"
      className={`lumen-agent-approval-surface${presentation ? ' lumen-agent-approval-preview-root' : ''}`}
      contentClassName={contentClassName}
      data-lumen-component="agent-approval"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-surface={surface}
      data-hbar-app-ui-state={state}
    >
      {presentation?.notice ? (
        <p className="lumen-agent-approval-preview-notice" role="status">
          {presentation.notice}
        </p>
      ) : null}
      {children}
    </LumenSurface>
  )
}

function useApprovalScrollEdges() {
  const scrollPane = React.useRef<HTMLDivElement>(null)
  const [scrollEdges, setScrollEdges] = React.useState({ top: false, bottom: false })
  React.useEffect(() => {
    const pane = scrollPane.current
    if (!pane) return undefined
    const update = () => {
      const next = {
        top: pane.scrollTop > 1,
        bottom: pane.scrollHeight - pane.clientHeight - pane.scrollTop > 1,
      }
      setScrollEdges((previous) => (previous.top === next.top && previous.bottom === next.bottom ? previous : next))
    }
    const observer = new ResizeObserver(update)
    // The live preview refreshes these indicators on viewport resize or scroll,
    // not merely when its request disclosure changes the content height.
    observer.observe(pane)
    pane.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      pane.removeEventListener('scroll', update)
    }
  }, [])
  return { scrollPane, scrollEdges }
}

function InlineApproval(
  props: Omit<LumenAgentApprovalProps, 'content'> & { content: LumenAgentApprovalInlineContent },
) {
  const { content, onAction } = props
  const [localDecision, setDecision] = React.useState<'pending' | 'approved' | 'rejected'>('pending')
  const decision = content.state ?? localDecision
  const disabled =
    Boolean(content.busy) ||
    decision !== 'pending' ||
    (content.state !== undefined && (!content.onDecision || !content.requestId?.trim()))
  const [requestOpen, setRequestOpen] = React.useState(false)
  const { scrollPane, scrollEdges } = useApprovalScrollEdges()
  const decide = (value: 'approved' | 'rejected') => {
    if (disabled) return
    if (content.state !== undefined) {
      if (content.requestId) content.onDecision?.(content.requestId, value)
    } else setDecision(value)
    report(onAction, 'decide-inline-approval', value)
  }
  const outcome = decision === 'pending' ? undefined : content.outcomes[decision]
  return (
    <ApprovalRoot {...props} className="hbar-app-ui-agent-approval-inline-overlay-frame">
      <div className="hbar-app-ui-agent-approval-inline" ref={scrollPane}>
        <div className="hbar-app-ui-agent-approval-inline-body">
          <p className="hbar-app-ui-agent-approval-day">{content.labels.day}</p>
          <div className="hbar-app-ui-agent-approval-user-row">
            <p className="hbar-app-ui-agent-approval-user-message">{content.userMessage}</p>
          </div>
          <p className="hbar-app-ui-agent-approval-detail-message">{content.detailMessage}</p>
          <div className="hbar-app-ui-agent-approval-tool-row">
            <StateMark state="complete" />
            <span>{content.toolName}</span>
            <span>{content.toolDuration}</span>
          </div>
          {outcome ? (
            <React.Fragment>
              <div className="hbar-app-ui-agent-approval-inline-result">
                <StateMark state={decision === 'approved' ? 'approved' : 'skipped'} />
                <p>{outcome.summary}</p>
                <span>{content.labels.decisionTime}</span>
              </div>
              {outcome.followUp ? (
                <p className="hbar-app-ui-agent-approval-inline-follow-up">{outcome.followUp}</p>
              ) : null}
            </React.Fragment>
          ) : (
            <LumenSurface
              as="section"
              aria-label={content.requestTitle}
              boundary="none"
              className="hbar-app-ui-agent-approval-request-card"
              contentClassName="hbar-app-ui-agent-approval-request-flow"
              material="frost"
            >
              <div className="hbar-app-ui-agent-approval-request-summary">
                <div className="hbar-app-ui-agent-approval-inline-status">
                  <StateMark state="needs-approval" />
                  <span>{content.requestStatusLabel}</span>
                </div>
                <p className="hbar-app-ui-agent-approval-inline-title">{content.requestTitle}</p>
                <p>{content.requestDescription}</p>
              </div>
              <div className="hbar-app-ui-agent-approval-inline-actions">
                <footer className="hbar-app-ui-agent-approval-action-row">
                  <LumenButton
                    variant="text"
                    aria-expanded={requestOpen}
                    onClick={() => {
                      setRequestOpen((value) => !value)
                      report(onAction, 'toggle-inline-request')
                    }}
                  >
                    <ApprovalGlyph name={requestOpen ? 'chevron-down' : 'chevron'} />
                    {requestOpen ? content.labels.hideRequest : content.labels.showRequest}
                  </LumenButton>
                  <div>
                    <LumenButton variant="outlined" disabled={disabled} onClick={() => decide('rejected')}>
                      {content.labels.reject}
                    </LumenButton>
                    <LumenButton disabled={disabled} onClick={() => decide('approved')}>
                      {content.labels.approve}
                    </LumenButton>
                  </div>
                </footer>
                {requestOpen ? (
                  <pre tabIndex={0} className="hbar-app-ui-agent-approval-inline-request">
                    {content.requestText}
                  </pre>
                ) : null}
              </div>
            </LumenSurface>
          )}
        </div>
        <div className="hbar-app-ui-agent-approval-inline-announcement" aria-live="polite">
          {outcome?.announcement}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="hbar-app-ui-agent-approval-scroll-overlay is-top"
        data-visible={scrollEdges.top}
      />
      <div
        aria-hidden="true"
        className="hbar-app-ui-agent-approval-scroll-overlay is-bottom"
        data-visible={scrollEdges.bottom}
      />
    </ApprovalRoot>
  )
}

function DiffApproval(props: Omit<LumenAgentApprovalProps, 'content'> & { content: LumenAgentApprovalDiffContent }) {
  const { content, onAction } = props
  const changes = uniqueLumenAgentApprovalItems(content.changes)
  const [open, setOpen] = React.useState(false)
  const [localDecision, setDecision] = React.useState<'pending' | 'approved' | 'rejected' | 'always-allow'>('pending')
  const decision = content.state ?? localDecision
  const disabled =
    Boolean(content.busy) ||
    decision !== 'pending' ||
    (content.state !== undefined && (!content.onDecision || !content.requestId?.trim()))
  const { scrollPane, scrollEdges } = useApprovalScrollEdges()
  const outcome = decision === 'pending' ? undefined : content.outcomes[decision]
  const decide = (value: 'approved' | 'rejected' | 'always-allow') => {
    if (disabled) return
    if (content.state !== undefined) {
      if (content.requestId) content.onDecision?.(content.requestId, value)
    } else setDecision(value)
    report(onAction, 'decide-diff-approval', value)
  }
  return (
    <ApprovalRoot {...props} className="hbar-app-ui-agent-approval-diff">
      <header className="hbar-app-ui-agent-approval-diff-heading" role="banner">
        <h2>{content.labels.headerTitle}</h2>
        <span>{content.labels.agent}</span>
      </header>
      <div className="hbar-app-ui-agent-approval-diff-scroll-frame">
        <main
          className="hbar-app-ui-agent-approval-diff-scroll"
          ref={scrollPane}
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
        >
          <div className="hbar-app-ui-agent-approval-diff-body">
            <LumenSurface
              as="section"
              aria-label={content.title}
              boundary="none"
              className="hbar-app-ui-agent-approval-diff-card"
              contentClassName="hbar-app-ui-agent-approval-diff-flow"
              material="frost"
            >
              <div className="hbar-app-ui-agent-approval-diff-summary">
                <div className="hbar-app-ui-agent-approval-diff-status">
                  <StateMark state={outcome ? 'skipped' : 'needs-approval'} />
                  <span>{outcome?.status ?? content.labels.status}</span>
                </div>
                <h2>{content.title}</h2>
                <p>{content.description}</p>
                <dl className="hbar-app-ui-agent-approval-change-list">
                  {changes.map((change) => (
                    <div key={change.id}>
                      <dt>{change.label}</dt>
                      <dd>
                        <span>{change.previousValue}</span>
                        <svg className="hbar-app-ui-agent-approval-diff-arrow" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                        <span>{change.nextValue}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="hbar-app-ui-agent-approval-diff-actions">
                {outcome ? (
                  <div className="hbar-app-ui-agent-approval-diff-result">
                    <StateMark state="skipped" />
                    <p>{outcome.summary}</p>
                  </div>
                ) : (
                  <React.Fragment>
                    <div className="hbar-app-ui-agent-approval-diff-buttons">
                      <LumenButton
                        variant="text"
                        aria-expanded={open}
                        onClick={() => {
                          setOpen((value) => !value)
                          report(onAction, 'toggle-diff-details')
                        }}
                      >
                        <svg className="hbar-app-ui-agent-approval-diff-arrow" viewBox="0 0 24 24" aria-hidden="true">
                          <path d={open ? 'm6 9 6 6 6-6' : 'm9 18 6-6-6-6'} />
                        </svg>
                        {open ? content.labels.hideDiff : content.labels.showDiff}
                      </LumenButton>
                      <div>
                        <LumenButton variant="outlined" disabled={disabled} onClick={() => decide('rejected')}>
                          {content.labels.reject}
                        </LumenButton>
                        <LumenButton variant="outlined" disabled={disabled} onClick={() => decide('always-allow')}>
                          {content.labels.alwaysAllow}
                        </LumenButton>
                        <LumenButton disabled={disabled} onClick={() => decide('approved')}>
                          {content.labels.approve}
                        </LumenButton>
                      </div>
                    </div>
                    {open ? (
                      <pre tabIndex={0} className="hbar-app-ui-agent-approval-diff-payload">
                        {content.diffText}
                      </pre>
                    ) : null}
                  </React.Fragment>
                )}
              </div>
            </LumenSurface>
          </div>
        </main>
        <div
          aria-hidden="true"
          className="hbar-app-ui-agent-approval-scroll-overlay is-top"
          data-visible={scrollEdges.top}
        />
        <div
          aria-hidden="true"
          className="hbar-app-ui-agent-approval-scroll-overlay is-bottom"
          data-visible={scrollEdges.bottom}
        />
      </div>
      <div className="hbar-app-ui-agent-approval-inline-announcement" aria-live="polite">
        {outcome?.announcement}
      </div>
    </ApprovalRoot>
  )
}

function QueueRow({ item }: { readonly item: LumenAgentApprovalQueueItem }) {
  return (
    <li data-hbar-app-ui-item-id={item.id} data-hbar-app-ui-state={item.state}>
      <div className="hbar-app-ui-agent-approval-queue-compact-row">
        <StateMark state={item.state} />
        <p>{item.title}</p>
        <span className="hbar-app-ui-agent-approval-queue-row-status">{item.stateLabel}</span>
        <span className="hbar-app-ui-agent-approval-queue-row-time">{item.when}</span>
      </div>
    </li>
  )
}

function QueueRequest({
  item,
  content,
  onAction,
}: {
  readonly item: LumenAgentApprovalQueueItem
  readonly content: LumenAgentApprovalQueueContent
  readonly onAction: LumenAgentApprovalProps['onAction']
}) {
  const [open, setOpen] = React.useState(false)
  const decide = (value: 'approved' | 'rejected') => {
    if (content.busyId === item.id) return
    content.onDecision(item.id, value)
    report(onAction, value === 'approved' ? 'approve-queue-item' : 'reject-queue-item', item.id)
  }
  return (
    <li data-hbar-app-ui-item-id={item.id} data-hbar-app-ui-state="needs-approval">
      <div className="hbar-app-ui-agent-approval-queue-featured">
        <div className="hbar-app-ui-agent-approval-queue-summary">
          <div className="hbar-app-ui-agent-approval-queue-status">
            <StateMark state="needs-approval" />
            <span>{content.labels.status}</span>
          </div>
          <p className="hbar-app-ui-agent-approval-queue-title">{item.title}</p>
          <p>{item.detail}</p>
        </div>
        <div className="hbar-app-ui-agent-approval-queue-actions">
          <div className="hbar-app-ui-agent-approval-queue-buttons">
            {item.expandable && item.requestText !== undefined ? (
              <LumenButton
                variant="text"
                aria-expanded={open}
                data-hbar-app-ui-action="toggle-queue-request"
                onClick={() => {
                  setOpen((value) => !value)
                  report(onAction, 'toggle-queue-request', item.id)
                }}
              >
                <ApprovalGlyph name={open ? 'chevron-down' : 'chevron'} />
                {open ? content.labels.hideRequest : content.labels.showRequest}
              </LumenButton>
            ) : null}
            <div>
              <LumenButton
                variant="outlined"
                disabled={content.busyId === item.id}
                data-hbar-app-ui-action="reject-queue-item"
                onClick={() => decide('rejected')}
              >
                {content.labels.reject}
              </LumenButton>
              <LumenButton
                tone="primary"
                disabled={content.busyId === item.id}
                data-hbar-app-ui-action="approve-queue-item"
                onClick={() => decide('approved')}
              >
                {content.labels.approve}
              </LumenButton>
            </div>
          </div>
          {open && item.expandable && item.requestText !== undefined ? (
            <pre tabIndex={0} className="hbar-app-ui-agent-approval-queue-payload">
              {item.requestText}
            </pre>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function QueueApproval(props: Omit<LumenAgentApprovalProps, 'content'> & { content: LumenAgentApprovalQueueContent }) {
  const { content, onAction } = props
  const pending = React.useMemo(() => uniqueLumenAgentApprovalItems(content.pending), [content.pending])
  const rows = uniqueLumenAgentApprovalItems([...pending, ...content.history])
  const waiting = pending.filter((item) => item.state === 'needs-approval' || item.state === 'queued')
  const first = waiting[0]
  const { scrollPane, scrollEdges } = useApprovalScrollEdges()
  return (
    <ApprovalRoot {...props} className="hbar-app-ui-agent-approval-queue">
      <header className="hbar-app-ui-agent-approval-queue-heading" role="banner">
        <LumenText as="h2" variant="heading">
          {content.labels.title}
        </LumenText>
        <span>
          <StateMark state={waiting.length > 0 ? 'needs-approval' : 'skipped'} />
          {content.labels.waiting(waiting.length)}
        </span>
      </header>
      <div className="hbar-app-ui-agent-approval-queue-scroll-frame">
        <div
          ref={scrollPane}
          className="hbar-app-ui-agent-approval-queue-pane"
          data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        >
          <ul>
            {rows.map((item) =>
              item.id !== first?.id ? (
                <QueueRow item={item} key={item.id} />
              ) : (
                <QueueRequest item={item} content={content} onAction={onAction} key={item.id} />
              ),
            )}
          </ul>
        </div>
        <div
          aria-hidden="true"
          className="hbar-app-ui-agent-approval-scroll-overlay is-top"
          data-visible={scrollEdges.top}
        />
        <div
          aria-hidden="true"
          className="hbar-app-ui-agent-approval-scroll-overlay is-bottom"
          data-visible={scrollEdges.bottom}
        />
      </div>
      <span className="hbar-app-ui-agent-approval-inline-announcement" aria-live="polite">
        {content.announcement}
      </span>
    </ApprovalRoot>
  )
}

function PermissionApproval(
  props: Omit<LumenAgentApprovalProps, 'content'> & {
    content: LumenAgentApprovalPermissionContent
  },
) {
  const { content, onAction } = props
  const scopes = React.useMemo(() => uniqueLumenAgentApprovalItems(content.scopes), [content.scopes])
  const [open, setOpen] = React.useState(false)
  const { scrollPane, scrollEdges } = useApprovalScrollEdges()
  const selected = scopes.filter((scope) => scope.checked).length
  const outcome = content.state === 'pending' ? undefined : content.outcomes[content.state]
  const disabled = Boolean(content.busy) || content.state !== 'pending'
  const state = content.state === 'pending' ? 'needs-approval' : content.state === 'approved' ? 'approved' : 'skipped'
  const decide = (decision: 'approved' | 'rejected') => {
    if (disabled || (decision === 'approved' && selected === 0)) return
    content.onDecision(content.requestId, decision)
    report(onAction, decision === 'approved' ? 'approve-permission' : 'reject-permission', content.requestId)
  }
  return (
    <ApprovalRoot {...props} className="hbar-app-ui-agent-approval-permission">
      <header className="hbar-app-ui-agent-approval-permission-heading" role="banner">
        <LumenText as="h2" variant="heading">
          {content.labels.title}
        </LumenText>
        <span>{content.labels.agent}</span>
      </header>
      <div className="hbar-app-ui-agent-approval-permission-scroll-frame">
        <main ref={scrollPane} className="hbar-app-ui-agent-approval-permission-scroll">
          <LumenSurface
            as="section"
            aria-label={content.requestTitle}
            boundary="none"
            className="hbar-app-ui-agent-approval-permission-card"
            contentClassName="hbar-app-ui-agent-approval-permission-flow"
            material="frost"
          >
            <div className="hbar-app-ui-agent-approval-permission-summary">
              <div className="hbar-app-ui-agent-approval-permission-status">
                <StateMark state={state} />
                <span>{outcome?.status ?? content.labels.status}</span>
              </div>
              <LumenText as="h3" variant="heading">
                {content.requestTitle}
              </LumenText>
              <p>{content.description}</p>
            </div>
            <div
              className="hbar-app-ui-agent-approval-scope-list"
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}
              data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
            >
              <p className="hbar-app-ui-agent-approval-scope-heading">{content.labels.scopes}</p>
              <div>
                {scopes.map((scope) => (
                  <LumenCheckBox
                    key={scope.id}
                    label={scope.title}
                    description={scope.description}
                    checked={scope.checked}
                    disabled={disabled}
                    data-hbar-app-ui-scope-id={scope.id}
                    onChange={(event) => {
                      if (disabled) return
                      content.onScopeChange(content.requestId, scope.id, event.currentTarget.checked)
                      report(onAction, 'toggle-permission-scope', scope.id)
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="hbar-app-ui-agent-approval-permission-actions">
              {outcome ? (
                <div className="hbar-app-ui-agent-approval-permission-result">
                  <StateMark state={state} />
                  <p>{outcome.summary(selected, scopes.length)}</p>
                </div>
              ) : (
                <React.Fragment>
                  <div className="hbar-app-ui-agent-approval-permission-buttons">
                    <LumenButton
                      variant="text"
                      aria-expanded={open}
                      onClick={() => {
                        setOpen((value) => !value)
                        report(onAction, 'toggle-permission-request')
                      }}
                    >
                      <ApprovalGlyph name={open ? 'chevron-down' : 'chevron'} />
                      {open ? content.labels.hideRequest : content.labels.showRequest}
                    </LumenButton>
                    <span className="hbar-app-ui-agent-approval-permission-expiry">
                      <span>{content.labels.expires}</span>
                      <span>{content.expiry}</span>
                    </span>
                    <div>
                      <LumenButton variant="outlined" disabled={disabled} onClick={() => decide('rejected')}>
                        {content.labels.reject}
                      </LumenButton>
                      <LumenButton
                        tone="primary"
                        disabled={disabled || selected === 0}
                        onClick={() => decide('approved')}
                      >
                        {content.labels.approve}
                      </LumenButton>
                    </div>
                  </div>
                  {open ? (
                    <pre tabIndex={0} className="hbar-app-ui-agent-approval-permission-payload">
                      {content.requestText}
                    </pre>
                  ) : null}
                </React.Fragment>
              )}
            </div>
          </LumenSurface>
        </main>
        <div
          aria-hidden="true"
          className="hbar-app-ui-agent-approval-scroll-overlay is-top"
          data-visible={scrollEdges.top}
        />
        <div
          aria-hidden="true"
          className="hbar-app-ui-agent-approval-scroll-overlay is-bottom"
          data-visible={scrollEdges.bottom}
        />
      </div>
      <span className="hbar-app-ui-agent-approval-inline-announcement" aria-live="polite">
        {outcome?.announcement(selected)}
      </span>
    </ApprovalRoot>
  )
}

function CostApproval(props: Omit<LumenAgentApprovalProps, 'content'> & { content: LumenAgentApprovalCostContent }) {
  const { content, onAction } = props
  const metrics = uniqueLumenAgentApprovalItems(content.metrics)
  const [open, setOpen] = React.useState(false)
  const outcome = content.state === 'pending' ? undefined : content.outcomes[content.state]
  const state = content.state === 'pending' ? 'needs-approval' : content.state === 'approved' ? 'approved' : 'skipped'
  const decide = (decision: 'approved' | 'rejected') => {
    if (content.busy || content.state !== 'pending') return
    content.onDecision(content.requestId, decision)
    report(onAction, decision === 'approved' ? 'approve-cost' : 'reject-cost', content.requestId)
  }
  return (
    <ApprovalRoot {...props} className="hbar-app-ui-agent-approval-cost">
      <LumenSurface
        as="section"
        aria-label={content.labels.title}
        boundary="none"
        material="frost"
        className="hbar-app-ui-agent-approval-cost-card"
        contentClassName="hbar-app-ui-agent-approval-cost-flow"
      >
        <div className="hbar-app-ui-agent-approval-cost-summary">
          <div className="hbar-app-ui-agent-approval-cost-heading">
            <StateMark state={state} />
            <span>{outcome?.status ?? content.labels.badge}</span>
            <span>{content.labels.agent}</span>
          </div>
          <LumenText as="h2" variant="heading">
            {content.labels.title}
          </LumenText>
          {content.description ? <p>{content.description}</p> : null}
        </div>
        <div className="hbar-app-ui-agent-approval-cost-details">
          <dl
            className="hbar-app-ui-agent-approval-cost-metrics"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
          >
            {metrics.map((metric) => (
              <div key={metric.id}>
                <dt>{metric.label}</dt>
                <dd>{metric.value}</dd>
                <dd>{metric.detail}</dd>
              </div>
            ))}
          </dl>
          <div className="hbar-app-ui-agent-approval-cost-projected">
            <div>
              <span>{content.labels.projected}</span>
              <span>{content.projectedValue}</span>
            </div>
            <ApprovalProgress value={content.progress} />
          </div>
        </div>
        <div className="hbar-app-ui-agent-approval-cost-actions">
          {outcome ? (
            <div className="hbar-app-ui-agent-approval-cost-result">
              <StateMark state={state} />
              <p>{outcome.summary}</p>
            </div>
          ) : (
            <React.Fragment>
              <div className="hbar-app-ui-agent-approval-cost-buttons">
                <LumenButton
                  variant="text"
                  aria-expanded={open}
                  onClick={() => {
                    setOpen((value) => !value)
                    report(onAction, 'toggle-cost-request', content.requestId)
                  }}
                >
                  <ApprovalGlyph name={open ? 'chevron-down' : 'chevron'} />
                  {open ? content.labels.hideRequest : content.labels.showRequest}
                </LumenButton>
                <div>
                  <LumenButton variant="outlined" disabled={content.busy} onClick={() => decide('rejected')}>
                    {content.labels.reject}
                  </LumenButton>
                  <LumenButton tone="primary" disabled={content.busy} onClick={() => decide('approved')}>
                    {content.labels.approve}
                  </LumenButton>
                </div>
              </div>
              {open ? (
                <pre tabIndex={0} className="hbar-app-ui-agent-approval-cost-payload">
                  {content.requestText}
                </pre>
              ) : null}
            </React.Fragment>
          )}
        </div>
      </LumenSurface>
      <span className="hbar-app-ui-agent-approval-inline-announcement" aria-live="polite">
        {outcome?.announcement}
      </span>
    </ApprovalRoot>
  )
}

function HistoryApproval(
  props: Omit<LumenAgentApprovalProps, 'content'> & { content: LumenAgentApprovalHistoryContent },
) {
  const { content, onAction } = props
  const filters = React.useMemo(() => uniqueLumenAgentApprovalItems(content.filters), [content.filters])
  const entries = React.useMemo(() => uniqueLumenAgentApprovalItems(content.entries), [content.entries])
  const { scrollPane, scrollEdges } = useApprovalScrollEdges()
  const searchId = React.useId()
  const activeFilter = selectLumenAgentApprovalItem(filters, content.activeFilterId)
  const normalized = content.query.trim().toLocaleLowerCase()
  const visible = entries.filter(
    (entry) =>
      (!activeFilter || entry.filterIds.includes(activeFilter.id)) &&
      (!normalized || `${entry.title} ${entry.detail}`.toLocaleLowerCase().includes(normalized)),
  )
  return (
    <ApprovalRoot {...props} className="hbar-app-ui-agent-approval-history">
      <header className="hbar-app-ui-agent-approval-history-heading" role="banner">
        <h2>{content.labels.title}</h2>
        <LumenButton
          variant="outlined"
          onClick={() => {
            content.onExport?.(content.historyId)
            report(onAction, 'export-approval-history', content.historyId)
          }}
        >
          <ApprovalGlyph name="download" />
          {content.labels.export}
        </LumenButton>
      </header>
      <div className="hbar-app-ui-agent-approval-history-toolbar">
        <div className="hbar-app-ui-agent-approval-history-search">
          <ApprovalGlyph name="search" />
          <label htmlFor={searchId} className="hbar-app-ui-agent-approval-history-search-label">
            {content.labels.searchLabel}
          </label>
          <LumenInput
            id={searchId}
            variant="plain"
            placeholder={content.searchPlaceholder}
            value={content.query}
            onChange={(event) => {
              content.onQueryChange?.(content.historyId, event.currentTarget.value)
              report(onAction, 'search-approval-history', event.currentTarget.value)
            }}
          />
        </div>
        <div className="hbar-app-ui-agent-approval-history-filters">
          {filters.map((filter) => (
            <LumenButton
              aria-pressed={filter.id === activeFilter?.id}
              variant={filter.id === activeFilter?.id ? 'solid' : 'text'}
              key={filter.id}
              onClick={() => {
                content.onFilterChange?.(content.historyId, filter.id)
                report(onAction, 'filter-approval-history', filter.id)
              }}
            >
              {filter.label}
            </LumenButton>
          ))}
        </div>
      </div>
      <div className="hbar-app-ui-agent-approval-history-scroll-frame">
        <div
          ref={scrollPane}
          className="hbar-app-ui-agent-approval-history-pane"
          data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        >
          {visible.length ? (
            <ul>
              {visible.map((entry) => (
                <li key={entry.id}>
                  <span aria-hidden="true" className="hbar-app-ui-agent-approval-history-dot" />
                  <div className="hbar-app-ui-agent-approval-history-copy">
                    <p>{entry.title}</p>
                    <p>{entry.detail}</p>
                  </div>
                  <span className="hbar-app-ui-agent-approval-history-state" data-state={entry.state}>
                    {entry.stateLabel}
                  </span>
                  <span className="hbar-app-ui-agent-approval-history-time">{entry.when}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="hbar-app-ui-agent-approval-history-empty">
              <p>{content.labels.emptyTitle}</p>
              <p>{content.labels.emptyDescription}</p>
              <LumenButton
                onClick={() => {
                  content.onClearFilters?.(content.historyId)
                  report(onAction, 'clear-approval-history-filters', content.historyId)
                }}
              >
                {content.labels.clearFilters}
              </LumenButton>
            </div>
          )}
        </div>
        <div
          aria-hidden="true"
          className="hbar-app-ui-agent-approval-scroll-overlay is-top"
          data-visible={scrollEdges.top}
        />
        <div
          aria-hidden="true"
          className="hbar-app-ui-agent-approval-scroll-overlay is-bottom"
          data-visible={scrollEdges.bottom}
        />
      </div>
    </ApprovalRoot>
  )
}

export function LumenAgentApproval(props: LumenAgentApprovalProps) {
  const contextualContent = useLumenAgentApprovalContent()
  if (props.controlled) return <ApprovalRoot {...props}>{props.controlled.body}</ApprovalRoot>
  const content = props.content ?? contextualContent
  let view: React.ReactNode = null
  if (props.variant === 1 && content?.inline) view = <InlineApproval {...props} content={content.inline} />
  if (props.variant === 2 && content?.diff) view = <DiffApproval {...props} content={content.diff} />
  if (props.variant === 3 && content?.queue) view = <QueueApproval {...props} content={content.queue} />
  if (props.variant === 4 && content?.permission)
    view = <PermissionApproval {...props} content={content.permission} key={content.permission.requestId} />
  if (props.variant === 5 && content?.cost)
    view = <CostApproval {...props} content={content.cost} key={content.cost.requestId} />
  if (props.variant === 6 && content?.history) view = <HistoryApproval {...props} content={content.history} />
  return (
    <ApprovalPresentationContext.Provider
      key={content?.presentation?.ownerId ?? props.variantId}
      value={content?.presentation}
    >
      {view ?? (
        <ApprovalRoot {...props} className="hbar-app-ui-agent-approval-empty">
          {null}
        </ApprovalRoot>
      )}
    </ApprovalPresentationContext.Provider>
  )
}

function createAgentApprovalVariant(variant: number) {
  function Component(props: LumenAgentApprovalVariantProps) {
    return <LumenAgentApproval {...props} variant={variant} variantId={`hbar-app-ui-agent-approval-${variant}`} />
  }
  Component.displayName = `LumenAgentApproval${String(variant).padStart(2, '0')}`
  return Component
}

export const LumenAgentApproval01 = createAgentApprovalVariant(1)

export const LumenAgentApproval02 = createAgentApprovalVariant(2)

export const LumenAgentApproval03 = createAgentApprovalVariant(3)

export const LumenAgentApproval04 = createAgentApprovalVariant(4)

export const LumenAgentApproval05 = createAgentApprovalVariant(5)

export const LumenAgentApproval06 = createAgentApprovalVariant(6)
