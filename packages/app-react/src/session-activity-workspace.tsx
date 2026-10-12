import { useEffect, useRef, useState } from 'react'
import { ListChecks, RefreshCw } from 'lucide-react'
import {
  LumenContentText,
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenIconButton,
  LumenStatus,
  LumenText,
  LumenToolPane,
} from '@lumen/app-ui'
import type { ActivityWorkspaceEntryState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './session-activity-workspace.css'
import { ActivityAgentsView, type ActivityAgentLabels, type ActivityAgentOpenState } from './activity-agents-view'
import type { ActivityAgentEntryState } from '@hbar/app-runtime'
import { ActivityTasksView, type ActivityTaskLabels } from './activity-tasks-view'
import { ActivityWorkflowView, type ActivityWorkflowLabels } from './activity-workflow-view'
import { ActivityText, type ActivityTextLabels } from './activity-text'
import { projectActivityWorkflow } from './activity-workflow-model'
import { createMessageScope } from './messages'

type Operation = ActivityWorkspaceEntryState['items'][number]

export interface HbarSessionActivityLabels {
  readonly text: ActivityTextLabels
  readonly title: string
  readonly runs: string
  readonly agents: ActivityAgentLabels
  readonly tasks: ActivityTaskLabels
  readonly workflow: ActivityWorkflowLabels
  readonly description: string
  readonly close: string
  readonly refresh: string
  readonly loading: string
  readonly empty: string
  readonly offline: string
  readonly retry: string
  readonly loadMore: string
  readonly loadingMore: string
  readonly limitReached: string
  readonly count: (loaded: number, total: number) => string
  readonly runAt: (createdAt: number) => string
  readonly intentPreview: (preview: string) => string
  readonly startedAt: (startedAt: number) => string
  readonly queuedAt: (createdAt: number) => string
  readonly status: (status: Operation['status']) => string
  readonly error: (code: string) => string
}

type SessionActivityMessages = Pick<
  HbarSessionActivityLabels,
  | 'title'
  | 'runs'
  | 'description'
  | 'close'
  | 'refresh'
  | 'loading'
  | 'empty'
  | 'offline'
  | 'retry'
  | 'loadMore'
  | 'loadingMore'
  | 'limitReached'
  | 'count'
  | 'runAt'
  | 'intentPreview'
  | 'startedAt'
  | 'queuedAt'
  | 'status'
  | 'error'
>
const sessionActivityMessages = createMessageScope<SessionActivityMessages>()

function tone(status: Operation['status']): 'neutral' | 'warning' {
  return status === 'cancelRequested' || status === 'waiting_approval' ? 'warning' : 'neutral'
}

/** The Host query is cursor-bounded; rows grow inside this pane's scroll region. */
export function HbarSessionActivityView(props: {
  readonly entry: Readonly<ActivityWorkspaceEntryState> | undefined
  readonly connected: boolean
  readonly labels: HbarSessionActivityLabels
  readonly onRefresh: () => void
  readonly onLoadMore: () => void
}) {
  const { labels, ...viewProps } = props
  const { text, ...messages } = labels
  return (
    <sessionActivityMessages.Provider messages={messages}>
      <SessionActivityViewContent {...viewProps} textLabels={text} />
    </sessionActivityMessages.Provider>
  )
}

function SessionActivityViewContent({
  entry,
  connected,
  textLabels,
  onRefresh,
  onLoadMore,
}: {
  readonly entry: Readonly<ActivityWorkspaceEntryState> | undefined
  readonly connected: boolean
  readonly textLabels: ActivityTextLabels
  readonly onRefresh: () => void
  readonly onLoadMore: () => void
}) {
  const { t } = sessionActivityMessages.useMessages()
  const loading = !entry || entry.status === 'loading'
  const loadingMore = loading && Boolean(entry?.items.length)
  const visible = entry?.items ?? []
  return (
    <LumenFrame as="section" className="hbar-session-activity-runs" aria-label={t('runs')}>
      <LumenFrame className="hbar-activity-section-heading">
        <LumenContentText context="section.subtitle">{t('runs')}</LumenContentText>
      </LumenFrame>
      {!connected && (
        <LumenContentText context="feedback.message" role="status" className="hbar-session-activity-notice">
          {t('offline')}
        </LumenContentText>
      )}
      {entry?.status === 'error' && (
        <LumenFrame className="hbar-session-activity-recovery">
          <LumenContentText context="feedback.message" role="alert">
            {t('error')(entry.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          <LumenButton size="s" disabled={!connected} onClick={onRefresh}>
            {t('retry')}
          </LumenButton>
        </LumenFrame>
      )}
      {loading && !loadingMore && (
        <LumenContentText context="feedback.message" role="status" className="hbar-session-activity-notice">
          {t('loading')}
        </LumenContentText>
      )}
      {entry?.status === 'ready' && entry.totalActive === 0 && (
        <LumenContentText context="section.description" className="hbar-session-activity-notice">
          {t('empty')}
        </LumenContentText>
      )}
      {visible.length > 0 && (
        <>
          <LumenContentText context="section.description" className="hbar-session-activity-count">
            {t('count')(visible.length, entry?.totalActive ?? visible.length)}
          </LumenContentText>
          <LumenCollection as="ol" className="hbar-session-activity-list">
            {visible.map((item) => (
              <LumenCollectionItem key={item.operationId} data-operation-id={item.operationId}>
                <LumenFrame className="hbar-session-activity-row-heading">
                  <ActivityText
                    text={item.intentPreview ? t('intentPreview')(item.intentPreview) : t('runAt')(item.createdAt)}
                    labels={textLabels}
                    context="choice.title"
                  />
                  <LumenStatus value={t('status')(item.status)} tone={tone(item.status)} />
                </LumenFrame>
                <LumenText as="time" dateTime={new Date(item.startedAt ?? item.createdAt).toISOString()}>
                  {item.startedAt === null ? t('queuedAt')(item.createdAt) : t('startedAt')(item.startedAt)}
                </LumenText>
              </LumenCollectionItem>
            ))}
          </LumenCollection>
          {loadingMore && (
            <LumenContentText context="feedback.message" role="status" className="hbar-session-activity-notice">
              {t('loadingMore')}
            </LumenContentText>
          )}
          {entry?.limitReached && (
            <LumenContentText context="section.description" className="hbar-session-activity-notice">
              {t('limitReached')}
            </LumenContentText>
          )}
          {entry?.status === 'ready' && entry.nextCursor && !entry.limitReached && (
            <LumenButton size="s" disabled={!connected} onClick={onLoadMore}>
              {t('loadMore')}
            </LumenButton>
          )}
        </>
      )}
    </LumenFrame>
  )
}

export function HbarSessionActivityWorkspace(props: {
  readonly labels: HbarSessionActivityLabels
  readonly connected: boolean
  readonly instanceId: string
  readonly targetLabel?: string | undefined
}) {
  const { labels, ...viewProps } = props
  const { text, tasks, workflow, agents, ...messages } = labels
  return (
    <sessionActivityMessages.Provider messages={messages}>
      <SessionActivityWorkspaceContent {...viewProps} labels={{ text, tasks, workflow, agents }} />
    </sessionActivityMessages.Provider>
  )
}

function SessionActivityWorkspaceContent({
  labels,
  connected,
  instanceId,
  targetLabel,
}: {
  readonly labels: Pick<HbarSessionActivityLabels, 'text' | 'tasks' | 'workflow' | 'agents'>
  readonly connected: boolean
  readonly instanceId: string
  readonly targetLabel?: string | undefined
}) {
  const { t } = sessionActivityMessages.useMessages()
  const runtime = useHbarRuntime()
  const activity = useHbarRuntimeState(runtime.state.activity)
  const composerIntent = useHbarRuntimeState(runtime.state.composerIntent)
  const workflows = useHbarRuntimeState(runtime.state.workflows)
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const tabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const panel = surfaces.panels[instanceId]
  const entry = activity.entries[instanceId]
  const agentEntry = activity.agents[instanceId]
  const workflowEntry = workflows.entries[instanceId]
  const liveAgents = agentEntry && agentEntry.sessionId === panel?.sessionId ? agentEntry.items : []
  const representedAgents = projectActivityWorkflow(
    workflowEntry,
    panel?.sessionId ?? '',
    liveAgents,
  ).representedAgentIds
  const [opening, setOpening] = useState<ActivityAgentOpenState | null>(null)
  const openIntent = useRef(0)
  const targetReady =
    panel?.panelId === 'activity' &&
    panel.sessionId !== null &&
    navigation.status === 'idle' &&
    navigation.sessionId === panel.sessionId &&
    navigation.workspaceId === panel.workspaceId

  useEffect(() => {
    if (targetReady && (!entry || entry.sessionId !== panel.sessionId))
      void runtime.commands.execute('activityWorkspace.refresh', { instanceId }).catch(() => undefined)
  }, [entry, instanceId, panel?.sessionId, runtime.commands, targetReady])
  useEffect(() => {
    if (targetReady && (!agentEntry || agentEntry.sessionId !== panel.sessionId))
      void runtime.commands.execute('activityWorkspace.refreshAgents', { instanceId }).catch(() => undefined)
  }, [agentEntry, instanceId, panel?.sessionId, runtime.commands, targetReady])
  useEffect(
    () => () => {
      openIntent.current++
    },
    [instanceId, panel?.sessionId],
  )
  useEffect(() => {
    if (targetReady && (!workflowEntry || workflowEntry.sessionId !== panel.sessionId))
      void runtime.commands.execute('workflowWorkspace.refresh', { instanceId }).catch(() => undefined)
  }, [workflowEntry, instanceId, panel?.sessionId, runtime.commands, targetReady])

  const invoke = (
    command:
      | 'activityWorkspace.refresh'
      | 'activityWorkspace.loadMore'
      | 'activityWorkspace.refreshAgents'
      | 'activityWorkspace.loadMoreAgents',
  ) => void runtime.commands.execute(command, { instanceId }).catch(() => undefined)
  const openAgent = (agent: ActivityAgentEntryState['items'][number]) => {
    if (opening?.status === 'opening') return
    const source = tabs.items.find((item) => item.kind === 'session' && item.sessionId === agent.parentSessionId)
    if (!source || !targetReady || panel?.sessionId !== agent.parentSessionId) {
      setOpening({ agentId: agent.agentId, status: 'error', error: 'SOURCE_CHANGED' })
      return
    }
    const intent = ++openIntent.current
    setOpening({ agentId: agent.agentId, status: 'opening', error: null })
    void runtime.commands
      .execute('agentChild.open', {
        panelInstanceId: instanceId,
        parentSessionId: agent.parentSessionId,
        agentId: agent.agentId,
        expectedChildSessionId: agent.sessionId,
        sourceTabInstanceKey: source.instanceKey,
      })
      .then(() => {
        if (openIntent.current === intent) setOpening(null)
      })
      .catch((reason: unknown) => {
        if (openIntent.current !== intent) return
        const code =
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED'
        setOpening({ agentId: agent.agentId, status: 'error', error: code })
      })
  }
  return (
    <LumenToolPane
      title={t('title')}
      targetLabel={targetLabel}
      description={t('description')}
      icon={ListChecks}
      closeLabel={t('close')}
      onClose={() => void runtime.commands.execute('app.closePanel', { instanceId }).catch(() => undefined)}
      busy={
        !entry || entry.status === 'loading' || agentEntry?.status === 'loading' || workflowEntry?.status === 'loading'
      }
      actions={
        <LumenIconButton
          label={t('refresh')}
          disabled={
            !connected ||
            !targetReady ||
            entry?.status === 'loading' ||
            agentEntry?.status === 'loading' ||
            workflowEntry?.status === 'loading'
          }
          onClick={() => {
            invoke('activityWorkspace.refresh')
            invoke('activityWorkspace.refreshAgents')
            void runtime.commands.execute('workflowWorkspace.refresh', { instanceId }).catch(() => undefined)
            if (targetReady && panel?.sessionId)
              void runtime.commands
                .execute('composerIntent.refresh', { sessionId: panel.sessionId })
                .catch(() => undefined)
          }}
        >
          <LumenIcon icon={RefreshCw} tier="sm" />
        </LumenIconButton>
      }
      className="hbar-session-activity-workspace"
    >
      <LumenFrame as="main" className="hbar-session-activity-body" tabIndex={0} aria-label={t('title')}>
        {panel?.sessionId && (
          <ActivityTasksView
            facts={composerIntent.facts}
            sessionId={panel.sessionId}
            connected={connected}
            labels={labels.tasks}
            onRefresh={() => {
              if (targetReady && panel.sessionId)
                void runtime.commands
                  .execute('composerIntent.refresh', { sessionId: panel.sessionId })
                  .catch(() => undefined)
            }}
          />
        )}
        <SessionActivityViewContent
          entry={entry?.sessionId === panel?.sessionId ? entry : undefined}
          connected={connected}
          textLabels={labels.text}
          onRefresh={() => invoke('activityWorkspace.refresh')}
          onLoadMore={() => invoke('activityWorkspace.loadMore')}
        />
        {panel?.sessionId && (
          <ActivityWorkflowView
            entry={workflowEntry?.sessionId === panel.sessionId ? workflowEntry : undefined}
            sessionId={panel.sessionId}
            liveAgents={liveAgents}
            labels={labels.workflow}
            connected={connected}
            opening={opening}
            onRefresh={() =>
              void runtime.commands.execute('workflowWorkspace.refresh', { instanceId }).catch(() => undefined)
            }
            onOpen={openAgent}
          />
        )}
        <ActivityAgentsView
          entry={agentEntry?.sessionId === panel?.sessionId ? agentEntry : undefined}
          labels={labels.agents}
          connected={connected}
          opening={opening}
          onRefresh={() => invoke('activityWorkspace.refreshAgents')}
          onLoadMore={() => invoke('activityWorkspace.loadMoreAgents')}
          onOpen={openAgent}
          excludedAgentIds={representedAgents}
        />
      </LumenFrame>
    </LumenToolPane>
  )
}
