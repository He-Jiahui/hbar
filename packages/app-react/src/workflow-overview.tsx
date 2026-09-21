import { Bot, Focus, GitPullRequestArrow, ShieldCheck } from 'lucide-react'
import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenButton, LumenDisclosure, LumenIcon, LumenStatus } from '@lumen/app-ui'
import type { WorkflowWorkspaceEntryState } from '@hbar/app-runtime'

type WorkflowState = NonNullable<WorkflowWorkspaceEntryState['snapshot']['workflow']>
type WorkflowStatus = WorkflowState['status']
type WorkflowEvidence = WorkflowState['evidence'][number]
type WorkflowWorkItem = WorkflowState['workItems'][number]
type WorkflowWorkItemStatus = WorkflowWorkItem['status']
type WorkflowAcceptanceStatus = WorkflowWorkItem['acceptanceChecks'][number]['status']
type DelegationStatus = NonNullable<
  WorkflowWorkspaceEntryState['snapshot']['workflow']
>['delegations'][number]['status']

export interface HbarWorkflowOverviewLabels {
  readonly title: string
  readonly loading: string
  readonly empty: string
  readonly draft: string
  readonly focus: string
  readonly staleFocus: string
  readonly todo: string
  readonly acceptance: string
  readonly scope: string
  readonly readPaths: string
  readonly writePaths: string
  readonly tools: string
  readonly none: string
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
  readonly itemStatuses: Readonly<Record<WorkflowWorkItemStatus, string>>
  readonly acceptanceStatuses: Readonly<Record<WorkflowAcceptanceStatus, string>>
  readonly delegationStatuses: Readonly<Record<DelegationStatus, string>>
  readonly ownerMain: string
  readonly ownerAgent: (agentId: string) => string
  readonly itemCount: (count: number) => string
  readonly evidenceCount: (visible: number, total: number) => string
  readonly patchFiles: (count: number) => string
  readonly acceptanceAction: (decision: 'accepted' | 'rejected', check: string) => string
  readonly evidenceLabel: (evidence: WorkflowEvidence) => string
  readonly timestamp: (value: number) => string
}

function tone(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (['completed', 'passed', 'accepted', 'applied'].includes(status)) return 'success'
  if (['failed', 'rejected', 'conflict'].includes(status)) return 'danger'
  if (['blocked', 'waiting', 'verifying', 'patch_ready'].includes(status)) return 'warning'
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
        <LumenText as="p" className="hbar-app-react-goal-plan-loading">{labels.loading}</LumenText>
      </LumenFrame>
    )
  if (entry.error)
    return (
      <LumenFrame as="section" className="hbar-app-react-workflow-overview">
        <LumenText as="p" role="alert">{labels.error(entry.error)}</LumenText>
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
        <LumenText as="p" className="hbar-app-react-goal-plan-empty">{labels.empty}</LumenText>
      </LumenFrame>
    )
  const status = workflow?.status ?? 'draft'
  const active = workflow?.workItems.find((item) => item.id === workflow.activeItemId)
  const items: readonly WorkflowWorkItem[] =
    workflow?.workItems ??
    plan?.items.map((item) => ({
      ...item,
      status: 'pending' as const,
      owner: { kind: 'main' as const },
      acceptanceChecks: item.acceptanceChecks.map((check) => ({
        ...check,
        status: 'pending' as const,
        evidenceId: null,
        updatedAt: plan.updatedAt,
      })),
      startedAt: null,
      completedAt: null,
    })) ??
    []
  const evidence = workflow?.evidence.slice(-entry.visibleEvidence).reverse() ?? []
  return (
    <LumenFrame as="section" className="hbar-app-react-workflow-overview">
      <LumenFrame as="header">
        <LumenText as="h2">{labels.title}</LumenText>
        <LumenStatus value={labels.statuses[status]} tone={tone(status)} />
      </LumenFrame>
      {!workflow && <LumenText as="p" className="hbar-app-react-workflow-draft">{labels.draft}</LumenText>}
      {workflow && (
        <LumenFrame className="hbar-app-react-workflow-focus">
          <LumenIcon icon={Focus} tier="sm" />
          <LumenText as="span">{labels.focus}</LumenText>
          <LumenText as="strong">{active?.title ?? labels.staleFocus}</LumenText>
        </LumenFrame>
      )}
      <LumenFrame className="hbar-app-react-workflow-group">
        <LumenText as="h3">
          {labels.todo} <LumenText as="span">{labels.itemCount(items.length)}</LumenText>
        </LumenText>
        {items.length ? (
          <LumenCollection as="ol" className="hbar-app-react-workflow-items">
            {items.map((item, index) => {
              const state = item.status
              const owner = item.owner
              return (
                <LumenCollectionItem key={`${item.id}:${index}`} data-active={workflow?.activeItemId === item.id || undefined}>
                  <LumenFrame className="hbar-app-react-workflow-item-heading">
                    <LumenText as="strong">{item.title}</LumenText>
                    <LumenStatus value={labels.itemStatuses[state]} tone={tone(state)} />
                    <LumenText as="span">{owner.kind === 'main' ? labels.ownerMain : labels.ownerAgent(owner.agentId)}</LumenText>
                  </LumenFrame>
                  <LumenDisclosure className="hbar-app-react-workflow-disclosure" summary={labels.scope}>
                    <LumenCollection as="dl">
                      <LumenFrame>
                        <LumenCollectionItem as="dt">{labels.readPaths}</LumenCollectionItem>
                        <LumenCollectionItem as="dd">{item.scope.readPaths.join(', ') || labels.none}</LumenCollectionItem>
                      </LumenFrame>
                      <LumenFrame>
                        <LumenCollectionItem as="dt">{labels.writePaths}</LumenCollectionItem>
                        <LumenCollectionItem as="dd">{item.scope.writePaths.join(', ') || labels.none}</LumenCollectionItem>
                      </LumenFrame>
                      <LumenFrame>
                        <LumenCollectionItem as="dt">{labels.tools}</LumenCollectionItem>
                        <LumenCollectionItem as="dd">{item.scope.tools.join(', ') || labels.none}</LumenCollectionItem>
                      </LumenFrame>
                    </LumenCollection>
                  </LumenDisclosure>
                  <LumenFrame className="hbar-app-react-workflow-checks">
                    <LumenText as="span">{labels.acceptance}</LumenText>
                    <LumenCollection as="ul">
                      {item.acceptanceChecks.map((check, checkIndex) => {
                        const checkStatus = check.status
                        const actionKey = `accept:${item.id}:${check.id}`
                        const action = entry.actions[actionKey]
                        return (
                          <LumenCollectionItem key={`${check.id}:${checkIndex}`}>
                            <LumenText as="span">{check.description}</LumenText>
                            <LumenStatus value={labels.acceptanceStatuses[checkStatus]} tone={tone(checkStatus)} />
                            {check.verifier.kind === 'user' && !['accepted', 'passed'].includes(checkStatus) && (
                              <LumenFrame className="hbar-app-react-workflow-check-actions">
                                <LumenButton
                                  disabled={
                                    !connected || action?.status === 'submitting' || action?.status === 'unknown'
                                  }
                                  onClick={() =>
                                    invoke('workflowWorkspace.acceptCheck', {
                                      instanceId,
                                      itemId: item.id,
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
                                  disabled={
                                    !connected || action?.status === 'submitting' || action?.status === 'unknown'
                                  }
                                  onClick={() =>
                                    invoke('workflowWorkspace.acceptCheck', {
                                      instanceId,
                                      itemId: item.id,
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
                            {action?.status === 'succeeded' && <LumenText as="span" role="status">{labels.actionSucceeded}</LumenText>}
                            {action?.error && <LumenText as="span" role="alert">{labels.error(action.error)}</LumenText>}
                          </LumenCollectionItem>
                        )
                      })}
                    </LumenCollection>
                  </LumenFrame>
                </LumenCollectionItem>
              )
            })}
          </LumenCollection>
        ) : (
          <LumenText as="p" className="hbar-app-react-goal-plan-empty">{labels.none}</LumenText>
        )}
      </LumenFrame>
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
                    <LumenText as="strong">
                      {workflow.workItems.find((item) => item.id === delegation.itemId)?.title ?? delegation.itemId}
                    </LumenText>
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
                  {action?.status === 'succeeded' && <LumenText as="p" role="status">{labels.actionSucceeded}</LumenText>}
                  {action?.error && <LumenText as="p" role="alert">{labels.error(action.error)}</LumenText>}
                </LumenCollectionItem>
              )
            })}
          </LumenCollection>
        ) : (
          <LumenText as="p" className="hbar-app-react-goal-plan-empty">{labels.noAgents}</LumenText>
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
                <LumenText as="time" dateTime={new Date(proof.createdAt).toISOString()}>{labels.timestamp(proof.createdAt)}</LumenText>
              </LumenCollectionItem>
            ))}
          </LumenCollection>
        ) : (
          <LumenText as="p" className="hbar-app-react-goal-plan-empty">{labels.noEvidence}</LumenText>
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
