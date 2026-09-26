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
  readonly list: ArchivedSessionsPage
}

export interface SessionArchiveOptions {
  readonly directory: StateReader<DirectoryState>
  readonly commands: CommandExecutor
  readonly observeSession?: (sessionId: string) => Promise<Session | null>
  readonly onSubscriberError: (error: unknown) => void
  readonly isDisposed: () => boolean
}

export const ARCHIVED_SESSIONS_PAGE_SIZE = 100
const id = z.string().min(1).max(160)
const target = z.strictObject({ sessionId: id, revision: z.number().int().nonnegative() })
const pageTarget = z.strictObject({ workspaceId: id, revision: z.number().int().nonnegative() })
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
  const setList = (list: ArchivedSessionsPage) => {
    if (alive()) state.replace({ ...current(), list })
  }
  const mutationResult = () => ({ revision: current().mutation.revision })
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
  const begin = (workspaceId: string, sessionId: string, archived: boolean) => {
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
    const value = owned(input)
    editable(value)
    const pending = { ...value, requestId: crypto.randomUUID() }
    setMutation({ ...pending, status: 'submitting', error: null })
    let writeStarted = false
    try {
      const session = await readTarget(value.target)
      if (!alive()) return mutationResult()
      if (!session || session.workspaceId !== value.target.workspaceId)
        throw new CommandError('STALE_TARGET', 'The original session is no longer available')
      if (session.archived !== value.target.archived) {
        writeStarted = true
        await commands.execute(
          'app.archiveSession',
          { sessionId: value.target.sessionId, archived: value.target.archived },
          { requestId: pending.requestId },
        )
      }
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
