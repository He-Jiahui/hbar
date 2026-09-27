import { CommandError, defineCommand, type CommandExecutor, type CommandRegistry } from '@hbar/commands'
import { idSchema } from '@hbar/contracts'
import { queuedUserRunsPageSchema, type QueuedUserRunsPage } from '@hbar/contracts/commands/run'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import type { NavigationState, SessionTimelineState } from './types'

export const QUEUED_USER_RUNS_PAGE_SIZE = 10
const input = z.strictObject({ sessionId: idSchema })
const result = z.strictObject({
  sessionId: idSchema,
  pageIndex: z.number().int().nonnegative(),
  totalQueued: z.number().int().nonnegative(),
})
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.app-runtime',
  kind: 'query' as const,
  execution: 'client' as const,
  stateEffect: 'none' as const,
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
}

type Cursor = QueuedUserRunsPage['nextCursor']
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
  }
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
}

/** The Host is the queue fact source; this client ViewModel holds one bounded page at a time. */
export function createQueuedUserRuns(
  local: CommandRegistry,
  run: CommandExecutor | undefined,
  navigation: StateReader<NavigationState>,
  timeline: StateReader<SessionTimelineState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<QueuedUserRunsState>(empty(null), onSubscriberError)
  let generation = 0
  let controller: AbortController | null = null
  let selected = navigation.getSnapshot().sessionId

  const read = async (sessionId: string, cursor: Cursor, previousCursors: readonly Cursor[]) => {
    if (!run) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Queued Run reads are unavailable')
    const intent = ++generation
    controller?.abort()
    const request = new AbortController()
    controller = request
    state.replace({
      ...empty(sessionId),
      status: 'loading',
      pageIndex: previousCursors.length,
      cursor,
      previousCursors,
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
        page.items.length > page.totalQueued ||
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
      })
      return { sessionId, pageIndex: previousCursors.length, totalQueued: page.totalQueued }
    } catch (reason) {
      if (isDisposed() || intent !== generation || navigation.getSnapshot().sessionId !== sessionId)
        throw new CommandError('QUERY_SUPERSEDED', 'Queued Run read was superseded')
      if (cursor && errorCode(reason) === 'ACTIVITY_CHANGED') return read(sessionId, null, [])
      state.replace({ ...empty(sessionId), status: 'error', error: errorCode(reason) })
      throw reason
    } finally {
      if (controller === request) controller = null
    }
  }

  const requireTarget = (sessionId: string) => {
    if (navigation.getSnapshot().sessionId !== sessionId)
      throw new CommandError('INVALID_INPUT', 'Queue target is not the selected session')
    return state.reader.getSnapshot()
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
  const loadSelected = () => {
    selected = navigation.getSnapshot().sessionId
    generation++
    controller?.abort()
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
        (current.cursor !== lastTimeline.cursor &&
          ['run.queued', 'run.status', 'run.settled'].includes(current.events.at(-1)?.type ?? '')))
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
