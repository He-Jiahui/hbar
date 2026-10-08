import { CommandError, createCommandClient, defineCommand, type CommandRegistry } from '@hbar/commands'
import {
  runBoardCommands as hostCommands,
  runBoardPageSchema,
  type RunBoardItem,
  type RunBoardPage,
} from '@hbar/contracts/commands/run-board'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import type { NavigationState, SurfaceState } from './types'

export const RUN_BOARD_PAGE_SIZE = 100
export const RUN_BOARD_MAX_ITEMS = 400
export type RunBoardColumn = RunBoardItem['run']['status']

export interface RunBoardColumns {
  readonly queued: readonly Readonly<RunBoardItem>[]
  readonly running: readonly Readonly<RunBoardItem>[]
  readonly waiting_approval: readonly Readonly<RunBoardItem>[]
  readonly guided: readonly Readonly<RunBoardItem>[]
  readonly completed: readonly Readonly<RunBoardItem>[]
  readonly cancelled: readonly Readonly<RunBoardItem>[]
  readonly failed: readonly Readonly<RunBoardItem>[]
  readonly interrupted: readonly Readonly<RunBoardItem>[]
}

export interface RunBoardState {
  readonly workspaceId: string | null
  readonly sessionId: string | null
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly columns: Readonly<RunBoardColumns>
  readonly items: readonly Readonly<RunBoardItem>[]
  readonly revision: number | null
  readonly workspaceName: string | null
  readonly sessionTitle: string | null
  readonly nextCursor: Readonly<RunBoardPage['nextCursor']>
  readonly error: string | null
}

const inputSchema = z.strictObject({ instanceId: z.string().min(1).max(160) })
const loadMoreInputSchema = z.strictObject({ instanceId: z.string().min(1).max(160) })
const resultSchema = z.strictObject({
  workspaceId: z.string().min(1).max(160),
  sessionId: z.string().min(1).max(160).nullable(),
  loaded: z.number().int().nonnegative(),
})
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.app-runtime',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'workspace' as const,
  category: 'monitoring.runs',
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as 'api'[],
})
export const runBoardCommands = {
  'runBoard.refresh': defineCommand(metadata('runBoard.refresh'), inputSchema, resultSchema),
  'runBoard.loadMore': defineCommand(metadata('runBoard.loadMore'), loadMoreInputSchema, resultSchema),
}

const emptyColumns = (): Record<RunBoardColumn, RunBoardItem[]> => ({
  queued: [],
  running: [],
  waiting_approval: [],
  guided: [],
  completed: [],
  cancelled: [],
  failed: [],
  interrupted: [],
})
function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}
function columns(items: readonly RunBoardItem[]): RunBoardColumns {
  const grouped = emptyColumns()
  for (const item of items) grouped[item.run.status].push(item)
  return grouped
}
function validatePageTarget(
  page: RunBoardPage,
  target: { readonly workspaceId: string; readonly sessionId: string | null },
): void {
  const ids = new Set(page.items.map((item) => item.run.id))
  if (
    page.workspaceId !== target.workspaceId ||
    page.sessionId !== target.sessionId ||
    ids.size !== page.items.length ||
    (target.sessionId !== null && page.items.some((item) => item.run.sessionId !== target.sessionId))
  )
    throw new CommandError('INVALID_OUTPUT', 'Run board page does not identify unique original target records')
}

/** Host-owned workspace/session run projection used by Kanban and compact boards. */
export function createRunBoard(
  local: CommandRegistry,
  run: import('@hbar/commands').CommandExecutor | undefined,
  navigation: StateReader<NavigationState>,
  surfaces: StateReader<SurfaceState>,
  onSubscriberError: (reason: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<RunBoardState>(
    {
      workspaceId: null,
      sessionId: null,
      status: 'idle',
      columns: emptyColumns(),
      items: [],
      revision: null,
      workspaceName: null,
      sessionTitle: null,
      nextCursor: null,
      error: null,
    },
    onSubscriberError,
  )
  const client = run ? createCommandClient(hostCommands, run) : null
  let disposed = false
  let request: {
    workspaceId: string
    sessionId: string | null
    generation: number
    controller: AbortController
    instanceId: string
  } | null = null
  let generation = 0
  const resolveTarget = (instanceId: string) => {
    const panel = surfaces.getSnapshot().panels[instanceId]
    if (!panel || panel.panelId !== 'run-board')
      throw new CommandError('STALE_TARGET', 'Run board panel is no longer available')
    const selected = navigation.getSnapshot()
    if (selected.status !== 'idle') throw new CommandError('STALE_TARGET', 'Run board navigation is not settled')
    return {
      workspaceId: panel.binding === 'pinned' ? panel.workspaceId : selected.workspaceId,
      sessionId: panel.binding === 'pinned' ? panel.sessionId : selected.sessionId,
    }
  }
  const current = (candidate: typeof request & object) => {
    const target = (() => {
      try {
        return resolveTarget(candidate.instanceId)
      } catch {
        return null
      }
    })()
    return (
      !disposed &&
      !isDisposed() &&
      request?.generation === candidate.generation &&
      target?.workspaceId === candidate.workspaceId &&
      target?.sessionId === candidate.sessionId
    )
  }
  const invalidate = () => {
    const active = request
    if (!active) return
    if (current(active)) return
    request = null
    active.controller.abort(new CommandError('QUERY_SUPERSEDED', 'Run board target changed'))
    state.replace({ ...state.reader.getSnapshot(), status: 'idle', error: null })
  }
  const unsubscribeNavigation = navigation.subscribe(invalidate)
  const unsubscribeSurfaces = surfaces.subscribe(invalidate)

  async function refresh({ instanceId }: { instanceId: string }, execution: { signal?: AbortSignal } = {}) {
    const target = resolveTarget(instanceId)
    if (!target.workspaceId) throw new CommandError('STALE_TARGET', 'Run board workspace is not selected')
    if (request) throw new CommandError('BUSY', 'Run board is already loading')
    const controller = new AbortController()
    const token = {
      workspaceId: target.workspaceId,
      sessionId: target.sessionId,
      instanceId,
      generation: ++generation,
      controller,
    }
    request = token
    const previous = state.reader.getSnapshot()
    state.replace({
      ...previous,
      workspaceId: token.workspaceId,
      sessionId: token.sessionId,
      status: 'loading',
      columns:
        previous.workspaceId === token.workspaceId && previous.sessionId === token.sessionId
          ? previous.columns
          : emptyColumns(),
      items: previous.workspaceId === token.workspaceId && previous.sessionId === token.sessionId ? previous.items : [],
      error: null,
    })
    const abort = () =>
      controller.abort(execution.signal?.reason ?? new CommandError('CANCELLED', 'Run board read cancelled'))
    execution.signal?.addEventListener('abort', abort, { once: true })
    const interrupted = new Promise<never>((_resolve, reject) =>
      controller.signal.addEventListener(
        'abort',
        () =>
          reject(
            controller.signal.reason instanceof CommandError
              ? controller.signal.reason
              : new CommandError('QUERY_SUPERSEDED', 'Run board read interrupted'),
          ),
        { once: true },
      ),
    )
    const timer = setTimeout(() => controller.abort(new CommandError('TIMEOUT', 'Run board read timed out')), 12_000)
    try {
      if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Run board reads are unavailable')
      const raw = await Promise.race([
        client.execute(
          'run.board.list',
          {
            workspaceId: token.workspaceId,
            ...(token.sessionId ? { sessionId: token.sessionId } : {}),
            limit: RUN_BOARD_PAGE_SIZE,
          },
          { signal: controller.signal },
        ),
        interrupted,
      ])
      const page = runBoardPageSchema.parse(raw)
      validatePageTarget(page, token)
      if (
        page.workspaceId !== token.workspaceId ||
        page.sessionId !== token.sessionId ||
        page.items.length > RUN_BOARD_MAX_ITEMS ||
        !current(token)
      )
        throw new CommandError('QUERY_SUPERSEDED', 'Run board target changed')
      state.replace({
        workspaceId: token.workspaceId,
        sessionId: token.sessionId,
        status: 'ready',
        columns: columns(page.items),
        items: page.items,
        revision: page.revision,
        workspaceName: page.workspaceName,
        sessionTitle: page.sessionTitle,
        nextCursor: page.items.length >= RUN_BOARD_MAX_ITEMS ? null : page.nextCursor,
        error: null,
      })
      return { workspaceId: token.workspaceId, sessionId: token.sessionId, loaded: page.items.length }
    } catch (reason) {
      if (current(token)) state.replace({ ...state.reader.getSnapshot(), status: 'error', error: errorCode(reason) })
      throw reason
    } finally {
      clearTimeout(timer)
      execution.signal?.removeEventListener('abort', abort)
      if (request === token) request = null
    }
  }
  async function loadMore({ instanceId }: { instanceId: string }, execution: { signal?: AbortSignal } = {}) {
    const target = resolveTarget(instanceId)
    const previous = state.reader.getSnapshot()
    if (!previous.nextCursor)
      return { workspaceId: previous.workspaceId ?? '', sessionId: previous.sessionId, loaded: 0 }
    if (request || previous.status === 'loading' || !previous.workspaceId)
      throw new CommandError('BUSY', 'Run board is already loading')
    if (target.workspaceId !== previous.workspaceId || target.sessionId !== previous.sessionId)
      throw new CommandError('STALE_TARGET', 'Run board target changed')
    const controller = new AbortController()
    const token = {
      workspaceId: previous.workspaceId,
      sessionId: previous.sessionId,
      generation: ++generation,
      controller,
      instanceId,
    }
    request = token
    state.replace({ ...previous, status: 'loading', error: null })
    const abort = () =>
      controller.abort(execution.signal?.reason ?? new CommandError('CANCELLED', 'Run board read cancelled'))
    execution.signal?.addEventListener('abort', abort, { once: true })
    const interrupted = new Promise<never>((_resolve, reject) =>
      controller.signal.addEventListener(
        'abort',
        () =>
          reject(
            controller.signal.reason instanceof CommandError
              ? controller.signal.reason
              : new CommandError('QUERY_SUPERSEDED', 'Run board read interrupted'),
          ),
        { once: true },
      ),
    )
    const timer = setTimeout(() => controller.abort(new CommandError('TIMEOUT', 'Run board read timed out')), 12_000)
    try {
      if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Run board reads are unavailable')
      const raw = await Promise.race([
        client.execute(
          'run.board.list',
          {
            workspaceId: token.workspaceId,
            ...(token.sessionId ? { sessionId: token.sessionId } : {}),
            cursor: previous.nextCursor,
            limit: RUN_BOARD_PAGE_SIZE,
          },
          { signal: controller.signal },
        ),
        interrupted,
      ])
      const page = runBoardPageSchema.parse(raw)
      validatePageTarget(page, token)
      if (!current(token) || page.revision !== previous.revision)
        throw new CommandError('STALE_CURSOR', 'Run board changed; refresh required')
      const merged = [...previous.items, ...page.items]
        .filter((item, index, all) => all.findIndex((candidate) => candidate.run.id === item.run.id) === index)
        .slice(0, RUN_BOARD_MAX_ITEMS)
      state.replace({
        ...previous,
        status: 'ready',
        items: merged,
        columns: columns(merged),
        nextCursor: merged.length >= RUN_BOARD_MAX_ITEMS ? null : page.nextCursor,
      })
      return { workspaceId: token.workspaceId, sessionId: token.sessionId, loaded: page.items.length }
    } catch (reason) {
      if (current(token)) state.replace({ ...previous, status: 'error', error: errorCode(reason) })
      throw reason
    } finally {
      clearTimeout(timer)
      execution.signal?.removeEventListener('abort', abort)
      if (request === token) request = null
    }
  }
  local.register(runBoardCommands['runBoard.refresh'], refresh)
  local.register(runBoardCommands['runBoard.loadMore'], loadMore)
  return {
    reader: state.reader,
    refresh,
    loadMore,
    dispose() {
      disposed = true
      unsubscribeNavigation()
      unsubscribeSurfaces()
      request?.controller.abort(new CommandError('DISPOSED', 'Run board was disposed'))
      request = null
      state.dispose()
    },
  }
}
