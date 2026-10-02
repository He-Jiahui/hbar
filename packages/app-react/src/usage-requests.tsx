import { LumenText, LumenUsage07, type LumenUsageContent, type LumenUsageRequestRecord } from '@lumen/app-ui'
import type { UsageRequestsRuntime, UsageRequestItem } from '@hbar/app-runtime'
import { useEffect, useMemo, useState } from 'react'

export interface HbarUsageRequestsLabels {
  readonly title: string
  readonly description: string
  readonly request: string
  readonly model: string
  readonly tokens: string
  readonly latency: string
  readonly cost: string
  readonly empty: string
  readonly previous: string
  readonly next: string
  readonly page: (from: number, to: number, total: number) => string
  readonly time: (value: number) => string
  readonly tokenCount: (value: number) => string
  readonly duration: (value: number | null) => string
  readonly costValue: (value: UsageRequestItem['cost']) => string
  readonly status: (value: UsageRequestItem['runStatus']) => string
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
  readonly labels: HbarUsageRequestsLabels
  readonly onOpenRequest?: (target: { readonly sessionId: string; readonly runId: string | null; readonly usageId: string }) => void
}

function latency(item: UsageRequestItem): number | null {
  if (item.startedAt === null) return null
  return Math.max(0, item.endedAt - item.startedAt)
}

function status(item: UsageRequestItem): LumenUsageRequestRecord['status'] {
  if (item.runStatus === 'failed' || item.runStatus === 'cancelled') return 'error'
  if (item.runStatus === 'unknown' || item.runStatus === 'running' || item.runStatus === 'accepted') return 'capped'
  return 'success'
}

export function HbarUsageRequests({ runtime, labels, onOpenRequest }: HbarUsageRequestsProps) {
  const snapshot = runtime.reader.getSnapshot()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  useEffect(() => {
    void runtime.refresh()
    return () => runtime.dispose()
  }, [runtime])
  const rows = useMemo<readonly LumenUsageRequestRecord[]>(
    () => snapshot.items.map((item) => ({
      id: item.id,
      time: labels.time(item.endedAt),
      endpoint: item.source,
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
        { id: 'source', label: labels.detail.source, value: labels.status(item.runStatus) },
      ],
    })),
    [labels, snapshot.items],
  )
  const content: LumenUsageContent = {
    requests: {
      title: labels.title,
      description: labels.description,
      rows: [],
      table: {
        rows,
        filter: { label: labels.request, value: 'all', options: [{ id: 'all', label: labels.request }], onChange: () => undefined },
        expandedId,
        onToggle: (id) => {
          setExpandedId((current) => (current === id ? null : id))
          const item = snapshot.items.find((candidate) => candidate.id === id)
          if (item) onOpenRequest?.({ sessionId: item.sessionId, runId: item.runId, usageId: item.id })
        },
        columns: { time: labels.time(0), request: labels.request, model: labels.model, tokens: labels.tokens, latency: labels.latency, cost: labels.cost },
        emptyLabel: labels.empty,
        pagination: snapshot.hasMore || snapshot.items.length > 0 ? {
          label: labels.page(1, snapshot.items.length, snapshot.items.length),
          previousLabel: labels.previous,
          nextLabel: labels.next,
          canPrevious: false,
          canNext: snapshot.hasMore && snapshot.status !== 'loading',
          onPrevious: () => undefined,
          onNext: () => void runtime.loadMore(),
        } : undefined,
      },
    },
  }
  if (snapshot.status === 'error') return <LumenText as="p" role="alert">{snapshot.error}</LumenText>
  return <LumenUsage07 content={content} state={snapshot.status} />
}
