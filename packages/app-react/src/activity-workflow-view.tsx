import { Bot, ChevronRight } from 'lucide-react'
import {
  LumenContentText,
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenStatus,
  LumenText,
} from '@lumen/app-ui'
import type { WorkflowWorkspaceEntryState } from '@hbar/app-runtime'
import type { AgentRecord } from '@hbar/contracts/commands/agents'
import type { ActivityAgentLabels, ActivityAgentOpenState } from './activity-agents-view'
import { createMessageScope } from './messages'
import { projectActivityWorkflow } from './activity-workflow-model'
import { ActivityText, type ActivityTextLabels } from './activity-text'
import './activity-workflow-view.css'

type Workflow = NonNullable<WorkflowWorkspaceEntryState['snapshot']['workflow']>
export interface ActivityWorkflowLabels {
  readonly text: ActivityTextLabels
  readonly title: string
  readonly loading: string
  readonly retry: string
  readonly other: string
  readonly missingAgent: string
  readonly count: (settled: number, total: number) => string
  readonly delegation: (modelId: string) => string
  readonly status: (status: Workflow['status']) => string
  readonly focusStatus: (status: NonNullable<Workflow['focus']>['status']) => string
  readonly delegationStatus: (status: Workflow['delegations'][number]['status']) => string
  readonly error: (code: string) => string
  readonly agent: Pick<ActivityAgentLabels, 'open' | 'opening' | 'error' | 'status'>
}
const activityWorkflowMessages = createMessageScope<ActivityWorkflowLabels>()

type ActivityWorkflowViewProps = {
  readonly entry: Readonly<WorkflowWorkspaceEntryState> | undefined
  readonly sessionId: string
  readonly liveAgents: readonly AgentRecord[]
  readonly labels: ActivityWorkflowLabels
  readonly connected: boolean
  readonly opening: ActivityAgentOpenState | null
  readonly onRefresh: () => void
  readonly onOpen: (agent: AgentRecord) => void
}

/** At most 128 public delegations, grouped by the actual focus. Activity owns the scroll. */
export function ActivityWorkflowView(props: ActivityWorkflowViewProps) {
  return (
    <activityWorkflowMessages.Provider messages={props.labels}>
      <ActivityWorkflowContent {...props} />
    </activityWorkflowMessages.Provider>
  )
}

function ActivityWorkflowContent({
  entry,
  sessionId,
  liveAgents,
  connected,
  opening,
  onRefresh,
  onOpen,
}: ActivityWorkflowViewProps) {
  const { t } = activityWorkflowMessages.useMessages()
  const { workflow, focused, other, settled } = projectActivityWorkflow(entry, sessionId, liveAgents)
  const loading = !entry || entry.status === 'loading'
  const failed = entry?.status === 'error'
  if (!loading && !failed && !workflow) return null
  const rows = (items: typeof focused) => (
    <LumenCollection as="ol" className="hbar-activity-workflow-agents" tabIndex={0} aria-label={t('title')}>
      {items.map(({ delegation, agent }) => {
        const title = agent?.objective ?? t('delegation')(delegation.modelId)
        const status =
          agent &&
          ['queued', 'running'].includes(delegation.status) &&
          ['created', 'queued', 'running', 'waiting_approval', 'cancelRequested'].includes(agent.status)
            ? t('agent').status(agent.status)
            : t('delegationStatus')(delegation.status)
        return (
          <LumenCollectionItem key={delegation.delegationId} data-activity-delegation-id={delegation.delegationId}>
            <ActivityText text={title} labels={t('text')} context="choice.title">
              {(caption) => {
                const content = (
                  <>
                    <LumenIcon icon={Bot} tier="sm" />
                    <LumenFrame className="hbar-activity-agent-copy">
                      {caption}
                      <LumenStatus value={status} />
                    </LumenFrame>
                    {agent && <LumenIcon icon={ChevronRight} tier="sm" />}
                  </>
                )
                return agent ? (
                  <LumenButton
                    size="s"
                    variant="text"
                    className="hbar-activity-agent-row"
                    aria-label={t('agent').open(agent.objective)}
                    disabled={!connected || opening?.status === 'opening'}
                    onClick={() => onOpen(agent)}
                  >
                    {content}
                  </LumenButton>
                ) : (
                  <LumenFrame className="hbar-activity-agent-row">{content}</LumenFrame>
                )
              }}
            </ActivityText>
            {!agent && delegation.agentId && (
              <LumenFrame className="hbar-session-activity-recovery">
                <LumenContentText context="section.description">{t('missingAgent')}</LumenContentText>
                <LumenButton size="s" disabled={!connected || loading} onClick={onRefresh}>
                  {t('retry')}
                </LumenButton>
              </LumenFrame>
            )}
            {agent && opening?.agentId === agent.agentId && (
              <LumenContentText context="feedback.message" role={opening.status === 'error' ? 'alert' : 'status'}>
                {opening.status === 'opening'
                  ? t('agent').opening
                  : t('agent').error(opening.error ?? 'EXECUTION_FAILED')}
              </LumenContentText>
            )}
          </LumenCollectionItem>
        )
      })}
    </LumenCollection>
  )
  return (
    <LumenFrame as="section" className="hbar-activity-workflow" aria-label={t('title')}>
      <LumenFrame className="hbar-activity-section-heading">
        <LumenContentText context="section.subtitle">{t('title')}</LumenContentText>
        {workflow && <LumenStatus value={t('status')(workflow.status)} />}
      </LumenFrame>
      {loading && (
        <LumenContentText context="feedback.message" role="status">
          {t('loading')}
        </LumenContentText>
      )}
      {failed && (
        <LumenFrame className="hbar-session-activity-recovery">
          <LumenContentText context="feedback.message" role="alert">
            {t('error')(entry.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          <LumenButton size="s" disabled={!connected || loading} onClick={onRefresh}>
            {t('retry')}
          </LumenButton>
        </LumenFrame>
      )}
      {workflow?.focus && (
        <LumenFrame className="hbar-activity-workflow-group" data-activity-focus-id={workflow.focus.focusId}>
          <LumenFrame className="hbar-activity-workflow-group-heading">
            <ActivityText key={workflow.focus.focusId} text={workflow.focus.title} labels={t('text')} />
            <LumenContentText context="message.inline">
              {focused.length
                ? t('count')(settled(focused), focused.length)
                : t('focusStatus')(workflow.focus.status)}
            </LumenContentText>
          </LumenFrame>
          {rows(focused)}
        </LumenFrame>
      )}
      {other.length > 0 && (
        <LumenFrame className="hbar-activity-workflow-group">
          <LumenFrame className="hbar-activity-workflow-group-heading">
            <LumenText as="h4">{t('other')}</LumenText>
            <LumenContentText context="message.inline">{t('count')(settled(other), other.length)}</LumenContentText>
          </LumenFrame>
          {rows(other)}
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
