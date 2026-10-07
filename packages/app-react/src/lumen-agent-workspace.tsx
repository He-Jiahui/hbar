import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, ExternalLink, Plus, RefreshCw } from 'lucide-react'
import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenContentText,
  LumenButton,
  LumenCompactMetrics,
  LumenFormField,
  LumenIcon,
  LumenIconButton,
  LumenInput,
  LumenPopupSelect,
  LumenStatus,
  LumenTextarea,
  LumenToolPane,
  LumenToggleGroup,
  type LumenControlOption,
} from '@lumen/app-ui'
import type { AgentWorkspaceEntryState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { AgentModelPicker, type AgentModelPickerLabels } from './agent-model-picker'
import { AgentPolicyEditor, type AgentPolicyEditorLabels } from './agent-policy-editor'
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
  readonly inheritModel: string
  readonly selectionMode: string
  readonly manualSelection: string
  readonly policy: AgentPolicyEditorLabels
  readonly sandboxProfile: string
  readonly inheritSandbox: string
  readonly configureChild: string
  readonly configurationHint: string
  readonly selectionSummary: (difficulty: string, weight: number) => string
  readonly profile: string
  readonly profileOptions: Readonly<Record<'general' | AgentProfileId, string>>
  readonly exploreHint: string
  readonly modelPicker: AgentModelPickerLabels
  readonly tokenBudget: string
  readonly thinkingLevel: string
  readonly thinkingDefault: (level: string | null) => string
  readonly thinkingInherited: (level: string | null) => string
  readonly thinkingOption: (level: string) => string
  readonly thinkingUnavailable: (level: string) => string
  readonly approval: string
  readonly approvalOptions: Readonly<Record<'inherit' | 'deny' | 'ask' | 'sandbox' | 'allow', string>>
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
  const sandboxProfiles = useHbarRuntimeState(runtime.state.sandboxProfiles)
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
  useEffect(() => {
    if (entry?.view === 'create' && sandboxProfiles.available && sandboxProfiles.list.status === 'idle')
      invoke('sandboxProfiles.refresh', {})
  }, [entry?.view, sandboxProfiles.available, sandboxProfiles.list.status, invoke])
  if (!instanceId || panel?.panelId !== 'agents') return null

  const creationBusy = entry?.creation.status === 'submitting' || entry?.creation.status === 'unknown'
  const view = entry?.view ?? 'list'
  const selectedAgent =
    view === 'detail' ? entry?.items.find((agent) => agent.agentId === entry.selectedAgentId) : undefined
  const selectedAction = selectedAgent ? entry?.actions[selectedAgent.agentId] : undefined
  const setField = (field: string, value: string) => invoke('agentWorkspace.setField', { instanceId, field, value })
  const catalog = agents.catalog
  const selectedModel = entry?.draft.modelId
    ? catalog.models.find((model) => model.id === entry.draft.modelId)
    : entry?.inheritedModel?.model
  const profileOptions: readonly LumenControlOption[] = [
    { id: '', label: labels.profileOptions.general },
    { id: 'explore', label: labels.profileOptions.explore },
  ]
  const difficultyOptions: readonly LumenControlOption[] = [
    { id: '', label: labels.manualSelection },
    ...(['simple', 'medium', 'complex'] as const).map((difficulty) => ({
      id: difficulty,
      label: labels.policy.difficulties[difficulty],
    })),
  ]
  const thinkingOptions: readonly LumenControlOption[] = [
    {
      id: '',
      label:
        entry?.inheritedModel?.thinkingLevel &&
        selectedModel &&
        !selectedModel.thinkingLevels.includes(entry.inheritedModel.thinkingLevel)
          ? labels.thinkingDefault(selectedModel.defaultThinkingLevel)
          : labels.thinkingInherited(entry?.inheritedModel?.thinkingLevel ?? null),
    },
    ...(selectedModel?.thinkingLevels.map((level) => ({ id: level, label: labels.thinkingOption(level) })) ?? []),
    ...(entry?.draft.thinkingLevel &&
    !selectedModel?.thinkingLevels.some((level) => level === entry.draft.thinkingLevel)
      ? [
          {
            id: entry.draft.thinkingLevel,
            label: labels.thinkingUnavailable(entry.draft.thinkingLevel),
            disabled: true,
          },
        ]
      : []),
  ]
  const approvalOptions: readonly LumenControlOption[] = (['inherit', 'deny', 'ask', 'sandbox', 'allow'] as const).map(
    (option) => ({ id: option, label: labels.approvalOptions[option] }),
  )
  const sandboxOptions: readonly LumenControlOption[] = [
    { id: '', label: labels.inheritSandbox },
    ...sandboxProfiles.list.items.map((profile) => ({ id: profile.id, label: profile.name })),
  ]
  const selectedSandboxProfile = sandboxProfiles.list.items.find(
    (profile) => profile.id === entry?.draft.sandboxProfileId,
  )
  const openSession = (agent: Agent, configure = false) => {
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
      .then(async () => {
        if (openIntent.current !== intent) return
        const latestPanel = runtime.state.surfaces.getSnapshot().panels[instanceId]
        if (
          latestPanel?.panelId !== 'agents' ||
          (latestPanel.sessionId !== agent.parentSessionId && latestPanel.sessionId !== agent.sessionId)
        ) {
          setOpenState(null)
          return
        }
        if (configure) {
          const child = runtime.state.directory.getSnapshot().sessions[agent.sessionId]
          if (!child) throw new Error('Child Session is unavailable')
          await runtime.commands.execute('app.openSettings', {
            scope: 'session',
            targetId: child.id,
            sessionId: child.id,
            workspaceId: child.workspaceId,
            binding: 'pinned',
            section: 'model',
          })
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
      {entry && (view === 'create' || view === 'list') && (
        <AgentPolicyEditor
          labels={labels.policy}
          modelLabels={labels.modelPicker}
          instanceId={instanceId}
          parentSessionId={entry.parentSessionId}
          catalog={catalog}
          connected={connected}
          refreshModels={() => invoke('agentWorkspace.refreshModels', { instanceId })}
        />
      )}
      {view === 'create' && entry ? (
        <LumenFrame as="main" className="hbar-app-react-agent-create-view">
          <LumenFrame>
            <LumenContentText context="section.title">{labels.createTitle}</LumenContentText>
            <LumenContentText context="section.description">{labels.createScope}</LumenContentText>
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
                layout="rows"
                controlId={`${instanceId}-agent-objective`}
                label={labels.objective}
                required
                {...(entry.draft.issues.objective ? { error: labels.issue('objective') } : {})}
              >
                <LumenTextarea
                  id={`${instanceId}-agent-objective`}
                  required
                  maxLength={4000}
                  value={entry.draft.objective}
                  placeholder={labels.objectivePlaceholder}
                  onChange={(event) => setField('objective', event.currentTarget.value)}
                />
              </LumenFormField>
              <LumenFormField
                layout="rows"
                controlId={`${instanceId}-agent-title`}
                label={labels.childTitle}
                {...(entry.draft.issues.title ? { error: labels.issue('title') } : {})}
              >
                <LumenInput
                  id={`${instanceId}-agent-title`}
                  maxLength={160}
                  value={entry.draft.title}
                  placeholder={labels.childTitlePlaceholder}
                  onChange={(event) => setField('title', event.currentTarget.value)}
                />
              </LumenFormField>
              <LumenFormField layout="rows" controlId={`${instanceId}-agent-profile`} label={labels.profile}>
                <LumenPopupSelect
                  id={`${instanceId}-agent-profile`}
                  value={entry.draft.profileId}
                  options={profileOptions}
                  disabled={creationBusy || !connected}
                  onValueChange={(value) => setField('profileId', value)}
                />
              </LumenFormField>
              {entry.draft.profileId === 'explore' && (
                <LumenContentText context="form.help">{labels.exploreHint}</LumenContentText>
              )}
              <LumenFormField layout="rows" controlId={`${instanceId}-agent-selection`} label={labels.selectionMode}>
                <LumenPopupSelect
                  id={`${instanceId}-agent-selection`}
                  value={entry.draft.difficulty}
                  options={difficultyOptions}
                  disabled={creationBusy || !connected}
                  onValueChange={(value) => setField('difficulty', value)}
                />
              </LumenFormField>
              {!entry.draft.difficulty && (
                <>
                  <LumenFormField
                    layout="rows"
                    controlId={`${instanceId}-agent-model`}
                    label={labels.model}
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
                    {entry.draft.modelId && (
                      <LumenFrame
                        className="hbar-agent-content-reading"
                        role="group"
                        aria-label={labels.inheritModel}
                        tabIndex={0}
                      >
                        <LumenButton
                          size="s"
                          variant="text"
                          disabled={creationBusy}
                          onClick={() => setField('modelId', '')}
                        >
                          {labels.inheritModel}
                        </LumenButton>
                      </LumenFrame>
                    )}
                  </LumenFormField>
                </>
              )}
              <LumenFormField
                layout="rows"
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
              {!entry.draft.difficulty && (
                <LumenFormField layout="rows" controlId={`${instanceId}-agent-thinking`} label={labels.thinkingLevel}>
                  <LumenFrame
                    className="hbar-agent-content-reading"
                    role="group"
                    aria-label={labels.thinkingLevel}
                    tabIndex={0}
                  >
                    <LumenToggleGroup
                      id={`${instanceId}-agent-thinking`}
                      type="single"
                      value={entry.draft.thinkingLevel}
                      options={thinkingOptions}
                      disabled={!selectedModel && !entry.draft.thinkingLevel}
                      onValueChange={(value) => setField('thinkingLevel', value)}
                    />
                  </LumenFrame>
                </LumenFormField>
              )}
              <LumenFormField layout="rows" controlId={`${instanceId}-agent-approval`} label={labels.approval}>
                <LumenPopupSelect
                  id={`${instanceId}-agent-approval`}
                  value={entry.draft.approval}
                  options={approvalOptions}
                  disabled={creationBusy || !connected}
                  onValueChange={(value) => setField('approval', value)}
                />
              </LumenFormField>
              {(entry.draft.approval === 'sandbox' || entry.draft.approval === 'inherit') && (
                <LumenFormField layout="rows" controlId={`${instanceId}-agent-sandbox`} label={labels.sandboxProfile}>
                  <LumenPopupSelect
                    id={`${instanceId}-agent-sandbox`}
                    value={entry.draft.sandboxProfileId}
                    options={sandboxOptions}
                    selectedLabel={(selectedSandboxProfile?.name ?? entry.draft.sandboxProfileId) || undefined}
                    disabled={creationBusy || !connected}
                    onValueChange={(value) => setField('sandboxProfileId', value)}
                  />
                  {sandboxProfiles.list.error && (
                    <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
                      {labels.error(sandboxProfiles.list.error)}
                    </LumenContentText>
                  )}
                </LumenFormField>
              )}
            </LumenFrame>
            {entry.creation.error && (
              <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
                {labels.error(entry.creation.error)}
              </LumenContentText>
            )}
            <LumenFrame
              className="hbar-agent-content-reading"
              role="group"
              aria-label={labels.createTitle}
              tabIndex={0}
            >
              <LumenButton disabled={!connected || entry.creation.status === 'submitting'} tone="primary" type="submit">
                {entry.creation.status === 'submitting'
                  ? labels.creating
                  : entry.creation.status === 'unknown'
                    ? labels.retryCreate
                    : labels.create}
              </LumenButton>
            </LumenFrame>
          </LumenFrame>
        </LumenFrame>
      ) : selectedAgent && entry ? (
        <LumenFrame as="main" className="hbar-app-react-agent-detail">
          <LumenFrame className="hbar-app-react-agent-detail-heading">
            <LumenContentText context="section.title">{labels.detailTitle}</LumenContentText>
            <LumenFrame
              className="hbar-agent-content-reading"
              role="group"
              aria-label={labels.status(selectedAgent.status)}
              tabIndex={0}
            >
              <LumenStatus value={labels.status(selectedAgent.status)} tone={tone(selectedAgent.status)} />
            </LumenFrame>
          </LumenFrame>
          {entry.creation.status === 'succeeded' && entry.selectedAgentId === selectedAgent.agentId && (
            <LumenContentText context="feedback.paragraph" tone="success" role="status">
              {labels.created}
            </LumenContentText>
          )}
          <LumenFrame as="section">
            <LumenContentText context="section.title" level={3}>
              {labels.objective}
            </LumenContentText>
            <LumenContentText context="section.description">{selectedAgent.objective}</LumenContentText>
          </LumenFrame>
          <LumenCompactMetrics
            label={labels.detailTitle}
            metrics={[
              {
                id: 'parent-session',
                label: labels.parentSession,
                value: labels.currentSession(selectedAgent.parentSessionId),
              },
              {
                id: 'model',
                label: labels.model,
                value: labels.modelValue(selectedAgent.configuration?.modelId ?? selectedAgent.modelId),
              },
              {
                id: 'thinking',
                label: labels.thinkingLevel,
                value: labels.thinkingOption(
                  selectedAgent.configuration?.thinkingLevel ??
                    selectedAgent.dispatchConfiguration?.thinkingLevel ??
                    '',
                ),
              },
              ...(selectedAgent.configuration
                ? [
                    {
                      id: 'approval',
                      label: labels.approval,
                      value: labels.approvalOptions[selectedAgent.configuration.approval],
                    },
                  ]
                : []),
              {
                id: 'profile',
                label: labels.profile,
                value: labels.profileOptions[selectedAgent.profileId ?? 'general'],
              },
              { id: 'budget', label: labels.tokenBudget, value: labels.budget(selectedAgent.tokenBudget) },
              { id: 'created', label: labels.createdAt, value: labels.timestamp(selectedAgent.createdAt) },
            ]}
          />
          {selectedAgent.dispatchConfiguration?.selection && (
            <LumenContentText context="collection.detail">
              {labels.selectionSummary(
                labels.policy.difficulties[selectedAgent.dispatchConfiguration.selection.difficulty],
                selectedAgent.dispatchConfiguration.selection.weight,
              )}
            </LumenContentText>
          )}
          <LumenContentText context="section.description">{labels.configurationHint}</LumenContentText>
          {selectedAgent.error && (
            <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
              {selectedAgent.error}
            </LumenContentText>
          )}
          {selectedAction?.error && (
            <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
              {labels.error(selectedAction.error)}
            </LumenContentText>
          )}
          {openState?.agentId === selectedAgent.agentId && openState.error && (
            <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
              {labels.openSessionError(openState.error)}
            </LumenContentText>
          )}
          <LumenFrame
            as="footer"
            className="hbar-agent-content-reading"
            role="group"
            aria-label={labels.detailTitle}
            tabIndex={0}
          >
            <LumenButton
              disabled={!connected || openState?.status === 'submitting'}
              onClick={() => openSession(selectedAgent, true)}
            >
              {labels.configureChild}
            </LumenButton>
            <LumenButton
              tone="primary"
              disabled={!connected || openState?.status === 'submitting'}
              onClick={() => openSession(selectedAgent)}
            >
              <LumenIcon icon={ExternalLink} tier="sm" />
              <LumenContentText context="control.label">
                {openState?.agentId === selectedAgent.agentId && openState.status === 'submitting'
                  ? labels.openingSession
                  : labels.openSession}
              </LumenContentText>
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
            <LumenContentText context="section.title">{labels.count(entry?.items.length ?? 0)}</LumenContentText>
          </LumenFrame>
          {!entry || entry.status === 'loading' ? (
            <LumenContentText context="feedback.paragraph" role="status">
              {labels.loading}
            </LumenContentText>
          ) : entry.error ? (
            <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
              {labels.error(entry.error)}
            </LumenContentText>
          ) : entry.items.length === 0 ? (
            <LumenContentText context="empty.description" className="hbar-app-react-agent-empty">
              {labels.empty}
            </LumenContentText>
          ) : (
            <LumenCollection as="ul">
              {entry.items.map((agent) => (
                <LumenCollectionItem key={agent.agentId} className="hbar-app-react-agent-record">
                  <LumenButton
                    className="hbar-app-react-agent-row"
                    variant="outlined"
                    aria-label={labels.showDetails(agent.objective)}
                    onClick={() => invoke('agentWorkspace.showAgent', { instanceId, agentId: agent.agentId })}
                  >
                    <LumenContentText context="collection.title">{agent.objective}</LumenContentText>
                    <LumenContentText context="collection.detail">
                      {labels.summary(agent.modelId, agent.tokenBudget, agent.profileId)}
                    </LumenContentText>
                  </LumenButton>
                  <LumenFrame
                    className="hbar-agent-content-reading"
                    role="group"
                    aria-label={labels.status(agent.status)}
                    tabIndex={0}
                  >
                    <LumenStatus value={labels.status(agent.status)} tone={tone(agent.status)} />
                  </LumenFrame>
                  <LumenFrame
                    className="hbar-agent-content-reading"
                    role="group"
                    aria-label={labels.createdAt}
                    tabIndex={0}
                  >
                    <LumenContentText context="metadata.time" dateTime={new Date(agent.createdAt).toISOString()}>
                      {labels.timestamp(agent.createdAt)}
                    </LumenContentText>
                  </LumenFrame>
                </LumenCollectionItem>
              ))}
            </LumenCollection>
          )}
          {entry?.loadMoreError && (
            <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
              {labels.error(entry.loadMoreError)}
            </LumenContentText>
          )}
          {entry?.loadingMore && (
            <LumenContentText context="feedback.paragraph" role="status">
              {labels.loading}
            </LumenContentText>
          )}
          {entry?.nextCursor && (
            <LumenFrame className="hbar-agent-content-reading" role="group" aria-label={labels.loadMore} tabIndex={0}>
              <LumenButton
                disabled={!connected || entry.status === 'loading' || entry.loadingMore}
                onClick={() => invoke('agentWorkspace.loadMore', { instanceId })}
              >
                {labels.loadMore}
              </LumenButton>
            </LumenFrame>
          )}
        </LumenFrame>
      )}
    </LumenToolPane>
  )
}
