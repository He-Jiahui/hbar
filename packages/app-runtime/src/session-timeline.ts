import { CommandError, type CommandRegistry } from '@hbar/commands'
import { contentBlockSchema, inputSchema, usageSchema, userInputRequestSchema } from '@hbar/contracts'
import { sessionTimelineCommands } from '@hbar/contracts/commands/session-timeline'
import type { Approval, LiveStream, Message, Run, SessionEvent, SessionSnapshot, StreamDelta } from '@hbar/contracts'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import type { NavigationState, SessionTimelinePort, SessionTimelineState } from './types'

const MAX_MESSAGES = 1_000
const MAX_RUNS = 80
const MAX_APPROVALS = 80
const MAX_USER_INPUTS = 40
const MAX_EVENTS = 1_000
const MAX_CACHED_SESSIONS = 8
const PAGE_SIZE = 60

const runSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  requestId: z.string().min(1),
  input: inputSchema,
  modelId: z.string().min(1),
  status: z.enum(['queued', 'running', 'waiting_approval', 'completed', 'cancelled', 'failed', 'interrupted']),
  createdAt: z.number().int().nonnegative(),
  startedAt: z.number().int().nonnegative().nullable(),
  endedAt: z.number().int().nonnegative().nullable(),
  error: z.string().nullable(),
})
const approvalSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  callId: z.string().min(1),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  status: z.enum(['pending', 'allowed', 'denied', 'cancelled']),
  createdAt: z.number().int().nonnegative(),
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
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    streams: {},
    events: [],
    cursor: 0,
    hasOlder: false,
    error: null,
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

function fromSnapshot(snapshot: SessionSnapshot, previous?: SessionTimelineState): SessionTimelineState {
  const messages = mergeMessages(previous?.messages ?? [], snapshot.messages)
  const snapshotFirst = snapshot.messages[0]?.seq
  const previousFirst = previous?.messages[0]?.seq
  const preservesOlder = previousFirst !== undefined && snapshotFirst !== undefined && previousFirst <= snapshotFirst
  return {
    sessionId: snapshot.session.id,
    status: 'ready',
    olderStatus: previous?.olderStatus === 'limit' ? 'limit' : 'idle',
    olderError: null,
    messages,
    runs: snapshot.runs.slice(0, MAX_RUNS),
    approvals: snapshot.approvals.slice(0, MAX_APPROVALS),
    userInputs: snapshot.userInputs.slice(0, MAX_USER_INPUTS),
    usage: { ...snapshot.usage },
    streams: Object.fromEntries(snapshot.streams.map((stream) => [stream.id, { ...stream }])),
    events: [],
    cursor: snapshot.cursor,
    hasOlder: preservesOlder ? (previous?.hasOlder ?? snapshot.hasOlder) : snapshot.hasOlder,
    error: null,
  }
}

function dataRecord(event: SessionEvent): Record<string, unknown> | null {
  return event.data !== null && typeof event.data === 'object' && !Array.isArray(event.data)
    ? (event.data as Record<string, unknown>)
    : null
}

function upsert<T>(items: readonly T[], value: T, id: (item: T) => string, limit: number): readonly T[] {
  const next = items.filter((item) => id(item) !== id(value))
  next.push(value)
  return next.slice(-limit)
}

function projectEvent(current: SessionTimelineState, event: SessionEvent): SessionTimelineState {
  if (event.sessionId !== current.sessionId) return current
  if (current.events.some((item) => item.eventId === event.eventId)) return current
  const data = dataRecord(event)
  let messages = current.messages
  let runs = current.runs
  let approvals = current.approvals
  let userInputs = current.userInputs
  let usage = current.usage
  let streams = current.streams

  if (event.type === 'message.committed' && data && event.runId) {
    const content = z.array(contentBlockSchema).safeParse(data.content)
    const role = z.enum(['user', 'assistant', 'tool', 'system']).safeParse(data.role)
    if (typeof data.id === 'string' && content.success && role.success) {
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
      streams = Object.fromEntries(Object.entries(streams).filter(([, stream]) => stream.runId !== event.runId))
    }
  } else if (['run.queued', 'run.status', 'run.settled'].includes(event.type) && data) {
    const parsed = runSchema.safeParse(data.run)
    if (parsed.success) {
      runs = [...upsert(runs, parsed.data as Run, (item) => item.id, MAX_RUNS)].sort(
        (a, b) => b.createdAt - a.createdAt,
      )
      if (event.type === 'run.settled')
        streams = Object.fromEntries(Object.entries(streams).filter(([, stream]) => stream.runId !== parsed.data.id))
    }
  } else if (event.type === 'approval.requested' || event.type === 'approval.resolved') {
    const parsed = approvalSchema.safeParse(event.data)
    if (parsed.success) approvals = upsert(approvals, parsed.data as Approval, (item) => item.id, MAX_APPROVALS)
  } else if (event.type === 'user_input.requested') {
    const parsed = userInputRequestSchema.safeParse(event.data)
    if (parsed.success) userInputs = upsert(userInputs, parsed.data, (item) => item.requestId, MAX_USER_INPUTS)
  } else if (event.type === 'user_input.resolved' && data && typeof data.requestId === 'string') {
    userInputs = userInputs.filter((item) => item.requestId !== data.requestId)
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

  return {
    ...current,
    status: 'ready',
    messages,
    runs,
    approvals,
    userInputs,
    usage,
    streams,
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
) {
  const state = createState<SessionTimelineState>(emptyState(null, 'idle'), onSubscriberError)
  const cache = new Map<string, SessionTimelineState>()
  let generation = 0
  let olderGeneration = 0
  let closeWatch: (() => void | Promise<void>) | undefined

  const remember = (value: SessionTimelineState) => {
    if (value.sessionId) {
      cache.delete(value.sessionId)
      cache.set(value.sessionId, value)
      while (cache.size > MAX_CACHED_SESSIONS) cache.delete(cache.keys().next().value!)
    }
    state.replace(value)
  }

  const close = () => {
    const current = closeWatch
    closeWatch = undefined
    if (current) void Promise.resolve(current()).catch(() => {})
  }
  const load = async (sessionId: string | null) => {
    const intent = ++generation
    olderGeneration += 1
    close()
    if (!port || !sessionId) {
      const unavailable = emptyState(sessionId, sessionId ? 'error' : 'idle')
      remember(sessionId ? { ...unavailable, error: 'Timeline history is unavailable in this runtime' } : unavailable)
      return unavailable
    }
    const cached = cache.get(sessionId)
    remember(cached ? { ...cached, status: 'loading', error: null } : emptyState(sessionId, 'loading'))
    try {
      const snapshot = await port.snapshot(sessionId, undefined, PAGE_SIZE)
      if (isDisposed() || intent !== generation || navigation.getSnapshot().sessionId !== sessionId) return undefined
      if (snapshot.session.id !== sessionId)
        throw new Error('Timeline snapshot does not belong to the selected session')
      remember(fromSnapshot(snapshot, cache.get(sessionId)))
      const watcher = await port.watch(sessionId, snapshot.cursor, (update) => {
        if (isDisposed() || intent !== generation || navigation.getSnapshot().sessionId !== sessionId) return
        if (update.kind === 'reset') {
          void load(sessionId)
          return
        }
        const current = state.reader.getSnapshot()
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
      })
      if (isDisposed() || intent !== generation || navigation.getSnapshot().sessionId !== sessionId)
        void Promise.resolve(watcher()).catch(() => {})
      else closeWatch = watcher
      return state.reader.getSnapshot()
    } catch (error) {
      if (isDisposed() || intent !== generation || navigation.getSnapshot().sessionId !== sessionId) return undefined
      const failed = {
        ...state.reader.getSnapshot(),
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      } satisfies SessionTimelineState
      remember(failed)
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
        hasOlder: snapshot.hasOlder,
      }
      remember(next)
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
    dispose() {
      generation += 1
      unsubscribe()
      close()
      state.dispose()
      cache.clear()
    },
  }
}
