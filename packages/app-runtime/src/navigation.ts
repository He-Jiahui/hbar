import { CommandRegistry, CommandError, type ExecuteOptions } from '@hbar/commands'
import { navigationCommands } from '@hbar/contracts/commands'
import type { createState } from './state'
import type { NavigationState } from './types'
import type { DirectoryQueries } from './directory'
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
  navigation: ReturnType<typeof createState<NavigationState>>,
  isDisposed: () => boolean,
): void {
  let generation = 0
  async function navigate(
    operation: (execution: ExecuteOptions) => Promise<{ workspaceId: string; sessionId: string | null }>,
    execution: ExecuteOptions,
  ) {
    const current = ++generation
    navigation.replace({ ...navigation.reader.getSnapshot(), status: 'loading', error: null })
    try {
      const selection = await operation(execution)
      if (isDisposed() || execution.signal?.aborted || generation !== current)
        throw new SessionSelectionError('NAVIGATION_SUPERSEDED')
      navigation.replace({ ...selection, status: 'idle', error: null })
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
