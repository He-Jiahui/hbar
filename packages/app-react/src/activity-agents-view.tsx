import { Bot, ChevronRight } from 'lucide-react'
import {
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenStatus,
  LumenContentText,
} from '@lumen/app-ui'
import type { ActivityAgentEntryState } from '@hbar/app-runtime'
import './activity-agents-view.css'

type Agent = ActivityAgentEntryState['items'][number]
export interface ActivityAgentLabels {
  readonly title: string
  readonly loading: string
  readonly unavailable: string
  readonly retry: string
  readonly loadMore: string
  readonly limitReached: string
  readonly opening: string
  readonly open: (objective: string) => string
  readonly count: (loaded: number, active: number, hasMore: boolean) => string
  readonly status: (status: Agent['status']) => string
  readonly error: (code: string) => string
}
export interface ActivityAgentOpenState {
  readonly agentId: string
  readonly status: 'opening' | 'error'
  readonly error: string | null
}
const active = (agent: Agent) =>
  ['created', 'queued', 'running', 'waiting_approval', 'cancelRequested'].includes(agent.status)
function tone(agent: Agent): 'neutral' | 'success' | 'warning' | 'danger' {
  if (agent.status === 'completed') return 'success'
  if (agent.status === 'failed' || agent.status === 'interrupted') return 'danger'
  if (agent.status === 'waiting_approval' || agent.status === 'cancelRequested') return 'warning'
  return 'neutral'
}

/** 50-row cursor pages; the containing Activity pane owns scrolling. */
export function ActivityAgentsView({
  entry,
  labels,
  connected,
  opening,
  onRefresh,
  onLoadMore,
  onOpen,
  excludedAgentIds,
}: {
  readonly entry: Readonly<ActivityAgentEntryState> | undefined
  readonly labels: ActivityAgentLabels
  readonly connected: boolean
  readonly opening: ActivityAgentOpenState | null
  readonly onRefresh: () => void
  readonly onLoadMore: () => void
  readonly onOpen: (agent: Agent) => void
  readonly excludedAgentIds?: ReadonlySet<string>
}) {
  const visible = (entry?.items ?? []).filter((agent) => !excludedAgentIds?.has(agent.agentId))
  if (entry?.status === 'ready' && visible.length === 0 && !entry.nextCursor) return null
  const items = [...visible].sort(
    (left, right) =>
      Number(active(right)) - Number(active(left)) ||
      right.updatedAt - left.updatedAt ||
      left.agentId.localeCompare(right.agentId),
  )
  return (
    <LumenFrame as="section" className="hbar-activity-agents" aria-label={labels.title}>
      <LumenFrame className="hbar-activity-section-heading">
        <LumenContentText context="section.title" level={3}>
          {labels.title}
        </LumenContentText>
        {items.length > 0 && (
          <LumenContentText context="collection.detail">
            {labels.count(items.length, items.filter(active).length, Boolean(entry?.nextCursor))}
          </LumenContentText>
        )}
      </LumenFrame>
      {(!entry || entry.status === 'loading') && (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {entry?.status === 'unavailable' && (
        <LumenContentText context="feedback.paragraph">{labels.unavailable}</LumenContentText>
      )}
      {entry?.status === 'error' && (
        <LumenFrame className="hbar-session-activity-recovery">
          <LumenContentText context="feedback.paragraph" role="alert">
            {labels.error(entry.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          <LumenFrame className="hbar-activity-reader" role="group" aria-label={labels.retry} tabIndex={0}>
            <LumenButton size="s" disabled={!connected} onClick={onRefresh}>
              {labels.retry}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
      )}
      {items.length > 0 && (
        <LumenCollection as="ol" className="hbar-activity-agent-list" tabIndex={0} aria-label={labels.title}>
          {items.map((agent) => (
            <LumenCollectionItem key={agent.agentId} data-activity-agent-id={agent.agentId}>
              <LumenFrame className="hbar-activity-agent-row">
                <LumenButton
                  className="hbar-activity-agent-open"
                  size="s"
                  variant="text"
                  aria-label={labels.open(agent.objective)}
                  disabled={!connected || opening?.status === 'opening'}
                  onClick={() => onOpen(agent)}
                >
                  <LumenIcon icon={Bot} tier="md" />
                  <LumenContentText context="collection.title">{agent.objective}</LumenContentText>
                  <LumenIcon icon={ChevronRight} tier="sm" />
                </LumenButton>
                <LumenFrame
                  className="hbar-activity-reader"
                  role="region"
                  aria-label={labels.status(agent.status)}
                  tabIndex={0}
                >
                  <LumenStatus value={labels.status(agent.status)} tone={tone(agent)} />
                </LumenFrame>
              </LumenFrame>
              {opening?.agentId === agent.agentId && (
                <LumenContentText context="feedback.paragraph" role={opening.status === 'error' ? 'alert' : 'status'}>
                  {opening.status === 'opening' ? labels.opening : labels.error(opening.error ?? 'EXECUTION_FAILED')}
                </LumenContentText>
              )}
            </LumenCollectionItem>
          ))}
        </LumenCollection>
      )}
      {entry?.limitReached && <LumenContentText context="feedback.paragraph">{labels.limitReached}</LumenContentText>}
      {entry?.status === 'ready' && entry.nextCursor && !entry.limitReached && (
        <LumenFrame className="hbar-activity-reader" role="group" aria-label={labels.loadMore} tabIndex={0}>
          <LumenButton size="s" disabled={!connected} onClick={onLoadMore}>
            {labels.loadMore}
          </LumenButton>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
