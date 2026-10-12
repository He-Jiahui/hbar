import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, ExternalLink, Plus, RefreshCw } from 'lucide-react'
import {
  LumenContentText,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
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
import { createMessageScope } from './messages'
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
const AgentWorkspaceMessages = createMessageScope<HbarAgentWorkspaceLabels>()

function tone(status: AgentStatus): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'completed') return 'success'
  if (status === 'failed' || status === 'interrupted') return 'danger'
  if (status === 'waiting_approval' || status === 'cancelRequested') return 'warning'
  return 'neutral'
}

function terminal(status: AgentStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'failed' || status === 'interrupted'
}

export function HbarAgentWorkspace(props: {
  readonly labels: HbarAgentWorkspaceLabels
  readonly connected: boolean
  readonly instanceId?: string
  readonly targetLabel?: string | undefined
}) {
  return (
    <AgentWorkspaceMessages.Provider messages={props.labels}>
      <HbarAgentWorkspaceView {...props} />
    </AgentWorkspaceMessages.Provider>
  )
}

function HbarAgentWorkspaceView({
  connected,
  instanceId: requestedInstanceId,
  targetLabel,
}: {
  readonly connected: boolean
  readonly instanceId?: string
  readonly targetLabel?: string | undefined
}) {
  const { t } = AgentWorkspaceMessages.useMessages()
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
    { id: '', label: t('profileOptions').general },
    { id: 'explore', label: t('profileOptions').explore },
  ]
  const difficultyOptions: readonly LumenControlOption[] = [
    { id: '', label: t('manualSelection') },
    ...(['simple', 'medium', 'complex'] as const).map((difficulty) => ({
      id: difficulty,
      label: t('policy').difficulties[difficulty],
    })),
  ]
  const thinkingOptions: readonly LumenControlOption[] = [
    {
      id: '',
      label:
        entry?.inheritedModel?.thinkingLevel &&
        selectedModel &&
        !selectedModel.thinkingLevels.includes(entry.inheritedModel.thinkingLevel)
          ? t('thinkingDefault')(selectedModel.defaultThinkingLevel)
          : t('thinkingInherited')(entry?.inheritedModel?.thinkingLevel ?? null),
    },
    ...(selectedModel?.thinkingLevels.map((level) => ({ id: level, label: t('thinkingOption')(level) })) ?? []),
    ...(entry?.draft.thinkingLevel &&
    !selectedModel?.thinkingLevels.some((level) => level === entry.draft.thinkingLevel)
      ? [
          {
            id: entry.draft.thinkingLevel,
            label: t('thinkingUnavailable')(entry.draft.thinkingLevel),
            disabled: true,
          },
        ]
      : []),
  ]
  const approvalOptions: readonly LumenControlOption[] = (['inherit', 'deny', 'ask', 'sandbox', 'allow'] as const).map(
    (option) => ({ id: option, label: t('approvalOptions')[option] }),
  )
  const sandboxOptions: readonly LumenControlOption[] = [
    { id: '', label: t('inheritSandbox') },
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
      title={t('title')}
      targetLabel={targetLabel}
      description={t('description')}
      icon={Bot}
      backLabel={view === 'list' ? undefined : t('back')}
      closeLabel={t('close')}
      onBack={view === 'list' ? undefined : back}
      onClose={() => invoke('app.closePanel', { instanceId })}
      busy={Boolean(!entry || entry.status === 'loading' || creationBusy || openState?.status === 'submitting')}
      actions={
        <>
          {view === 'list' && entry && (
            <LumenIconButton
              label={t('createTitle')}
              disabled={!connected}
              onClick={() => invoke('agentWorkspace.showCreate', { instanceId })}
            >
              <LumenIcon icon={Plus} tier="sm" />
            </LumenIconButton>
          )}
          <LumenIconButton
            label={t('refresh')}
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
          labels={t('policy')}
          modelLabels={t('modelPicker')}
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
            <LumenContentText context="section.title">{t('createTitle')}</LumenContentText>
            <LumenContentText context="section.description">{t('createScope')}</LumenContentText>
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
                label={t('objective')}
                required
                {...(entry.draft.issues.objective ? { error: t('issue')('objective') } : {})}
              >
                <LumenTextarea
                  id={`${instanceId}-agent-objective`}
                  required
                  value={entry.draft.objective}
                  placeholder={t('objectivePlaceholder')}
                  onChange={(event) => setField('objective', event.currentTarget.value)}
                />
              </LumenFormField>
              <LumenFormField controlId={`${instanceId}-agent-title`} label={t('childTitle')}>
                <LumenInput
                  id={`${instanceId}-agent-title`}
                  value={entry.draft.title}
                  placeholder={t('childTitlePlaceholder')}
                  onChange={(event) => setField('title', event.currentTarget.value)}
                />
              </LumenFormField>
              <LumenFormField controlId={`${instanceId}-agent-profile`} label={t('profile')}>
                <LumenPopupSelect
                  id={`${instanceId}-agent-profile`}
                  value={entry.draft.profileId}
                  options={profileOptions}
                  disabled={creationBusy || !connected}
                  onValueChange={(value) => setField('profileId', value)}
                />
              </LumenFormField>
              {entry.draft.profileId === 'explore' && (
                <LumenContentText context="section.description">{t('exploreHint')}</LumenContentText>
              )}
              <LumenFormField controlId={`${instanceId}-agent-selection`} label={t('selectionMode')}>
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
                    controlId={`${instanceId}-agent-model`}
                    label={t('model')}
                    {...(entry.draft.issues.modelId ? { error: t('issue')('modelId') } : {})}
                  >
                    <AgentModelPicker
                      id={`${instanceId}-agent-model`}
                      value={entry.draft.modelId}
                      catalog={catalog}
                      connected={connected}
                      disabled={creationBusy}
                      labels={t('modelPicker')}
                      onSelect={(modelId) => setField('modelId', modelId)}
                      onRetry={() => invoke('agentWorkspace.refreshModels', { instanceId })}
                    />
                    {entry.draft.modelId && (
                      <LumenButton
                        size="s"
                        variant="text"
                        disabled={creationBusy}
                        onClick={() => setField('modelId', '')}
                      >
                        {t('inheritModel')}
                      </LumenButton>
                    )}
                  </LumenFormField>
                </>
              )}
              <LumenFormField
                controlId={`${instanceId}-agent-budget`}
                label={t('tokenBudget')}
                {...(entry.draft.issues.tokenBudget ? { error: t('issue')('tokenBudget') } : {})}
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
                <LumenFormField controlId={`${instanceId}-agent-thinking`} label={t('thinkingLevel')}>
                  <LumenToggleGroup
                    id={`${instanceId}-agent-thinking`}
                    type="single"
                    value={entry.draft.thinkingLevel}
                    options={thinkingOptions}
                    disabled={!selectedModel && !entry.draft.thinkingLevel}
                    onValueChange={(value) => setField('thinkingLevel', value)}
                  />
                </LumenFormField>
              )}
              <LumenFormField controlId={`${instanceId}-agent-approval`} label={t('approval')}>
                <LumenPopupSelect
                  id={`${instanceId}-agent-approval`}
                  value={entry.draft.approval}
                  options={approvalOptions}
                  disabled={creationBusy || !connected}
                  onValueChange={(value) => setField('approval', value)}
                />
              </LumenFormField>
              {(entry.draft.approval === 'sandbox' || entry.draft.approval === 'inherit') && (
                <LumenFormField controlId={`${instanceId}-agent-sandbox`} label={t('sandboxProfile')}>
                  <LumenPopupSelect
                    id={`${instanceId}-agent-sandbox`}
                    value={entry.draft.sandboxProfileId}
                    options={sandboxOptions}
                    selectedLabel={(selectedSandboxProfile?.name ?? entry.draft.sandboxProfileId) || undefined}
                    disabled={creationBusy || !connected}
                    onValueChange={(value) => setField('sandboxProfileId', value)}
                  />
                  {sandboxProfiles.list.error && (
                    <LumenContentText context="feedback.message" role="alert">
                      {t('error')(sandboxProfiles.list.error)}
                    </LumenContentText>
                  )}
                </LumenFormField>
              )}
            </LumenFrame>
            {entry.creation.error && (
              <LumenContentText context="feedback.message" role="alert">
                {t('error')(entry.creation.error)}
              </LumenContentText>
            )}
            <LumenButton disabled={!connected || entry.creation.status === 'submitting'} tone="primary" type="submit">
              {entry.creation.status === 'submitting'
                ? t('creating')
                : entry.creation.status === 'unknown'
                  ? t('retryCreate')
                  : t('create')}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
      ) : selectedAgent && entry ? (
        <LumenFrame as="main" className="hbar-app-react-agent-detail">
          <LumenFrame className="hbar-app-react-agent-detail-heading">
            <LumenContentText context="section.title">{t('detailTitle')}</LumenContentText>
            <LumenStatus value={t('status')(selectedAgent.status)} tone={tone(selectedAgent.status)} />
          </LumenFrame>
          {entry.creation.status === 'succeeded' && entry.selectedAgentId === selectedAgent.agentId && (
            <LumenContentText context="feedback.message" role="status">
              {t('created')}
            </LumenContentText>
          )}
          <LumenFrame as="section">
            <LumenContentText context="section.subtitle">{t('objective')}</LumenContentText>
            <LumenContentText context="section.description">{selectedAgent.objective}</LumenContentText>
          </LumenFrame>
          <LumenCompactMetrics
            label={t('detailTitle')}
            metrics={[
              {
                id: 'parent-session',
                label: t('parentSession'),
                value: t('currentSession')(selectedAgent.parentSessionId),
              },
              {
                id: 'model',
                label: t('model'),
                value: t('modelValue')(selectedAgent.configuration?.modelId ?? selectedAgent.modelId),
              },
              {
                id: 'thinking',
                label: t('thinkingLevel'),
                value: t('thinkingOption')(
                  selectedAgent.configuration?.thinkingLevel ??
                    selectedAgent.dispatchConfiguration?.thinkingLevel ??
                    '',
                ),
              },
              ...(selectedAgent.configuration
                ? [
                    {
                      id: 'approval',
                      label: t('approval'),
                      value: t('approvalOptions')[selectedAgent.configuration.approval],
                    },
                  ]
                : []),
              {
                id: 'profile',
                label: t('profile'),
                value: t('profileOptions')[selectedAgent.profileId ?? 'general'],
              },
              { id: 'budget', label: t('tokenBudget'), value: t('budget')(selectedAgent.tokenBudget) },
              { id: 'created', label: t('createdAt'), value: t('timestamp')(selectedAgent.createdAt) },
            ]}
          />
          {selectedAgent.dispatchConfiguration?.selection && (
            <LumenContentText context="section.description">
              {t('selectionSummary')(
                t('policy').difficulties[selectedAgent.dispatchConfiguration.selection.difficulty],
                selectedAgent.dispatchConfiguration.selection.weight,
              )}
            </LumenContentText>
          )}
          <LumenContentText context="section.description">{t('configurationHint')}</LumenContentText>
          {selectedAgent.error && (
            <LumenContentText context="feedback.message" role="alert">
              {selectedAgent.error}
            </LumenContentText>
          )}
          {selectedAction?.error && (
            <LumenContentText context="feedback.message" role="alert">
              {t('error')(selectedAction.error)}
            </LumenContentText>
          )}
          {openState?.agentId === selectedAgent.agentId && openState.error && (
            <LumenContentText context="feedback.message" role="alert">
              {t('openSessionError')(openState.error)}
            </LumenContentText>
          )}
          <LumenFrame as="footer">
            <LumenButton
              disabled={!connected || openState?.status === 'submitting'}
              onClick={() => openSession(selectedAgent, true)}
            >
              {t('configureChild')}
            </LumenButton>
            <LumenButton
              tone="primary"
              disabled={!connected || openState?.status === 'submitting'}
              onClick={() => openSession(selectedAgent)}
            >
              <LumenIcon icon={ExternalLink} tier="sm" />
              <LumenContentText context="control.label">
                {openState?.agentId === selectedAgent.agentId && openState.status === 'submitting'
                  ? t('openingSession')
                  : t('openSession')}
              </LumenContentText>
            </LumenButton>
            {!terminal(selectedAgent.status) && (
              <LumenButton
                disabled={!connected || selectedAction?.status === 'submitting'}
                tone="warning"
                onClick={() => invoke('agentWorkspace.cancel', { instanceId, agentId: selectedAgent.agentId })}
              >
                {selectedAction?.status === 'submitting'
                  ? t('cancelling')
                  : selectedAction?.status === 'unknown'
                    ? t('retryCancel')
                    : t('cancel')}
              </LumenButton>
            )}
          </LumenFrame>
        </LumenFrame>
      ) : (
        <LumenFrame as="main" className="hbar-app-react-agent-list" aria-label={t('title')}>
          <LumenFrame as="header">
            <LumenContentText context="section.title">{t('count')(entry?.items.length ?? 0)}</LumenContentText>
          </LumenFrame>
          {!entry || entry.status === 'loading' ? (
            <LumenContentText context="section.description">{t('loading')}</LumenContentText>
          ) : entry.error ? (
            <LumenContentText context="feedback.message" role="alert">
              {t('error')(entry.error)}
            </LumenContentText>
          ) : entry.items.length === 0 ? (
            <LumenContentText context="section.description" className="hbar-app-react-agent-empty">
              {t('empty')}
            </LumenContentText>
          ) : (
            <LumenCollection as="ul">
              {entry.items.map((agent) => (
                <LumenCollectionItem key={agent.agentId}>
                  <LumenButton
                    className="hbar-app-react-agent-row"
                    variant="outlined"
                    aria-label={t('showDetails')(agent.objective)}
                    onClick={() => invoke('agentWorkspace.showAgent', { instanceId, agentId: agent.agentId })}
                  >
                    <LumenContentText context="control.label">
                      <LumenContentText context="choice.title">{agent.objective}</LumenContentText>
                      <LumenStatus value={t('status')(agent.status)} tone={tone(agent.status)} />
                    </LumenContentText>
                    <LumenContentText context="choice.description">
                      {t('summary')(agent.modelId, agent.tokenBudget, agent.profileId)}
                    </LumenContentText>
                    <LumenText as="time" dateTime={new Date(agent.createdAt).toISOString()}>
                      {t('timestamp')(agent.createdAt)}
                    </LumenText>
                  </LumenButton>
                </LumenCollectionItem>
              ))}
            </LumenCollection>
          )}
          {entry?.nextCursor && (
            <LumenButton onClick={() => invoke('agentWorkspace.loadMore', { instanceId })}>
              {t('loadMore')}
            </LumenButton>
          )}
        </LumenFrame>
      )}
    </LumenToolPane>
  )
}
