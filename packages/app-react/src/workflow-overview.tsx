import { Bot, Focus, GitPullRequestArrow, ShieldCheck } from 'lucide-react'
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
import type { workflowWorkspaceCommands } from '@hbar/contracts/commands/workflow-workspace'
import { HbarLumenDisclosure } from './lumen-disclosure'
import './workflow-overview.css'

type WorkflowState = NonNullable<WorkflowWorkspaceEntryState['snapshot']['workflow']>
type WorkflowStatusCode = WorkflowState['status']
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
  readonly scopeEntries: (entries: readonly string[]) => string
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
  readonly statuses: Readonly<Record<WorkflowStatusCode | 'draft' | 'none', string>>
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

function WorkflowStatus({ value, status }: { readonly value: string; readonly status: string }) {
  return (
    <LumenFrame className="hbar-workflow-reading" role="group" aria-label={value} tabIndex={0}>
      <LumenStatus value={value} tone={tone(status)} />
    </LumenFrame>
  )
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
  readonly invoke: (name: keyof typeof workflowWorkspaceCommands | 'app.setSession', input: unknown) => void
}) {
  if (!entry || entry.status === 'loading')
    return (
      <LumenFrame as="section" className="hbar-app-react-workflow-overview">
        <LumenContentText context="feedback.paragraph" role="status" className="hbar-workflow-loading">
          {labels.loading}
        </LumenContentText>
      </LumenFrame>
    )
  if (entry.error)
    return (
      <LumenFrame as="section" className="hbar-app-react-workflow-overview">
        <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
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
          <WorkflowStatus value={labels.statuses.none} status="none" />
        </LumenFrame>
        <LumenContentText context="empty.description" className="hbar-workflow-empty">
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
        <WorkflowStatus value={labels.statuses[status]} status={status} />
      </LumenFrame>
      {!workflow && (
        <LumenContentText context="feedback.paragraph" tone="warning" className="hbar-app-react-workflow-draft">
          {labels.draft}
        </LumenContentText>
      )}
      {workflow && (
        <LumenFrame className="hbar-app-react-workflow-focus">
          <LumenIcon icon={Focus} tier="sm" />
          <LumenContentText context="collection.detail">{labels.focus}</LumenContentText>
          <LumenContentText context="collection.title">{focus?.title ?? labels.staleFocus}</LumenContentText>
          {focus && <WorkflowStatus value={labels.focusStatuses[focus.status]} status={focus.status} />}
        </LumenFrame>
      )}
      {focus && (
        <LumenFrame className="hbar-app-react-workflow-group">
          <LumenFrame className="hbar-app-react-workflow-policy">
            <LumenContentText context="collection.detail">{labels.completionPolicy}</LumenContentText>
            <WorkflowStatus value={labels.completionPolicies[focus.completionPolicy]} status="none" />
          </LumenFrame>
          <HbarLumenDisclosure className="hbar-app-react-workflow-disclosure" label={labels.scope}>
            <LumenCollection as="dl" className="hbar-app-react-workflow-scope">
              <LumenFrame>
                <LumenContentText context="detail.term" className="hbar-workflow-reading" tabIndex={0}>
                  {labels.readPaths}
                </LumenContentText>
                <LumenContentText context="detail.value">{labels.scopeEntries(focus.scope.readPaths)}</LumenContentText>
              </LumenFrame>
              <LumenFrame>
                <LumenContentText context="detail.term" className="hbar-workflow-reading" tabIndex={0}>
                  {labels.writePaths}
                </LumenContentText>
                <LumenContentText context="detail.value">
                  {labels.scopeEntries(focus.scope.writePaths)}
                </LumenContentText>
              </LumenFrame>
              <LumenFrame>
                <LumenContentText context="detail.term" className="hbar-workflow-reading" tabIndex={0}>
                  {labels.tools}
                </LumenContentText>
                <LumenContentText context="detail.value">{labels.scopeEntries(focus.scope.tools)}</LumenContentText>
              </LumenFrame>
            </LumenCollection>
          </HbarLumenDisclosure>
          <LumenFrame className="hbar-app-react-workflow-checks">
            <LumenContentText context="section.title" level={3}>
              {labels.acceptance}
            </LumenContentText>
            {focus.acceptanceChecks.length ? (
              <LumenCollection as="ul">
                {focus.acceptanceChecks.map((check) => {
                  const actionKey = `accept:${focus.focusId}:${check.id}`
                  const action = entry.actions[actionKey]
                  const canDecide =
                    workflow.status === 'waiting_user' &&
                    focus.completionPolicy === 'user' &&
                    check.verifier.kind === 'user' &&
                    !['accepted', 'passed'].includes(check.status)
                  return (
                    <LumenCollectionItem key={check.id}>
                      <LumenContentText context="collection.description">{check.description}</LumenContentText>
                      <WorkflowStatus value={labels.acceptanceStatuses[check.status]} status={check.status} />
                      {canDecide && (
                        <LumenFrame
                          className="hbar-app-react-workflow-check-actions hbar-workflow-reading"
                          role="group"
                          aria-label={labels.acceptanceAction('accepted', check.description)}
                          tabIndex={0}
                        >
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
                        <LumenContentText context="feedback.detail" tone="success" role="status">
                          {labels.actionSucceeded}
                        </LumenContentText>
                      )}
                      {action?.error && (
                        <LumenContentText context="feedback.detail" tone="danger" role="alert">
                          {labels.error(action.error)}
                        </LumenContentText>
                      )}
                    </LumenCollectionItem>
                  )
                })}
              </LumenCollection>
            ) : (
              <LumenContentText context="empty.description" className="hbar-workflow-empty">
                {labels.none}
              </LumenContentText>
            )}
          </LumenFrame>
        </LumenFrame>
      )}
      {workflow?.review && (
        <LumenFrame className="hbar-app-react-workflow-group">
          <LumenContentText context="section.title" level={3}>
            {labels.review}
          </LumenContentText>
          <WorkflowStatus value={labels.reviewStatuses[workflow.review.status]} status={workflow.review.status} />
          {workflow.review.summary && (
            <LumenContentText context="reading.paragraph">{workflow.review.summary}</LumenContentText>
          )}
        </LumenFrame>
      )}
      {workflow?.rejection && (
        <LumenFrame className="hbar-app-react-workflow-group">
          <LumenContentText context="section.title" level={3}>
            {labels.diagnosis}
          </LumenContentText>
          <LumenContentText context="feedback.paragraph" tone="warning">
            {workflow.rejection.reason}
          </LumenContentText>
          <LumenContentText context="collection.detail">
            {labels.denialCount(workflow.rejection.count)}
          </LumenContentText>
        </LumenFrame>
      )}
      <LumenFrame className="hbar-app-react-workflow-group">
        <LumenContentText context="section.title" level={3}>
          <LumenIcon icon={Bot} tier="sm" /> {labels.agents}
        </LumenContentText>
        {workflow?.delegations.length ? (
          <LumenCollection as="ul" className="hbar-app-react-workflow-agents">
            {workflow.delegations.map((delegation) => {
              const agent = delegation.agentId ? entry.agents[delegation.agentId] : undefined
              const action = delegation.agentId ? entry.actions[`apply:${delegation.agentId}`] : undefined
              return (
                <LumenCollectionItem key={delegation.delegationId}>
                  <LumenFrame>
                    <LumenContentText context="collection.title">{delegation.itemId}</LumenContentText>
                    <WorkflowStatus value={labels.delegationStatuses[delegation.status]} status={delegation.status} />
                  </LumenFrame>
                  {agent?.resultSummary && (
                    <LumenContentText context="reading.paragraph">{agent.resultSummary}</LumenContentText>
                  )}
                  {agent?.patch && (
                    <HbarLumenDisclosure
                      key={`${agent.patch.patchId}:${delegation.status === 'conflict'}`}
                      className="hbar-app-react-workflow-disclosure"
                      label={labels.patchFiles(agent.patch.files.length)}
                      defaultOpen={delegation.status === 'conflict'}
                    >
                      <LumenCollection as="ul">
                        {agent.patch.files.map((file) => (
                          <LumenCollectionItem key={file.path}>
                            <LumenFrame
                              className="hbar-workflow-reading"
                              role="group"
                              aria-label={file.path}
                              tabIndex={0}
                            >
                              <LumenContentText context="resource.path">{file.path}</LumenContentText>
                            </LumenFrame>
                          </LumenCollectionItem>
                        ))}
                      </LumenCollection>
                    </HbarLumenDisclosure>
                  )}
                  <LumenFrame
                    className="hbar-app-react-workflow-agent-actions hbar-workflow-reading"
                    role="group"
                    aria-label={delegation.status === 'conflict' ? labels.coordinate : labels.applyPatch}
                    tabIndex={0}
                  >
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
                    <LumenContentText context="feedback.paragraph" tone="success" role="status">
                      {labels.actionSucceeded}
                    </LumenContentText>
                  )}
                  {action?.error && (
                    <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
                      {labels.error(action.error)}
                    </LumenContentText>
                  )}
                </LumenCollectionItem>
              )
            })}
          </LumenCollection>
        ) : (
          <LumenContentText context="empty.description" className="hbar-workflow-empty">
            {labels.noAgents}
          </LumenContentText>
        )}
      </LumenFrame>
      <LumenFrame className="hbar-app-react-workflow-group">
        <LumenFrame className="hbar-workflow-section-heading">
          <LumenContentText context="section.title" level={3}>
            <LumenIcon icon={ShieldCheck} tier="sm" /> {labels.evidence}
          </LumenContentText>
          <LumenContentText context="collection.detail">
            {labels.evidenceCount(evidence.length, workflow?.evidence.length ?? 0)}
          </LumenContentText>
        </LumenFrame>
        {evidence.length ? (
          <LumenCollection as="ol" className="hbar-app-react-workflow-evidence">
            {evidence.map((proof) => (
              <LumenCollectionItem key={proof.evidenceId}>
                <LumenIcon icon={GitPullRequestArrow} tier="sm" />
                <LumenContentText context="collection.description">{labels.evidenceLabel(proof)}</LumenContentText>
                <LumenFrame
                  className="hbar-workflow-reading"
                  role="group"
                  aria-label={labels.timestamp(proof.createdAt)}
                  tabIndex={0}
                >
                  <LumenContentText context="metadata.time" dateTime={new Date(proof.createdAt).toISOString()}>
                    {labels.timestamp(proof.createdAt)}
                  </LumenContentText>
                </LumenFrame>
              </LumenCollectionItem>
            ))}
          </LumenCollection>
        ) : (
          <LumenContentText context="empty.description" className="hbar-workflow-empty">
            {labels.noEvidence}
          </LumenContentText>
        )}
        {workflow && entry.visibleEvidence < workflow.evidence.length && (
          <LumenFrame className="hbar-workflow-reading" role="group" aria-label={labels.loadMore} tabIndex={0}>
            <LumenButton onClick={() => invoke('workflowWorkspace.loadMoreEvidence', { instanceId })}>
              {labels.loadMore}
            </LumenButton>
          </LumenFrame>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}
