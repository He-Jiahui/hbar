import { HbarComposerFeedback } from './composer-feedback'
import {
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenContentText,
  LumenDisclosure,
  LumenFrame,
  LumenIcon,
  LumenFloatingSurface,
} from '@lumen/app-ui'
import { useEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { ScrollText } from 'lucide-react'
import type {
  ContextCompactionMarker,
  ContextCompactionRecord,
  ContextCompactionTrigger,
  ContextHistoryPage,
  ContextWindowStats,
} from '@hbar/contracts/context-history'
import type { SessionTimelineState } from '@hbar/app-runtime'
import { HbarSessionExecutionStatus } from './session-execution-status'
import { useSessionClock } from './session-tool-clock'
import './session-context-history.css'

export interface ContextHistoryMetric {
  readonly id: string
  readonly label: string
  readonly value: string
}
/** Host owns all locale formatting. Ten records per page; the session details pane owns scrolling. */
export interface HbarContextHistoryLabels {
  readonly notice: string
  readonly offline: string
  readonly compacted: (trigger: ContextCompactionTrigger | null) => string
  readonly elapsed: (durationMs: number) => string
  readonly completed: (marker: ContextCompactionMarker) => string
  readonly detailsLabel: string
  readonly activeDetails: (record: ContextCompactionRecord) => readonly [string, string]
  readonly completedDetails: (marker: ContextCompactionMarker) => readonly [string, string]
  readonly title: string
  readonly current: string
  readonly empty: string
  readonly estimates: string
  readonly accounting: string
  readonly fileAccounting: string
  readonly older: string
  readonly latest: string
  readonly loading: string
  readonly retry: string
  readonly error: (message: string) => string
  readonly record: (value: ContextCompactionRecord) => string
  readonly summary: (value: ContextCompactionRecord) => string
  readonly metrics: (value: ContextWindowStats) => readonly ContextHistoryMetric[]
  readonly compactionMetrics: (value: ContextCompactionRecord) => readonly ContextHistoryMetric[]
}

/** Two content-grown detail lines; shared Lumen owns the portal, viewport and dismissal. */
function CompactionHint({
  identity,
  label,
  details,
  children,
  ...attributes
}: HTMLAttributes<HTMLDivElement> & {
  readonly identity: string
  readonly label: string
  readonly details: readonly [string, string]
  readonly children: ReactNode
}) {
  const anchor = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const tooltipId = useId()
  const [preview, setPreview] = useState<string | null>(null)
  const open = preview === identity
  const cancelClose = () => {
    if (closing.current) clearTimeout(closing.current)
    closing.current = undefined
  }
  const reveal = () => {
    cancelClose()
    setPreview(identity)
  }
  const close = () => {
    cancelClose()
    setPreview(null)
  }
  const leave = (target: EventTarget | null) => {
    if (target instanceof Node && (anchor.current?.contains(target) || surface.current?.contains(target))) return
    // A short handoff lets the pointer cross the shared surface's anchor gap.
    cancelClose()
    closing.current = setTimeout(close, 150)
  }
  useEffect(
    () => () => {
      if (closing.current) clearTimeout(closing.current)
    },
    [],
  )
  return (
    <>
      <LumenFrame
        {...attributes}
        ref={anchor}
        tabIndex={0}
        aria-describedby={open ? tooltipId : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'touch') reveal()
        }}
        onPointerLeave={(event) => {
          if (!anchor.current?.contains(document.activeElement)) leave(event.relatedTarget)
        }}
        onFocus={reveal}
        onBlur={(event) => leave(event.relatedTarget)}
      >
        {children}
      </LumenFrame>
      <LumenFloatingSurface
        id={tooltipId}
        role="tooltip"
        label={label}
        open={open}
        onClose={close}
        anchorRef={anchor}
        contentRef={surface}
        placement="above"
        focusBehavior="preserve"
        trapFocus={false}
        restoreFocus={false}
        className="hbar-context-compaction-details"
        onPointerEnter={reveal}
        onPointerLeave={(event) => leave(event.relatedTarget)}
      >
        {details.map((line, index) => (
          <LumenContentText key={index} context="popover.body">
            {line}
          </LumenContentText>
        ))}
      </LumenFloatingSurface>
    </>
  )
}

export function HbarContextCompactionNotice({
  record,
  sessionId,
  owned,
  connected,
  labels,
}: {
  readonly record: ContextCompactionRecord | null | undefined
  readonly sessionId: string
  readonly owned: boolean
  readonly connected: boolean
  readonly labels: HbarContextHistoryLabels
}) {
  const active = owned && record?.sessionId === sessionId && record.status === 'running'
  const now = useSessionClock(active && connected)
  if (!owned || record?.sessionId !== sessionId || record.status !== 'running') return null
  const elapsedMs = Math.max(0, (now || record.startedAt) - record.startedAt)
  return (
    <HbarComposerFeedback priority="blocking">
    <CompactionHint
      identity={record.id}
      label={labels.detailsLabel}
      details={labels.activeDetails(record)}
      className="hbar-context-compaction-notice"
      role="status"
      aria-live="polite"
      aria-atomic="false"
      data-context-compaction={record.id}
      data-session-id={sessionId}
      data-connected={connected}
    >
      <HbarSessionExecutionStatus
        state={connected ? 'running' : 'unconfirmed'}
        label={connected ? labels.notice : labels.offline}
        tone="warning"
      />
      {connected && (
        <LumenContentText context="control.status" aria-live="off" data-context-compaction-elapsed={elapsedMs}>
          {labels.elapsed(elapsedMs)}
        </LumenContentText>
      )}
    </CompactionHint>
    </HbarComposerFeedback>
  )
}

/** A content-grown row in the pane-owned conversation; durable facts supply identity and provenance. */
export function HbarContextCompactionMarker({
  marker,
  sessionId,
  labels,
}: {
  readonly marker: ContextCompactionMarker
  readonly sessionId: string
  readonly labels: Pick<HbarContextHistoryLabels, 'completed' | 'detailsLabel' | 'completedDetails'>
}) {
  if (marker.sessionId !== sessionId) return null
  return (
    <CompactionHint
      identity={marker.id}
      label={labels.detailsLabel}
      details={labels.completedDetails(marker)}
      className="hbar-context-compaction-marker"
      data-context-compaction-marker={marker.id}
      data-session-id={sessionId}
      data-trigger={marker.trigger ?? 'unknown'}
    >
      <LumenIcon icon={ScrollText} tier="sm" />
      <LumenContentText context="record.description">{labels.completed(marker)}</LumenContentText>
    </CompactionHint>
  )
}

function Metrics({ rows }: { readonly rows: readonly ContextHistoryMetric[] }) {
  return (
    <LumenCollection as="dl" className="hbar-context-history-metrics">
      {rows.map((row) => (
        <LumenFrame key={row.id} className="hbar-context-history-metric">
          <LumenCollectionItem as="dt">{row.label}</LumenCollectionItem>
          <LumenCollectionItem as="dd">{row.value}</LumenCollectionItem>
        </LumenFrame>
      ))}
    </LumenCollection>
  )
}

export function HbarContextHistory({
  sessionId,
  page,
  status = 'idle',
  error,
  before,
  labels,
  onLoad,
  onRetry,
}: {
  readonly sessionId: string
  readonly page: ContextHistoryPage | undefined
  readonly status?: SessionTimelineState['contextHistoryStatus']
  readonly error: string | null | undefined
  readonly before: number | null | undefined
  readonly labels: HbarContextHistoryLabels
  readonly onLoad: (before?: number) => void
  readonly onRetry?: () => void
}) {
  if (page?.sessionId !== sessionId) return null
  const records = [
    ...new Map(
      page.records.filter((record) => record.sessionId === sessionId).map((record) => [record.id, record]),
    ).values(),
  ].slice(0, 20)
  return (
    <LumenFrame
      as="section"
      className="hbar-context-history"
      aria-label={labels.title}
      data-context-history-session={sessionId}
    >
      <LumenContentText context="section.subtitle">{labels.title}</LumenContentText>
      <LumenDisclosure className="hbar-context-history-row" data-context-window="current" summary={labels.current}>
        <Metrics rows={labels.metrics(page.current)} />
      </LumenDisclosure>
      {records.map((record) => (
        <LumenDisclosure
          key={record.id}
          className="hbar-context-history-row"
          data-context-history-id={record.id}
          data-status={record.status}
          summary={
            <>
              <LumenContentText context="record.title">{labels.record(record)}</LumenContentText>
              <LumenContentText context="record.description">{labels.summary(record)}</LumenContentText>
            </>
          }
        >
          <Metrics rows={[...labels.compactionMetrics(record), ...labels.metrics(record.stats)]} />
        </LumenDisclosure>
      ))}
      {!records.length && <LumenContentText context="section.description">{labels.empty}</LumenContentText>}
      <LumenContentText context="section.description">{labels.estimates}</LumenContentText>
      <LumenContentText context="section.description">{labels.accounting}</LumenContentText>
      <LumenContentText context="section.description">{labels.fileAccounting}</LumenContentText>
      {error && (
        <LumenContentText context="section.description" role="alert">
          {labels.error(error)}
        </LumenContentText>
      )}
      <LumenFrame className="hbar-context-history-actions">
        {page.hasOlder && page.before !== null && (
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            disabled={status === 'loading'}
            onClick={() => onLoad(page.before ?? undefined)}
          >
            {labels.older}
          </LumenButton>
        )}
        {Boolean(before) && (
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            disabled={status === 'loading'}
            onClick={() => onLoad()}
          >
            {labels.latest}
          </LumenButton>
        )}
        {error && (
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            disabled={status === 'loading'}
            onClick={() => (onRetry ? onRetry() : onLoad(before ?? undefined))}
          >
            {labels.retry}
          </LumenButton>
        )}
        {status === 'loading' && (
          <LumenContentText context="control.status" role="status">
            {labels.loading}
          </LumenContentText>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}
