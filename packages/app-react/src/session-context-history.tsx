import { LumenButton, LumenCollection, LumenCollectionItem, LumenContentText, LumenFrame } from '@lumen/app-ui'
import type { ContextCompactionRecord, ContextHistoryPage, ContextWindowStats } from '@hbar/contracts/context-history'
import type { SessionTimelineState } from '@hbar/app-runtime'
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
  if (!owned || record?.sessionId !== sessionId || record.status !== 'running') return null
  return (
    <LumenFrame
      className="hbar-context-compaction-notice"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-context-compaction={record.id}
      data-session-id={sessionId}
      data-connected={connected}
    >
      <LumenContentText context="record.title">{connected ? labels.notice : labels.offline}</LumenContentText>
      <LumenContentText context="record.description">{labels.summary(record)}</LumenContentText>
    </LumenFrame>
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
      <details className="hbar-context-history-row" data-context-window="current">
        <summary>{labels.current}</summary>
        <Metrics rows={labels.metrics(page.current)} />
      </details>
      {records.map((record) => (
        <details
          key={record.id}
          className="hbar-context-history-row"
          data-context-history-id={record.id}
          data-status={record.status}
        >
          <summary>
            <LumenContentText context="record.title">{labels.record(record)}</LumenContentText>
            <LumenContentText context="record.description">{labels.summary(record)}</LumenContentText>
          </summary>
          <Metrics rows={[...labels.compactionMetrics(record), ...labels.metrics(record.stats)]} />
        </details>
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
