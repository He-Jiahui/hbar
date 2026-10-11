import { CommandError, type CommandRegistry } from '@hbar/commands'
import {
  contentBlockSchema,
  runSchema,
  planStateSchema,
  sessionEventSchema,
  usageSchema,
  userInputRequestSchema,
  toolExecutionEventSchema,
  toolBatchEventSchema,
} from '@hbar/contracts'
import { sessionTimelineCommands } from '@hbar/contracts/commands/session-timeline'
import {
  contextHistoryPageSchema,
  parseContextCompactionEvent,
  parseContextCompactionMarker,
  type ContextHistoryInput,
  type ContextHistoryPage,
} from '@hbar/contracts/context-history'
import { queuedRunGuidanceSchema, admitOperationRecovery, type QueuedRunGuidance } from '@hbar/contracts/commands/run'
import type {
  Approval,
  LiveStream,
  Message,
  PlanState,
  Run,
  SessionEvent,
  SessionSnapshot,
  StreamDelta,
} from '@hbar/contracts'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import { mergeContextCompactionMarkers } from './context-compaction-markers'
import type { GoalHistoryTimelinePort, GoalHistoryTimelineSnapshot, GoalHistoryTimelineUpdate } from './goal-history'
import type { NavigationState, SessionTimelinePort, SessionTimelineState } from './types'

const MAX_MESSAGES = 1_000
const MAX_RUNS = 80
const MAX_APPROVALS = 80
const MAX_USER_INPUTS = 40
const MAX_EVENTS = 1_000
const MAX_CACHED_SESSIONS = 8
const PAGE_SIZE = 60

const approvalSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  callId: z.string().min(1),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  status: z.enum(['pending', 'allowed', 'denied', 'cancelled']),
  createdAt: z.number().int().nonnegative(),
  feedback: z.string().max(4_000).optional(),
  decidedBy: z.string().optional(),
})

function emptyState(sessionId: string | null, status: SessionTimelineState['status']): SessionTimelineState {
  return {
    sessionId,
    status,
    olderStatus: 'idle',
    olderError: null,
    messages: [],
    runs: [],
    approvals: [],
    userInputs: [],
    plan: null,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    streams: {},
    events: [],
    cursor: 0,
    hasOlder: false,
    error: null,
    activeCompaction: null,
    contextCompactions: [],
    contextHistoryStatus: 'idle',
    contextHistoryError: null,
    contextHistoryBefore: null,
    contextHistoryRequestBefore: null,
  }
}

function mergeMessages(
  first: readonly Readonly<Message>[],
  second: readonly Readonly<Message>[],
): readonly Readonly<Message>[] {
  const messages = new Map<string, Readonly<Message>>()
  for (const message of [...first, ...second]) messages.set(message.id, message)
  return [...messages.values()].sort((left, right) => left.seq - right.seq).slice(-MAX_MESSAGES)
}

function fromSnapshot(
  snapshot: SessionSnapshot,
  previous?: SessionTimelineState,
  plan?: Readonly<PlanState> | null,
): SessionTimelineState {
  const messages = mergeMessages(previous?.messages ?? [], snapshot.messages)
  const snapshotFirst = snapshot.messages[0]?.seq
  const previousFirst = previous?.messages[0]?.seq
  const preservesOlder = previousFirst !== undefined && snapshotFirst !== undefined && previousFirst <= snapshotFirst
  const historical = (previous?.approvals ?? []).filter((approval) => approval.status !== 'pending')
  return {
    sessionId: snapshot.session.id,
    status: 'ready',
    olderStatus: previous?.olderStatus === 'limit' ? 'limit' : 'idle',
    olderError: null,
    messages,
    runs: snapshot.runs.slice(0, MAX_RUNS),
    approvals: mergeApprovals(historical, snapshot.approvals),
    userInputs: snapshot.userInputs.slice(0, MAX_USER_INPUTS),
    plan: plan === undefined ? (previous?.plan ?? null) : plan,
    usage: { ...snapshot.usage },
    contextCompactions: mergeContextCompactionMarkers(
      snapshot.session.id,
      previous?.contextCompactions,
      snapshot.contextCompactions,
      messages.length >= MAX_MESSAGES ? (messages[0]?.seq ?? 0) : 0,
      snapshot.cursor,
    ),
    ...(snapshot.contextHistory
      ? {
          contextHistory: contextHistoryPageSchema.parse(snapshot.contextHistory),
          activeCompaction: snapshot.contextHistory.records.find((record) => record.status === 'running') ?? null,
        }
      : { activeCompaction: null }),
    contextHistoryBefore: null,
    contextHistoryStatus: 'idle',
    contextHistoryError: null,
    streams: Object.fromEntries(snapshot.streams.map((stream) => [stream.id, { ...stream }])),
    events: [],
    cursor: snapshot.cursor,
    toolEvents: (snapshot.toolEvents ?? []).filter((event) => event.sessionId === snapshot.session.id).slice(-1000),
    ...(snapshot.toolObservedAt !== undefined
      ? { toolClock: { hostTime: snapshot.toolObservedAt, receivedAt: Date.now() } }
      : {}),
    hasOlder: preservesOlder ? (previous?.hasOlder ?? snapshot.hasOlder) : snapshot.hasOlder,
    error: null,
  }
}

function dataRecord(event: SessionEvent): Record<string, unknown> | null {
  return event.data !== null && typeof event.data === 'object' && !Array.isArray(event.data)
    ? (event.data as Record<string, unknown>)
    : null
}

/** Keep proof comparisons independent of object-key insertion order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

/**
 * Validate the complete cross-entity proof carried by a guided queue message.
 * A malformed proof is rejected as a whole so the user message cannot appear
 * without the queue item being consumed.
 */
export function parseQueuedRunGuidance(event: SessionEvent, data: Record<string, unknown>): QueuedRunGuidance | null {
  if (event.type !== 'message.committed' || !event.runId || data.queueGuidance === undefined) return null
  const messageId = typeof data.id === 'string' ? data.id : null
  const role = z.literal('user').safeParse(data.role)
  const content = z.array(contentBlockSchema).safeParse(data.content)
  if (!messageId || !role.success || !content.success) return null
  const parsed = queuedRunGuidanceSchema.safeParse(data.queueGuidance)
  if (!parsed.success) return null
  const { activeRunId, expectedRevision, guidedRun, receipt } = parsed.data
  const expectedContent = [
    ...(guidedRun.input.text ? [{ type: 'text' as const, text: guidedRun.input.text }] : []),
    ...guidedRun.input.images.map((artifact) => ({ type: 'image' as const, artifact })),
    ...(guidedRun.input.files ?? []).map((artifact) => ({ type: 'file' as const, artifact })),
  ]
  if (
    activeRunId !== event.runId ||
    guidedRun.id === event.runId ||
    guidedRun.status !== 'guided' ||
    guidedRun.sessionId !== event.sessionId ||
    (guidedRun.input.source ?? 'user') !== 'user' ||
    guidedRun.startedAt !== null ||
    guidedRun.endedAt !== event.time ||
    guidedRun.error !== null ||
    guidedRun.failure !== undefined ||
    receipt.sessionId !== event.sessionId ||
    receipt.operationId !== guidedRun.id ||
    receipt.activeRunId !== event.runId ||
    receipt.messageId !== messageId ||
    receipt.eventId !== event.eventId ||
    receipt.revision !== event.seq ||
    receipt.sessionSeq !== event.seq ||
    receipt.queueRevision !== expectedRevision ||
    receipt.guidedAt !== event.time ||
    stableJson(expectedContent) !== stableJson(content.data)
  )
    return null
  return parsed.data
}

export function isQueuedRunGuidanceEvent(event: SessionEvent): boolean {
  const data = dataRecord(event)
  return data !== null && data.queueGuidance !== undefined && parseQueuedRunGuidance(event, data) !== null
}

function upsert<T>(items: readonly T[], value: T, id: (item: T) => string, limit: number): readonly T[] {
  const next = items.filter((item) => id(item) !== id(value))
  next.push(value)
  return next.slice(-limit)
}

function mergeApprovals(previous: readonly Approval[], incoming: readonly Approval[]): readonly Approval[] {
  const records = new Map(previous.map((approval) => [approval.id, approval]))
  for (const approval of incoming) records.set(approval.id, approval)
  return [...records.values()]
    .sort(
      (left, right) =>
        Number(right.status === 'pending') - Number(left.status === 'pending') || right.createdAt - left.createdAt,
    )
    .slice(0, MAX_APPROVALS)
}

function projectEvent(current: SessionTimelineState, event: SessionEvent): SessionTimelineState {
  if (event.sessionId !== current.sessionId) return current
  if (current.events.some((item) => item.eventId === event.eventId)) return current
  const data = dataRecord(event)
  let messages = current.messages
  let runs = current.runs
  let approvals = current.approvals
  let userInputs = current.userInputs
  let plan = current.plan
  let usage = current.usage
  let streams = current.streams
  let toolEvents = current.toolEvents
  let toolClock = current.toolClock
  let contextHistory = current.contextHistory
  let activeCompaction = current.activeCompaction
  const compaction = parseContextCompactionEvent(event)
  if (compaction) {
    activeCompaction =
      compaction.status === 'running' ? compaction : activeCompaction?.id === compaction.id ? null : activeCompaction
    if (contextHistory && !current.contextHistoryBefore) {
      const records = [compaction, ...contextHistory.records.filter((record) => record.id !== compaction.id)].sort(
        (a, b) => b.seq - a.seq,
      )
      contextHistory = {
        ...contextHistory,
        records: records.slice(0, 10),
        before: records.slice(0, 10).at(-1)?.seq ?? null,
        hasOlder: contextHistory.hasOlder || records.length > 10,
      }
    }
  }

  if (
    event.runId &&
    ((event.type === 'tool.execution' && toolExecutionEventSchema.safeParse(event.data).success) ||
      (event.type === 'tool.sequence_progress' && toolBatchEventSchema.safeParse(event.data).success))
  ) {
    const identity = event.type === 'tool.execution' ? data?.callId : data?.parentCallId
    const existing = (toolEvents ?? []).find(
      (item) =>
        item.runId === event.runId &&
        item.type === event.type &&
        (dataRecord(item)?.callId ?? dataRecord(item)?.parentCallId) === identity,
    )
    if (!existing || event.seq > existing.seq) {
      toolEvents = [...(toolEvents ?? []).filter((item) => item !== existing), event].slice(-1000)
      toolClock = { hostTime: event.time, receivedAt: Date.now() }
    }
  }

  if (event.type === 'message.committed' && data && event.runId) {
    const content = z.array(contentBlockSchema).safeParse(data.content)
    const role = z.enum(['user', 'assistant', 'tool', 'system']).safeParse(data.role)
    const hasGuidance = Object.hasOwn(data, 'queueGuidance')
    const guidance = hasGuidance ? parseQueuedRunGuidance(event, data) : null
    if (hasGuidance && !guidance) {
      // A message that claims to consume a queue item must carry a complete,
      // exact receipt proof. Fail closed instead of rendering a user message
      // while leaving its queued Run available for a later duplicate.
    } else if (typeof data.id === 'string' && content.success && role.success) {
      const message: Message = {
        id: data.id,
        sessionId: event.sessionId,
        runId: event.runId,
        role: role.data,
        content: content.data,
        seq: event.seq,
        createdAt: event.time,
        ...(data.providerData !== undefined ? { providerData: data.providerData } : {}),
      }
      messages = [...upsert(messages, message, (item) => item.id, MAX_MESSAGES)].sort((a, b) => a.seq - b.seq)
      if (guidance) {
        runs = [...upsert(runs, guidance.guidedRun, (item) => item.id, MAX_RUNS)].sort(
          (a, b) => b.createdAt - a.createdAt,
        )
      } else {
        streams = Object.fromEntries(Object.entries(streams).filter(([, stream]) => stream.runId !== event.runId))
      }
    }
  } else if (['run.queued', 'run.status', 'run.settled', 'run.filesUndone', 'run.recoveryQueued', 'execution.claimed'].includes(event.type) && data) {
    const parsed = runSchema.safeParse(data.run)
    const ids = new Set(parsed.success && parsed.data.recovery ? [parsed.data.recovery.predecessorRunId] : [])
    admitOperationRecovery(event, ids)
    if (
      parsed.success && parsed.data.sessionId === current.sessionId &&
      (!event.runId || parsed.data.id === event.runId) &&
      (event.type !== 'run.recoveryQueued' || ids.has(parsed.data.id))
    ) {
      if (!toolClock || event.time >= toolClock.hostTime) toolClock = { hostTime: event.time, receivedAt: Date.now() }
      runs = [...upsert<Run>(runs, parsed.data, (item) => item.id, MAX_RUNS)].sort((a, b) => b.createdAt - a.createdAt)
      if (event.type === 'run.settled')
        streams = Object.fromEntries(Object.entries(streams).filter(([, stream]) => stream.runId !== parsed.data.id))
    }
  } else if (event.type === 'run.inputEdited' && data && event.runId === data.operationId) {
    const text = z.string().trim().min(1).max(200_000).safeParse(data.text)
    if (text.success)
      runs = runs.map((run) => (run.id === event.runId ? { ...run, input: { ...run.input, text: text.data } } : run))
  } else if (
    event.type === 'approval.requested' ||
    event.type === 'approval.resolved' ||
    event.type === 'plan_exit.resolved'
  ) {
    const parsed = approvalSchema.safeParse(event.type === 'plan_exit.resolved' ? data?.approval : event.data)
    if (parsed.success) approvals = upsert(approvals, parsed.data as Approval, (item) => item.id, MAX_APPROVALS)
  } else if (event.type === 'user_input.requested') {
    const parsed = userInputRequestSchema.safeParse(event.data)
    if (parsed.success) userInputs = upsert(userInputs, parsed.data, (item) => item.requestId, MAX_USER_INPUTS)
  } else if (event.type === 'user_input.resolved' && data && typeof data.requestId === 'string') {
    userInputs = userInputs.filter((item) => item.requestId !== data.requestId)
  } else if (event.type === 'plan.updated' && data) {
    const parsed = planStateSchema.safeParse(data.plan)
    if (parsed.success && parsed.data.sessionId === current.sessionId) plan = parsed.data
  } else if (event.type === 'plan.cleared') {
    plan = null
  } else if (event.type === 'usage.recorded') {
    const parsed = usageSchema.safeParse(event.data)
    if (parsed.success)
      usage = {
        input: usage.input + parsed.data.input,
        output: usage.output + parsed.data.output,
        cacheRead: usage.cacheRead + parsed.data.cacheRead,
        cacheWrite: usage.cacheWrite + parsed.data.cacheWrite,
        cost: usage.cost + parsed.data.cost,
      }
  }

  const marker = parseContextCompactionMarker(event)
  const contextCompactions =
    marker || messages[0]?.seq !== current.messages[0]?.seq
      ? mergeContextCompactionMarkers(
          event.sessionId,
          current.contextCompactions,
          marker ? [marker] : [],
          messages.length >= MAX_MESSAGES ? (messages[0]?.seq ?? 0) : 0,
          event.seq,
        )
      : (current.contextCompactions ?? [])
  return {
    ...current,
    status: 'ready',
    messages,
    runs,
    approvals,
    userInputs,
    plan,
    usage,
    streams,
    ...(contextHistory ? { contextHistory } : {}),
    activeCompaction: activeCompaction ?? null,
    contextCompactions,
    ...(toolEvents ? { toolEvents } : {}),
    ...(toolClock ? { toolClock } : {}),
    events: [...current.events, event].slice(-MAX_EVENTS),
    cursor: Math.max(current.cursor, event.seq),
    error: null,
  }
}

function projectStream(current: SessionTimelineState, stream: StreamDelta): SessionTimelineState {
  if (stream.sessionId !== current.sessionId) return current
  const previous = current.streams[stream.id]
  if (previous && stream.version <= previous.version) return current
  const reset = stream.operation === 'reset' || !previous
  const text = reset ? stream.text : `${previous.text.slice(0, stream.textOffset)}${stream.text}`
  const thinking = reset ? stream.thinking : `${previous.thinking.slice(0, stream.thinkingOffset)}${stream.thinking}`
  const next: LiveStream = {
    id: stream.id,
    sessionId: stream.sessionId,
    runId: stream.runId,
    text,
    thinking,
    offset: Math.max(text.length, thinking.length),
    version: stream.version,
  }
  return { ...current, streams: { ...current.streams, [stream.id]: next } }
}

export function createSessionTimeline(
  local: CommandRegistry,
  port: SessionTimelinePort | undefined,
  navigation: StateReader<NavigationState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
  isSessionDeleted: (id: string) => boolean = () => false,
) {
  const state = createState<SessionTimelineState>(emptyState(null, 'idle'), onSubscriberError)
  const cache = new Map<string, SessionTimelineState>()
  let generation = 0
  let olderGeneration = 0
  let closeWatch: (() => void | Promise<void>) | undefined
  let watching = false
  let contextTimer: ReturnType<typeof setTimeout> | undefined
  let contextReading = false
  let contextDirty = false
  let contextGeneration = 0
  let contextInFlight: Promise<ContextHistoryPage> | null = null
  const historyListeners = new Set<(update: GoalHistoryTimelineUpdate) => void | Promise<void>>()
  const historySnapshot = (): GoalHistoryTimelineSnapshot => {
    const current = state.reader.getSnapshot()
    return {
      sessionId: current.sessionId,
      generation,
      status: current.status,
      cursor: current.cursor,
      messageFromSeq: current.messages[0]?.seq ?? null,
      hasOlderMessages: current.hasOlder,
      watching,
    }
  }
  const notifyHistory = async (update: GoalHistoryTimelineUpdate) => {
    await Promise.all(
      [...historyListeners].map(async (listener) => {
        try {
          await listener(update)
        } catch (error) {
          onSubscriberError(error)
        }
      }),
    )
  }
  const history: GoalHistoryTimelinePort = {
    getSnapshot: historySnapshot,
    subscribe(listener) {
      historyListeners.add(listener)
      return () => {
        historyListeners.delete(listener)
      }
    },
  }

  const remember = (value: SessionTimelineState) => {
    if (value.sessionId) {
      cache.delete(value.sessionId)
      cache.set(value.sessionId, value)
      while (cache.size > MAX_CACHED_SESSIONS) cache.delete(cache.keys().next().value!)
    }
    state.replace(value)
  }

  const close = () => {
    clearTimeout(contextTimer)
    contextTimer = undefined
    contextReading = false
    contextDirty = false
    contextGeneration++
    const current = closeWatch
    closeWatch = undefined
    watching = false
    if (current) void Promise.resolve(current()).catch(() => {})
  }
  const readContextPage = async (input: ContextHistoryInput, current: () => boolean) => {
    while (contextInFlight) {
      await contextInFlight.catch(() => undefined)
      if (!current()) return undefined
    }
    const read = port?.contextHistory
    if (!read || !current()) return undefined
    const pending = read(input)
    contextInFlight = pending
    try {
      return await pending
    } finally {
      if (contextInFlight === pending) contextInFlight = null
    }
  }
  // One actual metadata request across navigation and paging; superseded queued reads never reach the Host.
  const refreshContext = (sessionId: string) => {
    if (!port?.contextHistory || contextTimer) return
    if (contextReading) {
      contextDirty = true
      return
    }
    const selection = generation,
      contextSelection = contextGeneration
    contextTimer = setTimeout(() => {
      contextTimer = undefined
      contextReading = true
      const cursor = state.reader.getSnapshot().cursor
      void readContextPage(
        { sessionId },
        () => !isDisposed() && selection === generation && contextSelection === contextGeneration,
      )
        .then((value) => {
          if (
            isDisposed() ||
            selection !== generation ||
            contextSelection !== contextGeneration ||
            navigation.getSnapshot().sessionId !== sessionId
          )
            return
          if (!value) return
          const page = contextHistoryPageSchema.parse(value)
          if (page.sessionId !== sessionId) throw new Error('Context history belongs to another session')
          const current = state.reader.getSnapshot()
          if (current.cursor !== cursor) {
            contextDirty = true
            return
          }
          remember({
            ...current,
            contextHistory:
              current.contextHistoryBefore && current.contextHistory
                ? { ...current.contextHistory, current: page.current }
                : page,
            activeCompaction: page.records.find((record) => record.status === 'running') ?? null,
            contextHistoryError:
              current.contextHistoryStatus === 'error' ? (current.contextHistoryError ?? null) : null,
          })
        })
        .catch((error: unknown) => {
          if (
            selection === generation &&
            contextSelection === contextGeneration &&
            navigation.getSnapshot().sessionId === sessionId
          )
            remember({
              ...state.reader.getSnapshot(),
              contextHistoryError: error instanceof Error ? error.message : String(error),
            })
        })
        .finally(() => {
          if (selection !== generation || contextSelection !== contextGeneration) return
          contextReading = false
          if (contextDirty) {
            contextDirty = false
            refreshContext(sessionId)
          }
        })
    }, 250)
  }
  const load = async (sessionId: string | null) => {
    const intent = ++generation
    olderGeneration += 1
    close()
    if (sessionId && isSessionDeleted(sessionId)) {
      const unavailable = { ...emptyState(sessionId, 'error'), error: 'SESSION_DELETED' }
      remember(unavailable)
      void notifyHistory({ kind: 'loading', snapshot: historySnapshot() })
      return unavailable
    }
    if (!port || !sessionId) {
      const unavailable = emptyState(sessionId, sessionId ? 'error' : 'idle')
      remember(sessionId ? { ...unavailable, error: 'Timeline history is unavailable in this runtime' } : unavailable)
      void notifyHistory({ kind: 'loading', snapshot: historySnapshot() })
      return unavailable
    }
    const cached = cache.get(sessionId)
    remember(cached ? { ...cached, status: 'loading', error: null } : emptyState(sessionId, 'loading'))
    void notifyHistory({ kind: 'loading', snapshot: historySnapshot() })
    try {
      const [snapshot, loadedPlan] = await Promise.all([
        port.snapshot(sessionId, undefined, PAGE_SIZE),
        port.plan
          ? port
              .plan(sessionId)
              .then((plan) => (plan === null ? null : planStateSchema.parse(plan)))
              .catch(() => undefined)
          : Promise.resolve(undefined),
      ])
      if (isDisposed() || intent !== generation || navigation.getSnapshot().sessionId !== sessionId) return undefined
      if (snapshot.session.id !== sessionId)
        throw new Error('Timeline snapshot does not belong to the selected session')
      remember(fromSnapshot(snapshot, cache.get(sessionId), loadedPlan))
      const watcher = await port.watch(sessionId, snapshot.cursor, (update) => {
        if (isDisposed() || intent !== generation || navigation.getSnapshot().sessionId !== sessionId) return
        if (update.kind === 'reset') {
          void load(sessionId)
          return
        }
        const current = state.reader.getSnapshot()
        if (update.kind === 'event') {
          const canonical = sessionEventSchema.safeParse(update.event)
          if (canonical.success && canonical.data.sessionId !== sessionId) return
          if (!canonical.success || canonical.data.seq > current.cursor + 1) {
            void load(sessionId)
            return
          }
          // Replayed facts are already covered by snapshot.cursor. Only contiguous durable facts advance coverage.
          if (canonical.data.seq <= current.cursor) return
          const eventData = dataRecord(canonical.data)
          if (eventData?.queueGuidance !== undefined && !parseQueuedRunGuidance(canonical.data, eventData)) {
            // A malformed guidance event cannot be safely projected locally;
            // reload so the durable snapshot remains the source of truth.
            void load(sessionId)
            return
          }
        }
        if (update.kind === 'stream') {
          const previous = current.streams[update.stream.id]
          const gap =
            update.stream.operation === 'append' &&
            ((previous &&
              (update.stream.version !== previous.version + 1 ||
                update.stream.textOffset !== previous.text.length ||
                update.stream.thinkingOffset !== previous.thinking.length)) ||
              (!previous &&
                (update.stream.version !== 1 || update.stream.textOffset !== 0 || update.stream.thinkingOffset !== 0)))
          if (gap) {
            void load(sessionId)
            return
          }
        }
        remember(update.kind === 'event' ? projectEvent(current, update.event) : projectStream(current, update.stream))
        if (
          update.kind === 'event' &&
          ['run.settled', 'tool.settled', 'usage.recorded', 'context.compacted', 'context.compaction.settled'].includes(
            update.event.type,
          )
        )
          refreshContext(sessionId)
        if (update.kind === 'event')
          void notifyHistory({ kind: 'event', snapshot: historySnapshot(), event: update.event })
      })
      if (isDisposed() || intent !== generation || navigation.getSnapshot().sessionId !== sessionId)
        void Promise.resolve(watcher()).catch(() => {})
      else {
        closeWatch = watcher
        watching = true
        void notifyHistory({ kind: 'snapshot', snapshot: historySnapshot() })
      }
      return state.reader.getSnapshot()
    } catch (error) {
      if (isDisposed() || intent !== generation || navigation.getSnapshot().sessionId !== sessionId) return undefined
      const failed = {
        ...state.reader.getSnapshot(),
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      } satisfies SessionTimelineState
      remember(failed)
      void notifyHistory({ kind: 'error', snapshot: historySnapshot() })
      return failed
    }
  }

  local.register(sessionTimelineCommands['timeline.loadOlder'], async ({ sessionId }) => {
    if (!port) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Timeline history is unavailable')
    const current = state.reader.getSnapshot()
    if (navigation.getSnapshot().sessionId !== sessionId || current.sessionId !== sessionId)
      throw new CommandError('INVALID_INPUT', 'Timeline history target is not the selected session')
    if (current.olderStatus === 'loading') throw new CommandError('BUSY', 'Older timeline history is already loading')
    if (!current.hasOlder || current.olderStatus === 'limit')
      return { sessionId, loaded: 0, hasOlder: current.hasOlder }
    const before = current.messages[0]?.seq
    if (before === undefined)
      throw new CommandError('INVALID_INPUT', 'Timeline has no message cursor for older history')
    const available = MAX_MESSAGES - current.messages.length
    if (available <= 0) {
      remember({ ...current, olderStatus: 'limit', olderError: null })
      return { sessionId, loaded: 0, hasOlder: current.hasOlder }
    }
    const intent = ++olderGeneration
    const selection = generation
    remember({ ...current, olderStatus: 'loading', olderError: null })
    try {
      const snapshot = await port.snapshot(sessionId, before, Math.min(PAGE_SIZE, available))
      if (
        isDisposed() ||
        intent !== olderGeneration ||
        selection !== generation ||
        navigation.getSnapshot().sessionId !== sessionId
      )
        return { sessionId, loaded: 0, hasOlder: current.hasOlder }
      if (
        snapshot.session.id !== sessionId ||
        snapshot.messages.some((message) => message.sessionId !== sessionId || message.seq >= before)
      )
        throw new CommandError('INVALID_OUTPUT', 'Older timeline page does not match its target or cursor')
      const latest = state.reader.getSnapshot()
      const messages = mergeMessages(snapshot.messages, latest.messages)
      const loaded = messages.length - latest.messages.length
      const next: SessionTimelineState = {
        ...latest,
        olderStatus: messages.length >= MAX_MESSAGES && snapshot.hasOlder ? 'limit' : 'idle',
        olderError: null,
        messages,
        contextCompactions: mergeContextCompactionMarkers(
          sessionId,
          latest.contextCompactions,
          snapshot.contextCompactions,
          messages.length >= MAX_MESSAGES ? (messages[0]?.seq ?? 0) : 0,
          latest.cursor,
        ),
        approvals: mergeApprovals(latest.approvals, snapshot.approvals),
        hasOlder: snapshot.hasOlder,
      }
      remember(next)
      // Goal-only pages use their own cursor. Their failure is local; messages have already been committed above.
      await notifyHistory({ kind: 'window', snapshot: historySnapshot() })
      return { sessionId, loaded: Math.max(0, loaded), hasOlder: next.hasOlder }
    } catch (error) {
      if (
        !isDisposed() &&
        intent === olderGeneration &&
        selection === generation &&
        navigation.getSnapshot().sessionId === sessionId
      )
        remember({
          ...state.reader.getSnapshot(),
          olderStatus: 'error',
          olderError: error instanceof Error ? error.message : String(error),
        })
      throw error
    }
  })

  local.register(sessionTimelineCommands['timeline.contextHistory'], async ({ sessionId, before }) => {
    if (!port?.contextHistory) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Context history unavailable')
    if (navigation.getSnapshot().sessionId !== sessionId || state.reader.getSnapshot().sessionId !== sessionId)
      throw new CommandError('INVALID_INPUT', 'Context history target is not selected')
    const selection = generation,
      intent = ++contextGeneration
    clearTimeout(contextTimer)
    contextTimer = undefined
    contextReading = true
    contextDirty = false
    remember({
      ...state.reader.getSnapshot(),
      contextHistoryStatus: 'loading',
      contextHistoryError: null,
      contextHistoryRequestBefore: before ?? null,
    })
    try {
      const value = await readContextPage(
        { sessionId, ...(before === undefined ? {} : { before }), limit: 10 },
        () => !isDisposed() && selection === generation && intent === contextGeneration,
      )
      if (
        isDisposed() ||
        selection !== generation ||
        intent !== contextGeneration ||
        navigation.getSnapshot().sessionId !== sessionId
      )
        return { sessionId, loaded: 0, hasOlder: false }
      if (!value) return { sessionId, loaded: 0, hasOlder: false }
      const page = contextHistoryPageSchema.parse(value)
      if (page.sessionId !== sessionId) throw new Error('Context history belongs to another session')
      if (before !== undefined && page.records.some((record) => record.seq >= before))
        throw new Error('Context history cursor is invalid')
      const current = state.reader.getSnapshot()
      remember({
        ...current,
        contextHistory: page,
        contextHistoryBefore: before ?? null,
        contextHistoryStatus: 'idle',
        contextHistoryError: null,
        ...(before === undefined
          ? { activeCompaction: page.records.find((record) => record.status === 'running') ?? null }
          : {}),
      })
      return { sessionId, loaded: page.records.length, hasOlder: page.hasOlder }
    } catch (error) {
      if (selection === generation && intent === contextGeneration && navigation.getSnapshot().sessionId === sessionId)
        remember({
          ...state.reader.getSnapshot(),
          contextHistoryStatus: 'error',
          contextHistoryError: error instanceof Error ? error.message : String(error),
        })
      throw error
    } finally {
      if (selection === generation && intent === contextGeneration) {
        contextReading = false
        if (contextDirty) {
          contextDirty = false
          refreshContext(sessionId)
        }
      }
    }
  })

  local.register(sessionTimelineCommands['timeline.retry'], async ({ sessionId }) => {
    if (navigation.getSnapshot().sessionId !== sessionId)
      throw new CommandError('INVALID_INPUT', 'Timeline retry target is not the selected session')
    const result = await load(sessionId)
    if (!result || result.status !== 'ready')
      throw new CommandError('EXECUTION_FAILED', result?.error ?? 'Timeline retry failed')
    return { sessionId, loaded: result.messages.length, hasOlder: result.hasOlder }
  })

  let selected = navigation.getSnapshot().sessionId
  const unsubscribe = navigation.subscribe(() => {
    const next = navigation.getSnapshot().sessionId
    if (next === selected) return
    selected = next
    void load(next)
  })
  void load(selected)

  return {
    reader: state.reader,
    history,
    markDeleted(ids: readonly string[]) {
      for (const id of ids) cache.delete(id)
      const current = state.reader.getSnapshot()
      if (current.sessionId && ids.includes(current.sessionId)) {
        generation++
        olderGeneration++
        close()
        remember({ ...emptyState(current.sessionId, 'error'), error: 'SESSION_DELETED' })
        void notifyHistory({ kind: 'loading', snapshot: historySnapshot() })
      }
    },
    dispose() {
      generation += 1
      unsubscribe()
      close()
      state.dispose()
      cache.clear()
      historyListeners.clear()
    },
  }
}
