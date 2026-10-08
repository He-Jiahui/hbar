import {
  LumenButton,
  LumenContentText,
  LumenFrame,
  LumenUsage07,
  type LumenUsageContent,
  type LumenUsageRequestRecord,
} from '@lumen/app-ui'
import type { UsageRequestsRuntime, UsageRequestItem } from '@hbar/app-runtime'
import type { UsageSource } from '@hbar/contracts/usage'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import './usage-feedback.css'

export interface HbarUsageRequestsLabels {
  readonly title: string
  readonly description: string
  readonly request: string
  readonly timeLabel: string
  readonly filterOptions: readonly { readonly id: 'all' | UsageSource; readonly label: string }[]
  readonly model: string
  readonly tokens: string
  readonly latency: string
  readonly cost: string
  readonly empty: string
  readonly open: string
  readonly previous: string
  readonly next: string
  readonly retry: string
  readonly error: (code: string) => string
  readonly page: (from: number, to: number, total: number) => string
  readonly time: (value: number) => string
  readonly tokenCount: (value: number) => string
  readonly duration: (value: number | null) => string
  readonly costValue: (value: UsageRequestItem['cost']) => string
  readonly status: (value: UsageRequestItem['runStatus']) => string
  readonly source: (value: UsageRequestItem['source']) => string
  readonly detail: {
    readonly attempt: string
    readonly session: string
    readonly provider: string
    readonly source: string
    readonly status: string
  }
}

export interface HbarUsageRequestsProps {
  readonly runtime: UsageRequestsRuntime
  readonly managed?: boolean
  readonly labels: HbarUsageRequestsLabels
  readonly onOpenRequest?: (target: {
    readonly workspaceId: string
    readonly sessionId: string
    readonly runId: string | null
    readonly usageId: string
  }) => void | Promise<void>
}

function latency(item: UsageRequestItem): number | null {
  if (item.startedAt === null) return null
  return Math.max(0, item.endedAt - item.startedAt)
}

function status(item: UsageRequestItem): LumenUsageRequestRecord['status'] {
  if (item.runStatus === 'failed' || item.runStatus === 'cancelled') return 'error'
  if (
    item.runStatus === 'queued' ||
    item.runStatus === 'running' ||
    item.runStatus === 'waiting_approval' ||
    item.runStatus === 'guided' ||
    item.runStatus === 'interrupted'
  )
    return 'capped'
  return 'success'
}

export function HbarUsageRequests({ runtime, labels, onOpenRequest, managed = false }: HbarUsageRequestsProps) {
  const snapshot = useSyncExternalStore(
    runtime.reader.subscribe,
    runtime.reader.getSnapshot,
    runtime.reader.getSnapshot,
  )
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  useEffect(() => {
    if (!managed) void runtime.refresh().catch(() => undefined)
  }, [managed, runtime])
  const rows = useMemo<readonly LumenUsageRequestRecord[]>(
    () =>
      snapshot.items.map((item) => ({
        id: item.id,
        time: labels.time(item.endedAt),
        endpoint: labels.source(item.source),
        model: item.modelId,
        mobileSummary: labels.tokenCount(item.input + item.output),
        tokens: labels.tokenCount(item.input + item.output),
        latency: labels.duration(latency(item)),
        cost: labels.costValue(item.cost),
        status: status(item),
        details: [
          { id: 'attempt', label: labels.detail.attempt, value: item.attemptId },
          { id: 'session', label: labels.detail.session, value: item.sessionId },
          { id: 'provider', label: labels.detail.provider, value: item.providerId },
          { id: 'source', label: labels.detail.source, value: labels.source(item.source) },
          { id: 'status', label: labels.detail.status, value: labels.status(item.runStatus) },
        ],
      })),
    [labels, snapshot.items],
  )
  const content: LumenUsageContent = {
    requests: {
      title: labels.title,
      description: labels.description,
      strategy: 'content-grown',
      emptyLabel: labels.empty,
      rows: [],
      table: {
        rows,
        filter: {
          label: labels.request,
          value: snapshot.filters.source ?? 'all',
          options: labels.filterOptions,
          onChange: (value) => {
            const source = value === 'all' || (value !== 'model' && value !== 'compaction') ? undefined : value
            const filters = { ...snapshot.filters }
            delete filters.source
            void runtime.setScope(snapshot.scope, source ? { ...filters, source } : filters)
          },
        },
        expandedId,
        onToggle: (id) => setExpandedId((current) => (current === id ? null : id)),
        ...(onOpenRequest
          ? {
              openLabel: labels.open,
              onOpen: (id: string) => {
                const item = snapshot.items.find((candidate) => candidate.id === id)
                if (!item) return
                setActionError(null)
                void Promise.resolve()
                  .then(() =>
                    onOpenRequest({
                      workspaceId: item.workspaceId,
                      sessionId: item.sessionId,
                      runId: item.runId,
                      usageId: item.id,
                    }),
                  )
                  .catch(() => setActionError('EXECUTION_FAILED'))
              },
            }
          : {}),
        columns: {
          time: labels.timeLabel,
          request: labels.request,
          model: labels.model,
          tokens: labels.tokens,
          latency: labels.latency,
          cost: labels.cost,
        },
        emptyLabel: labels.empty,
        pagination:
          snapshot.hasMore || snapshot.items.length > 0
            ? {
                label: labels.page(1, snapshot.items.length, snapshot.items.length),
                previousLabel: labels.previous,
                nextLabel: labels.next,
                canPrevious: false,
                canNext: snapshot.hasMore && snapshot.status !== 'loading',
                onPrevious: () => undefined,
                onNext: () => void runtime.loadMore(),
              }
            : undefined,
      },
    },
  }
  const queryError = snapshot.error ?? 'EXECUTION_FAILED'
  if (snapshot.status === 'error')
    return (
      <LumenFrame as="section" aria-label={labels.title} className="hbar-usage-feedback">
        <LumenContentText context="feedback.paragraph" role="alert">
          {labels.error(queryError)}
        </LumenContentText>
        <LumenFrame role="group" aria-label={labels.retry} tabIndex={0} className="hbar-usage-feedback-actions">
          <LumenButton type="button" variant="text" onClick={() => void runtime.refresh()}>
            {labels.retry}
          </LumenButton>
        </LumenFrame>
      </LumenFrame>
    )
  return (
    <LumenFrame as="section" aria-label={labels.title} className="hbar-usage-feedback">
      {actionError ? (
        <LumenContentText context="feedback.paragraph" role="alert">
          {labels.error(actionError)}
        </LumenContentText>
      ) : null}
      <LumenUsage07 content={content} state={snapshot.status} />
    </LumenFrame>
  )
}
