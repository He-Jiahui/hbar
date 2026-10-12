import type { NavigationState, PresentationState, RunActionsState, SessionTimelineState, SurfaceState } from './types'
import type { WorkspaceTabsState } from './workspace-tabs-runtime'
import type { ObservedOperationStatus } from '@hbar/contracts/commands/run-action'
export type SessionStopRun = Pick<SessionTimelineState['runs'][number], 'id' | 'sessionId' | 'status'>

export interface SessionStopSnapshot {
  readonly hostId: string
  readonly runtimeId: string
  readonly connected: boolean
  readonly navigation: NavigationState
  readonly tabs: Pick<WorkspaceTabsState, 'items' | 'activeId'>
  readonly presentation: Pick<PresentationState, 'page' | 'toolInstanceId' | 'modalInstanceId'>
  readonly surfaces: Pick<SurfaceState, 'panels'>
  readonly timeline: Pick<SessionTimelineState, 'sessionId' | 'status'> & {
    readonly runs: readonly SessionStopRun[]
  }
  readonly actions: RunActionsState
}

export interface SessionStopScope {
  readonly hostId: string
  readonly runtimeId: string
  readonly workspaceId: string
  readonly sessionId: string
  readonly tabId: string | null
  readonly tabInstanceKey: string | null
}

export interface SessionStopTarget extends SessionStopScope {
  readonly operationId: string
}

export interface SessionStopKey {
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  readonly repeat: boolean
  readonly defaultPrevented: boolean
  readonly isComposing: boolean
  readonly keyCode: number
}

export interface SessionStopKeyScope {
  readonly scope: 'main' | 'tool' | 'body' | 'sidebar' | 'outside'
  readonly mainVisible: boolean
  readonly toolVisible: boolean
  readonly overlayOpen: boolean
}

export type SessionStopFeedbackKind =
  | 'sending'
  | 'checking'
  | 'requested'
  | 'unknown'
  | 'failed'
  | 'cancelled'
  | 'completed'
  | 'run-failed'
  | 'interrupted'
  | 'guided'

export interface SessionStopFeedback {
  readonly kind: SessionStopFeedbackKind
  readonly error: string | null
  readonly canCheck: boolean
  readonly canRetry: boolean
  readonly requestInFlight: boolean
}

const nonempty = (value: string): boolean => value.trim().length > 0

function validScope(scope: SessionStopScope): boolean {
  return (
    [scope.hostId, scope.runtimeId, scope.workspaceId, scope.sessionId].every(nonempty) &&
    ((scope.tabId === null && scope.tabInstanceKey === null) ||
      (scope.tabId !== null &&
        scope.tabInstanceKey !== null &&
        nonempty(scope.tabId) &&
        nonempty(scope.tabInstanceKey)))
  )
}

export function sameSessionStopScope(left: SessionStopScope | null, right: SessionStopScope | null): boolean {
  return Boolean(
    left &&
    right &&
    validScope(left) &&
    validScope(right) &&
    left.hostId === right.hostId &&
    left.runtimeId === right.runtimeId &&
    left.workspaceId === right.workspaceId &&
    left.sessionId === right.sessionId &&
    left.tabId === right.tabId &&
    left.tabInstanceKey === right.tabInstanceKey,
  )
}

export function sameSessionStopTarget(left: SessionStopTarget | null, right: SessionStopTarget | null): boolean {
  return Boolean(
    left &&
    right &&
    nonempty(left.operationId) &&
    left.operationId === right.operationId &&
    sameSessionStopScope(left, right),
  )
}

export function sessionStopScope(snapshot: SessionStopSnapshot): SessionStopScope | null {
  const { navigation, presentation, tabs, timeline } = snapshot
  if (
    presentation.page.kind !== 'session' ||
    navigation.status !== 'idle' ||
    !navigation.workspaceId ||
    !navigation.sessionId ||
    timeline.sessionId !== navigation.sessionId
  )
    return null
  const selected = tabs.activeId === null ? [] : tabs.items.filter((tab) => tab.id === tabs.activeId)
  const tab = selected[0]
  if (
    tabs.activeId !== null &&
    (selected.length !== 1 ||
      !tab ||
      tab.kind !== 'session' ||
      tab.workspaceId !== navigation.workspaceId ||
      tab.sessionId !== navigation.sessionId)
  )
    return null
  const scope: SessionStopScope = {
    hostId: snapshot.hostId,
    runtimeId: snapshot.runtimeId,
    workspaceId: navigation.workspaceId,
    sessionId: navigation.sessionId,
    tabId: tab?.id ?? null,
    tabInstanceKey: tab?.instanceKey ?? null,
  }
  return validScope(scope) ? scope : null
}

export function sessionStopToolMatches(snapshot: SessionStopSnapshot): boolean {
  const scope = sessionStopScope(snapshot)
  const id = snapshot.presentation.toolInstanceId
  const tool = id === null ? undefined : snapshot.surfaces.panels[id]
  return Boolean(
    scope &&
    tool &&
    tool.instanceId === id &&
    tool.sessionTool === true &&
    tool.sessionId === scope.sessionId &&
    tool.workspaceId === scope.workspaceId,
  )
}

function isActive(run: SessionStopRun): boolean {
  return run.status === 'running' || run.status === 'waiting_approval' || run.status === 'queued'
}

export function activeSessionStopRun<T extends SessionStopRun>(runs: readonly T[]): T | undefined {
  return (
    runs.find((run) => run.status === 'running' || run.status === 'waiting_approval') ??
    runs.find((run) => run.status === 'queued')
  )
}

function exactRun(snapshot: SessionStopSnapshot, operationId: string): SessionStopRun | undefined {
  const matches = snapshot.timeline.runs.filter((run) => run.id === operationId)
  const run = matches[0]
  return matches.length === 1 && run?.sessionId === snapshot.navigation.sessionId ? run : undefined
}

function ready(snapshot: SessionStopSnapshot): boolean {
  return snapshot.connected && snapshot.timeline.status === 'ready' && snapshot.presentation.modalInstanceId === null
}

export function sessionStopCanCancel(snapshot: SessionStopSnapshot, operationId: string): boolean {
  if (!sessionStopScope(snapshot) || !ready(snapshot) || !nonempty(operationId)) return false
  const run = exactRun(snapshot, operationId)
  if (!run || !isActive(run)) return false
  const action = snapshot.actions[operationId]
  return (
    !action ||
    (action.operationId === operationId &&
      (action.sessionId === undefined || action.sessionId === run.sessionId) &&
      !action.requestInFlight &&
      action.status !== 'submitting' &&
      action.status !== 'unknown' &&
      !(action.commandId === 'operation.cancel' && action.status === 'succeeded'))
  )
}

export function sessionStopTarget(snapshot: SessionStopSnapshot): SessionStopTarget | null {
  const scope = sessionStopScope(snapshot)
  if (!scope) return null
  const run = activeSessionStopRun(
    snapshot.timeline.runs.filter((candidate) => candidate.sessionId === scope.sessionId),
  )
  return run && sessionStopCanCancel(snapshot, run.id) ? { ...scope, operationId: run.id } : null
}

export function shouldStopSessionKey(
  event: SessionStopKey,
  scope: SessionStopKeyScope,
  snapshot: SessionStopSnapshot,
): boolean {
  if (
    event.key !== '.' ||
    event.ctrlKey === event.metaKey ||
    event.altKey ||
    event.shiftKey ||
    event.repeat ||
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    scope.overlayOpen ||
    !sessionStopTarget(snapshot)
  )
    return false
  const ownedTool = scope.toolVisible && sessionStopToolMatches(snapshot)
  switch (scope.scope) {
    case 'main':
      return scope.mainVisible
    case 'tool':
      return ownedTool
    case 'body':
      return (!scope.toolVisible || ownedTool) && (scope.mainVisible || ownedTool)
    case 'sidebar':
    case 'outside':
      return false
  }
}

function terminalKind(status: ObservedOperationStatus | undefined): SessionStopFeedbackKind | null {
  switch (status) {
    case 'completed':
    case 'cancelled':
    case 'interrupted':
    case 'guided':
      return status
    case 'failed':
      return 'run-failed'
    case 'queued':
    case 'running':
    case 'waiting_approval':
    case 'cancelRequested':
    case undefined:
      return null
  }
}

export function sessionStopFeedback(
  snapshot: SessionStopSnapshot,
  target: SessionStopTarget,
): SessionStopFeedback | null {
  if (!nonempty(target.operationId) || !sameSessionStopScope(sessionStopScope(snapshot), target)) return null
  const action = snapshot.actions[target.operationId]
  const run = exactRun(snapshot, target.operationId)
  if (
    !action ||
    action.commandId !== 'operation.cancel' ||
    action.operationId !== target.operationId ||
    (action.sessionId !== undefined && action.sessionId !== target.sessionId) ||
    (!run && action.sessionId !== target.sessionId)
  )
    return null
  const terminal = terminalKind(run?.status) ?? terminalKind(action.observedStatus)
  const kind: SessionStopFeedbackKind =
    terminal ??
    (action.status === 'submitting'
      ? action.phase === 'state'
        ? 'checking'
        : 'sending'
      : action.status === 'succeeded'
        ? 'requested'
        : action.status)
  const requestInFlight = action.requestInFlight === true
  return {
    kind,
    error: action.error,
    requestInFlight,
    canCheck:
      !terminal &&
      ready(snapshot) &&
      !requestInFlight &&
      (action.status === 'unknown' || action.status === 'succeeded'),
    canRetry: !terminal && action.status === 'failed' && sessionStopCanCancel(snapshot, target.operationId),
  }
}
