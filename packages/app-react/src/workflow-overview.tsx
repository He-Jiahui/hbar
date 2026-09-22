import { Bot, Focus, GitPullRequestArrow, ShieldCheck } from 'lucide-react'
import {
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
  readonly statuses: Readonly<Record<WorkflowStatus | 'none', string>>
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
        <LumenText as="p" className="hbar-app-react-goal-plan-loading">
          {labels.loading}
        </LumenText>
      </LumenFrame>
    )
  if (entry.error)
    return (
      <LumenFrame as="section" className="hbar-app-react-workflow-overview">
        <LumenText as="p" role="alert">
          {labels.error(entry.error)}
        </LumenText>
      </LumenFrame>
    )
  const { plan, workflow } = entry.snapshot
  if (!plan && !workflow)
    return (
      <LumenFrame as="section" className="hbar-app-react-workflow-overview">
        <LumenFrame as="header">
          <LumenText as="h2">{labels.title}</LumenText>
          <LumenStatus value={labels.statuses.none} tone="neutral" />
        </LumenFrame>
        <LumenText as="p" className="hbar-app-react-goal-plan-empty">
          {labels.empty}
        </LumenText>
      </LumenFrame>
    )

  const status = workflow?.status ?? 'draft'
  const focus = workflow?.focus
  const evidence = workflow?.evidence.slice(-entry.visibleEvidence).reverse() ?? []
  return (
    <LumenFrame as="section" className="hbar-app-react-workflow-overview">
      <LumenFrame as="header">
        <LumenText as="h2">{labels.title}</LumenText>
        <LumenStatus value={labels.statuses[status]} tone={tone(status)} />
      </LumenFrame>
      {!workflow && (
        <LumenText as="p" className="hbar-app-react-workflow-draft">
          {labels.draft}
        </LumenText>
      )}
      {workflow && (
        <LumenFrame className="hbar-app-react-workflow-focus">
          <LumenIcon icon={Focus} tier="sm" />
          <LumenText as="span">{labels.focus}</LumenText>
          <LumenText as="strong">{focus?.title ?? labels.staleFocus}</LumenText>
          {focus && <LumenStatus value={labels.focusStatuses[focus.status]} tone={tone(focus.status)} />}
        </LumenFrame>
      )}
      {focus && (
        <LumenFrame className="hbar-app-react-workflow-group">
          <LumenFrame className="hbar-app-react-workflow-policy">
            <LumenText as="span">{labels.completionPolicy}</LumenText>
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
            <LumenText as="span">{labels.acceptance}</LumenText>
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
                      <LumenText as="span">{check.description}</LumenText>
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
                        <LumenText as="span" role="status">
                          {labels.actionSucceeded}
                        </LumenText>
                      )}
                      {action?.error && (
                        <LumenText as="span" role="alert">
                          {labels.error(action.error)}
                        </LumenText>
                      )}
                    </LumenCollectionItem>
                  )
                })}
              </LumenCollection>
            ) : (
              <LumenText as="p" className="hbar-app-react-goal-plan-empty">
                {labels.none}
              </LumenText>
            )}
          </LumenFrame>
        </LumenFrame>
      )}
      {workflow?.review && (
        <LumenFrame className="hbar-app-react-workflow-group">
          <LumenText as="h3">{labels.review}</LumenText>
          <LumenStatus value={labels.reviewStatuses[workflow.review.status]} tone={tone(workflow.review.status)} />
          {workflow.review.summary && <LumenText as="p">{workflow.review.summary}</LumenText>}
        </LumenFrame>
      )}
      {workflow?.rejection && (
        <LumenFrame className="hbar-app-react-workflow-group">
          <LumenText as="h3">{labels.diagnosis}</LumenText>
          <LumenText as="p">{workflow.rejection.reason}</LumenText>
          <LumenText as="span">{labels.denialCount(workflow.rejection.count)}</LumenText>
        </LumenFrame>
      )}
      <LumenFrame className="hbar-app-react-workflow-group">
        <LumenText as="h3">
          <LumenIcon icon={Bot} tier="sm" /> {labels.agents}
        </LumenText>
        {workflow?.delegations.length ? (
          <LumenCollection as="ul" className="hbar-app-react-workflow-agents">
            {workflow.delegations.map((delegation, index) => {
              const agent = delegation.agentId ? entry.agents[delegation.agentId] : undefined
              const action = delegation.agentId ? entry.actions[`apply:${delegation.agentId}`] : undefined
              return (
                <LumenCollectionItem key={`${delegation.delegationId}:${index}`}>
                  <LumenFrame>
                    <LumenText as="strong">{delegation.itemId}</LumenText>
                    <LumenStatus value={labels.delegationStatuses[delegation.status]} tone={tone(delegation.status)} />
                  </LumenFrame>
                  {agent?.resultSummary && <LumenText as="p">{agent.resultSummary}</LumenText>}
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
                    <LumenText as="p" role="status">
                      {labels.actionSucceeded}
                    </LumenText>
                  )}
                  {action?.error && (
                    <LumenText as="p" role="alert">
                      {labels.error(action.error)}
                    </LumenText>
                  )}
                </LumenCollectionItem>
              )
            })}
          </LumenCollection>
        ) : (
          <LumenText as="p" className="hbar-app-react-goal-plan-empty">
            {labels.noAgents}
          </LumenText>
        )}
      </LumenFrame>
      <LumenFrame className="hbar-app-react-workflow-group">
        <LumenText as="h3">
          <LumenIcon icon={ShieldCheck} tier="sm" /> {labels.evidence}
          <LumenText as="span">{labels.evidenceCount(evidence.length, workflow?.evidence.length ?? 0)}</LumenText>
        </LumenText>
        {evidence.length ? (
          <LumenCollection as="ol" className="hbar-app-react-workflow-evidence">
            {evidence.map((proof, index) => (
              <LumenCollectionItem key={`${proof.evidenceId}:${index}`}>
                <LumenIcon icon={GitPullRequestArrow} tier="sm" />
                <LumenText as="span">{labels.evidenceLabel(proof)}</LumenText>
                <LumenText as="time" dateTime={new Date(proof.createdAt).toISOString()}>
                  {labels.timestamp(proof.createdAt)}
                </LumenText>
              </LumenCollectionItem>
            ))}
          </LumenCollection>
        ) : (
          <LumenText as="p" className="hbar-app-react-goal-plan-empty">
            {labels.noEvidence}
          </LumenText>
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
