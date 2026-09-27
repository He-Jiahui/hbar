import { CommandError, defineCommand, type CommandRegistry } from '@hbar/commands'
import { idSchema } from '@hbar/contracts'
import {
  queuedRunRemoveInputSchema,
  queuedRunRemoveReceiptSchema,
  queuedUserRunsPageSchema,
  type QueuedRunRemoveInput,
  type QueuedRunRemoveReceipt,
  type QueuedUserRunsPage,
} from '@hbar/contracts/commands/run'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import type { NavigationState, RunCommandPort, SessionTimelineState } from './types'

export const QUEUED_USER_RUNS_PAGE_SIZE = 10
const input = z.strictObject({ sessionId: idSchema })
const result = z.strictObject({
  sessionId: idSchema,
  pageIndex: z.number().int().nonnegative(),
  totalQueued: z.number().int().nonnegative(),
})
const metadata = (id: string, kind: 'query' | 'command' = 'query') => ({
  id,
  version: 1,
  owner: 'hbar.app-runtime',
  kind,
  execution: 'client' as const,
  stateEffect: kind === 'query' ? ('none' as const) : ('application' as const),
  category: 'run.approval',
  scope: 'session' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('cli' | 'tui' | 'api' | 'palette')[],
  visibility: 'internal' as const,
})
export const queuedUserRunsCommands = {
  'queuedUserRuns.refresh': defineCommand(metadata('queuedUserRuns.refresh'), input, result),
  'queuedUserRuns.next': defineCommand(metadata('queuedUserRuns.next'), input, result),
  'queuedUserRuns.previous': defineCommand(metadata('queuedUserRuns.previous'), input, result),
  'queuedUserRuns.remove': defineCommand(
    metadata('queuedUserRuns.remove', 'command'),
    queuedRunRemoveInputSchema,
    queuedRunRemoveReceiptSchema,
  ),
  'queuedUserRuns.retryRemoval': defineCommand(
    metadata('queuedUserRuns.retryRemoval', 'command'),
    z.strictObject({ sessionId: idSchema, operationId: idSchema }),
    queuedRunRemoveReceiptSchema,
  ),
  'queuedUserRuns.dismissRemoval': defineCommand(
    metadata('queuedUserRuns.dismissRemoval', 'command'),
    z.strictObject({ sessionId: idSchema }),
    z.strictObject({ sessionId: idSchema }),
  ),
}

type Cursor = QueuedUserRunsPage['nextCursor']
export interface QueuedRunRemovalState {
  readonly operationId: string
  readonly status: 'submitting' | 'unknown' | 'failed'
  readonly error: string | null
}
export interface QueuedUserRunsState {
  readonly sessionId: string | null
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly items: QueuedUserRunsPage['items']
  readonly totalQueued: number
  readonly pageIndex: number
  readonly cursor: Cursor
  readonly nextCursor: Cursor
  readonly previousCursors: readonly Cursor[]
  readonly error: string | null
  readonly removal: QueuedRunRemovalState | null
}

function empty(sessionId: string | null): QueuedUserRunsState {
  return {
    sessionId,
    status: 'idle',
    items: [],
    totalQueued: 0,
    pageIndex: 0,
    cursor: null,
    nextCursor: null,
    previousCursors: [],
    error: null,
    removal: null,
  }
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
}

function hasQueueEventAfter(timeline: SessionTimelineState, cursor: number): boolean {
  for (let index = timeline.events.length - 1; index >= 0; index--) {
    const event = timeline.events[index]
    if (!event || event.seq <= cursor) break
    if (['run.queued', 'run.status', 'run.settled', 'run.inputEdited'].includes(event.type)) return true
  }
  return false
}

/** The Host is the queue fact source; this client ViewModel holds one bounded page at a time. */
export function createQueuedUserRuns(
  local: CommandRegistry,
  run: RunCommandPort | undefined,
  navigation: StateReader<NavigationState>,
  timeline: StateReader<SessionTimelineState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<QueuedUserRunsState>(empty(null), onSubscriberError)
  let generation = 0
  let controller: AbortController | null = null
  let selected = navigation.getSnapshot().sessionId
  let pendingRemoval: { readonly request: QueuedRunRemoveInput; readonly idempotencyKey: string } | null = null

  const setRemoval = (sessionId: string, removal: QueuedRunRemovalState | null) => {
    const current = state.reader.getSnapshot()
    if (current.sessionId === sessionId && navigation.getSnapshot().sessionId === sessionId)
      state.replace({ ...current, removal })
  }

  const read = async (sessionId: string, cursor: Cursor, previousCursors: readonly Cursor[]) => {
    if (!run) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Queued Run reads are unavailable')
    const intent = ++generation
    controller?.abort()
    const request = new AbortController()
    controller = request
    const removal = state.reader.getSnapshot().sessionId === sessionId ? state.reader.getSnapshot().removal : null
    state.replace({
      ...empty(sessionId),
      status: 'loading',
      pageIndex: previousCursors.length,
      cursor,
      previousCursors,
      removal,
    })
    try {
      const parsed = queuedUserRunsPageSchema.safeParse(
        await run.execute(
          'session.queuedUserRuns',
          { sessionId, ...(cursor ? { cursor } : {}), limit: QUEUED_USER_RUNS_PAGE_SIZE },
          { signal: request.signal },
        ),
      )
      if (!parsed.success || parsed.data.sessionId !== sessionId)
        throw new CommandError('INVALID_OUTPUT', 'Queued Run page does not match its session')
      if (isDisposed() || intent !== generation || navigation.getSnapshot().sessionId !== sessionId)
        throw new CommandError('QUERY_SUPERSEDED', 'Queued Run read was superseded')
      const page = parsed.data
      if (
        page.items.length > QUEUED_USER_RUNS_PAGE_SIZE ||
        page.items.length > page.totalQueued ||
        new Set(page.items.map((item) => item.operationId)).size !== page.items.length ||
        (page.nextCursor && page.nextCursor.afterOperationId !== page.items.at(-1)?.operationId)
      )
        throw new CommandError('INVALID_OUTPUT', 'Queued Run page has an invalid cursor or count')
      state.replace({
        sessionId,
        status: 'ready',
        items: page.items,
        totalQueued: page.totalQueued,
        pageIndex: previousCursors.length,
        cursor,
        nextCursor: page.nextCursor,
        previousCursors,
        error: null,
        removal: state.reader.getSnapshot().removal,
      })
      return { sessionId, pageIndex: previousCursors.length, totalQueued: page.totalQueued }
    } catch (reason) {
      if (isDisposed() || intent !== generation || navigation.getSnapshot().sessionId !== sessionId)
        throw new CommandError('QUERY_SUPERSEDED', 'Queued Run read was superseded')
      if (cursor && errorCode(reason) === 'ACTIVITY_CHANGED') return read(sessionId, null, [])
      state.replace({
        ...empty(sessionId),
        status: 'error',
        error: errorCode(reason),
        removal: state.reader.getSnapshot().removal,
      })
      throw reason
    } finally {
      if (controller === request) controller = null
    }
  }

  const requireTarget = (sessionId: string) => {
    if (navigation.getSnapshot().sessionId !== sessionId)
      throw new CommandError('INVALID_INPUT', 'Queue target is not the selected session')
    const current = state.reader.getSnapshot()
    if (current.sessionId !== sessionId)
      throw new CommandError('INVALID_INPUT', 'Queue projection does not belong to the selected session')
    return current
  }
  local.register(queuedUserRunsCommands['queuedUserRuns.refresh'], ({ sessionId }) => {
    requireTarget(sessionId)
    return read(sessionId, null, [])
  })
  local.register(queuedUserRunsCommands['queuedUserRuns.next'], ({ sessionId }) => {
    const current = requireTarget(sessionId)
    if (current.status !== 'ready' || !current.nextCursor)
      throw new CommandError('INVALID_INPUT', 'There is no next queue page')
    return read(sessionId, current.nextCursor, [...current.previousCursors, current.cursor])
  })
  local.register(queuedUserRunsCommands['queuedUserRuns.previous'], ({ sessionId }) => {
    const current = requireTarget(sessionId)
    if (current.status !== 'ready' || current.previousCursors.length === 0)
      throw new CommandError('INVALID_INPUT', 'There is no previous queue page')
    return read(sessionId, current.previousCursors.at(-1) ?? null, current.previousCursors.slice(0, -1))
  })
  const confirmRemoval = (
    pending: { readonly request: QueuedRunRemoveInput; readonly idempotencyKey: string },
    receipt: QueuedRunRemoveReceipt,
  ): QueuedRunRemoveReceipt => {
    const { request, idempotencyKey } = pending
    if (
      receipt.sessionId !== request.sessionId ||
      receipt.operationId !== request.operationId ||
      receipt.idempotencyKey !== idempotencyKey
    )
      throw new CommandError('RESULT_UNKNOWN', 'Queue removal receipt does not match its target')
    if (pendingRemoval === pending) {
      pendingRemoval = null
      setRemoval(request.sessionId, null)
    }
    if (navigation.getSnapshot().sessionId === request.sessionId)
      void read(request.sessionId, null, []).catch(() => undefined)
    return receipt
  }
  const submitRemoval = async (pending: {
    readonly request: QueuedRunRemoveInput
    readonly idempotencyKey: string
  }): Promise<QueuedRunRemoveReceipt> => {
    if (!run) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Queued Run removal is unavailable')
    const { request, idempotencyKey } = pending
    setRemoval(request.sessionId, { operationId: request.operationId, status: 'submitting', error: null })
    try {
      const receipt = queuedRunRemoveReceiptSchema.parse(
        await run.execute('queuedRun.remove', request, { idempotencyKey }),
      )
      return confirmRemoval(pending, receipt)
    } catch (reason) {
      if (pendingRemoval !== pending) throw reason
      const code = errorCode(reason)
      if (code === 'RESULT_UNKNOWN' && run.getQueuedRemoveReceipt) {
        try {
          const receipt = await run.getQueuedRemoveReceipt(request.sessionId, idempotencyKey)
          if (receipt) return confirmRemoval(pending, receipt)
        } catch {
          // A failed read cannot turn an unknown write into a confirmed failure.
        }
      }
      if (code !== 'RESULT_UNKNOWN' && code !== 'DISCONNECTED' && code !== 'TIMEOUT') pendingRemoval = null
      setRemoval(request.sessionId, {
        operationId: request.operationId,
        status: pendingRemoval === pending ? 'unknown' : 'failed',
        error: code,
      })
      if (
        pendingRemoval !== pending &&
        code === 'COMMAND_CONFLICT' &&
        navigation.getSnapshot().sessionId === request.sessionId
      )
        void read(request.sessionId, null, []).catch(() => undefined)
      throw reason
    }
  }
  local.register(queuedUserRunsCommands['queuedUserRuns.remove'], (request) => {
    const current = requireTarget(request.sessionId)
    if (current.status !== 'ready') throw new CommandError('BUSY', 'Queue is not ready')
    if (pendingRemoval) throw new CommandError('BUSY', 'Another queue removal is pending')
    if (
      !current.items.some(
        (item) => item.operationId === request.operationId && item.revision === request.expectedRevision,
      )
    )
      throw new CommandError('COMMAND_CONFLICT', 'Queued Run is no longer on this page')
    const pending = { request, idempotencyKey: crypto.randomUUID() }
    pendingRemoval = pending
    return submitRemoval(pending)
  })
  local.register(queuedUserRunsCommands['queuedUserRuns.retryRemoval'], ({ sessionId, operationId }) => {
    requireTarget(sessionId)
    const pending = pendingRemoval
    if (!pending || pending.request.sessionId !== sessionId || pending.request.operationId !== operationId)
      throw new CommandError('INVALID_INPUT', 'No unknown queue removal belongs to this target')
    if (state.reader.getSnapshot().removal?.status === 'submitting')
      throw new CommandError('BUSY', 'Queue removal is already in progress')
    return submitRemoval(pending)
  })
  local.register(queuedUserRunsCommands['queuedUserRuns.dismissRemoval'], ({ sessionId }) => {
    requireTarget(sessionId)
    if (state.reader.getSnapshot().removal?.status === 'submitting')
      throw new CommandError('BUSY', 'Queue removal is still in progress')
    if (pendingRemoval?.request.sessionId === sessionId) pendingRemoval = null
    setRemoval(sessionId, null)
    return { sessionId }
  })
  const loadSelected = () => {
    selected = navigation.getSnapshot().sessionId
    generation++
    controller?.abort()
    pendingRemoval = null
    state.replace(empty(selected))
    if (selected && run) void read(selected, null, []).catch(() => undefined)
  }
  const offNavigation = navigation.subscribe(() => {
    if (navigation.getSnapshot().sessionId !== selected) loadSelected()
  })
  let lastTimeline = timeline.getSnapshot()
  const offTimeline = timeline.subscribe(() => {
    const current = timeline.getSnapshot()
    const changed =
      current.sessionId === selected &&
      current.status === 'ready' &&
      (lastTimeline.status !== 'ready' ||
        (current.cursor !== lastTimeline.cursor && hasQueueEventAfter(current, lastTimeline.cursor)))
    lastTimeline = current
    if (changed && selected && run) void read(selected, null, []).catch(() => undefined)
  })
  loadSelected()
  return {
    reader: state.reader,
    dispose() {
      generation++
      controller?.abort()
      offNavigation()
      offTimeline()
      state.dispose()
    },
  }
}
