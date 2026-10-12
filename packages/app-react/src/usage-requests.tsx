import {
  LumenContentText,
  LumenButton,
  LumenFrame,
  LumenUsage07,
  type LumenUsageContent,
  type LumenUsageRequestRecord,
} from '@lumen/app-ui'
import type { UsageRequestsRuntime, UsageRequestItem } from '@hbar/app-runtime'
import type { UsageSource } from '@hbar/contracts/usage'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createMessageScope } from './messages'

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
export interface HbarUsageRequestsMessages {
  readonly title: string
  readonly description: string
  readonly request: string
  readonly timeLabel: string
  readonly filterOptions: HbarUsageRequestsLabels['filterOptions']
  readonly model: string
  readonly tokens: string
  readonly latency: string
  readonly cost: string
  readonly empty: string
  readonly open: string
  readonly previous: string
  readonly next: string
  readonly retry: string
  readonly error: HbarUsageRequestsLabels['error']
  readonly page: HbarUsageRequestsLabels['page']
  readonly time: HbarUsageRequestsLabels['time']
  readonly tokenCount: HbarUsageRequestsLabels['tokenCount']
  readonly duration: HbarUsageRequestsLabels['duration']
  readonly costValue: HbarUsageRequestsLabels['costValue']
  readonly status: HbarUsageRequestsLabels['status']
  readonly source: HbarUsageRequestsLabels['source']
  readonly detailAttempt: string
  readonly detailSession: string
  readonly detailProvider: string
  readonly detailSource: string
  readonly detailStatus: string
}
export const HbarUsageRequestsMessageScope = createMessageScope<HbarUsageRequestsMessages>()
export function createHbarUsageRequestsMessages(labels: HbarUsageRequestsLabels): HbarUsageRequestsMessages {
  return {
    title: labels.title,
    description: labels.description,
    request: labels.request,
    timeLabel: labels.timeLabel,
    filterOptions: labels.filterOptions,
    model: labels.model,
    tokens: labels.tokens,
    latency: labels.latency,
    cost: labels.cost,
    empty: labels.empty,
    open: labels.open,
    previous: labels.previous,
    next: labels.next,
    retry: labels.retry,
    error: labels.error,
    page: labels.page,
    time: labels.time,
    tokenCount: labels.tokenCount,
    duration: labels.duration,
    costValue: labels.costValue,
    status: labels.status,
    source: labels.source,
    detailAttempt: labels.detail.attempt,
    detailSession: labels.detail.session,
    detailProvider: labels.detail.provider,
    detailSource: labels.detail.source,
    detailStatus: labels.detail.status,
  }
}
export type HbarUsageRequestsViewProps = Omit<HbarUsageRequestsProps, 'labels'>

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

export function HbarUsageRequests(props: HbarUsageRequestsProps) {
  const { runtime, labels, ...viewProps } = props
  return (
    <HbarUsageRequestsMessageScope.Provider messages={createHbarUsageRequestsMessages(labels)}>
      <HbarUsageRequestsView runtime={runtime} {...viewProps} />
    </HbarUsageRequestsMessageScope.Provider>
  )
}

export function HbarUsageRequestsView({ runtime, onOpenRequest, managed = false }: HbarUsageRequestsViewProps) {
  const { t } = HbarUsageRequestsMessageScope.useMessages()
  const labels = useMemo<HbarUsageRequestsLabels>(
    () => ({
      title: t('title'),
      description: t('description'),
      request: t('request'),
      timeLabel: t('timeLabel'),
      filterOptions: t('filterOptions'),
      model: t('model'),
      tokens: t('tokens'),
      latency: t('latency'),
      cost: t('cost'),
      empty: t('empty'),
      open: t('open'),
      previous: t('previous'),
      next: t('next'),
      retry: t('retry'),
      error: t('error'),
      page: t('page'),
      time: t('time'),
      tokenCount: t('tokenCount'),
      duration: t('duration'),
      costValue: t('costValue'),
      status: t('status'),
      source: t('source'),
      detail: {
        attempt: t('detailAttempt'),
        session: t('detailSession'),
        provider: t('detailProvider'),
        source: t('detailSource'),
        status: t('detailStatus'),
      },
    }),
    [t],
  )
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
      <LumenFrame>
        <LumenContentText context="feedback.message" role="alert">
          {labels.error(queryError)}
        </LumenContentText>
        <LumenButton type="button" variant="text" onClick={() => void runtime.refresh()}>
          {labels.retry}
        </LumenButton>
      </LumenFrame>
    )
  return (
    <LumenFrame>
      {actionError ? (
        <LumenContentText context="feedback.message" role="alert">
          {labels.error(actionError)}
        </LumenContentText>
      ) : null}
      <LumenUsage07 content={content} state={snapshot.status} />
    </LumenFrame>
  )
}
