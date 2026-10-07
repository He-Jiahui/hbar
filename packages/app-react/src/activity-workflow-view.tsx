import { Bot, ChevronRight } from 'lucide-react'
import {
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
        return (
          <LumenCollectionItem key={delegation.delegationId} data-activity-delegation-id={delegation.delegationId}>
            <ActivityText text={title} labels={labels.text} context="choice.title">
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
                    aria-label={labels.agent.open(agent.objective)}
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
                <LumenText as="p">{labels.missingAgent}</LumenText>
                <LumenButton size="s" disabled={!connected || loading} onClick={onRefresh}>
                  {labels.retry}
                </LumenButton>
              </LumenFrame>
            )}
            {agent && opening?.agentId === agent.agentId && (
              <LumenText as="p" role={opening.status === 'error' ? 'alert' : 'status'}>
                {opening.status === 'opening'
                  ? labels.agent.opening
                  : labels.agent.error(opening.error ?? 'EXECUTION_FAILED')}
              </LumenText>
            )}
          </LumenCollectionItem>
        )
      })}
    </LumenCollection>
  )
  return (
    <LumenFrame as="section" className="hbar-activity-workflow" aria-label={labels.title}>
      <LumenFrame className="hbar-activity-section-heading">
        <LumenText as="h3">{labels.title}</LumenText>
        {workflow && <LumenStatus value={labels.status(workflow.status)} />}
      </LumenFrame>
      {loading && (
        <LumenText as="p" role="status">
          {labels.loading}
        </LumenText>
      )}
      {failed && (
        <LumenFrame className="hbar-session-activity-recovery">
          <LumenText as="p" role="alert">
            {labels.error(entry.error ?? 'EXECUTION_FAILED')}
          </LumenText>
          <LumenButton size="s" disabled={!connected || loading} onClick={onRefresh}>
            {labels.retry}
          </LumenButton>
        </LumenFrame>
      )}
      {workflow?.focus && (
        <LumenFrame className="hbar-activity-workflow-group" data-activity-focus-id={workflow.focus.focusId}>
          <LumenFrame className="hbar-activity-workflow-group-heading">
            <ActivityText key={workflow.focus.focusId} text={workflow.focus.title} labels={labels.text} />
            <LumenText as="span">
              {focused.length
                ? labels.count(settled(focused), focused.length)
                : labels.focusStatus(workflow.focus.status)}
            </LumenText>
          </LumenFrame>
          {rows(focused)}
        </LumenFrame>
      )}
      {other.length > 0 && (
        <LumenFrame className="hbar-activity-workflow-group">
          <LumenFrame className="hbar-activity-workflow-group-heading">
            <LumenText as="h4">{labels.other}</LumenText>
            <LumenText as="span">{labels.count(settled(other), other.length)}</LumenText>
          </LumenFrame>
          {rows(other)}
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
