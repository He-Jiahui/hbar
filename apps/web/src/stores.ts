import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { HbarClient } from '@hbar/client'
import type { ConnectionStatus } from '@hbar/client'
import type {
  Approval,
  ApprovalMode,
  Bootstrap,
  ContentBlock,
  HostInfo,
  Message,
  Run,
  Session,
  SessionEvent,
  SessionSnapshot,
  SessionSummary,
  ThinkingLevel,
  Usage,
  WireNotification,
} from '@hbar/contracts'
import { normalizeThinkingLevel } from '@hbar/contracts'
import { isApprovalMode } from './permissions'
import {
  acknowledgeComposerDraftValue,
  composerDraftKey,
  EMPTY_COMPOSER_DRAFT,
  normalizeComposerDraft,
  normalizeComposerDrafts,
  type ComposerDraft,
} from './composer-draft'
import { applySessionCapabilityEvent, loadSessionCapabilities, resetSessionCapabilities } from './session-capabilities'

export const useConnection = create<{
  client: HbarClient | null
  status: ConnectionStatus
  host: HostInfo | null
  error: string
  url: string
}>(() => ({
  client: null,
  status: 'disconnected',
  host: null,
  error: '',
  url: typeof globalThis.location !== 'undefined' ? globalThis.location.origin : 'http://127.0.0.1',
}))
export const useCatalog = create<{ data: Bootstrap | null }>(() => ({ data: null }))
export const useSessionSummaries = create<{ byId: Record<string, SessionSummary> }>(() => ({ byId: {} }))
export const useGitState = create<{ revision: number; changedCwds: string[] }>(() => ({ revision: 0, changedCwds: [] }))
export const useSessions = create<{ snapshots: Record<string, SessionSnapshot>; loading: Set<string> }>(() => ({
  snapshots: {},
  loading: new Set(),
}))
interface WorkbenchState {
  activeSession: string
  workspaceId: string
  modelId: string
  thinkingLevel: ThinkingLevel
  thinkingByModel: Record<string, ThinkingLevel>
  approvalMode: ApprovalMode
  drafts: Record<string, ComposerDraft>
  showArchived: boolean
  pinnedSessionIds: string[]
  pinnedWorkspaceIds: string[]
  panel: 'sessions' | 'files'
  toolPanel: string
  theme: 'dark' | 'light' | 'white' | 'custom'
  layout: unknown
  sidebarWidth: number
}

function isTheme(value: unknown): value is WorkbenchState['theme'] {
  return value === 'dark' || value === 'light' || value === 'white' || value === 'custom'
}

const defaultWorkbenchState: WorkbenchState = {
  activeSession: '',
  workspaceId: '',
  modelId: '',
  thinkingLevel: 'off',
  thinkingByModel: {},
  approvalMode: 'ask',
  drafts: {},
  showArchived: false,
  pinnedSessionIds: [],
  pinnedWorkspaceIds: [],
  panel: 'sessions',
  toolPanel: '',
  theme: 'dark',
  layout: null,
  sidebarWidth: 272,
}

function normalizeSidebarWidth(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(360, Math.max(220, Math.round(value))) : 272
}

export const useWorkbench = create(
  persist<WorkbenchState>(() => defaultWorkbenchState, {
    name: 'hbar.workbench.v1',
    version: 5,
    migrate: (persisted): WorkbenchState => {
      const raw = persisted && typeof persisted === 'object' ? (persisted as Partial<WorkbenchState> & { toolRailLayout?: unknown }) : {}
      const { toolRailLayout: _legacyToolRailLayout, ...value } = raw
      return {
        ...defaultWorkbenchState,
        ...value,
        drafts: normalizeComposerDrafts(value.drafts),
        thinkingLevel: isThinkingLevel(value.thinkingLevel) ? value.thinkingLevel : 'off',
        thinkingByModel: normalizeThinkingMap(value.thinkingByModel),
        approvalMode: isApprovalMode(value.approvalMode) ? value.approvalMode : 'ask',
        pinnedSessionIds: Array.isArray(value.pinnedSessionIds) ? value.pinnedSessionIds.filter((id): id is string => typeof id === 'string') : [],
        pinnedWorkspaceIds: Array.isArray(value.pinnedWorkspaceIds) ? value.pinnedWorkspaceIds.filter((id): id is string => typeof id === 'string') : [],
        theme: isTheme(value.theme) ? value.theme : 'dark',
        sidebarWidth: normalizeSidebarWidth(value.sidebarWidth),
      }
    },
  }),
)
export const useNotice = create<{ error: string; notice: string }>(() => ({ error: '', notice: '' }))
export const report = (error: unknown) =>
  useNotice.setState({ error: error instanceof Error ? error.message : String(error) })

export function getComposerDraft(sessionId?: string): ComposerDraft {
  const draft = useWorkbench.getState().drafts[composerDraftKey(sessionId)]
  return draft ? normalizeComposerDraft(draft) : { ...EMPTY_COMPOSER_DRAFT }
}

export function updateComposerDraft(
  sessionId: string | undefined,
  patch: Partial<ComposerDraft> | ((current: ComposerDraft) => Partial<ComposerDraft>),
): ComposerDraft {
  const key = composerDraftKey(sessionId)
  let nextDraft: ComposerDraft = { ...EMPTY_COMPOSER_DRAFT }
  useWorkbench.setState((state) => {
    const current = getDraftFromState(state, key)
    const changes = typeof patch === 'function' ? patch(current) : patch
    nextDraft = normalizeComposerDraft({ ...current, ...changes })
    return { drafts: { ...state.drafts, [key]: nextDraft } }
  })
  return nextDraft
}

export function clearComposerDraft(sessionId?: string): void {
  const key = composerDraftKey(sessionId)
  useWorkbench.setState((state) => {
    if (!state.drafts[key]) return state
    const drafts = { ...state.drafts }
    delete drafts[key]
    return { drafts }
  })
}

export function acknowledgeComposerDraft(sessionId: string | undefined, sent: ComposerDraft): void {
  const key = composerDraftKey(sessionId)
  useWorkbench.setState((state) => {
    const current = state.drafts[key]
    if (!current) return state
    const next = acknowledgeComposerDraftValue(current, sent)
    if (!next) {
      const drafts = { ...state.drafts }
      delete drafts[key]
      return { drafts }
    }
    return { drafts: { ...state.drafts, [key]: next } }
  })
}

export function moveComposerDraft(fromSessionId: string | undefined, toSessionId: string): void {
  const from = composerDraftKey(fromSessionId)
  if (!toSessionId || from === toSessionId) return
  useWorkbench.setState((state) => {
    const source = state.drafts[from]
    if (!source || state.drafts[toSessionId]) return state
    const drafts = { ...state.drafts, [toSessionId]: normalizeComposerDraft(source) }
    delete drafts[from]
    return { drafts }
  })
}

function getDraftFromState(state: WorkbenchState, key: string): ComposerDraft {
  const draft = state.drafts[key]
  return draft ? normalizeComposerDraft(draft) : { ...EMPTY_COMPOSER_DRAFT }
}

let approvalSequence = 0
let approvalQueue: Promise<void> = Promise.resolve()
export async function setApprovalMode(mode: ApprovalMode): Promise<boolean> {
  const sequence = ++approvalSequence
  const previous = useWorkbench.getState().approvalMode
  if (previous === mode) return true
  useWorkbench.setState({ approvalMode: mode })
  const connection = useConnection.getState().client
  const request = approvalQueue
    .catch(() => {})
    .then(async () => {
      if (!connection) {
        if (sequence === approvalSequence) useWorkbench.setState({ approvalMode: previous })
        return false
      }
      try {
        await connection.call('permission.set', { mode })
        return true
      } catch (error) {
        if (sequence === approvalSequence) {
          useWorkbench.setState({ approvalMode: previous })
          report(error)
        }
        return false
      }
    })
  approvalQueue = request.then(
    () => undefined,
    () => undefined,
  )
  return request
}
export async function loadApprovalMode() {
  const connection = client()
  const result = await connection.call('permission.get', {})
  if (useConnection.getState().client !== connection || !isApprovalMode(result.mode)) return
  useWorkbench.setState({ approvalMode: result.mode })
}
function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === 'string' && ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(value)
}

function normalizeThinkingMap(value: unknown): Record<string, ThinkingLevel> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([modelId, level]) => (isThinkingLevel(level) ? [[modelId, level]] : [])),
  )
}

export function selectModel(modelId: string, requestedThinking?: ThinkingLevel) {
  const model = useCatalog.getState().data?.models.find((entry) => entry.id === modelId)
  const state = useWorkbench.getState()
  const thinkingLevel = model
    ? normalizeThinkingLevel(model, requestedThinking ?? state.thinkingByModel[modelId])
    : (requestedThinking ?? state.thinkingByModel[modelId] ?? 'off')
  useWorkbench.setState({
    modelId,
    thinkingLevel,
    thinkingByModel: { ...state.thinkingByModel, [modelId]: thinkingLevel },
  })
}

export function selectThinkingLevel(level: ThinkingLevel) {
  const state = useWorkbench.getState()
  const model = useCatalog.getState().data?.models.find((entry) => entry.id === state.modelId)
  const thinkingLevel = model ? normalizeThinkingLevel(model, level) : level
  useWorkbench.setState({
    thinkingLevel,
    ...(state.modelId ? { thinkingByModel: { ...state.thinkingByModel, [state.modelId]: thinkingLevel } } : {}),
  })
}
export function client(): HbarClient {
  const value = useConnection.getState().client
  if (!value) throw new Error('Host is not connected')
  return value
}
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let generation = 0
const bufferedEvents = new Map<string, Map<number, SessionEvent>>()
const sessionLoadGeneration = new Map<string, number>()
const olderMessageRequests = new Map<string, { connection: HbarClient; before: number }>()
const seenTaskNotificationKeys = new Set<string>()
const MAX_SEEN_TASK_NOTIFICATIONS = 256

function rememberTaskNotification(event: Extract<WireNotification, { method: 'task.notification' }>) {
  const key = `${event.params.sessionId}:${event.params.runId ?? ''}:${event.params.kind}`
  if (seenTaskNotificationKeys.has(key)) return false
  seenTaskNotificationKeys.add(key)
  if (seenTaskNotificationKeys.size > MAX_SEEN_TASK_NOTIFICATIONS) {
    const oldest = seenTaskNotificationKeys.values().next().value
    if (typeof oldest === 'string') seenTaskNotificationKeys.delete(oldest)
  }
  return true
}

export async function connectHost(url: string, token?: string) {
  const prior = useConnection.getState().client
  prior?.disconnect()
  const connectionGeneration = ++generation
  const next = new HbarClient(url, token)
  useConnection.setState({ client: next, url, status: 'connecting', error: '' })
  useSessions.setState({ snapshots: {}, loading: new Set() })
  useSessionSummaries.setState({ byId: {} })
  useGitState.setState({ revision: 0, changedCwds: [] })
  sessionLoadGeneration.clear()
  olderMessageRequests.clear()
  resetSessionCapabilities()
  bufferedEvents.clear()
  next.onStatus((status) => {
    if (connectionGeneration !== generation) return
    useConnection.setState({ status })
    if (status === 'connected')
      void refreshCatalog()
        .then(async () => {
          await loadApprovalMode()
          const selected = useWorkbench.getState().activeSession
          if (selected) void openSession(selected).catch(report)
        })
        .catch(report)
  })
  next.onEvent((event) => {
    if (connectionGeneration === generation) onEvent(event)
  })
  try {
    const host = await next.connect()
    if (connectionGeneration === generation) useConnection.setState({ host })
  } catch (error) {
    if (connectionGeneration === generation && useConnection.getState().status !== 'pairing')
      useConnection.setState({ error: error instanceof Error ? error.message : String(error) })
  }
}
export async function refreshCatalog() {
  const connection = client()
  const data = await connection.call('system.bootstrap', {})
  if (client() !== connection) return
  useCatalog.setState({ data })
  useConnection.setState({ host: data.host })
  try {
    const ids = data.sessions.map((session) => session.id).slice(0, 2_000)
    const summaries = (await Promise.all(
      Array.from({ length: Math.ceil(ids.length / 200) }, (_, index) =>
        connection.call('session.summaries', { sessionIds: ids.slice(index * 200, index * 200 + 200) }),
      ),
    )).flat()
    if (client() === connection)
      useSessionSummaries.setState({ byId: Object.fromEntries(summaries.map((summary) => [summary.sessionId, summary])) })
  } catch (error) {
    if (client() === connection) report(error)
  }
  const state = useWorkbench.getState()
  const changes: Partial<typeof state> = {}
  if (!data.workspaces.some((w) => w.id === state.workspaceId)) changes.workspaceId = data.workspaces[0]?.id ?? ''
  const nextModelId = data.models.some((m) => m.id === state.modelId) ? state.modelId : (data.models[0]?.id ?? '')
  if (nextModelId !== state.modelId) changes.modelId = nextModelId
  const nextModel = data.models.find((model) => model.id === nextModelId)
  if (nextModel) {
    const nextThinking = normalizeThinkingLevel(nextModel, state.thinkingByModel[nextModel.id] ?? state.thinkingLevel)
    if (nextThinking !== state.thinkingLevel) changes.thinkingLevel = nextThinking
    if (state.thinkingByModel[nextModel.id] !== nextThinking)
      changes.thinkingByModel = { ...state.thinkingByModel, [nextModel.id]: nextThinking }
  }
  if (state.activeSession && !data.sessions.some((s) => s.id === state.activeSession)) changes.activeSession = ''
  useWorkbench.setState(changes)
}
export async function openSession(sessionId: string) {
  const connection = client()
  const sessionGeneration = (sessionLoadGeneration.get(sessionId) ?? 0) + 1
  sessionLoadGeneration.set(sessionId, sessionGeneration)
  const current = useWorkbench.getState().activeSession
  useWorkbench.setState({ activeSession: sessionId })
  if (current && current !== sessionId) await connection.unfollow(current).catch(() => {})
  useSessions.setState((state) => ({ loading: new Set(state.loading).add(sessionId) }))
  try {
    const snapshot = await connection.call('session.snapshot', { sessionId })
    if (client() !== connection || useWorkbench.getState().activeSession !== sessionId) return
    useSessions.setState((state) => ({ snapshots: { ...state.snapshots, [sessionId]: snapshot } }))
    bufferedEvents.delete(sessionId)
    await connection.follow(sessionId, snapshot.cursor)
    await loadSessionCapabilities(sessionId, connection, () => useConnection.getState().client === connection)
    const session = useCatalog.getState().data?.sessions.find((s) => s.id === sessionId)
    if (session) useWorkbench.setState({ workspaceId: session.workspaceId })
  } finally {
    useSessions.setState((state) => {
      const loading = new Set(state.loading)
      loading.delete(sessionId)
      return { loading }
    })
  }
}
export async function loadOlder(sessionId: string) {
  const connection = useConnection.getState().client
  const snapshot = useSessions.getState().snapshots[sessionId]
  const firstMessage = snapshot?.messages[0]
  if (!connection || !firstMessage) return
  const before = firstMessage.seq
  const previousRequest = olderMessageRequests.get(sessionId)
  if (previousRequest?.connection === connection && previousRequest.before === before) return
  const request = { connection, before }
  olderMessageRequests.set(sessionId, request)
  const sessionGeneration = sessionLoadGeneration.get(sessionId) ?? 0
  const connectionGeneration = generation
  const isCurrentRequest = () =>
    connection === useConnection.getState().client &&
    connectionGeneration === generation &&
    olderMessageRequests.get(sessionId) === request &&
    sessionGeneration === (sessionLoadGeneration.get(sessionId) ?? 0) &&
    (!useWorkbench.getState().activeSession || useWorkbench.getState().activeSession === sessionId)
  try {
    const older = await connection.call('session.snapshot', { sessionId, before, limit: 100 })
    if (!isCurrentRequest()) return
    const current = useSessions.getState().snapshots[sessionId]
    if (!current || current.messages[0]?.seq !== before) return
    useSessions.setState((state) => {
      const current = state.snapshots[sessionId]
      if (!current || current.messages[0]?.seq !== before) return state
      const known = new Set(current.messages.map((m) => m.id))
      return {
        snapshots: {
          ...state.snapshots,
          [sessionId]: {
            ...current,
            messages: [...older.messages.filter((m) => !known.has(m.id)), ...current.messages],
            hasOlder: older.hasOlder,
          },
        },
      }
    })
  } catch (error) {
    if (isCurrentRequest()) throw error
    return
  } finally {
    if (olderMessageRequests.get(sessionId) === request) olderMessageRequests.delete(sessionId)
  }
}
function onEvent(event: WireNotification) {
  if (event.method === 'git.changed') {
    useGitState.setState((state) => ({ revision: state.revision + 1, changedCwds: [...state.changedCwds.slice(-31), event.params.cwd] }))
    return
  }
  applySessionCapabilityEvent(event)
  if (event.method === 'host.changed') {
    if (event.params.kind === 'permissions') {
      void loadApprovalMode().catch(report)
      return
    }
    clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      void refreshCatalog().catch(report)
    }, 80)
    if (event.params.kind === 'resync' && useWorkbench.getState().activeSession)
      void openSession(useWorkbench.getState().activeSession).catch(report)
  } else if (event.method === 'stream.update') {
    let gap = false
    useSessions.setState((state) => {
      const snapshot = state.snapshots[event.params.sessionId]
      if (!snapshot || snapshot.messages.some((m) => m.id === event.params.id)) return state
      const streams = new Map(snapshot.streams.map((s) => [s.id, s]))
      const previous = streams.get(event.params.id)
      if (previous && event.params.version <= previous.version) return state
      if (
        event.params.operation === 'append' &&
        (event.params.textOffset !== (previous?.text.length ?? 0) ||
          event.params.thinkingOffset !== (previous?.thinking.length ?? 0))
      ) {
        gap = true
        return state
      }
      const text =
        event.params.operation === 'reset' ? event.params.text : `${previous?.text ?? ''}${event.params.text}`
      const thinking =
        event.params.operation === 'reset'
          ? event.params.thinking
          : `${previous?.thinking ?? ''}${event.params.thinking}`
      streams.set(event.params.id, {
        id: event.params.id,
        sessionId: event.params.sessionId,
        runId: event.params.runId,
        text,
        thinking,
        offset: text.length + thinking.length,
        version: event.params.version,
      })
      return {
        snapshots: { ...state.snapshots, [event.params.sessionId]: { ...snapshot, streams: [...streams.values()] } },
      }
    })
    if (gap && useWorkbench.getState().activeSession === event.params.sessionId)
      void openSession(event.params.sessionId).catch(report)
  } else if (event.method === 'user_input.requested') {
    useSessions.setState((state) => {
      const snapshot = state.snapshots[event.params.sessionId]
      const userInputs = snapshot?.userInputs ?? []
      if (!snapshot || userInputs.some((item) => item.requestId === event.params.requestId)) return state
      return {
        snapshots: {
          ...state.snapshots,
          [event.params.sessionId]: { ...snapshot, userInputs: [...userInputs, event.params] },
        },
      }
    })
  } else if (event.method === 'user_input.resolved') {
    useSessions.setState((state) => {
      const snapshot = state.snapshots[event.params.sessionId]
      if (!snapshot) return state
      return {
        snapshots: {
          ...state.snapshots,
          [event.params.sessionId]: {
            ...snapshot,
            userInputs: (snapshot.userInputs ?? []).filter((item) => item.requestId !== event.params.requestId),
          },
        },
      }
    })
  } else if (event.method === 'task.notification') {
    if (!rememberTaskNotification(event)) return
    useNotice.setState({ notice: `${event.params.title}：${event.params.message}` })
    if (typeof Notification !== 'undefined' && document.visibilityState === 'hidden' && Notification.permission === 'granted')
      new Notification(event.params.title, { body: event.params.message })
  } else if (event.method === 'session.summary') {
    useSessionSummaries.setState((state) => {
      const previous = state.byId[event.params.sessionId]
      if (previous && previous.seq > event.params.seq) return state
      return { byId: { ...state.byId, [event.params.sessionId]: event.params } }
    })
  } else if (event.method === 'session.event') applyEvent(event.params)
}
export function applyEvent(event: SessionEvent) {
  const buffer = bufferedEvents.get(event.sessionId) ?? new Map<number, SessionEvent>()
  buffer.set(event.seq, event)
  bufferedEvents.set(event.sessionId, buffer)
  useSessions.setState((state) => {
    let snapshot = state.snapshots[event.sessionId]
    if (!snapshot) return state
    for (const seq of buffer.keys()) if (seq <= snapshot.cursor) buffer.delete(seq)
    let next = buffer.get(snapshot.cursor + 1)
    while (next) {
      buffer.delete(next.seq)
      snapshot = reduce(snapshot, next)
      next = buffer.get(snapshot.cursor + 1)
    }
    return { snapshots: { ...state.snapshots, [event.sessionId]: snapshot } }
  })
  if (buffer.size > 100) {
    bufferedEvents.delete(event.sessionId)
    void openSession(event.sessionId).catch(report)
  }
}
function reduce(snapshot: SessionSnapshot, event: SessionEvent): SessionSnapshot {
  let next = { ...snapshot, cursor: event.seq, session: { ...snapshot.session, seq: event.seq } }
  if (event.type === 'session.updated' || event.type === 'session.moved') {
    const data = event.data as { session?: Session }
    if (data.session) next.session = data.session
  } else if (event.type === 'message.committed') {
    const data = event.data as { id: string; role: Message['role']; content: ContentBlock[] }
    if (!next.messages.some((m) => m.id === data.id))
      next.messages = [
        ...next.messages,
        { ...data, sessionId: event.sessionId, runId: event.runId ?? '', seq: event.seq, createdAt: event.time },
      ]
    next.streams = next.streams.filter((s) => s.id !== data.id)
  } else if (['run.queued', 'run.status', 'run.settled'].includes(event.type)) {
    const { run } = event.data as { run: Run }
    next.runs = [run, ...next.runs.filter((r) => r.id !== run.id)]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 40)
    if (event.type === 'run.settled') next.streams = next.streams.filter((s) => s.runId !== run.id)
  } else if (event.type === 'approval.requested')
    next.approvals = [...next.approvals.filter((a) => a.id !== (event.data as Approval).id), event.data as Approval]
  else if (event.type === 'approval.resolved')
    next.approvals = next.approvals.filter((a) => a.id !== (event.data as Approval).id)
  else if (event.type === 'usage.recorded') {
    next.usage = { ...next.usage }
    for (const key of Object.keys(next.usage) as (keyof Usage)[]) next.usage[key] += (event.data as Usage)[key] ?? 0
  }
  return next
}
