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
  SessionEvent,
  SessionSnapshot,
  Usage,
  WireNotification,
} from '@hbar/contracts'
import { isApprovalMode } from './permissions'

export const useConnection = create<{
  client: HbarClient | null
  status: ConnectionStatus
  host: HostInfo | null
  error: string
  url: string
}>(() => ({ client: null, status: 'disconnected', host: null, error: '', url: location.origin }))
export const useCatalog = create<{ data: Bootstrap | null }>(() => ({ data: null }))
export const useSessions = create<{ snapshots: Record<string, SessionSnapshot>; loading: Set<string> }>(() => ({
  snapshots: {},
  loading: new Set(),
}))
interface WorkbenchState {
  activeSession: string
  workspaceId: string
  modelId: string
  approvalMode: ApprovalMode
  drafts: Record<string, string>
  showArchived: boolean
  panel: 'sessions' | 'files'
  toolPanel: string
  theme: 'dark' | 'light'
  layout: unknown
}

const defaultWorkbenchState: WorkbenchState = {
  activeSession: '',
  workspaceId: '',
  modelId: '',
  approvalMode: 'ask',
  drafts: {},
  showArchived: false,
  panel: 'sessions',
  toolPanel: 'activity',
  theme: 'dark',
  layout: null,
}

export const useWorkbench = create(
  persist<WorkbenchState>(
    () => defaultWorkbenchState,
    {
      name: 'hbar.workbench.v1',
      version: 2,
      migrate: (persisted): WorkbenchState => {
        const value = persisted && typeof persisted === 'object' ? (persisted as Partial<WorkbenchState>) : {}
        return {
          ...defaultWorkbenchState,
          ...value,
          approvalMode: isApprovalMode(value.approvalMode) ? value.approvalMode : 'ask',
        }
      },
    },
  ),
)
export const useNotice = create<{ error: string; notice: string }>(() => ({ error: '', notice: '' }))
export const report = (error: unknown) =>
  useNotice.setState({ error: error instanceof Error ? error.message : String(error) })
export async function setApprovalMode(mode: ApprovalMode) {
  const previous = useWorkbench.getState().approvalMode
  useWorkbench.setState({ approvalMode: mode })
  const connection = useConnection.getState().client
  if (!connection) return
  try {
    await connection.call('permission.set', { mode })
  } catch (error) {
    useWorkbench.setState({ approvalMode: previous })
    report(error)
  }
}
export async function loadApprovalMode() {
  const connection = client()
  const result = await connection.call('permission.get', {})
  if (client() !== connection || !isApprovalMode(result.mode)) return
  useWorkbench.setState({ approvalMode: result.mode })
}
export function client(): HbarClient {
  const value = useConnection.getState().client
  if (!value) throw new Error('Host is not connected')
  return value
}
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let generation = 0
const bufferedEvents = new Map<string, Map<number, SessionEvent>>()

export async function connectHost(url: string, token?: string) {
  const prior = useConnection.getState().client
  prior?.disconnect()
  const connectionGeneration = ++generation
  const next = new HbarClient(url, token)
  useConnection.setState({ client: next, url, status: 'connecting', error: '' })
  useSessions.setState({ snapshots: {}, loading: new Set() })
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
  const state = useWorkbench.getState()
  const changes: Partial<typeof state> = {}
  if (!data.workspaces.some((w) => w.id === state.workspaceId)) changes.workspaceId = data.workspaces[0]?.id ?? ''
  if (!data.models.some((m) => m.id === state.modelId)) changes.modelId = data.models[0]?.id ?? ''
  if (state.activeSession && !data.sessions.some((s) => s.id === state.activeSession)) changes.activeSession = ''
  useWorkbench.setState(changes)
}
export async function openSession(sessionId: string) {
  const connection = client()
  const current = useWorkbench.getState().activeSession
  if (current && current !== sessionId) await connection.unfollow(current).catch(() => {})
  useWorkbench.setState({ activeSession: sessionId })
  useSessions.setState((state) => ({ loading: new Set(state.loading).add(sessionId) }))
  try {
    const snapshot = await connection.call('session.snapshot', { sessionId })
    if (client() !== connection || useWorkbench.getState().activeSession !== sessionId) return
    useSessions.setState((state) => ({ snapshots: { ...state.snapshots, [sessionId]: snapshot } }))
    bufferedEvents.delete(sessionId)
    await connection.follow(sessionId, snapshot.cursor)
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
  const snapshot = useSessions.getState().snapshots[sessionId]
  if (!snapshot?.messages[0]) return
  const older = await client().call('session.snapshot', { sessionId, before: snapshot.messages[0].seq, limit: 100 })
  useSessions.setState((state) => {
    const current = state.snapshots[sessionId]
    if (!current) return state
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
}
function onEvent(event: WireNotification) {
  if (event.method === 'host.changed') {
    clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      void refreshCatalog().catch(report)
    }, 80)
    if (event.params.kind === 'resync' && useWorkbench.getState().activeSession)
      void openSession(useWorkbench.getState().activeSession).catch(report)
  } else if (event.method === 'stream.update') {
    useSessions.setState((state) => {
      const snapshot = state.snapshots[event.params.sessionId]
      if (!snapshot || snapshot.messages.some((m) => m.id === event.params.id)) return state
      const streams = new Map(snapshot.streams.map((s) => [s.id, s]))
      const previous = streams.get(event.params.id)
      if (!previous || previous.offset <= event.params.offset) streams.set(event.params.id, event.params)
      return {
        snapshots: { ...state.snapshots, [event.params.sessionId]: { ...snapshot, streams: [...streams.values()] } },
      }
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
  if (event.type === 'message.committed') {
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
