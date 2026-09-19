import { useCallback, useEffect } from 'react'
import { HbarAppUiButton, HbarAppUiStatus, HbarAppUiSurface } from 'hbar-app-ui'
import type { AgentRecord } from '@hbar/contracts/commands/agents'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './agent-workspace.css'

export interface HbarAgentWorkspaceLabels {
  readonly title: string
  readonly description: string
  readonly close: string
  readonly refresh: string
  readonly loading: string
  readonly empty: string
  readonly loadMore: string
  readonly createTitle: string
  readonly objective: string
  readonly objectivePlaceholder: string
  readonly childTitle: string
  readonly childTitlePlaceholder: string
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
  readonly status: (status: AgentRecord['status']) => string
  readonly budget: (tokens: number | null) => string
  readonly modelValue: (modelId: string) => string
  readonly timestamp: (value: number) => string
  readonly issue: (field: string) => string
  readonly error: (code: string) => string
}

function tone(status: AgentRecord['status']): 'neutral' | 'positive' | 'warning' | 'danger' {
  if (status === 'completed') return 'positive'
  if (status === 'failed' || status === 'interrupted') return 'danger'
  if (status === 'waiting_approval' || status === 'cancelRequested') return 'warning'
  return 'neutral'
}

export function HbarAgentWorkspace({
  labels,
  connected,
}: {
  readonly labels: HbarAgentWorkspaceLabels
  readonly connected: boolean
}) {
  const runtime = useHbarRuntime()
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const agents = useHbarRuntimeState(runtime.state.agents)
  const instanceId = surfaces.focusedPanelId
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
  const setField = (field: string, value: string) => invoke('agentWorkspace.setField', { instanceId, field, value })
  const openSession = (sessionId: string) => {
    void runtime.commands
      .execute('app.closePanel', { instanceId })
      .then(() => runtime.commands.execute('app.setSession', { sessionId }))
      .catch(() => {})
  }

  return (
    <HbarAppUiSurface className="hbar-app-react-agent-workspace">
      <header>
        <div>
          <h1>{labels.title}</h1>
          <p>{labels.description}</p>
        </div>
        <div className="hbar-app-react-agent-header-actions">
          <HbarAppUiButton
            disabled={!connected || entry?.status === 'loading'}
            onClick={() => invoke('agentWorkspace.refresh', { instanceId })}
          >
            {labels.refresh}
          </HbarAppUiButton>
          <HbarAppUiButton onClick={() => invoke('app.closePanel', { instanceId })}>{labels.close}</HbarAppUiButton>
        </div>
      </header>
      <main>
        <form
          className="hbar-app-react-agent-create"
          onSubmit={(event) => {
            event.preventDefault()
            invoke('agentWorkspace.create', { instanceId })
          }}
        >
          <h2>{labels.createTitle}</h2>
          <fieldset disabled={!connected || creationBusy || !entry}>
            <label>
              <span>{labels.objective}</span>
              <textarea
                required
                value={entry?.draft.objective ?? ''}
                placeholder={labels.objectivePlaceholder}
                aria-invalid={Boolean(entry?.draft.issues.objective)}
                onChange={(event) => setField('objective', event.currentTarget.value)}
              />
              {entry?.draft.issues.objective && <small>{labels.issue('objective')}</small>}
            </label>
            <label>
              <span>{labels.childTitle}</span>
              <input
                value={entry?.draft.title ?? ''}
                placeholder={labels.childTitlePlaceholder}
                aria-invalid={Boolean(entry?.draft.issues.title)}
                onChange={(event) => setField('title', event.currentTarget.value)}
              />
            </label>
            <label>
              <span>{labels.model}</span>
              <input
                required
                value={entry?.draft.modelId ?? ''}
                aria-invalid={Boolean(entry?.draft.issues.modelId)}
                onChange={(event) => setField('modelId', event.currentTarget.value)}
              />
              {entry?.draft.issues.modelId && <small>{labels.issue('modelId')}</small>}
            </label>
            <label>
              <span>{labels.tokenBudget}</span>
              <input
                inputMode="numeric"
                type="number"
                min={1}
                max={1_000_000_000}
                value={entry?.draft.tokenBudget ?? ''}
                aria-invalid={Boolean(entry?.draft.issues.tokenBudget)}
                onChange={(event) => setField('tokenBudget', event.currentTarget.value)}
              />
              {entry?.draft.issues.tokenBudget && <small>{labels.issue('tokenBudget')}</small>}
            </label>
            <label>
              <span>{labels.thinkingLevel}</span>
              <input
                value={entry?.draft.thinkingLevel ?? ''}
                aria-invalid={Boolean(entry?.draft.issues.thinkingLevel)}
                onChange={(event) => setField('thinkingLevel', event.currentTarget.value)}
              />
            </label>
            <label>
              <span>{labels.approval}</span>
              <select
                value={entry?.draft.approval ?? 'deny'}
                onChange={(event) => setField('approval', event.currentTarget.value)}
              >
                {(['deny', 'ask', 'allow'] as const).map((option) => (
                  <option key={option} value={option}>
                    {labels.approvalOptions[option]}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          {entry?.creation.error && <p role="alert">{labels.error(entry.creation.error)}</p>}
          {entry?.creation.status === 'succeeded' && <p role="status">{labels.created}</p>}
          <HbarAppUiButton
            disabled={!connected || !entry || entry.creation.status === 'submitting'}
            tone="accent"
            type="submit"
          >
            {entry?.creation.status === 'submitting'
              ? labels.creating
              : entry?.creation.status === 'unknown'
                ? labels.retryCreate
                : labels.create}
          </HbarAppUiButton>
        </form>
        <section className="hbar-app-react-agent-list" aria-label={labels.title}>
          <header>
            <h2>{labels.count(entry?.items.length ?? 0)}</h2>
          </header>
          {!entry || entry.status === 'loading' ? (
            <p>{labels.loading}</p>
          ) : entry.error ? (
            <p role="alert">{labels.error(entry.error)}</p>
          ) : entry.items.length === 0 ? (
            <p>{labels.empty}</p>
          ) : (
            <ul>
              {entry.items.map((agent) => {
                const action = entry.actions[agent.agentId]
                const isTerminal = ['completed', 'cancelled', 'failed', 'interrupted'].includes(agent.status)
                return (
                  <li key={agent.agentId}>
                    <header>
                      <strong>{agent.objective}</strong>
                      <HbarAppUiStatus value={labels.status(agent.status)} tone={tone(agent.status)} />
                    </header>
                    <dl>
                      <div>
                        <dt>{labels.model}</dt>
                        <dd>{labels.modelValue(agent.modelId)}</dd>
                      </div>
                      <div>
                        <dt>{labels.tokenBudget}</dt>
                        <dd>{labels.budget(agent.tokenBudget)}</dd>
                      </div>
                      <div>
                        <dt>{labels.createdAt}</dt>
                        <dd>{labels.timestamp(agent.createdAt)}</dd>
                      </div>
                    </dl>
                    {agent.error && <p role="alert">{agent.error}</p>}
                    {action?.error && <p role="alert">{labels.error(action.error)}</p>}
                    <footer>
                      <HbarAppUiButton onClick={() => openSession(agent.sessionId)}>
                        {labels.openSession}
                      </HbarAppUiButton>
                      {!isTerminal && (
                        <HbarAppUiButton
                          disabled={!connected || action?.status === 'submitting'}
                          tone="warning"
                          onClick={() => invoke('agentWorkspace.cancel', { instanceId, agentId: agent.agentId })}
                        >
                          {action?.status === 'submitting'
                            ? labels.cancelling
                            : action?.status === 'unknown'
                              ? labels.retryCancel
                              : labels.cancel}
                        </HbarAppUiButton>
                      )}
                    </footer>
                  </li>
                )
              })}
            </ul>
          )}
          {entry?.nextCursor && (
            <HbarAppUiButton onClick={() => invoke('agentWorkspace.loadMore', { instanceId })}>
              {labels.loadMore}
            </HbarAppUiButton>
          )}
        </section>
      </main>
    </HbarAppUiSurface>
  )
}
