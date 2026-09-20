import { useCallback, useEffect } from 'react'
import { Bot, ExternalLink, Plus, RefreshCw } from 'lucide-react'
import {
  LumenButton,
  LumenCompactMetrics,
  LumenFormField,
  LumenIcon,
  LumenIconButton,
  LumenInput,
  LumenSelect,
  LumenStatus,
  LumenTextarea,
  LumenToolPane,
} from '@lumen/app-ui'
import type { AgentWorkspaceEntryState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './lumen-agent-workspace.css'

type Agent = AgentWorkspaceEntryState['items'][number]
type AgentStatus = Agent['status']

export interface HbarAgentWorkspaceLabels {
  readonly title: string
  readonly description: string
  readonly close: string
  readonly refresh: string
  readonly loading: string
  readonly empty: string
  readonly loadMore: string
  readonly createTitle: string
  readonly createScope: string
  readonly detailTitle: string
  readonly back: string
  readonly showDetails: (objective: string) => string
  readonly objective: string
  readonly objectivePlaceholder: string
  readonly childTitle: string
  readonly childTitlePlaceholder: string
  readonly parentSession: string
  readonly currentSession: (sessionId: string) => string
  readonly createdAt: string
  readonly model: string
  readonly tokenBudget: string
  readonly thinkingLevel: string
  readonly approval: string
  readonly approvalOptions: Readonly<Record<'deny' | 'ask' | 'allow', string>>
  readonly create: string
  readonly creating: string
  readonly retryCreate: string
  readonly created: string
  readonly openSession: string
  readonly cancel: string
  readonly cancelling: string
  readonly retryCancel: string
  readonly count: (count: number) => string
  readonly status: (status: AgentStatus) => string
  readonly budget: (tokens: number | null) => string
  readonly summary: (modelId: string, tokens: number | null) => string
  readonly modelValue: (modelId: string) => string
  readonly timestamp: (value: number) => string
  readonly issue: (field: string) => string
  readonly error: (code: string) => string
}

function tone(status: AgentStatus): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'completed') return 'success'
  if (status === 'failed' || status === 'interrupted') return 'danger'
  if (status === 'waiting_approval' || status === 'cancelRequested') return 'warning'
  return 'neutral'
}

function terminal(status: AgentStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'failed' || status === 'interrupted'
}

export function HbarAgentWorkspace({
  labels,
  connected,
  instanceId: requestedInstanceId,
  targetLabel,
}: {
  readonly labels: HbarAgentWorkspaceLabels
  readonly connected: boolean
  readonly instanceId?: string
  readonly targetLabel?: string | undefined
}) {
  const runtime = useHbarRuntime()
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const agents = useHbarRuntimeState(runtime.state.agents)
  const instanceId = requestedInstanceId ?? presentation.toolInstanceId
  const panel = instanceId ? surfaces.panels[instanceId] : undefined
  const entry = instanceId ? agents.entries[instanceId] : undefined
  const invoke = useCallback(
    (name: string, input: unknown) =>
      void (runtime.commands.execute as (command: string, value: unknown) => Promise<unknown>)(name, input).catch(
        () => {},
      ),
    [runtime.commands],
  )
  useEffect(() => {
    if (instanceId && panel?.panelId === 'agents' && panel.sessionId && entry?.parentSessionId !== panel.sessionId)
      invoke('agentWorkspace.refresh', { instanceId })
  }, [entry?.parentSessionId, instanceId, invoke, panel?.panelId, panel?.sessionId])
  if (!instanceId || panel?.panelId !== 'agents') return null

  const creationBusy = entry?.creation.status === 'submitting' || entry?.creation.status === 'unknown'
  const view = entry?.view ?? 'list'
  const selectedAgent =
    view === 'detail' ? entry?.items.find((agent) => agent.agentId === entry.selectedAgentId) : undefined
  const selectedAction = selectedAgent ? entry?.actions[selectedAgent.agentId] : undefined
  const setField = (field: string, value: string) => invoke('agentWorkspace.setField', { instanceId, field, value })
  const openSession = (sessionId: string) => {
    void runtime.commands
      .execute('app.setSession', { sessionId })
      .then(() => runtime.commands.execute('app.closePanel', { instanceId }))
      .catch(() => {})
  }
  const back = () => invoke('agentWorkspace.showList', { instanceId })

  return (
    <LumenToolPane
      title={labels.title}
      targetLabel={targetLabel}
      description={labels.description}
      icon={Bot}
      backLabel={view === 'list' ? undefined : labels.back}
      closeLabel={labels.close}
      onBack={view === 'list' ? undefined : back}
      onClose={() => invoke('app.closePanel', { instanceId })}
      busy={Boolean(!entry || entry.status === 'loading' || creationBusy)}
      actions={
        <>
          {view === 'list' && entry && (
            <LumenIconButton
              label={labels.createTitle}
              disabled={!connected}
              onClick={() => invoke('agentWorkspace.showCreate', { instanceId })}
            >
              <LumenIcon icon={Plus} tier="sm" />
            </LumenIconButton>
          )}
          <LumenIconButton
            label={labels.refresh}
            disabled={!connected || entry?.status === 'loading'}
            onClick={() => invoke('agentWorkspace.refresh', { instanceId })}
          >
            <LumenIcon icon={RefreshCw} tier="sm" />
          </LumenIconButton>
        </>
      }
      className="hbar-app-react-agent-workspace"
    >
      {view === 'create' && entry ? (
        <main className="hbar-app-react-agent-create-view">
          <div>
            <h2>{labels.createTitle}</h2>
            <p>{labels.createScope}</p>
          </div>
          <form
            className="hbar-app-react-agent-create"
            onSubmit={(event) => {
              event.preventDefault()
              invoke('agentWorkspace.create', { instanceId })
            }}
          >
            <fieldset disabled={!connected || creationBusy}>
              <LumenFormField
                controlId={`${instanceId}-agent-objective`}
                label={labels.objective}
                required
                {...(entry.draft.issues.objective ? { error: labels.issue('objective') } : {})}
              >
                <LumenTextarea
                  id={`${instanceId}-agent-objective`}
                  required
                  value={entry.draft.objective}
                  placeholder={labels.objectivePlaceholder}
                  onChange={(event) => setField('objective', event.currentTarget.value)}
                />
              </LumenFormField>
              <LumenFormField controlId={`${instanceId}-agent-title`} label={labels.childTitle}>
                <LumenInput
                  id={`${instanceId}-agent-title`}
                  value={entry.draft.title}
                  placeholder={labels.childTitlePlaceholder}
                  onChange={(event) => setField('title', event.currentTarget.value)}
                />
              </LumenFormField>
              <LumenFormField
                controlId={`${instanceId}-agent-model`}
                label={labels.model}
                required
                {...(entry.draft.issues.modelId ? { error: labels.issue('modelId') } : {})}
              >
                <LumenInput
                  id={`${instanceId}-agent-model`}
                  required
                  value={entry.draft.modelId}
                  onChange={(event) => setField('modelId', event.currentTarget.value)}
                />
              </LumenFormField>
              <LumenFormField
                controlId={`${instanceId}-agent-budget`}
                label={labels.tokenBudget}
                {...(entry.draft.issues.tokenBudget ? { error: labels.issue('tokenBudget') } : {})}
              >
                <LumenInput
                  id={`${instanceId}-agent-budget`}
                  inputMode="numeric"
                  type="number"
                  min={1}
                  max={1_000_000_000}
                  value={entry.draft.tokenBudget}
                  onChange={(event) => setField('tokenBudget', event.currentTarget.value)}
                />
              </LumenFormField>
              <LumenFormField controlId={`${instanceId}-agent-thinking`} label={labels.thinkingLevel}>
                <LumenInput
                  id={`${instanceId}-agent-thinking`}
                  value={entry.draft.thinkingLevel}
                  onChange={(event) => setField('thinkingLevel', event.currentTarget.value)}
                />
              </LumenFormField>
              <LumenFormField controlId={`${instanceId}-agent-approval`} label={labels.approval}>
                <LumenSelect
                  id={`${instanceId}-agent-approval`}
                  value={entry.draft.approval}
                  onChange={(event) => setField('approval', event.currentTarget.value)}
                >
                  {(['deny', 'ask', 'allow'] as const).map((option) => (
                    <option key={option} value={option}>
                      {labels.approvalOptions[option]}
                    </option>
                  ))}
                </LumenSelect>
              </LumenFormField>
            </fieldset>
            {entry.creation.error && <p role="alert">{labels.error(entry.creation.error)}</p>}
            <LumenButton
              disabled={!connected || entry.creation.status === 'submitting'}
              tone="primary"
              type="submit"
            >
              {entry.creation.status === 'submitting'
                ? labels.creating
                : entry.creation.status === 'unknown'
                  ? labels.retryCreate
                  : labels.create}
            </LumenButton>
          </form>
        </main>
      ) : selectedAgent && entry ? (
        <main className="hbar-app-react-agent-detail">
          <div className="hbar-app-react-agent-detail-heading">
            <h2>{labels.detailTitle}</h2>
            <LumenStatus value={labels.status(selectedAgent.status)} tone={tone(selectedAgent.status)} />
          </div>
          {entry.creation.status === 'succeeded' && entry.selectedAgentId === selectedAgent.agentId && (
            <p role="status">{labels.created}</p>
          )}
          <section>
            <h3>{labels.objective}</h3>
            <p>{selectedAgent.objective}</p>
          </section>
          <LumenCompactMetrics
            label={labels.detailTitle}
            metrics={[
              {
                id: 'parent-session',
                label: labels.parentSession,
                value: labels.currentSession(selectedAgent.parentSessionId),
              },
              { id: 'model', label: labels.model, value: labels.modelValue(selectedAgent.modelId) },
              { id: 'budget', label: labels.tokenBudget, value: labels.budget(selectedAgent.tokenBudget) },
              { id: 'created', label: labels.createdAt, value: labels.timestamp(selectedAgent.createdAt) },
            ]}
          />
          {selectedAgent.error && <p role="alert">{selectedAgent.error}</p>}
          {selectedAction?.error && <p role="alert">{labels.error(selectedAction.error)}</p>}
          <footer>
            <LumenButton tone="primary" onClick={() => openSession(selectedAgent.sessionId)}>
              <LumenIcon icon={ExternalLink} tier="sm" />
              <span>{labels.openSession}</span>
            </LumenButton>
            {!terminal(selectedAgent.status) && (
              <LumenButton
                disabled={!connected || selectedAction?.status === 'submitting'}
                tone="warning"
                onClick={() => invoke('agentWorkspace.cancel', { instanceId, agentId: selectedAgent.agentId })}
              >
                {selectedAction?.status === 'submitting'
                  ? labels.cancelling
                  : selectedAction?.status === 'unknown'
                    ? labels.retryCancel
                    : labels.cancel}
              </LumenButton>
            )}
          </footer>
        </main>
      ) : (
        <main className="hbar-app-react-agent-list" aria-label={labels.title}>
          <header>
            <h2>{labels.count(entry?.items.length ?? 0)}</h2>
          </header>
          {!entry || entry.status === 'loading' ? (
            <p>{labels.loading}</p>
          ) : entry.error ? (
            <p role="alert">{labels.error(entry.error)}</p>
          ) : entry.items.length === 0 ? (
            <p className="hbar-app-react-agent-empty">{labels.empty}</p>
          ) : (
            <ul>
              {entry.items.map((agent) => (
                <li key={agent.agentId}>
                  <LumenButton
                    className="hbar-app-react-agent-row"
                    variant="outlined"
                    aria-label={labels.showDetails(agent.objective)}
                    onClick={() => invoke('agentWorkspace.showAgent', { instanceId, agentId: agent.agentId })}
                  >
                    <span>
                      <strong>{agent.objective}</strong>
                      <LumenStatus value={labels.status(agent.status)} tone={tone(agent.status)} />
                    </span>
                    <small>{labels.summary(agent.modelId, agent.tokenBudget)}</small>
                    <time dateTime={new Date(agent.createdAt).toISOString()}>{labels.timestamp(agent.createdAt)}</time>
                  </LumenButton>
                </li>
              ))}
            </ul>
          )}
          {entry?.nextCursor && (
            <LumenButton onClick={() => invoke('agentWorkspace.loadMore', { instanceId })}>
              {labels.loadMore}
            </LumenButton>
          )}
        </main>
      )}
    </LumenToolPane>
  )
}
