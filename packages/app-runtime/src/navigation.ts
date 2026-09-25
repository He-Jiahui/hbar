import { CommandRegistry, CommandError, type ExecuteOptions } from '@hbar/commands'
import { navigationCommands } from '@hbar/contracts/commands'
import type { createState } from './state'
import type { NavigationState } from './types'
import type { DirectoryQueries } from './directory'
import type { Session, Workspace } from '@hbar/contracts/directory'
const MAX_PENDING_SESSION_CREATIONS = 128
const UNCERTAIN_CREATION_CODES = new Set([
  'RESULT_UNKNOWN',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'EXECUTION_FAILED',
  'TIMEOUT',
  'TIMED_OUT',
  'CANCELLED',
  'NAVIGATION_SUPERSEDED',
  'INVALID_OUTPUT',
])

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
}

export class SessionSelectionError extends CommandError {
  constructor(
    code: string,
    readonly candidates: readonly string[] = [],
  ) {
    super(code, code)
  }
}

export function registerNavigationCommands(
  local: CommandRegistry,
  queries: DirectoryQueries,
  createSession: (workspaceId: string, title: string | undefined, execution: ExecuteOptions) => Promise<Session>,
  renameSession: (sessionId: string, title: string, execution: ExecuteOptions) => Promise<Session>,
  archiveSession: (sessionId: string, archived: boolean, execution: ExecuteOptions) => Promise<Session>,
  openWorkspace: (path: string, execution: ExecuteOptions) => Promise<Workspace>,
  navigation: ReturnType<typeof createState<NavigationState>>,
  isDisposed: () => boolean,
): void {
  let generation = 0
  const pendingSessionCreations = new Map<string, string>()
  async function navigate<Selection extends { workspaceId: string; sessionId: string | null }>(
    operation: (execution: ExecuteOptions) => Promise<Selection>,
    execution: ExecuteOptions,
  ) {
    const current = ++generation
    navigation.replace({ ...navigation.reader.getSnapshot(), status: 'loading', error: null })
    try {
      const selection = await operation(execution)
      if (isDisposed() || execution.signal?.aborted || generation !== current)
        throw new SessionSelectionError('NAVIGATION_SUPERSEDED')
      navigation.replace({
        workspaceId: selection.workspaceId,
        sessionId: selection.sessionId,
        status: 'idle',
        error: null,
      })
      return selection
    } catch (error) {
      if (!isDisposed() && generation === current)
        navigation.replace({
          ...navigation.reader.getSnapshot(),
          status: 'error',
          error: {
            code: error instanceof CommandError ? error.code : 'EXECUTION_FAILED',
            candidates: error instanceof SessionSelectionError ? error.candidates : [],
          },
        })
      throw error
    }
  }
  local.register(navigationCommands['app.createSession'], async (input, context) => {
    const operation = JSON.stringify([input.workspaceId, input.title ?? null])
    let key = context.idempotencyKey ?? pendingSessionCreations.get(operation)
    if (!key) {
      if (pendingSessionCreations.size >= MAX_PENDING_SESSION_CREATIONS)
        throw new CommandError('BUSY', 'Too many unresolved session creations')
      key = crypto.randomUUID()
    }
    pendingSessionCreations.set(operation, key)
    let creationStarted = false
    try {
      const result = await navigate(async (execution) => {
        const workspace = await queries.execute('workspace.get', { workspaceId: input.workspaceId }, execution)
        if (!workspace) throw new SessionSelectionError('WORKSPACE_NOT_FOUND')
        creationStarted = true
        const session = await createSession(input.workspaceId, input.title, {
          ...execution,
          idempotencyKey: key,
        })
        return { workspaceId: workspace.id, sessionId: session.id, session }
      }, context)
      pendingSessionCreations.delete(operation)
      return result.session
    } catch (error) {
      if (!creationStarted || !UNCERTAIN_CREATION_CODES.has(errorCode(error))) pendingSessionCreations.delete(operation)
      throw error
    }
  })
  local.register(navigationCommands['app.renameSession'], (input, context) =>
    renameSession(input.sessionId, input.title, context),
  )
  local.register(navigationCommands['app.archiveSession'], (input, context) =>
    archiveSession(input.sessionId, input.archived, context),
  )
  local.register(navigationCommands['workspace.open'], (input, context) =>
    navigate(async (execution) => {
      const workspace = await openWorkspace(input.path, execution)
      return { workspaceId: workspace.id, sessionId: null, workspace }
    }, context).then(({ workspace }) => workspace),
  )
  local.register(navigationCommands['app.setWorkspace'], (input, context) =>
    navigate(async (execution) => {
      const workspace = await queries.execute('workspace.get', input, execution)
      if (!workspace) throw new SessionSelectionError('WORKSPACE_NOT_FOUND')
      return { workspaceId: workspace.id, sessionId: null }
    }, context),
  )
  local.register(navigationCommands['app.setSession'], (input, context) => {
    const workspaceId = input.workspaceId ?? navigation.reader.getSnapshot().workspaceId
    return navigate(async (execution) => {
      let session =
        input.sessionName !== undefined
          ? null
          : await queries.execute('session.get', { sessionId: input.sessionId ?? input.session ?? '' }, execution)
      if (!session && input.sessionId === undefined) {
        if (!workspaceId) throw new SessionSelectionError('WORKSPACE_REQUIRED')
        const title = input.sessionName ?? input.session ?? ''
        const matches = await queries.execute('session.list', { workspaceId, title, limit: 2 }, execution)
        if (matches.items.length > 1)
          throw new SessionSelectionError(
            'SESSION_AMBIGUOUS',
            matches.items.map((item) => item.id),
          )
        session = matches.items[0] ?? null
        if (!session) {
          const archived = await queries.execute(
            'session.list',
            { workspaceId, title, includeArchived: true, limit: 1 },
            execution,
          )
          if (archived.items.length) throw new SessionSelectionError('SESSION_ARCHIVED')
        }
      }
      if (!session) throw new SessionSelectionError('SESSION_NOT_FOUND')
      if (session.archived) throw new SessionSelectionError('SESSION_ARCHIVED')
      if (workspaceId && session.workspaceId !== workspaceId)
        throw new SessionSelectionError('SESSION_WORKSPACE_MISMATCH')
      const workspace = await queries.execute('workspace.get', { workspaceId: session.workspaceId }, execution)
      if (!workspace) throw new SessionSelectionError('WORKSPACE_NOT_FOUND')
      return { workspaceId: workspace.id, sessionId: session.id }
    }, context)
  })
}
