import { CommandError, defineCommand, type CommandRegistry } from '@hbar/commands'
import { idSchema } from '@hbar/contracts'
import {
  sessionLaunchBranchesInputSchema,
  sessionLaunchBranchesPageSchema,
  type SessionLaunchBranchesPage,
  type SessionLaunchBranchesReader,
} from '@hbar/contracts/commands/session-launch-branches'
import { z } from 'zod'
import { createState } from './state'

export const PRE_SESSION_LAUNCH_BRANCHES_PAGE_SIZE = 25
const READ_TIMEOUT_MS = 15_000

export interface PreSessionLaunchBranchesState {
  readonly workspaceId: string | null
  readonly search: string
  readonly status: 'idle' | 'loading' | 'ready' | 'failed'
  readonly page: SessionLaunchBranchesPage | null
  readonly error: string | null
}

const stateSchema = z.strictObject({
  workspaceId: idSchema.nullable(),
  search: z.string().max(256),
  status: z.enum(['idle', 'loading', 'ready', 'failed']),
  page: sessionLaunchBranchesPageSchema.nullable(),
  error: z.string().max(128).nullable(),
})
const loadInputSchema = z.strictObject({
  workspaceId: idSchema,
  search: z.string().max(256).default(''),
  cursor: z.string().min(1).max(2_048).optional(),
})
const metadata = {
  id: 'preSessionLaunchBranches.load',
  version: 1,
  owner: 'hbar.pre-session-launch-branches',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'workspace' as const,
  category: 'workspace.session-launch-target',
  titleKey: 'commands.preSessionLaunchBranches.load.title',
  descriptionKey: 'commands.preSessionLaunchBranches.load.description',
  visibility: 'internal' as const,
  surfaces: ['api'] as ('api' | 'cli' | 'palette' | 'tui')[],
  cancelMode: 'cooperative' as const,
  maxConcurrent: 8,
  timeoutMs: READ_TIMEOUT_MS,
}

export const preSessionLaunchBranchesCommands = {
  'preSessionLaunchBranches.load': defineCommand(metadata, loadInputSchema, stateSchema),
}

interface BranchReadRequest {
  readonly generation: number
  readonly key: string
  readonly input: z.output<typeof sessionLaunchBranchesInputSchema>
  readonly controller: AbortController
  readonly removeExternalAbort: () => void
  finished: boolean
}

interface ActiveBranchRead {
  readonly request: BranchReadRequest
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string')
    return error.code.length <= 128 ? error.code : 'EXECUTION_FAILED'
  return 'EXECUTION_FAILED'
}

function asCommandError(error: unknown): CommandError {
  if (error instanceof CommandError) return error
  return new CommandError(errorCode(error), 'Workspace branch discovery failed')
}

/** One workspace-scoped page projection. Cursors replace the page; they are never accumulated here. */
export function createPreSessionLaunchBranches(
  local: CommandRegistry,
  reader: SessionLaunchBranchesReader | undefined,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<PreSessionLaunchBranchesState>(
    { workspaceId: null, search: '', status: 'idle', page: null, error: null },
    onSubscriberError,
  )
  let disposed = false
  let generation = 0
  let active: ActiveBranchRead | null = null
  let queued: BranchReadRequest | null = null

  const isCurrent = (request: BranchReadRequest): boolean =>
    !disposed && !isDisposed() && request.generation === generation

  const releaseExternalAbort = (request: BranchReadRequest): void => request.removeExternalAbort()

  const markFailure = (request: BranchReadRequest, error: unknown): CommandError => {
    const failure = asCommandError(error)
    if (!request.finished) {
      request.finished = true
      if (isCurrent(request)) {
        state.replace({
          ...state.reader.getSnapshot(),
          status: 'failed',
          error: failure.code,
        })
      }
    }
    return failure
  }

  const makeRequest = (
    input: z.output<typeof loadInputSchema>,
    readInput: z.output<typeof sessionLaunchBranchesInputSchema>,
    executionSignal: AbortSignal,
  ): BranchReadRequest => {
    const controller = new AbortController()
    const abort = () => controller.abort()
    if (!executionSignal.aborted) executionSignal.addEventListener('abort', abort, { once: true })
    else controller.abort()
    return {
      generation: ++generation,
      key: JSON.stringify([input.workspaceId, input.search, input.cursor ?? null]),
      input: readInput,
      controller,
      removeExternalAbort: () => executionSignal.removeEventListener('abort', abort),
      finished: false,
    }
  }

  const start = (request: BranchReadRequest): Promise<PreSessionLaunchBranchesState> => {
    if (disposed || isDisposed()) {
      releaseExternalAbort(request)
      return Promise.reject(new CommandError('DISPOSED', 'Branch discovery runtime was disposed'))
    }
    if (request.controller.signal.aborted) {
      const failure = markFailure(request, new CommandError('CANCELLED', 'Branch discovery was cancelled'))
      releaseExternalAbort(request)
      return Promise.reject(failure)
    }
    if (!reader) {
      const failure = markFailure(
        request,
        new CommandError('CAPABILITY_UNAVAILABLE', 'Workspace branch discovery is unavailable'),
      )
      releaseExternalAbort(request)
      return Promise.reject(failure)
    }

    const task = Promise.resolve()
      .then(async () => {
        if (request.controller.signal.aborted)
          throw new CommandError('CANCELLED', 'Branch discovery was cancelled before dispatch')
        const raw = await reader.list(request.input, { signal: request.controller.signal })
        const parsed = sessionLaunchBranchesPageSchema.safeParse(raw)
        if (!parsed.success || parsed.data.workspaceId !== request.input.workspaceId)
          throw new CommandError('INVALID_OUTPUT', 'Workspace branch page does not match its request')
        if (parsed.data.branches.length > PRE_SESSION_LAUNCH_BRANCHES_PAGE_SIZE)
          throw new CommandError('INVALID_OUTPUT', 'Workspace branch page exceeds its requested limit')
        if (!request.finished) {
          request.finished = true
          if (isCurrent(request))
            state.replace({
              workspaceId: request.input.workspaceId,
              search: request.input.search,
              status: 'ready',
              page: parsed.data,
              error: null,
            })
        }
      })
      .catch((error: unknown) => {
        throw markFailure(request, error)
      })

    const owner: ActiveBranchRead = { request }
    active = owner
    const release = () => {
      releaseExternalAbort(request)
      if (active !== owner) return
      active = null
      const next = queued
      queued = null
      if (next) void start(next).catch(() => {})
    }
    void task.then(release, release)

    return new Promise<PreSessionLaunchBranchesState>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | undefined
      let removeAbort = () => {}
      let timedOut = false
      const cleanup = () => {
        if (timeout !== undefined) clearTimeout(timeout)
        removeAbort()
      }
      const abort = () => {
        if (timedOut) return
        cleanup()
        reject(markFailure(request, new CommandError('CANCELLED', 'Branch discovery observation was cancelled')))
      }
      const timer = setTimeout(() => {
        timeout = undefined
        timedOut = true
        request.controller.abort()
        cleanup()
        reject(markFailure(request, new CommandError('TIMEOUT', 'Branch discovery exceeded its deadline')))
      }, READ_TIMEOUT_MS)
      timeout = timer
      request.controller.signal.addEventListener('abort', abort, { once: true })
      removeAbort = () => request.controller.signal.removeEventListener('abort', abort)
      void task.then(
        () => {
          cleanup()
          resolve(state.reader.getSnapshot())
        },
        (error: unknown) => {
          cleanup()
          reject(asCommandError(error))
        },
      )
      if (request.controller.signal.aborted) abort()
    })
  }

  local.register(preSessionLaunchBranchesCommands['preSessionLaunchBranches.load'], async (rawInput, execution) => {
    if (disposed || isDisposed()) throw new CommandError('DISPOSED', 'Branch discovery runtime was disposed')
    const input = loadInputSchema.parse(rawInput)
    if (execution.signal.aborted) throw new CommandError('CANCELLED', 'Branch discovery was cancelled')
    const current = state.reader.getSnapshot()
    if (input.cursor !== undefined) {
      if (
        current.workspaceId !== input.workspaceId ||
        current.search !== input.search ||
        current.status !== 'ready' ||
        current.page?.nextCursor !== input.cursor
      )
        throw new CommandError('STALE_TARGET', 'Branch page cursor no longer belongs to this workspace and search')
    }

    const requestKey = JSON.stringify([input.workspaceId, input.search, input.cursor ?? null])
    if (
      active?.request.key === requestKey &&
      active.request.generation === generation &&
      queued === null &&
      current.status === 'loading'
    )
      return state.reader.getSnapshot()
    if (queued?.key === requestKey && queued.generation === generation && !queued.controller.signal.aborted)
      return state.reader.getSnapshot()

    const parsedInput = sessionLaunchBranchesInputSchema.parse({
      workspaceId: input.workspaceId,
      search: input.search,
      limit: PRE_SESSION_LAUNCH_BRANCHES_PAGE_SIZE,
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    })
    const request = makeRequest(input, parsedInput, execution.signal)
    state.replace({
      workspaceId: input.workspaceId,
      search: input.search,
      status: 'loading',
      page: current.workspaceId === input.workspaceId && current.search === input.search ? current.page : null,
      error: null,
    })
    if (active) {
      active.request.controller.abort()
      if (queued) {
        queued.controller.abort()
        releaseExternalAbort(queued)
      }
      queued = request
      return state.reader.getSnapshot()
    }
    return start(request)
  })

  return {
    reader: state.reader,
    dispose() {
      if (disposed) return
      disposed = true
      generation++
      active?.request.controller.abort()
      if (active) releaseExternalAbort(active.request)
      if (queued) {
        queued.controller.abort()
        releaseExternalAbort(queued)
        queued = null
      }
      state.dispose()
    },
  }
}
