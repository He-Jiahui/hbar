import { Bot, Focus, GitPullRequestArrow, ShieldCheck } from 'lucide-react'
import {
  LumenContentText,
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenDisclosure,
  LumenFrame,
  LumenIcon,
  LumenStatus,
  LumenText,
} from '@lumen/app-ui'
import type { WorkflowWorkspaceEntryState } from '@hbar/app-runtime'

type WorkflowState = NonNullable<WorkflowWorkspaceEntryState['snapshot']['workflow']>
type WorkflowStatus = WorkflowState['status']
type WorkflowEvidence = WorkflowState['evidence'][number]
type WorkflowFocus = NonNullable<WorkflowState['focus']>
type WorkflowFocusStatus = WorkflowFocus['status']
type WorkflowAcceptanceStatus = WorkflowFocus['acceptanceChecks'][number]['status']
type WorkflowCompletionPolicy = WorkflowFocus['completionPolicy']
type WorkflowReviewStatus = NonNullable<WorkflowState['review']>['status']
type DelegationStatus = WorkflowState['delegations'][number]['status']

export interface HbarWorkflowOverviewLabels {
  readonly title: string
  readonly loading: string
  readonly empty: string
  readonly draft: string
  readonly focus: string
  readonly staleFocus: string
  readonly completionPolicy: string
  readonly completionPolicies: Readonly<Record<WorkflowCompletionPolicy, string>>
  readonly acceptance: string
  readonly scope: string
  readonly readPaths: string
  readonly writePaths: string
  readonly tools: string
  readonly none: string
  readonly review: string
  readonly reviewStatuses: Readonly<Record<WorkflowReviewStatus, string>>
  readonly diagnosis: string
  readonly denialCount: (count: number) => string
  readonly agents: string
  readonly noAgents: string
  readonly evidence: string
  readonly noEvidence: string
  readonly loadMore: string
  readonly applyPatch: string
  readonly applyingPatch: string
  readonly reconcilePatch: string
  readonly coordinate: string
  readonly accept: string
  readonly reject: string
  readonly actionSucceeded: string
  readonly error: (code: string) => string
  readonly statuses: Readonly<Record<WorkflowStatus | 'draft' | 'none', string>>
  readonly focusStatuses: Readonly<Record<WorkflowFocusStatus, string>>
  readonly acceptanceStatuses: Readonly<Record<WorkflowAcceptanceStatus, string>>
  readonly delegationStatuses: Readonly<Record<DelegationStatus, string>>
  readonly evidenceCount: (visible: number, total: number) => string
  readonly patchFiles: (count: number) => string
  readonly acceptanceAction: (decision: 'accepted' | 'rejected', check: string) => string
  readonly evidenceLabel: (evidence: WorkflowEvidence) => string
  readonly timestamp: (value: number) => string
}

function tone(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (['completed', 'passed', 'accepted', 'approved', 'applied'].includes(status)) return 'success'
  if (['failed', 'rejected', 'conflict', 'needs_revision', 'stale'].includes(status)) return 'danger'
  if (['blocked', 'waiting', 'waiting_review', 'waiting_user', 'verifying', 'patch_ready'].includes(status))
    return 'warning'
  return 'neutral'
}

export function HbarWorkflowOverview({
  entry,
  labels,
  connected,
  instanceId,
  invoke,
}: {
  readonly entry: Readonly<WorkflowWorkspaceEntryState> | undefined
  readonly labels: HbarWorkflowOverviewLabels
  readonly connected: boolean
  readonly instanceId: string
  readonly invoke: (name: string, input: unknown) => void
}) {
  if (!entry || entry.status === 'loading')
    return (
      <LumenFrame as="section" className="hbar-app-react-workflow-overview">
        <LumenContentText context="section.description" className="hbar-app-react-goal-plan-loading">
          {labels.loading}
        </LumenContentText>
      </LumenFrame>
    )
  if (entry.error)
    return (
      <LumenFrame as="section" className="hbar-app-react-workflow-overview">
        <LumenContentText context="feedback.message" role="alert">
          {labels.error(entry.error)}
        </LumenContentText>
      </LumenFrame>
    )
  const { plan, workflow } = entry.snapshot
  if (!plan && !workflow)
    return (
      <LumenFrame as="section" className="hbar-app-react-workflow-overview">
        <LumenFrame as="header">
          <LumenContentText context="section.title">{labels.title}</LumenContentText>
          <LumenStatus value={labels.statuses.none} tone="neutral" />
        </LumenFrame>
        <LumenContentText context="section.description" className="hbar-app-react-goal-plan-empty">
          {labels.empty}
        </LumenContentText>
      </LumenFrame>
    )

  const status = workflow?.status ?? 'draft'
  const focus = workflow?.focus
  const evidence = workflow?.evidence.slice(-entry.visibleEvidence).reverse() ?? []
  return (
    <LumenFrame as="section" className="hbar-app-react-workflow-overview">
      <LumenFrame as="header">
        <LumenContentText context="section.title">{labels.title}</LumenContentText>
        <LumenStatus value={labels.statuses[status]} tone={tone(status)} />
      </LumenFrame>
      {!workflow && (
        <LumenContentText context="section.description" className="hbar-app-react-workflow-draft">
          {labels.draft}
        </LumenContentText>
      )}
      {workflow && (
        <LumenFrame className="hbar-app-react-workflow-focus">
          <LumenIcon icon={Focus} tier="sm" />
          <LumenContentText context="message.inline">{labels.focus}</LumenContentText>
          <LumenContentText context="record.title">{focus?.title ?? labels.staleFocus}</LumenContentText>
          {focus && <LumenStatus value={labels.focusStatuses[focus.status]} tone={tone(focus.status)} />}
        </LumenFrame>
      )}
      {focus && (
        <LumenFrame className="hbar-app-react-workflow-group">
          <LumenFrame className="hbar-app-react-workflow-policy">
            <LumenContentText context="message.inline">{labels.completionPolicy}</LumenContentText>
            <LumenStatus value={labels.completionPolicies[focus.completionPolicy]} tone="neutral" />
          </LumenFrame>
          <LumenDisclosure className="hbar-app-react-workflow-disclosure" summary={labels.scope}>
            <LumenCollection as="dl" className="hbar-app-react-workflow-scope">
              <LumenFrame>
                <LumenCollectionItem as="dt">{labels.readPaths}</LumenCollectionItem>
                <LumenCollectionItem as="dd">{focus.scope.readPaths.join(', ') || labels.none}</LumenCollectionItem>
              </LumenFrame>
              <LumenFrame>
                <LumenCollectionItem as="dt">{labels.writePaths}</LumenCollectionItem>
                <LumenCollectionItem as="dd">{focus.scope.writePaths.join(', ') || labels.none}</LumenCollectionItem>
              </LumenFrame>
              <LumenFrame>
                <LumenCollectionItem as="dt">{labels.tools}</LumenCollectionItem>
                <LumenCollectionItem as="dd">{focus.scope.tools.join(', ') || labels.none}</LumenCollectionItem>
              </LumenFrame>
            </LumenCollection>
          </LumenDisclosure>
          <LumenFrame className="hbar-app-react-workflow-checks">
            <LumenContentText context="message.inline">{labels.acceptance}</LumenContentText>
            {focus.acceptanceChecks.length ? (
              <LumenCollection as="ul">
                {focus.acceptanceChecks.map((check, checkIndex) => {
                  const actionKey = `accept:${focus.focusId}:${check.id}`
                  const action = entry.actions[actionKey]
                  const canDecide =
                    workflow.status === 'waiting_user' &&
                    focus.completionPolicy === 'user' &&
                    check.verifier.kind === 'user' &&
                    !['accepted', 'passed'].includes(check.status)
                  return (
                    <LumenCollectionItem key={`${check.id}:${checkIndex}`}>
                      <LumenContentText context="message.inline">{check.description}</LumenContentText>
                      <LumenStatus value={labels.acceptanceStatuses[check.status]} tone={tone(check.status)} />
                      {canDecide && (
                        <LumenFrame className="hbar-app-react-workflow-check-actions">
                          <LumenButton
                            disabled={!connected || action?.status === 'submitting' || action?.status === 'unknown'}
                            onClick={() =>
                              invoke('workflowWorkspace.acceptCheck', {
                                instanceId,
                                itemId: focus.focusId,
                                checkId: check.id,
                                decision: 'accepted',
                              })
                            }
                            aria-label={labels.acceptanceAction('accepted', check.description)}
                          >
                            {labels.accept}
                          </LumenButton>
                          <LumenButton
                            tone="warning"
                            disabled={!connected || action?.status === 'submitting' || action?.status === 'unknown'}
                            onClick={() =>
                              invoke('workflowWorkspace.acceptCheck', {
                                instanceId,
                                itemId: focus.focusId,
                                checkId: check.id,
                                decision: 'rejected',
                              })
                            }
                            aria-label={labels.acceptanceAction('rejected', check.description)}
                          >
                            {labels.reject}
                          </LumenButton>
                        </LumenFrame>
                      )}
                      {action?.status === 'succeeded' && (
                        <LumenContentText context="message.inline" role="status">
                          {labels.actionSucceeded}
                        </LumenContentText>
                      )}
                      {action?.error && (
                        <LumenContentText context="message.inline" role="alert">
                          {labels.error(action.error)}
                        </LumenContentText>
                      )}
                    </LumenCollectionItem>
                  )
                })}
              </LumenCollection>
            ) : (
              <LumenContentText context="section.description" className="hbar-app-react-goal-plan-empty">
                {labels.none}
              </LumenContentText>
            )}
          </LumenFrame>
        </LumenFrame>
      )}
      {workflow?.review && (
        <LumenFrame className="hbar-app-react-workflow-group">
          <LumenContentText context="section.subtitle">{labels.review}</LumenContentText>
          <LumenStatus value={labels.reviewStatuses[workflow.review.status]} tone={tone(workflow.review.status)} />
          {workflow.review.summary && (
            <LumenContentText context="section.description">{workflow.review.summary}</LumenContentText>
          )}
        </LumenFrame>
      )}
      {workflow?.rejection && (
        <LumenFrame className="hbar-app-react-workflow-group">
          <LumenContentText context="section.subtitle">{labels.diagnosis}</LumenContentText>
          <LumenContentText context="section.description">{workflow.rejection.reason}</LumenContentText>
          <LumenContentText context="message.inline">{labels.denialCount(workflow.rejection.count)}</LumenContentText>
        </LumenFrame>
      )}
      <LumenFrame className="hbar-app-react-workflow-group">
        <LumenContentText context="section.subtitle">
          <LumenIcon icon={Bot} tier="sm" /> {labels.agents}
        </LumenContentText>
        {workflow?.delegations.length ? (
          <LumenCollection as="ul" className="hbar-app-react-workflow-agents">
            {workflow.delegations.map((delegation, index) => {
              const agent = delegation.agentId ? entry.agents[delegation.agentId] : undefined
              const action = delegation.agentId ? entry.actions[`apply:${delegation.agentId}`] : undefined
              return (
                <LumenCollectionItem key={`${delegation.delegationId}:${index}`}>
                  <LumenFrame>
                    <LumenContentText context="record.title">{delegation.itemId}</LumenContentText>
                    <LumenStatus value={labels.delegationStatuses[delegation.status]} tone={tone(delegation.status)} />
                  </LumenFrame>
                  {agent?.resultSummary && (
                    <LumenContentText context="section.description">{agent.resultSummary}</LumenContentText>
                  )}
                  {agent?.patch && (
                    <LumenDisclosure
                      className="hbar-app-react-workflow-disclosure"
                      summary={labels.patchFiles(agent.patch.files.length)}
                      {...(delegation.status === 'conflict' ? { open: true } : {})}
                    >
                      <LumenCollection as="ul">
                        {agent.patch.files.map((file) => (
                          <LumenCollectionItem key={file.path}>{file.path}</LumenCollectionItem>
                        ))}
                      </LumenCollection>
                    </LumenDisclosure>
                  )}
                  <LumenFrame className="hbar-app-react-workflow-agent-actions">
                    {delegation.status === 'patch_ready' && delegation.agentId && (
                      <LumenButton
                        tone="primary"
                        disabled={!connected || action?.status === 'submitting' || action?.status === 'unknown'}
                        onClick={() =>
                          invoke('workflowWorkspace.applyPatch', { instanceId, agentId: delegation.agentId })
                        }
                      >
                        {action?.status === 'submitting'
                          ? labels.applyingPatch
                          : action?.status === 'unknown'
                            ? labels.reconcilePatch
                            : labels.applyPatch}
                      </LumenButton>
                    )}
                    {delegation.status === 'conflict' && agent && (
                      <LumenButton onClick={() => invoke('app.setSession', { sessionId: agent.sessionId })}>
                        {labels.coordinate}
                      </LumenButton>
                    )}
                  </LumenFrame>
                  {action?.status === 'succeeded' && (
                    <LumenContentText context="feedback.message" role="status">
                      {labels.actionSucceeded}
                    </LumenContentText>
                  )}
                  {action?.error && (
                    <LumenContentText context="feedback.message" role="alert">
                      {labels.error(action.error)}
                    </LumenContentText>
                  )}
                </LumenCollectionItem>
              )
            })}
          </LumenCollection>
        ) : (
          <LumenContentText context="section.description" className="hbar-app-react-goal-plan-empty">
            {labels.noAgents}
          </LumenContentText>
        )}
      </LumenFrame>
      <LumenFrame className="hbar-app-react-workflow-group">
        <LumenContentText context="section.subtitle">
          <LumenIcon icon={ShieldCheck} tier="sm" /> {labels.evidence}
          <LumenContentText context="message.inline">
            {labels.evidenceCount(evidence.length, workflow?.evidence.length ?? 0)}
          </LumenContentText>
        </LumenContentText>
        {evidence.length ? (
          <LumenCollection as="ol" className="hbar-app-react-workflow-evidence">
            {evidence.map((proof, index) => (
              <LumenCollectionItem key={`${proof.evidenceId}:${index}`}>
                <LumenIcon icon={GitPullRequestArrow} tier="sm" />
                <LumenContentText context="message.inline">{labels.evidenceLabel(proof)}</LumenContentText>
                <LumenText as="time" dateTime={new Date(proof.createdAt).toISOString()}>
                  {labels.timestamp(proof.createdAt)}
                </LumenText>
              </LumenCollectionItem>
            ))}
          </LumenCollection>
        ) : (
          <LumenContentText context="section.description" className="hbar-app-react-goal-plan-empty">
            {labels.noEvidence}
          </LumenContentText>
        )}
        {workflow && entry.visibleEvidence < workflow.evidence.length && (
          <LumenButton onClick={() => invoke('workflowWorkspace.loadMoreEvidence', { instanceId })}>
            {labels.loadMore}
          </LumenButton>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}
