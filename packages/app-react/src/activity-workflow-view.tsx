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
import type { WorkflowWorkspaceEntryState } from '@hbar/app-runtime'
import type { AgentRecord } from '@hbar/contracts/commands/agents'
import type { ActivityAgentLabels, ActivityAgentOpenState } from './activity-agents-view'
import { projectActivityWorkflow } from './activity-workflow-model'
import './activity-workflow-view.css'

type Workflow = NonNullable<WorkflowWorkspaceEntryState['snapshot']['workflow']>
export interface ActivityWorkflowLabels {
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

/** At most 128 public delegations, grouped by the actual focus. Activity owns the scroll. */
export function ActivityWorkflowView({
  entry,
  sessionId,
  liveAgents,
  labels,
  connected,
  opening,
  onRefresh,
  onOpen,
}: {
  readonly entry: Readonly<WorkflowWorkspaceEntryState> | undefined
  readonly sessionId: string
  readonly liveAgents: readonly AgentRecord[]
  readonly labels: ActivityWorkflowLabels
  readonly connected: boolean
  readonly opening: ActivityAgentOpenState | null
  readonly onRefresh: () => void
  readonly onOpen: (agent: AgentRecord) => void
}) {
  const { workflow, focused, other, settled } = projectActivityWorkflow(entry, sessionId, liveAgents)
  const loading = !entry || entry.status === 'loading'
  const failed = entry?.status === 'error'
  if (!loading && !failed && !workflow) return null
  const rows = (items: typeof focused) => (
    <LumenCollection as="ol" className="hbar-activity-workflow-agents" tabIndex={0} aria-label={labels.title}>
      {items.map(({ delegation, agent }) => {
        const title = agent?.objective ?? labels.delegation(delegation.modelId)
        const status =
          agent &&
          ['queued', 'running'].includes(delegation.status) &&
          ['created', 'queued', 'running', 'waiting_approval', 'cancelRequested'].includes(agent.status)
            ? labels.agent.status(agent.status)
            : labels.delegationStatus(delegation.status)
        const content = (
          <>
            <LumenIcon icon={Bot} tier="md" />
            <LumenContentText context="collection.title">{title}</LumenContentText>
            {agent && <LumenIcon icon={ChevronRight} tier="sm" />}
          </>
        )
        return (
          <LumenCollectionItem key={delegation.delegationId} data-activity-delegation-id={delegation.delegationId}>
            <LumenFrame className="hbar-activity-agent-row">
              {agent ? (
                <LumenButton
                  size="s"
                  variant="text"
                  className="hbar-activity-agent-open"
                  aria-label={labels.agent.open(agent.objective)}
                  disabled={!connected || opening?.status === 'opening'}
                  onClick={() => onOpen(agent)}
                >
                  {content}
                </LumenButton>
              ) : (
                <LumenFrame className="hbar-activity-agent-open">{content}</LumenFrame>
              )}
              <LumenFrame className="hbar-activity-reader" role="region" aria-label={status} tabIndex={0}>
                <LumenStatus value={status} />
              </LumenFrame>
            </LumenFrame>
            {!agent && delegation.agentId && (
              <LumenFrame className="hbar-session-activity-recovery">
                <LumenContentText context="feedback.paragraph">{labels.missingAgent}</LumenContentText>
                <LumenFrame className="hbar-activity-reader" role="group" aria-label={labels.retry} tabIndex={0}>
                  <LumenButton size="s" disabled={!connected || loading} onClick={onRefresh}>
                    {labels.retry}
                  </LumenButton>
                </LumenFrame>
              </LumenFrame>
            )}
            {agent && opening?.agentId === agent.agentId && (
              <LumenContentText context="feedback.paragraph" role={opening.status === 'error' ? 'alert' : 'status'}>
                {opening.status === 'opening'
                  ? labels.agent.opening
                  : labels.agent.error(opening.error ?? 'EXECUTION_FAILED')}
              </LumenContentText>
            )}
          </LumenCollectionItem>
        )
      })}
    </LumenCollection>
  )
  return (
    <LumenFrame as="section" className="hbar-activity-workflow" aria-label={labels.title}>
      <LumenFrame className="hbar-activity-section-heading">
        <LumenContentText context="section.title" level={3}>
          {labels.title}
        </LumenContentText>
        {workflow && (
          <LumenFrame
            className="hbar-activity-reader"
            role="region"
            aria-label={labels.status(workflow.status)}
            tabIndex={0}
          >
            <LumenStatus value={labels.status(workflow.status)} />
          </LumenFrame>
        )}
      </LumenFrame>
      {loading && (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {failed && (
        <LumenFrame className="hbar-session-activity-recovery">
          <LumenContentText context="feedback.paragraph" role="alert">
            {labels.error(entry.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          <LumenFrame className="hbar-activity-reader" role="group" aria-label={labels.retry} tabIndex={0}>
            <LumenButton size="s" disabled={!connected || loading} onClick={onRefresh}>
              {labels.retry}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
      )}
      {workflow?.focus && (
        <LumenFrame className="hbar-activity-workflow-group" data-activity-focus-id={workflow.focus.focusId}>
          <LumenFrame className="hbar-activity-workflow-group-heading">
            <LumenContentText context="section.title" level={4}>
              {workflow.focus.title}
            </LumenContentText>
            <LumenContentText context="collection.detail">
              {focused.length
                ? labels.count(settled(focused), focused.length)
                : labels.focusStatus(workflow.focus.status)}
            </LumenContentText>
          </LumenFrame>
          {rows(focused)}
        </LumenFrame>
      )}
      {other.length > 0 && (
        <LumenFrame className="hbar-activity-workflow-group">
          <LumenFrame className="hbar-activity-workflow-group-heading">
            <LumenContentText context="section.title" level={4}>
              {labels.other}
            </LumenContentText>
            <LumenContentText context="collection.detail">
              {labels.count(settled(other), other.length)}
            </LumenContentText>
          </LumenFrame>
          {rows(other)}
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
