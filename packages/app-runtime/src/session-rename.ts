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

export interface SessionRenameState {
  readonly target: { readonly workspaceId: string; readonly sessionId: string; readonly originalTitle: string } | null
  readonly draft: string
  readonly revision: number
  readonly status: 'idle' | 'editing' | 'submitting' | 'reconciling' | 'failed' | 'unknown' | 'succeeded'
  readonly error: string | null
}

const id = z.string().min(1).max(160)
const target = z.strictObject({ sessionId: id, revision: z.number().int().nonnegative() })
const output = z.strictObject({ revision: z.number().int().nonnegative() })
const metadata = (name: string) => ({
  id: name,
  version: 1,
  owner: 'hbar.session-rename',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'session' as const,
  category: 'workspace.session',
  visibility: 'internal' as const,
  titleKey: `commands.${name}.title`,
  descriptionKey: `commands.${name}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})

export const sessionRenameCommands = {
  'sessionRename.begin': defineCommand(
    metadata('sessionRename.begin'),
    z.strictObject({ workspaceId: id, sessionId: id }),
    output,
  ),
  'sessionRename.edit': defineCommand(
    metadata('sessionRename.edit'),
    target.extend({ title: z.string().max(160) }),
    output,
  ),
  'sessionRename.submit': defineCommand(metadata('sessionRename.submit'), target, output),
  'sessionRename.cancel': defineCommand(metadata('sessionRename.cancel'), target, output),
  'sessionRename.reconcile': defineCommand(metadata('sessionRename.reconcile'), target, output),
}

export interface SessionRenameOptions {
  readonly directory: StateReader<DirectoryState>
  /** Public directory/application commands, including confirmed-fact projection. */
  readonly commands: CommandExecutor
  readonly onSubscriberError: (error: unknown) => void
  readonly isDisposed: () => boolean
}

const code = (error: unknown): string =>
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
  'SESSION_ARCHIVED',
  'ARCHIVED',
  'CAPABILITY_UNAVAILABLE',
  'COMMAND_NOT_FOUND',
  'BUSY',
  'VERSION_CONFLICT',
])

/** One bounded edit intent; confirmed session facts remain exclusively in the directory projection. */
export function createSessionRename(local: CommandRegistry, options: SessionRenameOptions) {
  const state = createState<SessionRenameState>(
    { target: null, draft: '', revision: 0, status: 'idle', error: null },
    options.onSubscriberError,
  )
  const commands = createCommandClient({ ...directoryCommands, ...navigationCommands }, options.commands)
  let disposed = false
  const alive = () => !disposed && !options.isDisposed()
  const current = () => state.reader.getSnapshot()
  const result = () => ({ revision: current().revision })
  const replace = (next: SessionRenameState) => {
    if (alive()) state.replace(next)
  }
  const owned = (input: z.output<typeof target>) => {
    const value = current()
    if (!alive() || !value.target || value.target.sessionId !== input.sessionId || value.revision !== input.revision)
      throw new CommandError('STALE_TARGET', 'Rename input no longer belongs to the original session editor')
    return { ...value, target: value.target }
  }
  const editable = (value: SessionRenameState) => {
    if (value.status !== 'editing' && value.status !== 'failed')
      throw new CommandError('BUSY', 'Resolve the current rename before replacing its intent')
  }
  const sessionMatches = (session: Session | null, value: SessionRenameState) =>
    session !== null && session.id === value.target?.sessionId && session.workspaceId === value.target.workspaceId

  local.register(sessionRenameCommands['sessionRename.begin'], ({ workspaceId, sessionId }) => {
    const prior = current()
    if (!['idle', 'succeeded'].includes(prior.status)) {
      if (prior.target?.sessionId === sessionId && prior.target.workspaceId === workspaceId) return result()
      throw new CommandError('BUSY', 'Finish the original session rename before editing another session')
    }
    const session = options.directory.getSnapshot().sessions[sessionId]
    if (!session || session.workspaceId !== workspaceId || session.archived)
      throw new CommandError('STALE_TARGET', 'This session is no longer available in its original workspace')
    replace({
      target: { workspaceId, sessionId, originalTitle: session.title },
      draft: session.title,
      revision: prior.revision + 1,
      status: 'editing',
      error: null,
    })
    return result()
  })
  local.register(sessionRenameCommands['sessionRename.edit'], (input) => {
    const value = owned(input)
    editable(value)
    replace({ ...value, draft: input.title, status: 'editing', error: null })
    return result()
  })
  local.register(sessionRenameCommands['sessionRename.cancel'], (input) => {
    const value = owned(input)
    editable(value)
    replace({ target: null, draft: '', revision: value.revision + 1, status: 'idle', error: null })
    return result()
  })
  local.register(sessionRenameCommands['sessionRename.submit'], async (input) => {
    const value = owned(input)
    editable(value)
    const title = value.draft.trim()
    if (!title) {
      replace({ ...value, status: 'failed', error: 'TITLE_REQUIRED' })
      throw new CommandError('TITLE_REQUIRED', 'A session title is required')
    }
    replace({ ...value, status: 'submitting', error: null })
    let writeStarted = false
    try {
      const session = await commands.execute('session.get', { sessionId: input.sessionId })
      if (!alive()) return result()
      if (!sessionMatches(session, value) || session?.archived)
        throw new CommandError('STALE_TARGET', 'The original session is missing or archived')
      if (session?.title === title) {
        replace({ ...value, status: 'succeeded', error: null })
        return result()
      }
      if (session?.title !== value.target?.originalTitle)
        throw new CommandError(
          'VERSION_CONFLICT',
          'The session title changed; keep the draft until explicitly cancelled',
        )
      writeStarted = true
      await commands.execute('app.renameSession', {
        sessionId: input.sessionId,
        title,
        expectedTitle: value.target.originalTitle,
      })
      replace({ ...value, status: 'succeeded', error: null })
      return result()
    } catch (error) {
      const errorCode = code(error)
      replace({
        ...value,
        status: writeStarted && !definitiveRejections.has(errorCode) ? 'unknown' : 'failed',
        error: errorCode,
      })
      throw error
    }
  })
  local.register(sessionRenameCommands['sessionRename.reconcile'], async (input) => {
    const value = owned(input)
    if (value.status !== 'unknown') throw new CommandError('INVALID_INPUT', 'No rename result requires reconciliation')
    replace({ ...value, status: 'reconciling', error: null })
    try {
      const session = await commands.execute('session.get', { sessionId: input.sessionId })
      if (sessionMatches(session, value) && session?.title === value.draft.trim())
        replace({ ...value, status: 'succeeded', error: null })
      else replace({ ...value, status: 'unknown', error: 'RESULT_UNKNOWN' })
      return result()
    } catch (error) {
      replace({ ...value, status: 'unknown', error: code(error) })
      throw error
    }
  })
  return {
    reader: state.reader,
    dispose() {
      disposed = true
      state.dispose()
    },
  }
}
