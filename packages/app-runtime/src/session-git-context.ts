import { z } from 'zod'
import { CommandError, defineCommand, type CommandExecutor, type CommandRegistry } from '@hbar/commands'
import { gitInfoSchema, idSchema } from '@hbar/contracts'
import { createState, type StateReader } from './state'
import type { DirectoryState, NavigationState } from './types'

export interface SessionGitContextState {
  readonly sessionId: string | null
  readonly workspaceId: string | null
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly branch: string | null
  readonly error: string | null
}

const targetSchema = z.strictObject({ sessionId: idSchema, workspaceId: idSchema })
const metadata = (id: string, kind: 'query' | 'command') => ({
  id,
  version: 1,
  owner: 'hbar.app-runtime',
  kind,
  execution: 'client' as const,
  stateEffect: kind === 'query' ? ('none' as const) : ('application' as const),
  scope: 'session' as const,
  category: 'monitoring.git',
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('cli' | 'tui' | 'api' | 'palette')[],
  visibility: 'internal' as const,
  cancelMode: 'cooperative' as const,
  // Callers can join an in-flight read, and a superseded Host read may still be settling.
  maxConcurrent: 8,
})
export const sessionGitContextCommands = {
  'sessionGitContext.refresh': defineCommand(
    metadata('sessionGitContext.refresh', 'query'),
    targetSchema,
    targetSchema,
  ),
  'sessionGitContext.invalidate': defineCommand(
    metadata('sessionGitContext.invalidate', 'command'),
    targetSchema,
    targetSchema,
  ),
}

function code(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
}

export function createSessionGitContext(
  local: CommandRegistry,
  git: CommandExecutor | undefined,
  navigation: StateReader<NavigationState>,
  directory: StateReader<DirectoryState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const current = navigation.getSnapshot()
  const state = createState<SessionGitContextState>(
    { sessionId: current.sessionId, workspaceId: current.workspaceId, status: 'idle', branch: null, error: null },
    onSubscriberError,
  )
  let generation = 0
  let path = current.workspaceId ? (directory.getSnapshot().workspaces[current.workspaceId]?.path ?? null) : null
  let pending: { readonly controller: AbortController; readonly promise: Promise<void> } | null = null
  const release = (controller: AbortController) => {
    if (pending?.controller === controller) pending = null
  }
  const reset = (sessionId: string | null, workspaceId: string | null, nextPath: string | null) => {
    generation++
    pending?.controller.abort()
    pending = null
    path = nextPath
    state.replace({ sessionId, workspaceId, status: 'idle', branch: null, error: null })
  }
  const sync = () => {
    const selected = navigation.getSnapshot()
    const nextPath = selected.workspaceId
      ? (directory.getSnapshot().workspaces[selected.workspaceId]?.path ?? null)
      : null
    const projected = state.reader.getSnapshot()
    if (
      selected.sessionId !== projected.sessionId ||
      selected.workspaceId !== projected.workspaceId ||
      path !== nextPath
    )
      reset(selected.sessionId, selected.workspaceId, nextPath)
  }
  const stopNavigation = navigation.subscribe(sync)
  const stopDirectory = directory.subscribe(sync)

  local.register(sessionGitContextCommands['sessionGitContext.invalidate'], (input) => {
    sync()
    const current = state.reader.getSnapshot()
    if (current.sessionId === input.sessionId && current.workspaceId === input.workspaceId)
      reset(input.sessionId, input.workspaceId, path)
    return input
  })

  local.register(sessionGitContextCommands['sessionGitContext.refresh'], async (input, execution) => {
    sync()
    const selected = navigation.getSnapshot()
    const session = directory.getSnapshot().sessions[input.sessionId]
    if (
      selected.sessionId !== input.sessionId ||
      selected.workspaceId !== input.workspaceId ||
      (session && session.workspaceId !== input.workspaceId) ||
      !path
    )
      throw new CommandError('STALE_TARGET', 'Git context no longer belongs to this session')
    if (execution.signal.aborted) throw new CommandError('CANCELLED', 'Git context refresh was cancelled')
    if (pending) {
      await pending.promise
      return input
    }
    const controller = new AbortController()
    const intent = ++generation
    const workspacePath = path
    const selectedStillCurrent = () =>
      !isDisposed() &&
      !controller.signal.aborted &&
      intent === generation &&
      navigation.getSnapshot().sessionId === input.sessionId &&
      navigation.getSnapshot().workspaceId === input.workspaceId &&
      directory.getSnapshot().workspaces[input.workspaceId]?.path === workspacePath
    const abort = () => {
      if (intent !== generation) return
      generation++
      controller.abort()
      release(controller)
      state.replace({ ...state.reader.getSnapshot(), status: 'error', branch: null, error: 'CANCELLED' })
    }
    execution.signal.addEventListener('abort', abort, { once: true })
    state.replace({
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      status: 'loading',
      branch: null,
      error: null,
    })
    const promise = (async () => {
      try {
        if (!git) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Git context is unavailable')
        const response = gitInfoSchema.safeParse(
          await git.execute('git.info', { cwd: workspacePath }, { signal: controller.signal }),
        )
        if (!response.success) throw new CommandError('INVALID_OUTPUT', 'Git context response is invalid')
        if (selectedStillCurrent())
          state.replace({ ...state.reader.getSnapshot(), status: 'ready', branch: response.data.branch, error: null })
      } catch (error) {
        const failure = error instanceof CommandError ? error : new CommandError(code(error), 'Git context read failed')
        if (selectedStillCurrent())
          state.replace({ ...state.reader.getSnapshot(), status: 'error', branch: null, error: failure.code })
        throw failure
      } finally {
        execution.signal.removeEventListener('abort', abort)
        release(controller)
      }
    })()
    pending = { controller, promise }
    await promise
    return input
  })

  return {
    reader: state.reader,
    dispose() {
      reset(null, null, null)
      stopNavigation()
      stopDirectory()
      state.dispose()
    },
  }
}
