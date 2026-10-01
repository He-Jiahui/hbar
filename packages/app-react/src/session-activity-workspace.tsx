import { useEffect, useRef, useState } from 'react'
import { ListChecks, RefreshCw } from 'lucide-react'
import {
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

type Operation = ActivityWorkspaceEntryState['items'][number]

export interface HbarSessionActivityLabels {
  readonly title: string
  readonly runs: string
  readonly agents: ActivityAgentLabels
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

function tone(status: Operation['status']): 'neutral' | 'warning' {
  return status === 'cancelRequested' || status === 'waiting_approval' ? 'warning' : 'neutral'
}

/** The Host query is cursor-bounded; rows grow inside this pane's scroll region. */
export function HbarSessionActivityView({
  entry,
  connected,
  labels,
  onRefresh,
  onLoadMore,
}: {
  readonly entry: Readonly<ActivityWorkspaceEntryState> | undefined
  readonly connected: boolean
  readonly labels: HbarSessionActivityLabels
  readonly onRefresh: () => void
  readonly onLoadMore: () => void
}) {
  const loading = !entry || entry.status === 'loading'
  const loadingMore = loading && Boolean(entry?.items.length)
  const visible = entry?.items ?? []
  return (
    <LumenFrame as="section" className="hbar-session-activity-runs" aria-label={labels.runs}>
      <LumenFrame className="hbar-activity-section-heading">
        <LumenText as="h3">{labels.runs}</LumenText>
      </LumenFrame>
      {!connected && (
        <LumenText as="p" role="status" className="hbar-session-activity-notice">
          {labels.offline}
        </LumenText>
      )}
      {entry?.status === 'error' && (
        <LumenFrame className="hbar-session-activity-recovery">
          <LumenText as="p" role="alert">
            {labels.error(entry.error ?? 'EXECUTION_FAILED')}
          </LumenText>
          <LumenButton size="s" disabled={!connected} onClick={onRefresh}>
            {labels.retry}
          </LumenButton>
        </LumenFrame>
      )}
      {loading && !loadingMore && (
        <LumenText as="p" role="status" className="hbar-session-activity-notice">
          {labels.loading}
        </LumenText>
      )}
      {entry?.status === 'ready' && entry.totalActive === 0 && (
        <LumenText as="p" className="hbar-session-activity-notice">
          {labels.empty}
        </LumenText>
      )}
      {visible.length > 0 && (
        <>
          <LumenText as="p" className="hbar-session-activity-count">
            {labels.count(visible.length, entry?.totalActive ?? visible.length)}
          </LumenText>
          <LumenCollection as="ol" className="hbar-session-activity-list">
            {visible.map((item) => (
              <LumenCollectionItem key={item.operationId} data-operation-id={item.operationId}>
                <LumenFrame className="hbar-session-activity-row-heading">
                  <LumenText as="strong" className="hbar-session-activity-intent">
                    {item.intentPreview ? labels.intentPreview(item.intentPreview) : labels.runAt(item.createdAt)}
                  </LumenText>
                  <LumenStatus value={labels.status(item.status)} tone={tone(item.status)} />
                </LumenFrame>
                <LumenText as="time" dateTime={new Date(item.startedAt ?? item.createdAt).toISOString()}>
                  {item.startedAt === null ? labels.queuedAt(item.createdAt) : labels.startedAt(item.startedAt)}
                </LumenText>
              </LumenCollectionItem>
            ))}
          </LumenCollection>
          {loadingMore && (
            <LumenText as="p" role="status" className="hbar-session-activity-notice">
              {labels.loadingMore}
            </LumenText>
          )}
          {entry?.limitReached && (
            <LumenText as="p" className="hbar-session-activity-notice">
              {labels.limitReached}
            </LumenText>
          )}
          {entry?.status === 'ready' && entry.nextCursor && !entry.limitReached && (
            <LumenButton size="s" disabled={!connected} onClick={onLoadMore}>
              {labels.loadMore}
            </LumenButton>
          )}
        </>
      )}
    </LumenFrame>
  )
}

export function HbarSessionActivityWorkspace({
  labels,
  connected,
  instanceId,
  targetLabel,
}: {
  readonly labels: HbarSessionActivityLabels
  readonly connected: boolean
  readonly instanceId: string
  readonly targetLabel?: string | undefined
}) {
  const runtime = useHbarRuntime()
  const activity = useHbarRuntimeState(runtime.state.activity)
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const tabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const panel = surfaces.panels[instanceId]
  const entry = activity.entries[instanceId]
  const agentEntry = activity.agents[instanceId]
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
      title={labels.title}
      targetLabel={targetLabel}
      description={labels.description}
      icon={ListChecks}
      closeLabel={labels.close}
      onClose={() => void runtime.commands.execute('app.closePanel', { instanceId }).catch(() => undefined)}
      busy={!entry || entry.status === 'loading' || agentEntry?.status === 'loading'}
      actions={
        <LumenIconButton
          label={labels.refresh}
          disabled={!connected || !targetReady || entry?.status === 'loading' || agentEntry?.status === 'loading'}
          onClick={() => {
            invoke('activityWorkspace.refresh')
            invoke('activityWorkspace.refreshAgents')
          }}
        >
          <LumenIcon icon={RefreshCw} tier="sm" />
        </LumenIconButton>
      }
      className="hbar-session-activity-workspace"
    >
      <LumenFrame as="main" className="hbar-session-activity-body">
        <HbarSessionActivityView
          entry={entry?.sessionId === panel?.sessionId ? entry : undefined}
          connected={connected}
          labels={labels}
          onRefresh={() => invoke('activityWorkspace.refresh')}
          onLoadMore={() => invoke('activityWorkspace.loadMore')}
        />
        <ActivityAgentsView
          entry={agentEntry?.sessionId === panel?.sessionId ? agentEntry : undefined}
          labels={labels.agents}
          connected={connected}
          opening={opening}
          onRefresh={() => invoke('activityWorkspace.refreshAgents')}
          onLoadMore={() => invoke('activityWorkspace.loadMoreAgents')}
          onOpen={openAgent}
        />
      </LumenFrame>
    </LumenToolPane>
  )
}
