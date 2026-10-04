import { z } from 'zod'
import {
  CommandError,
  createCommandClient,
  defineCommand,
  type CommandExecutor,
  type CommandRegistry,
} from '@hbar/commands'
import { directoryCommands, navigationCommands } from '@hbar/contracts/commands'
import type { Session } from '@hbar/contracts/directory'
import { createState, type StateReader } from './state'
import type { DirectoryState } from './types'

export interface SessionArchiveMutation {
  readonly target: {
    readonly workspaceId: string
    readonly sessionId: string
    readonly title: string
    readonly archived: boolean
  } | null
  readonly revision: number
  readonly status: 'idle' | 'confirming' | 'submitting' | 'failed' | 'unknown' | 'reconciling' | 'succeeded'
  readonly error: string | null
  readonly requestId: string | null
}

export interface ArchivedSessionsPage {
  readonly workspaceId: string | null
  readonly revision: number
  readonly open: boolean
  readonly status: 'idle' | 'loading' | 'ready' | 'failed'
  /** At most one inclusive Host page. Session facts remain in DirectoryState. */
  readonly sessionIds: readonly string[]
  readonly page: number
  readonly after: string | null
  readonly nextCursor: string | null
  readonly error: string | null
}

export interface SessionArchiveState {
  readonly mutation: SessionArchiveMutation
  readonly batch: SessionArchiveBatchState
  readonly list: ArchivedSessionsPage
}

export interface SessionArchiveBatchTarget {
  readonly workspaceId: string
  readonly sessionId: string
  readonly title: string
}

export interface SessionArchiveBatchItem {
  readonly target: SessionArchiveBatchTarget
  readonly status: 'pending' | 'submitting' | 'archived' | 'failed' | 'unknown'
  readonly error: string | null
  readonly requestId: string | null
}

export interface SessionArchiveBatchState {
  readonly revision: number
  readonly status: 'idle' | 'confirming' | 'submitting' | 'unknown' | 'reconciling' | 'paused' | 'succeeded' | 'partial'
  readonly items: readonly Readonly<SessionArchiveBatchItem>[]
  readonly activeIndex: number | null
  readonly error: string | null
}

export interface SessionArchiveOptions {
  readonly directory: StateReader<DirectoryState>
  readonly commands: CommandExecutor
  readonly observeSession?: (sessionId: string) => Promise<Session | null>
  readonly onSubscriberError: (error: unknown) => void
  readonly isDisposed: () => boolean
}

export const ARCHIVED_SESSIONS_PAGE_SIZE = 100
export const SESSION_ARCHIVE_BATCH_MAX_ITEMS = 100
const id = z.string().min(1).max(160)
const target = z.strictObject({ sessionId: id, revision: z.number().int().nonnegative() })
const revisionTarget = z.strictObject({ revision: z.number().int().nonnegative() })
const pageTarget = z.strictObject({ workspaceId: id, revision: z.number().int().nonnegative() })
const batchTarget = z.strictObject({ workspaceId: id, sessionId: id })
const output = z.strictObject({ revision: z.number().int().nonnegative() })
const metadata = (name: string) => ({
  id: name,
  version: 1,
  owner: 'hbar.session-archive',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'workspace' as const,
  category: 'workspace.session',
  visibility: 'internal' as const,
  titleKey: `commands.${name}.title`,
  descriptionKey: `commands.${name}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})
export const sessionArchiveCommands = {
  'sessionArchive.begin': defineCommand(
    metadata('sessionArchive.begin'),
    z.strictObject({ workspaceId: id, sessionId: id }),
    output,
  ),
  'sessionArchive.restore': defineCommand(
    metadata('sessionArchive.restore'),
    z.strictObject({ workspaceId: id, sessionId: id }),
    output,
  ),
  'sessionArchive.confirm': defineCommand(metadata('sessionArchive.confirm'), target, output),
  'sessionArchive.cancel': defineCommand(metadata('sessionArchive.cancel'), target, output),
  'sessionArchive.reconcile': defineCommand(metadata('sessionArchive.reconcile'), target, output),
  'sessionArchive.dismiss': defineCommand(metadata('sessionArchive.dismiss'), target, output),
  'sessionArchiveBatch.begin': defineCommand(
    metadata('sessionArchiveBatch.begin'),
    z.strictObject({ targets: z.array(batchTarget).min(1).max(SESSION_ARCHIVE_BATCH_MAX_ITEMS) }),
    output,
  ),
  'sessionArchiveBatch.confirm': defineCommand(metadata('sessionArchiveBatch.confirm'), revisionTarget, output),
  'sessionArchiveBatch.cancel': defineCommand(metadata('sessionArchiveBatch.cancel'), revisionTarget, output),
  'sessionArchiveBatch.reconcile': defineCommand(metadata('sessionArchiveBatch.reconcile'), revisionTarget, output),
  'sessionArchiveBatch.continue': defineCommand(metadata('sessionArchiveBatch.continue'), revisionTarget, output),
  'sessionArchiveBatch.dismiss': defineCommand(metadata('sessionArchiveBatch.dismiss'), revisionTarget, output),
  'archivedSessions.open': defineCommand(
    metadata('archivedSessions.open'),
    z.strictObject({ workspaceId: id }),
    output,
  ),
  'archivedSessions.load': defineCommand(
    metadata('archivedSessions.load'),
    pageTarget.extend({ direction: z.enum(['first', 'next']) }),
    output,
  ),
  'archivedSessions.close': defineCommand(metadata('archivedSessions.close'), pageTarget, output),
}

const errorCode = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
const definitiveRejections = new Set([
  'INVALID_INPUT',
  'INPUT_TOO_LARGE',
  'FORBIDDEN',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'SESSION_NOT_FOUND',
  'CAPABILITY_UNAVAILABLE',
  'COMMAND_NOT_FOUND',
  'CAPACITY_EXCEEDED',
  'BUSY',
  'VERSION_CONFLICT',
])

/** One mutation intent and one cancellable inclusive page; neither duplicates confirmed session facts. */
export function createSessionArchive(local: CommandRegistry, options: SessionArchiveOptions) {
  const readTarget = (target: { readonly sessionId: string; readonly archived: boolean }) =>
    !target.archived && options.observeSession
      ? options.observeSession(target.sessionId)
      : commands.execute('session.get', { sessionId: target.sessionId })
  const state = createState<SessionArchiveState>(
    {
      mutation: { target: null, revision: 0, status: 'idle', error: null, requestId: null },
      batch: { revision: 0, status: 'idle', items: [], activeIndex: null, error: null },
      list: {
        workspaceId: null,
        revision: 0,
        open: false,
        status: 'idle',
        sessionIds: [],
        page: 1,
        after: null,
        nextCursor: null,
        error: null,
      },
    },
    options.onSubscriberError,
  )
  const commands = createCommandClient({ ...directoryCommands, ...navigationCommands }, options.commands)
  let disposed = false
  let pageRequest: AbortController | null = null
  const alive = () => !disposed && !options.isDisposed()
  const current = () => state.reader.getSnapshot()
  const setMutation = (mutation: SessionArchiveMutation) => {
    if (alive()) state.replace({ ...current(), mutation })
  }
  const setBatch = (batch: SessionArchiveBatchState) => {
    if (alive()) state.replace({ ...current(), batch })
  }
  const setList = (list: ArchivedSessionsPage) => {
    if (alive()) state.replace({ ...current(), list })
  }
  const mutationResult = () => ({ revision: current().mutation.revision })
  const batchResult = () => ({ revision: current().batch.revision })
  const pageResult = () => ({ revision: current().list.revision })
  const owned = (input: z.output<typeof target>) => {
    const value = current().mutation
    if (!alive() || !value.target || value.target.sessionId !== input.sessionId || value.revision !== input.revision)
      throw new CommandError('STALE_TARGET', 'The archive action no longer belongs to its original session')
    return { ...value, target: value.target }
  }
  const editable = (value: SessionArchiveMutation) => {
    if (value.status !== 'confirming' && value.status !== 'failed')
      throw new CommandError('BUSY', 'Resolve the original archive action first')
  }
  const batchBlocksSingle = (status: SessionArchiveBatchState['status']) => status !== 'idle'
  const assertBatchDoesNotOwnWrites = () => {
    if (batchBlocksSingle(current().batch.status))
      throw new CommandError('BUSY', 'Resolve the original batch archive action first')
  }
  const assertSingleDoesNotOwnWrites = () => {
    if (!['idle', 'succeeded'].includes(current().mutation.status))
      throw new CommandError('BUSY', 'Resolve the original archive action first')
  }
  const executeArchive = async (
    value: { readonly workspaceId: string; readonly sessionId: string; readonly archived: boolean },
    requestId: string,
    onWriteStarted: () => void,
  ) => {
    const session = await readTarget(value)
    if (!alive()) return
    if (!session || session.workspaceId !== value.workspaceId)
      throw new CommandError('STALE_TARGET', 'The original session is no longer available')
    if (session.archived !== value.archived) {
      onWriteStarted()
      await commands.execute(
        'app.archiveSession',
        { sessionId: value.sessionId, archived: value.archived },
        { requestId },
      )
    }
  }
  const updateBatchItem = (index: number, item: SessionArchiveBatchItem, patch: Partial<SessionArchiveBatchState>) => {
    const batch = current().batch
    const items = batch.items.map((prior, itemIndex) => (itemIndex === index ? item : prior))
    setBatch({ ...batch, ...patch, items })
  }
  const finishBatch = (items: readonly Readonly<SessionArchiveBatchItem>[], revision: number) => {
    const partial = items.some((item) => item.status === 'failed')
    setBatch({
      revision,
      status: partial ? 'partial' : 'succeeded',
      items,
      activeIndex: null,
      error: null,
    })
  }
  const runBatch = async (revision: number, fromIndex: number) => {
    const prior = current().batch
    if (prior.revision !== revision || (prior.status !== 'confirming' && prior.status !== 'paused'))
      throw new CommandError('STALE_TARGET', 'The batch archive action no longer belongs to its captured targets')
    setBatch({ ...prior, status: 'submitting', error: null, activeIndex: fromIndex })
    for (let index = fromIndex; index < current().batch.items.length; index += 1) {
      if (!alive()) return batchResult()
      const batch = current().batch
      if (batch.revision !== revision) throw new CommandError('STALE_TARGET', 'The batch archive action changed')
      const item = batch.items[index]
      if (!item || item.status !== 'pending') continue
      const pending: SessionArchiveBatchItem = {
        ...item,
        status: 'submitting',
        error: null,
        requestId: crypto.randomUUID(),
      }
      updateBatchItem(index, pending, { status: 'submitting', activeIndex: index, error: null })
      let writeStarted = false
      try {
        await executeArchive({ ...item.target, archived: true }, pending.requestId!, () => {
          writeStarted = true
        })
        if (!alive()) return batchResult()
        updateBatchItem(index, { ...pending, status: 'archived', error: null }, { status: 'submitting' })
      } catch (error) {
        if (!alive()) return batchResult()
        const code = errorCode(error)
        const unknown = writeStarted && !definitiveRejections.has(code)
        const failed: SessionArchiveBatchItem = {
          ...pending,
          status: unknown ? 'unknown' : 'failed',
          error: code,
        }
        if (unknown) {
          updateBatchItem(index, failed, { status: 'unknown', activeIndex: index, error: code })
          return batchResult()
        }
        updateBatchItem(index, failed, { status: 'submitting', activeIndex: index, error: code })
      }
    }
    if (alive()) finishBatch(current().batch.items, revision)
    return batchResult()
  }
  const begin = (workspaceId: string, sessionId: string, archived: boolean) => {
    assertBatchDoesNotOwnWrites()
    const prior = current().mutation
    if (!['idle', 'succeeded'].includes(prior.status))
      throw new CommandError('BUSY', 'Resolve the original archive action first')
    const session = options.directory.getSnapshot().sessions[sessionId]
    if (!session || session.workspaceId !== workspaceId || session.archived === archived)
      throw new CommandError('STALE_TARGET', 'The original session is no longer available for this action')
    setMutation({
      target: { workspaceId, sessionId, title: session.title, archived },
      revision: prior.revision + 1,
      status: 'confirming',
      error: null,
      requestId: null,
    })
    return mutationResult()
  }
  const submit = async (input: z.output<typeof target>) => {
    assertBatchDoesNotOwnWrites()
    const value = owned(input)
    editable(value)
    const pending = { ...value, requestId: crypto.randomUUID() }
    setMutation({ ...pending, status: 'submitting', error: null })
    let writeStarted = false
    try {
      await executeArchive(value.target, pending.requestId!, () => {
        writeStarted = true
      })
      if (!alive()) return mutationResult()
      setMutation({ ...pending, status: 'succeeded', error: null })
      return mutationResult()
    } catch (error) {
      const code = errorCode(error)
      setMutation({
        ...pending,
        status: writeStarted && !definitiveRejections.has(code) ? 'unknown' : 'failed',
        error: code,
      })
      throw error
    }
  }
  local.register(sessionArchiveCommands['sessionArchive.begin'], ({ workspaceId, sessionId }) =>
    begin(workspaceId, sessionId, true),
  )
  local.register(sessionArchiveCommands['sessionArchive.restore'], async ({ workspaceId, sessionId }) => {
    begin(workspaceId, sessionId, false)
    return submit({ sessionId, revision: current().mutation.revision })
  })
  local.register(sessionArchiveCommands['sessionArchive.confirm'], submit)
  local.register(sessionArchiveCommands['sessionArchive.cancel'], (input) => {
    const value = owned(input)
    editable(value)
    setMutation({ target: null, revision: value.revision + 1, status: 'idle', error: null, requestId: null })
    return mutationResult()
  })
  local.register(sessionArchiveCommands['sessionArchive.dismiss'], (input) => {
    const value = owned(input)
    if (value.status !== 'succeeded') throw new CommandError('BUSY', 'Only a confirmed result may be dismissed')
    setMutation({ target: null, revision: value.revision + 1, status: 'idle', error: null, requestId: null })
    return mutationResult()
  })
  local.register(sessionArchiveCommands['sessionArchive.reconcile'], async (input) => {
    assertBatchDoesNotOwnWrites()
    const value = owned(input)
    if (value.status !== 'unknown') throw new CommandError('INVALID_INPUT', 'No archive action requires reconciliation')
    setMutation({ ...value, status: 'reconciling', error: null })
    try {
      const session = await readTarget(value.target)
      const confirmed = session?.workspaceId === value.target.workspaceId && session.archived === value.target.archived
      setMutation({ ...value, status: confirmed ? 'succeeded' : 'unknown', error: confirmed ? null : 'RESULT_UNKNOWN' })
      return mutationResult()
    } catch (error) {
      setMutation({ ...value, status: 'unknown', error: errorCode(error) })
      throw error
    }
  })

  local.register(sessionArchiveCommands['sessionArchiveBatch.begin'], ({ targets }) => {
    assertSingleDoesNotOwnWrites()
    const prior = current().batch
    if (prior.status !== 'idle')
      throw new CommandError('BUSY', 'Resolve or dismiss the previous batch archive action first')
    const seen = new Set<string>()
    const captured = targets.map(({ workspaceId, sessionId }) => {
      const key = `${workspaceId}\u0000${sessionId}`
      if (seen.has(key)) throw new CommandError('INVALID_INPUT', 'A batch archive target was selected more than once')
      seen.add(key)
      const session = options.directory.getSnapshot().sessions[sessionId]
      if (!session || session.workspaceId !== workspaceId || session.archived)
        throw new CommandError('STALE_TARGET', 'A captured session is no longer available for archiving')
      return {
        target: { workspaceId, sessionId, title: session.title },
        status: 'pending' as const,
        error: null,
        requestId: null,
      }
    })
    setBatch({
      revision: prior.revision + 1,
      status: 'confirming',
      items: captured,
      activeIndex: null,
      error: null,
    })
    return batchResult()
  })
  local.register(sessionArchiveCommands['sessionArchiveBatch.confirm'], ({ revision }) => runBatch(revision, 0))
  local.register(sessionArchiveCommands['sessionArchiveBatch.continue'], ({ revision }) => {
    const batch = current().batch
    if (batch.revision !== revision || batch.status !== 'paused')
      throw new CommandError('STALE_TARGET', 'The batch archive action is not ready to continue')
    return runBatch(revision, batch.activeIndex ?? batch.items.length)
  })
  local.register(sessionArchiveCommands['sessionArchiveBatch.cancel'], ({ revision }) => {
    const batch = current().batch
    if (batch.revision !== revision || batch.status !== 'confirming')
      throw new CommandError('BUSY', 'Only an unsubmitted batch archive can be cancelled')
    setBatch({ revision: revision + 1, status: 'idle', items: [], activeIndex: null, error: null })
    return batchResult()
  })
  local.register(sessionArchiveCommands['sessionArchiveBatch.dismiss'], ({ revision }) => {
    const batch = current().batch
    if (batch.revision !== revision || (batch.status !== 'succeeded' && batch.status !== 'partial'))
      throw new CommandError('BUSY', 'Only a resolved batch archive result may be dismissed')
    setBatch({ revision: revision + 1, status: 'idle', items: [], activeIndex: null, error: null })
    return batchResult()
  })
  local.register(sessionArchiveCommands['sessionArchiveBatch.reconcile'], async ({ revision }) => {
    const batch = current().batch
    if (batch.revision !== revision || batch.status !== 'unknown' || batch.activeIndex === null)
      throw new CommandError('INVALID_INPUT', 'No batch archive target requires reconciliation')
    const index = batch.activeIndex
    const item = batch.items[index]
    if (!item || item.status !== 'unknown')
      throw new CommandError('STALE_TARGET', 'The unknown batch archive target is no longer current')
    setBatch({ ...batch, status: 'reconciling', error: null })
    try {
      const session = await readTarget({ ...item.target, archived: true })
      if (!alive()) return batchResult()
      const confirmed = session?.workspaceId === item.target.workspaceId && session.archived
      if (!confirmed) {
        updateBatchItem(index, { ...item, error: 'RESULT_UNKNOWN' }, { status: 'unknown', error: 'RESULT_UNKNOWN' })
      } else {
        const items = current().batch.items.map((prior, itemIndex) =>
          itemIndex === index ? { ...prior, status: 'archived' as const, error: null } : prior,
        )
        if (items.slice(index + 1).some((candidate) => candidate.status === 'pending'))
          setBatch({ ...current().batch, items, status: 'paused', activeIndex: index + 1, error: null })
        else finishBatch(items, revision)
      }
      return batchResult()
    } catch (error) {
      if (alive()) {
        const code = errorCode(error)
        updateBatchItem(index, { ...item, error: code }, { status: 'unknown', error: code })
      }
      throw error
    }
  })

  const load = async (list: ArchivedSessionsPage, after: string | null, page: number) => {
    if (!list.workspaceId) throw new CommandError('STALE_TARGET', 'No original workspace is selected')
    pageRequest?.abort()
    const request = new AbortController()
    pageRequest = request
    setList({ ...list, status: 'loading', error: null })
    try {
      const result = await commands.execute(
        'session.list',
        {
          workspaceId: list.workspaceId,
          includeArchived: true,
          limit: ARCHIVED_SESSIONS_PAGE_SIZE,
          ...(after ? { after } : {}),
        },
        { signal: request.signal },
      )
      if (!alive() || request.signal.aborted || pageRequest !== request) return pageResult()
      if (
        result.items.length > ARCHIVED_SESSIONS_PAGE_SIZE ||
        (result.nextCursor !== null && result.nextCursor === after)
      )
        throw new CommandError('INVALID_OUTPUT', 'The archived session page exceeds its bound or repeats its cursor')
      setList({
        ...list,
        sessionIds: result.items.map((session) => session.id),
        status: 'ready',
        error: null,
        after,
        nextCursor: result.nextCursor,
        page,
      })
      return pageResult()
    } catch (error) {
      if (alive() && !request.signal.aborted && pageRequest === request)
        setList({ ...list, status: 'failed', error: errorCode(error) })
      throw error
    } finally {
      if (pageRequest === request) pageRequest = null
    }
  }
  local.register(sessionArchiveCommands['archivedSessions.open'], ({ workspaceId }) => {
    if (!options.directory.getSnapshot().workspaces[workspaceId])
      throw new CommandError('STALE_TARGET', 'The original workspace is no longer available')
    const prior = current().list
    const list: ArchivedSessionsPage = {
      workspaceId,
      revision: prior.revision + 1,
      open: true,
      status: 'idle',
      sessionIds: [],
      page: 1,
      after: null,
      nextCursor: null,
      error: null,
    }
    return load(list, null, 1)
  })
  local.register(sessionArchiveCommands['archivedSessions.load'], (input) => {
    const list = current().list
    if (!list.open || list.workspaceId !== input.workspaceId || list.revision !== input.revision)
      throw new CommandError('STALE_TARGET', 'The archive page belongs to another workspace')
    if (list.status === 'loading') throw new CommandError('BUSY', 'An archive page is already loading')
    if (input.direction === 'next' && !list.nextCursor)
      throw new CommandError('INVALID_INPUT', 'There is no next archive page')
    return load(
      list,
      input.direction === 'first' ? null : list.nextCursor,
      input.direction === 'first' ? 1 : list.page + 1,
    )
  })
  local.register(sessionArchiveCommands['archivedSessions.close'], (input) => {
    const list = current().list
    if (list.workspaceId !== input.workspaceId || list.revision !== input.revision)
      throw new CommandError('STALE_TARGET', 'The archive page belongs to another workspace')
    pageRequest?.abort()
    pageRequest = null
    setList({
      ...list,
      open: false,
      revision: list.revision + 1,
      status: 'idle',
      sessionIds: [],
      after: null,
      nextCursor: null,
      error: null,
    })
    return pageResult()
  })
  return {
    reader: state.reader,
    dispose() {
      disposed = true
      pageRequest?.abort()
      pageRequest = null
      state.dispose()
    },
  }
}
