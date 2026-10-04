import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, ExternalLink, Plus, RefreshCw } from 'lucide-react'
import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenOption,
  LumenText,
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
import { AgentModelPicker, type AgentModelPickerLabels } from './agent-model-picker'
import './lumen-agent-workspace.css'

type Agent = AgentWorkspaceEntryState['items'][number]
type AgentStatus = Agent['status']
type AgentProfileId = NonNullable<Agent['profileId']>

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
  readonly profile: string
  readonly profileOptions: Readonly<Record<'general' | AgentProfileId, string>>
  readonly exploreHint: string
  readonly modelPicker: AgentModelPickerLabels
  readonly tokenBudget: string
  readonly thinkingLevel: string
  readonly thinkingDefault: (level: string | null) => string
  readonly thinkingOption: (level: string) => string
  readonly thinkingUnavailable: (level: string) => string
  readonly approval: string
  readonly approvalOptions: Readonly<Record<'deny' | 'ask' | 'sandbox' | 'allow', string>>
  readonly create: string
  readonly creating: string
  readonly retryCreate: string
  readonly created: string
  readonly openSession: string
  readonly openingSession: string
  readonly openSessionError: (code: string) => string
  readonly returnToParent: (title: string) => string
  readonly returningToParent: string
  readonly returnError: (code: string) => string
  readonly cancel: string
  readonly cancelling: string
  readonly retryCancel: string
  readonly count: (count: number) => string
  readonly status: (status: AgentStatus) => string
  readonly budget: (tokens: number | null) => string
  readonly summary: (modelId: string, tokens: number | null, profileId?: AgentProfileId) => string
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
  const tabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const [openState, setOpenState] = useState<{
    readonly agentId: string
    readonly status: 'submitting' | 'failed'
    readonly error: string | null
  } | null>(null)
  const openIntent = useRef(0)
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
  const catalog = agents.catalog
  const selectedModel = catalog.models.find((model) => model.id === entry?.draft.modelId)
  const openSession = (agent: Agent) => {
    if (openState?.status === 'submitting') return
    const source = tabs.items.find((item) => item.kind === 'session' && item.sessionId === agent.parentSessionId)
    if (!source || panel.sessionId !== agent.parentSessionId) {
      setOpenState({ agentId: agent.agentId, status: 'failed', error: 'SOURCE_CHANGED' })
      return
    }
    const intent = ++openIntent.current
    setOpenState({ agentId: agent.agentId, status: 'submitting', error: null })
    void runtime.commands
      .execute('agentChild.open', {
        panelInstanceId: instanceId,
        parentSessionId: agent.parentSessionId,
        agentId: agent.agentId,
        expectedChildSessionId: agent.sessionId,
        sourceTabInstanceKey: source.instanceKey,
      })
      .then(() => {
        if (openIntent.current !== intent) return
        const latestPanel = runtime.state.surfaces.getSnapshot().panels[instanceId]
        if (
          latestPanel?.panelId !== 'agents' ||
          (latestPanel.sessionId !== agent.parentSessionId && latestPanel.sessionId !== agent.sessionId)
        ) {
          setOpenState(null)
          return
        }
        return runtime.commands.execute('app.closePanel', { instanceId })
      })
      .catch((reason: unknown) => {
        if (openIntent.current !== intent) return
        const error =
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED'
        setOpenState({ agentId: agent.agentId, status: 'failed', error })
      })
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
      busy={Boolean(!entry || entry.status === 'loading' || creationBusy || openState?.status === 'submitting')}
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
        <LumenFrame as="main" className="hbar-app-react-agent-create-view">
          <LumenFrame>
            <LumenText as="h2">{labels.createTitle}</LumenText>
            <LumenText as="p">{labels.createScope}</LumenText>
          </LumenFrame>
          <LumenFrame
            as="form"
            className="hbar-app-react-agent-create"
            onSubmit={(event) => {
              event.preventDefault()
              invoke('agentWorkspace.create', { instanceId })
            }}
          >
            <LumenFrame as="fieldset" disabled={!connected || creationBusy}>
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
              <LumenFormField controlId={`${instanceId}-agent-profile`} label={labels.profile}>
                <LumenSelect
                  id={`${instanceId}-agent-profile`}
                  value={entry.draft.profileId}
                  onChange={(event) => setField('profileId', event.currentTarget.value)}
                >
                  <LumenOption value="">{labels.profileOptions.general}</LumenOption>
                  <LumenOption value="explore">{labels.profileOptions.explore}</LumenOption>
                </LumenSelect>
              </LumenFormField>
              {entry.draft.profileId === 'explore' && <LumenText as="p">{labels.exploreHint}</LumenText>}
              <LumenFormField
                controlId={`${instanceId}-agent-model`}
                label={labels.model}
                required
                {...(entry.draft.issues.modelId ? { error: labels.issue('modelId') } : {})}
              >
                <AgentModelPicker
                  id={`${instanceId}-agent-model`}
                  value={entry.draft.modelId}
                  catalog={catalog}
                  connected={connected}
                  disabled={creationBusy}
                  labels={labels.modelPicker}
                  onSelect={(modelId) => setField('modelId', modelId)}
                  onRetry={() => invoke('agentWorkspace.refreshModels', { instanceId })}
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
                <LumenSelect
                  id={`${instanceId}-agent-thinking`}
                  value={entry.draft.thinkingLevel}
                  onChange={(event) => setField('thinkingLevel', event.currentTarget.value)}
                  disabled={!selectedModel && !entry.draft.thinkingLevel}
                >
                  <LumenOption value="">
                    {labels.thinkingDefault(selectedModel?.defaultThinkingLevel ?? null)}
                  </LumenOption>
                  {selectedModel?.thinkingLevels.map((level) => (
                    <LumenOption key={level} value={level}>
                      {labels.thinkingOption(level)}
                    </LumenOption>
                  ))}
                  {entry.draft.thinkingLevel &&
                    !selectedModel?.thinkingLevels.some((level) => level === entry.draft.thinkingLevel) && (
                      <LumenOption value={entry.draft.thinkingLevel}>
                        {labels.thinkingUnavailable(entry.draft.thinkingLevel)}
                      </LumenOption>
                    )}
                </LumenSelect>
              </LumenFormField>
              <LumenFormField controlId={`${instanceId}-agent-approval`} label={labels.approval}>
                <LumenSelect
                  id={`${instanceId}-agent-approval`}
                  value={entry.draft.approval}
                  onChange={(event) => setField('approval', event.currentTarget.value)}
                >
                  {(['deny', 'ask', 'sandbox', 'allow'] as const).map((option) => (
                    <LumenOption key={option} value={option}>
                      {labels.approvalOptions[option]}
                    </LumenOption>
                  ))}
                </LumenSelect>
              </LumenFormField>
            </LumenFrame>
            {entry.creation.error && (
              <LumenText as="p" role="alert">
                {labels.error(entry.creation.error)}
              </LumenText>
            )}
            <LumenButton disabled={!connected || entry.creation.status === 'submitting'} tone="primary" type="submit">
              {entry.creation.status === 'submitting'
                ? labels.creating
                : entry.creation.status === 'unknown'
                  ? labels.retryCreate
                  : labels.create}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
      ) : selectedAgent && entry ? (
        <LumenFrame as="main" className="hbar-app-react-agent-detail">
          <LumenFrame className="hbar-app-react-agent-detail-heading">
            <LumenText as="h2">{labels.detailTitle}</LumenText>
            <LumenStatus value={labels.status(selectedAgent.status)} tone={tone(selectedAgent.status)} />
          </LumenFrame>
          {entry.creation.status === 'succeeded' && entry.selectedAgentId === selectedAgent.agentId && (
            <LumenText as="p" role="status">
              {labels.created}
            </LumenText>
          )}
          <LumenFrame as="section">
            <LumenText as="h3">{labels.objective}</LumenText>
            <LumenText as="p">{selectedAgent.objective}</LumenText>
          </LumenFrame>
          <LumenCompactMetrics
            label={labels.detailTitle}
            metrics={[
              {
                id: 'parent-session',
                label: labels.parentSession,
                value: labels.currentSession(selectedAgent.parentSessionId),
              },
              { id: 'model', label: labels.model, value: labels.modelValue(selectedAgent.modelId) },
              {
                id: 'profile',
                label: labels.profile,
                value: labels.profileOptions[selectedAgent.profileId ?? 'general'],
              },
              { id: 'budget', label: labels.tokenBudget, value: labels.budget(selectedAgent.tokenBudget) },
              { id: 'created', label: labels.createdAt, value: labels.timestamp(selectedAgent.createdAt) },
            ]}
          />
          {selectedAgent.error && (
            <LumenText as="p" role="alert">
              {selectedAgent.error}
            </LumenText>
          )}
          {selectedAction?.error && (
            <LumenText as="p" role="alert">
              {labels.error(selectedAction.error)}
            </LumenText>
          )}
          {openState?.agentId === selectedAgent.agentId && openState.error && (
            <LumenText as="p" role="alert">
              {labels.openSessionError(openState.error)}
            </LumenText>
          )}
          <LumenFrame as="footer">
            <LumenButton
              tone="primary"
              disabled={!connected || openState?.status === 'submitting'}
              onClick={() => openSession(selectedAgent)}
            >
              <LumenIcon icon={ExternalLink} tier="sm" />
              <LumenText as="span">
                {openState?.agentId === selectedAgent.agentId && openState.status === 'submitting'
                  ? labels.openingSession
                  : labels.openSession}
              </LumenText>
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
          </LumenFrame>
        </LumenFrame>
      ) : (
        <LumenFrame as="main" className="hbar-app-react-agent-list" aria-label={labels.title}>
          <LumenFrame as="header">
            <LumenText as="h2">{labels.count(entry?.items.length ?? 0)}</LumenText>
          </LumenFrame>
          {!entry || entry.status === 'loading' ? (
            <LumenText as="p">{labels.loading}</LumenText>
          ) : entry.error ? (
            <LumenText as="p" role="alert">
              {labels.error(entry.error)}
            </LumenText>
          ) : entry.items.length === 0 ? (
            <LumenText as="p" className="hbar-app-react-agent-empty">
              {labels.empty}
            </LumenText>
          ) : (
            <LumenCollection as="ul">
              {entry.items.map((agent) => (
                <LumenCollectionItem key={agent.agentId}>
                  <LumenButton
                    className="hbar-app-react-agent-row"
                    variant="outlined"
                    aria-label={labels.showDetails(agent.objective)}
                    onClick={() => invoke('agentWorkspace.showAgent', { instanceId, agentId: agent.agentId })}
                  >
                    <LumenText as="span">
                      <LumenText as="strong">{agent.objective}</LumenText>
                      <LumenStatus value={labels.status(agent.status)} tone={tone(agent.status)} />
                    </LumenText>
                    <LumenText as="small">
                      {labels.summary(agent.modelId, agent.tokenBudget, agent.profileId)}
                    </LumenText>
                    <LumenText as="time" dateTime={new Date(agent.createdAt).toISOString()}>
                      {labels.timestamp(agent.createdAt)}
                    </LumenText>
                  </LumenButton>
                </LumenCollectionItem>
              ))}
            </LumenCollection>
          )}
          {entry?.nextCursor && (
            <LumenButton onClick={() => invoke('agentWorkspace.loadMore', { instanceId })}>
              {labels.loadMore}
            </LumenButton>
          )}
        </LumenFrame>
      )}
    </LumenToolPane>
  )
}
