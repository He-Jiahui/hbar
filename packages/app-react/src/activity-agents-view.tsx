import { Bot, ChevronRight } from 'lucide-react'
import {
  LumenContentText,
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenStatus,
} from '@lumen/app-ui'
import type { ActivityAgentEntryState } from '@hbar/app-runtime'
import { createMessageScope } from './messages'
import { ActivityText, type ActivityTextLabels } from './activity-text'
import './activity-agents-view.css'

type Agent = ActivityAgentEntryState['items'][number]
export interface ActivityAgentLabels {
  readonly text: ActivityTextLabels
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
export const activityAgentMessages = createMessageScope<ActivityAgentLabels>()
const active = (agent: Agent) =>
  ['created', 'queued', 'running', 'waiting_approval', 'cancelRequested'].includes(agent.status)
function tone(agent: Agent): 'neutral' | 'success' | 'warning' | 'danger' {
  if (agent.status === 'completed') return 'success'
  if (agent.status === 'failed' || agent.status === 'interrupted') return 'danger'
  if (agent.status === 'waiting_approval' || agent.status === 'cancelRequested') return 'warning'
  return 'neutral'
}

/** 50-row cursor pages; the containing Activity pane owns scrolling. */
type ActivityAgentsViewProps = {
  readonly entry: Readonly<ActivityAgentEntryState> | undefined
  readonly labels: ActivityAgentLabels
  readonly connected: boolean
  readonly opening: ActivityAgentOpenState | null
  readonly onRefresh: () => void
  readonly onLoadMore: () => void
  readonly onOpen: (agent: Agent) => void
  readonly excludedAgentIds?: ReadonlySet<string>
}

export function ActivityAgentsView(props: ActivityAgentsViewProps) {
  const { labels, ...contentProps } = props
  return (
    <activityAgentMessages.Provider messages={labels}>
      <ActivityAgentsContent {...contentProps} />
    </activityAgentMessages.Provider>
  )
}

type ActivityAgentsContentProps = Omit<ActivityAgentsViewProps, 'labels'>

function ActivityAgentsContent({
  entry,
  connected,
  opening,
  onRefresh,
  onLoadMore,
  onOpen,
  excludedAgentIds,
}: ActivityAgentsContentProps) {
  const { t } = activityAgentMessages.useMessages()
  const visible = (entry?.items ?? []).filter((agent) => !excludedAgentIds?.has(agent.agentId))
  if (entry?.status === 'ready' && visible.length === 0 && !entry.nextCursor) return null
  const items = [...visible].sort(
    (left, right) =>
      Number(active(right)) - Number(active(left)) ||
      right.updatedAt - left.updatedAt ||
      left.agentId.localeCompare(right.agentId),
  )
  return (
    <LumenFrame as="section" className="hbar-activity-agents" aria-label={t('title')}>
      <LumenFrame className="hbar-activity-section-heading">
        <LumenContentText context="section.subtitle">{t('title')}</LumenContentText>
        {items.length > 0 && (
          <LumenContentText context="message.inline">
            {t('count')(items.length, items.filter(active).length, Boolean(entry?.nextCursor))}
          </LumenContentText>
        )}
      </LumenFrame>
      {(!entry || entry.status === 'loading') && (
        <LumenContentText context="feedback.message" role="status">
          {t('loading')}
        </LumenContentText>
      )}
      {entry?.status === 'unavailable' && (
        <LumenContentText context="section.description">{t('unavailable')}</LumenContentText>
      )}
      {entry?.status === 'error' && (
        <LumenFrame className="hbar-session-activity-recovery">
          <LumenContentText context="feedback.message" role="alert">
            {t('error')(entry.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          <LumenButton size="s" disabled={!connected} onClick={onRefresh}>
            {t('retry')}
          </LumenButton>
        </LumenFrame>
      )}
      {items.length > 0 && (
        <LumenCollection as="ol" className="hbar-activity-agent-list" tabIndex={0} aria-label={t('title')}>
          {items.map((agent) => (
            <LumenCollectionItem key={agent.agentId} data-activity-agent-id={agent.agentId}>
              <ActivityText text={agent.objective} labels={t('text')} context="choice.title">
                {(caption) => (
                  <LumenButton
                    className="hbar-activity-agent-row"
                    size="s"
                    variant="text"
                    aria-label={t('open')(agent.objective)}
                    disabled={!connected || opening?.status === 'opening'}
                    onClick={() => onOpen(agent)}
                  >
                    <LumenIcon icon={Bot} tier="sm" />
                    <LumenFrame className="hbar-activity-agent-copy">
                      {caption}
                      <LumenStatus value={t('status')(agent.status)} tone={tone(agent)} />
                    </LumenFrame>
                    <LumenIcon icon={ChevronRight} tier="sm" />
                  </LumenButton>
                )}
              </ActivityText>
              {opening?.agentId === agent.agentId && (
                <LumenContentText context="feedback.message" role={opening.status === 'error' ? 'alert' : 'status'}>
                  {opening.status === 'opening' ? t('opening') : t('error')(opening.error ?? 'EXECUTION_FAILED')}
                </LumenContentText>
              )}
            </LumenCollectionItem>
          ))}
        </LumenCollection>
      )}
      {entry?.limitReached && <LumenContentText context="section.description">{t('limitReached')}</LumenContentText>}
      {entry?.status === 'ready' && entry.nextCursor && !entry.limitReached && (
        <LumenButton size="s" disabled={!connected} onClick={onLoadMore}>
          {t('loadMore')}
        </LumenButton>
      )}
    </LumenFrame>
  )
}
