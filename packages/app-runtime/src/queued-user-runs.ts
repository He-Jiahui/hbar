import { CommandError, defineCommand, type CommandRegistry } from '@hbar/commands'
import { idSchema } from '@hbar/contracts'
import {
  queuedRunEditableSchema,
  queuedRunEditTextInputSchema,
  queuedRunEditTextReceiptSchema,
  queuedRunRemoveInputSchema,
  queuedRunRemoveReceiptSchema,
  queuedUserRunsPageSchema,
  type QueuedRunEditTextInput,
  type QueuedRunEditTextReceipt,
  type QueuedRunRemoveInput,
  type QueuedRunRemoveReceipt,
  type QueuedUserRunsPage,
} from '@hbar/contracts/commands/run'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import { isQueuedRunGuidanceEvent } from './session-timeline'
import type { NavigationState, RunCommandPort, SessionTimelineState } from './types'

export const QUEUED_USER_RUNS_PAGE_SIZE = 10
const input = z.strictObject({ sessionId: idSchema })
const result = z.strictObject({
  sessionId: idSchema,
  pageIndex: z.number().int().nonnegative(),
  totalQueued: z.number().int().nonnegative(),
})
const editTarget = z.strictObject({ sessionId: idSchema, operationId: idSchema })
const editText = editTarget.extend({ text: z.string().max(200_000) })
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
  'queuedUserRuns.startEdit': defineCommand(metadata('queuedUserRuns.startEdit'), editTarget, editTarget),
  'queuedUserRuns.setEditText': defineCommand(metadata('queuedUserRuns.setEditText', 'command'), editText, editTarget),
  'queuedUserRuns.saveEdit': defineCommand(
    metadata('queuedUserRuns.saveEdit', 'command'),
    editTarget,
    queuedRunEditTextReceiptSchema,
  ),
  'queuedUserRuns.retryEdit': defineCommand(
    metadata('queuedUserRuns.retryEdit', 'command'),
    editTarget,
    queuedRunEditTextReceiptSchema,
  ),
  'queuedUserRuns.cancelEdit': defineCommand(metadata('queuedUserRuns.cancelEdit', 'command'), input, input),
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
export interface QueuedRunEditingState {
  readonly operationId: string
  readonly status: 'loading' | 'ready' | 'submitting' | 'unknown' | 'failed'
  readonly text: string
  readonly revision: number | null
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
  readonly editing: QueuedRunEditingState | null
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
    editing: null,
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
    if (
      ['run.queued', 'run.status', 'run.settled', 'run.inputEdited'].includes(event.type) ||
      isQueuedRunGuidanceEvent(event)
    )
      return true
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
  let editLoadGeneration = 0
  let selected = navigation.getSnapshot().sessionId
  let pendingRemoval: { readonly request: QueuedRunRemoveInput; readonly idempotencyKey: string } | null = null
  let pendingEdit: { readonly request: QueuedRunEditTextInput; readonly idempotencyKey: string } | null = null

  const setRemoval = (sessionId: string, removal: QueuedRunRemovalState | null) => {
    const current = state.reader.getSnapshot()
    if (current.sessionId === sessionId && navigation.getSnapshot().sessionId === sessionId)
      state.replace({ ...current, removal })
  }
  const setEditing = (sessionId: string, editing: QueuedRunEditingState | null) => {
    const current = state.reader.getSnapshot()
    if (current.sessionId === sessionId && navigation.getSnapshot().sessionId === sessionId)
      state.replace({ ...current, editing })
  }

  const read = async (sessionId: string, cursor: Cursor, previousCursors: readonly Cursor[]) => {
    if (!run) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Queued Run reads are unavailable')
    const intent = ++generation
    controller?.abort()
    const request = new AbortController()
    controller = request
    const removal = state.reader.getSnapshot().sessionId === sessionId ? state.reader.getSnapshot().removal : null
    const editing = state.reader.getSnapshot().sessionId === sessionId ? state.reader.getSnapshot().editing : null
    state.replace({
      ...empty(sessionId),
      status: 'loading',
      pageIndex: previousCursors.length,
      cursor,
      previousCursors,
      removal,
      editing,
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
        editing: state.reader.getSnapshot().editing,
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
        editing: state.reader.getSnapshot().editing,
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
  local.register(queuedUserRunsCommands['queuedUserRuns.startEdit'], async ({ sessionId, operationId }) => {
    if (!run) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Queued Run editing is unavailable')
    const current = requireTarget(sessionId)
    if (current.status !== 'ready' || current.editing || current.removal || pendingEdit || pendingRemoval)
      throw new CommandError('BUSY', 'Queue item cannot be edited now')
    const item = current.items.find((entry) => entry.operationId === operationId)
    if (!item) throw new CommandError('COMMAND_CONFLICT', 'Queued Run is no longer on this page')
    const intent = ++editLoadGeneration
    setEditing(sessionId, { operationId, status: 'loading', text: '', revision: null, error: null })
    try {
      const parsed = queuedRunEditableSchema.safeParse(
        await run.execute('queuedRun.getEditable', { sessionId, operationId }),
      )
      if (!parsed.success || parsed.data.sessionId !== sessionId || parsed.data.operationId !== operationId)
        throw new CommandError('INVALID_OUTPUT', 'Editable queue text does not match the selected item')
      if (intent !== editLoadGeneration || navigation.getSnapshot().sessionId !== sessionId)
        throw new CommandError('QUERY_SUPERSEDED', 'Queued Run edit read was superseded')
      if (parsed.data.revision !== item.revision)
        throw new CommandError('COMMAND_CONFLICT', 'Queued Run changed before editing')
      setEditing(sessionId, {
        operationId,
        status: 'ready',
        text: parsed.data.text,
        revision: parsed.data.revision,
        error: null,
      })
      return { sessionId, operationId }
    } catch (reason) {
      if (intent === editLoadGeneration && navigation.getSnapshot().sessionId === sessionId) {
        setEditing(sessionId, { operationId, status: 'failed', text: '', revision: null, error: errorCode(reason) })
        if (errorCode(reason) === 'COMMAND_CONFLICT') void read(sessionId, null, []).catch(() => undefined)
      }
      throw reason
    }
  })
  local.register(queuedUserRunsCommands['queuedUserRuns.setEditText'], ({ sessionId, operationId, text }) => {
    const editing = requireTarget(sessionId).editing
    if (!editing || editing.operationId !== operationId || editing.status !== 'ready')
      throw new CommandError('BUSY', 'Queued Run edit is not ready')
    setEditing(sessionId, { ...editing, text })
    return { sessionId, operationId }
  })
  const confirmEdit = (
    pending: { readonly request: QueuedRunEditTextInput; readonly idempotencyKey: string },
    receipt: QueuedRunEditTextReceipt,
  ): QueuedRunEditTextReceipt => {
    const { request, idempotencyKey } = pending
    if (
      receipt.sessionId !== request.sessionId ||
      receipt.operationId !== request.operationId ||
      receipt.idempotencyKey !== idempotencyKey
    )
      throw new CommandError('RESULT_UNKNOWN', 'Queue edit receipt does not match its target')
    if (pendingEdit === pending) {
      pendingEdit = null
      setEditing(request.sessionId, null)
    }
    if (navigation.getSnapshot().sessionId === request.sessionId)
      void read(request.sessionId, null, []).catch(() => undefined)
    return receipt
  }
  const submitEdit = async (pending: {
    readonly request: QueuedRunEditTextInput
    readonly idempotencyKey: string
  }): Promise<QueuedRunEditTextReceipt> => {
    if (!run) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Queued Run editing is unavailable')
    const { request, idempotencyKey } = pending
    setEditing(request.sessionId, {
      operationId: request.operationId,
      status: 'submitting',
      text: request.text,
      revision: request.expectedRevision,
      error: null,
    })
    try {
      const receipt = queuedRunEditTextReceiptSchema.parse(
        await run.execute('queuedRun.editText', request, { idempotencyKey }),
      )
      return confirmEdit(pending, receipt)
    } catch (reason) {
      if (pendingEdit !== pending) throw reason
      const code = errorCode(reason)
      if (code === 'RESULT_UNKNOWN' && run.getQueuedEditTextReceipt) {
        try {
          const receipt = await run.getQueuedEditTextReceipt(request.sessionId, idempotencyKey)
          if (receipt) return confirmEdit(pending, receipt)
        } catch {
          // A failed receipt read cannot turn an uncertain write into a failure.
        }
      }
      if (code !== 'RESULT_UNKNOWN' && code !== 'DISCONNECTED' && code !== 'TIMEOUT') pendingEdit = null
      setEditing(request.sessionId, {
        operationId: request.operationId,
        status: pendingEdit === pending ? 'unknown' : 'failed',
        text: request.text,
        revision: request.expectedRevision,
        error: code,
      })
      if (
        pendingEdit !== pending &&
        code === 'COMMAND_CONFLICT' &&
        navigation.getSnapshot().sessionId === request.sessionId
      )
        void read(request.sessionId, null, []).catch(() => undefined)
      throw reason
    }
  }
  local.register(queuedUserRunsCommands['queuedUserRuns.saveEdit'], ({ sessionId, operationId }) => {
    const current = requireTarget(sessionId)
    const editing = current.editing
    if (!editing || editing.operationId !== operationId || editing.status !== 'ready' || editing.revision === null)
      throw new CommandError('BUSY', 'Queued Run edit is not ready')
    if (pendingEdit || pendingRemoval || current.removal)
      throw new CommandError('BUSY', 'Another queue action is pending')
    const text = editing.text.trim()
    if (!text) throw new CommandError('INVALID_INPUT', 'Queued Run text cannot be blank')
    const request = queuedRunEditTextInputSchema.parse({
      sessionId,
      operationId,
      expectedRevision: editing.revision,
      text,
    })
    const pending = { request, idempotencyKey: crypto.randomUUID() }
    pendingEdit = pending
    return submitEdit(pending)
  })
  local.register(queuedUserRunsCommands['queuedUserRuns.retryEdit'], ({ sessionId, operationId }) => {
    const current = requireTarget(sessionId)
    const pending = pendingEdit
    if (
      !pending ||
      pending.request.sessionId !== sessionId ||
      pending.request.operationId !== operationId ||
      current.editing?.status !== 'unknown'
    )
      throw new CommandError('INVALID_INPUT', 'No uncertain queue edit belongs to this target')
    return submitEdit(pending)
  })
  local.register(queuedUserRunsCommands['queuedUserRuns.cancelEdit'], ({ sessionId }) => {
    const current = requireTarget(sessionId)
    if (current.editing?.status === 'submitting') throw new CommandError('BUSY', 'Queue edit is still in progress')
    editLoadGeneration++
    pendingEdit = null
    setEditing(sessionId, null)
    void read(sessionId, null, []).catch(() => undefined)
    return { sessionId }
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
    if (pendingRemoval || pendingEdit || current.editing)
      throw new CommandError('BUSY', 'Another queue action is pending')
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
    editLoadGeneration++
    controller?.abort()
    pendingRemoval = null
    pendingEdit = null
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
      editLoadGeneration++
      controller?.abort()
      offNavigation()
      offTimeline()
      state.dispose()
    },
  }
}
