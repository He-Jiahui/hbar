import { Bot, Focus, GitPullRequestArrow, ShieldCheck } from 'lucide-react'
import { LumenButton, LumenIcon, LumenStatus } from '@lumen/app-ui'
import type {
  WorkflowAcceptanceStatus,
  WorkflowEvidence,
  WorkflowStatus,
  WorkflowWorkItem,
  WorkflowWorkItemStatus,
} from '@hbar/contracts'
import type { WorkflowWorkspaceEntryState } from '@hbar/app-runtime'

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
      <section className="hbar-app-react-workflow-overview">
        <p className="hbar-app-react-goal-plan-loading">{labels.loading}</p>
      </section>
    )
  if (entry.error)
    return (
      <section className="hbar-app-react-workflow-overview">
        <p role="alert">{labels.error(entry.error)}</p>
      </section>
    )
  const { plan, workflow } = entry.snapshot
  if (!plan && !workflow)
    return (
      <section className="hbar-app-react-workflow-overview">
        <header>
          <h2>{labels.title}</h2>
          <LumenStatus value={labels.statuses.none} tone="neutral" />
        </header>
        <p className="hbar-app-react-goal-plan-empty">{labels.empty}</p>
      </section>
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
    <section className="hbar-app-react-workflow-overview">
      <header>
        <h2>{labels.title}</h2>
        <LumenStatus value={labels.statuses[status]} tone={tone(status)} />
      </header>
      {!workflow && <p className="hbar-app-react-workflow-draft">{labels.draft}</p>}
      {workflow && (
        <div className="hbar-app-react-workflow-focus">
          <LumenIcon icon={Focus} tier="sm" />
          <span>{labels.focus}</span>
          <strong>{active?.title ?? labels.staleFocus}</strong>
        </div>
      )}
      <div className="hbar-app-react-workflow-group">
        <h3>
          {labels.todo} <span>{labels.itemCount(items.length)}</span>
        </h3>
        {items.length ? (
          <ol className="hbar-app-react-workflow-items">
            {items.map((item, index) => {
              const state = item.status
              const owner = item.owner
              return (
                <li key={`${item.id}:${index}`} data-active={workflow?.activeItemId === item.id || undefined}>
                  <div className="hbar-app-react-workflow-item-heading">
                    <strong>{item.title}</strong>
                    <LumenStatus value={labels.itemStatuses[state]} tone={tone(state)} />
                    <span>{owner.kind === 'main' ? labels.ownerMain : labels.ownerAgent(owner.agentId)}</span>
                  </div>
                  <details>
                    <summary>{labels.scope}</summary>
                    <dl>
                      <div>
                        <dt>{labels.readPaths}</dt>
                        <dd>{item.scope.readPaths.join(', ') || labels.none}</dd>
                      </div>
                      <div>
                        <dt>{labels.writePaths}</dt>
                        <dd>{item.scope.writePaths.join(', ') || labels.none}</dd>
                      </div>
                      <div>
                        <dt>{labels.tools}</dt>
                        <dd>{item.scope.tools.join(', ') || labels.none}</dd>
                      </div>
                    </dl>
                  </details>
                  <div className="hbar-app-react-workflow-checks">
                    <span>{labels.acceptance}</span>
                    <ul>
                      {item.acceptanceChecks.map((check, checkIndex) => {
                        const checkStatus = check.status
                        const actionKey = `accept:${item.id}:${check.id}`
                        const action = entry.actions[actionKey]
                        return (
                          <li key={`${check.id}:${checkIndex}`}>
                            <span>{check.description}</span>
                            <LumenStatus value={labels.acceptanceStatuses[checkStatus]} tone={tone(checkStatus)} />
                            {check.verifier.kind === 'user' && !['accepted', 'passed'].includes(checkStatus) && (
                              <div className="hbar-app-react-workflow-check-actions">
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
                              </div>
                            )}
                            {action?.status === 'succeeded' && <span role="status">{labels.actionSucceeded}</span>}
                            {action?.error && <span role="alert">{labels.error(action.error)}</span>}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="hbar-app-react-goal-plan-empty">{labels.none}</p>
        )}
      </div>
      <div className="hbar-app-react-workflow-group">
        <h3>
          <LumenIcon icon={Bot} tier="sm" /> {labels.agents}
        </h3>
        {workflow?.delegations.length ? (
          <ul className="hbar-app-react-workflow-agents">
            {workflow.delegations.map((delegation, index) => {
              const agent = delegation.agentId ? entry.agents[delegation.agentId] : undefined
              const action = delegation.agentId ? entry.actions[`apply:${delegation.agentId}`] : undefined
              return (
                <li key={`${delegation.delegationId}:${index}`}>
                  <div>
                    <strong>
                      {workflow.workItems.find((item) => item.id === delegation.itemId)?.title ?? delegation.itemId}
                    </strong>
                    <LumenStatus value={labels.delegationStatuses[delegation.status]} tone={tone(delegation.status)} />
                  </div>
                  {agent?.resultSummary && <p>{agent.resultSummary}</p>}
                  {agent?.patch && (
                    <details open={delegation.status === 'conflict'}>
                      <summary>{labels.patchFiles(agent.patch.files.length)}</summary>
                      <ul>
                        {agent.patch.files.map((file) => (
                          <li key={file.path}>{file.path}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="hbar-app-react-workflow-agent-actions">
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
                  </div>
                  {action?.status === 'succeeded' && <p role="status">{labels.actionSucceeded}</p>}
                  {action?.error && <p role="alert">{labels.error(action.error)}</p>}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="hbar-app-react-goal-plan-empty">{labels.noAgents}</p>
        )}
      </div>
      <div className="hbar-app-react-workflow-group">
        <h3>
          <LumenIcon icon={ShieldCheck} tier="sm" /> {labels.evidence}
          <span>{labels.evidenceCount(evidence.length, workflow?.evidence.length ?? 0)}</span>
        </h3>
        {evidence.length ? (
          <ol className="hbar-app-react-workflow-evidence">
            {evidence.map((proof, index) => (
              <li key={`${proof.evidenceId}:${index}`}>
                <LumenIcon icon={GitPullRequestArrow} tier="sm" />
                <span>{labels.evidenceLabel(proof)}</span>
                <time dateTime={new Date(proof.createdAt).toISOString()}>{labels.timestamp(proof.createdAt)}</time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="hbar-app-react-goal-plan-empty">{labels.noEvidence}</p>
        )}
        {workflow && entry.visibleEvidence < workflow.evidence.length && (
          <LumenButton onClick={() => invoke('workflowWorkspace.loadMoreEvidence', { instanceId })}>
            {labels.loadMore}
          </LumenButton>
        )}
      </div>
    </section>
  )
}
