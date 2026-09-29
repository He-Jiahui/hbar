import { CommandError, createCommandClient, defineCommand, type CommandRegistry } from '@hbar/commands'
import type { ActiveOperationsPage } from '@hbar/contracts/commands/run'
import { activeOperationsPageSchema, runCommands } from '@hbar/contracts/commands/run'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import { isSessionToolVisible } from './session-tool-visibility'
import type {
  ActivityWorkspaceEntryState,
  ActivityWorkspaceState,
  NavigationState,
  PanelSurface,
  PresentationState,
  RunCommandPort,
  SurfaceState,
} from './types'

export const ACTIVITY_WORKSPACE_PAGE_SIZE = 100
export const ACTIVITY_WORKSPACE_MAX_ITEMS = 1_000

type Cursor = ActiveOperationsPage['nextCursor']
type ActivityItem = ActiveOperationsPage['items'][number]

const instanceInput = z.strictObject({ instanceId: z.string().min(1).max(160) })
const commandResult = z.strictObject({
  instanceId: z.string().min(1).max(160),
  sessionId: z.string().min(1).max(160),
  loaded: z.number().int().nonnegative(),
  totalActive: z.number().int().nonnegative(),
})
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.app-runtime',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'session' as const,
  category: 'run.approval',
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as 'api'[],
  cancelMode: 'cooperative' as const,
  maxConcurrent: 8,
})

export const activityWorkspaceCommands = {
  'activityWorkspace.refresh': defineCommand(metadata('activityWorkspace.refresh'), instanceInput, commandResult),
  'activityWorkspace.loadMore': defineCommand(metadata('activityWorkspace.loadMore'), instanceInput, commandResult),
}

interface RequestTarget {
  readonly instanceId: string
  readonly sessionId: string
  readonly workspaceId: string
}

interface ActivityReadRequest {
  readonly controller: AbortController
  readonly target: RequestTarget
  readonly cursor: Cursor
  readonly previous: Readonly<ActivityWorkspaceEntryState> | null
}

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function emptyEntry(target: RequestTarget, status: ActivityWorkspaceEntryState['status']): ActivityWorkspaceEntryState {
  return {
    instanceId: target.instanceId,
    sessionId: target.sessionId,
    status,
    items: [],
    totalActive: 0,
    nextCursor: null,
    sessionSeq: null,
    limitReached: false,
    error: null,
  }
}

function sameCursor(left: Cursor, right: Cursor): boolean {
  return left?.afterOperationId === right?.afterOperationId && left?.sessionSeq === right?.sessionSeq
}

function assertPanelTarget(
  instanceId: string,
  surfaces: StateReader<SurfaceState>,
  presentation: StateReader<PresentationState>,
  navigation: StateReader<NavigationState>,
): RequestTarget {
  const panel: Readonly<PanelSurface> | undefined = surfaces.getSnapshot().panels[instanceId]
  const selected = navigation.getSnapshot()
  if (
    !panel ||
    panel.instanceId !== instanceId ||
    panel.panelId !== 'activity' ||
    panel.sessionTool !== true ||
    !panel.sessionId ||
    !panel.workspaceId ||
    !isSessionToolVisible(panel, presentation.getSnapshot()) ||
    selected.status !== 'idle' ||
    selected.sessionId !== panel.sessionId ||
    selected.workspaceId !== panel.workspaceId
  )
    throw new CommandError('STALE_TARGET', 'Activity panel is not the selected session tool')

  return { instanceId, sessionId: panel.sessionId, workspaceId: panel.workspaceId }
}

function validatePage(
  page: ActiveOperationsPage,
  target: RequestTarget,
  cursor: Cursor,
  previous: Readonly<ActivityWorkspaceEntryState> | null,
): readonly Readonly<ActivityItem>[] {
  if (page.sessionId !== target.sessionId)
    throw new CommandError('INVALID_OUTPUT', 'Activity page belongs to a different session')
  if (page.items.length > ACTIVITY_WORKSPACE_PAGE_SIZE)
    throw new CommandError('INVALID_OUTPUT', 'Activity page exceeds its requested limit')

  if (cursor && page.sessionSeq !== cursor.sessionSeq)
    throw new CommandError('ACTIVITY_CHANGED', 'Activity changed between pages')
  if (previous && (previous.sessionSeq !== page.sessionSeq || previous.totalActive !== page.totalActive))
    throw new CommandError('ACTIVITY_CHANGED', 'Activity changed between pages')

  const priorItems = previous?.items ?? []
  const ids = new Set(priorItems.map((item) => item.operationId))
  for (const item of page.items) {
    if (ids.has(item.operationId)) throw new CommandError('INVALID_OUTPUT', 'Activity page repeats an operation')
    ids.add(item.operationId)
  }

  const loaded = priorItems.length + page.items.length
  if (loaded > page.totalActive) throw new CommandError('INVALID_OUTPUT', 'Activity page exceeds its reported total')

  if (page.nextCursor) {
    const lastItem = page.items.at(-1)
    if (
      !lastItem ||
      page.nextCursor.sessionSeq !== page.sessionSeq ||
      page.nextCursor.afterOperationId !== lastItem.operationId ||
      loaded >= page.totalActive
    )
      throw new CommandError('INVALID_OUTPUT', 'Activity page returned an invalid continuation cursor')
  } else if (loaded !== page.totalActive) {
    throw new CommandError('INVALID_OUTPUT', 'Activity page does not cover its reported total')
  }

  return [...priorItems, ...page.items]
}

/** Reads only Host-owned operations for the visible, session-owned Activity panel. */
export function createActivityWorkspace(
  local: CommandRegistry,
  run: RunCommandPort | undefined,
  surfaces: StateReader<SurfaceState>,
  presentation: StateReader<PresentationState>,
  navigation: StateReader<NavigationState>,
  onSubscriberError: (reason: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<ActivityWorkspaceState>({ entries: {} }, onSubscriberError)
  const client = run ? createCommandClient(runCommands, run) : null
  const requests = new Map<string, ActivityReadRequest>()
  const ownedPanels = new Set<string>()
  const suspendedPanels = new Set<string>()
  let disposed = false

  function replace(entry: ActivityWorkspaceEntryState) {
    const entries = { ...state.reader.getSnapshot().entries, [entry.instanceId]: entry }
    state.replace({ entries })
  }

  function remove(instanceId: string) {
    const entries = { ...state.reader.getSnapshot().entries }
    delete entries[instanceId]
    state.replace({ entries })
  }

  function requestIsCurrent(request: ActivityReadRequest): boolean {
    const { target } = request
    const panel = surfaces.getSnapshot().panels[target.instanceId]
    const selected = navigation.getSnapshot()
    return (
      !disposed &&
      !isDisposed() &&
      requests.get(target.instanceId) === request &&
      panel?.instanceId === target.instanceId &&
      panel.panelId === 'activity' &&
      panel.sessionTool === true &&
      panel.sessionId === target.sessionId &&
      panel.workspaceId === target.workspaceId &&
      isSessionToolVisible(panel, presentation.getSnapshot()) &&
      selected.status === 'idle' &&
      selected.sessionId === target.sessionId &&
      selected.workspaceId === target.workspaceId
    )
  }

  function abortRequest(instanceId: string, reason: CommandError) {
    const request = requests.get(instanceId)
    if (!request) return
    requests.delete(instanceId)
    request.controller.abort(reason)
  }

  async function read(
    instanceId: string,
    cursor: Cursor,
    previous: Readonly<ActivityWorkspaceEntryState> | null,
    externalSignal?: AbortSignal,
  ) {
    const target = assertPanelTarget(instanceId, surfaces, presentation, navigation)
    if (requests.has(instanceId)) throw new CommandError('BUSY', 'Activity is already loading')
    if (cursor && (!previous || previous.status !== 'ready' || !sameCursor(previous.nextCursor, cursor)))
      throw new CommandError('ACTIVITY_CHANGED', 'Refresh Activity before loading another page')

    const request: ActivityReadRequest = {
      controller: new AbortController(),
      target,
      cursor,
      previous,
    }
    requests.set(instanceId, request)
    replace(cursor && previous ? { ...previous, status: 'loading', error: null } : emptyEntry(target, 'loading'))

    const { controller } = request
    const abort = () =>
      controller.abort(
        externalSignal?.reason instanceof CommandError
          ? externalSignal.reason
          : new CommandError('CANCELLED', 'Activity read was cancelled'),
      )
    externalSignal?.addEventListener('abort', abort, { once: true })
    if (externalSignal?.aborted) abort()

    let removeAbortListener: () => void = () => undefined
    const interrupted = new Promise<never>((_resolve, reject) => {
      const onAbort = () =>
        reject(
          controller.signal.reason instanceof CommandError
            ? controller.signal.reason
            : new CommandError('QUERY_SUPERSEDED', 'Activity target changed'),
        )
      controller.signal.addEventListener('abort', onAbort, { once: true })
      removeAbortListener = () => controller.signal.removeEventListener('abort', onAbort)
      if (controller.signal.aborted) onAbort()
    })
    const timeout = setTimeout(() => controller.abort(new CommandError('TIMEOUT', 'Activity read timed out')), 12_000)

    try {
      if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Activity reads are unavailable')
      const rawPage = await Promise.race([
        client.execute(
          'session.activeOperations',
          { sessionId: target.sessionId, ...(cursor ? { cursor } : {}), limit: ACTIVITY_WORKSPACE_PAGE_SIZE },
          { signal: controller.signal },
        ),
        interrupted,
      ])
      if (!requestIsCurrent(request)) throw new CommandError('QUERY_SUPERSEDED', 'Activity target changed')

      const parsed = activeOperationsPageSchema.safeParse(rawPage)
      if (!parsed.success) throw new CommandError('INVALID_OUTPUT', 'Activity query returned invalid data')
      const items = validatePage(parsed.data, target, cursor, previous)
      if (!requestIsCurrent(request)) throw new CommandError('QUERY_SUPERSEDED', 'Activity target changed')

      const limitReached = items.length >= ACTIVITY_WORKSPACE_MAX_ITEMS && parsed.data.nextCursor !== null
      const entry: ActivityWorkspaceEntryState = {
        instanceId,
        sessionId: target.sessionId,
        status: 'ready',
        items,
        totalActive: parsed.data.totalActive,
        nextCursor: parsed.data.nextCursor,
        sessionSeq: parsed.data.sessionSeq,
        limitReached,
        error: null,
      }
      replace(entry)
      return {
        instanceId,
        sessionId: target.sessionId,
        loaded: parsed.data.items.length,
        totalActive: parsed.data.totalActive,
      }
    } catch (reason) {
      if (requestIsCurrent(request)) {
        const code = errorCode(reason)
        replace({ ...emptyEntry(target, 'error'), error: code })
      }
      throw reason
    } finally {
      clearTimeout(timeout)
      removeAbortListener()
      externalSignal?.removeEventListener('abort', abort)
      if (requests.get(instanceId) === request) requests.delete(instanceId)
    }
  }

  const offSurfaces = surfaces.subscribe(synchronizeVisibility)
  const offPresentation = presentation.subscribe(synchronizeVisibility)
  const offNavigation = navigation.subscribe(synchronizeVisibility)

  function synchronizeVisibility() {
    const current = surfaces.getSnapshot().panels
    for (const [instanceId, panel] of Object.entries(current)) {
      if (panel.sessionTool && panel.panelId === 'activity') ownedPanels.add(instanceId)
    }

    for (const instanceId of [...ownedPanels]) {
      const panel = current[instanceId]
      if (!panel || !panel.sessionTool || panel.panelId !== 'activity' || !panel.sessionId) {
        abortRequest(instanceId, new CommandError('QUERY_SUPERSEDED', 'Activity panel was closed'))
        ownedPanels.delete(instanceId)
        suspendedPanels.delete(instanceId)
        remove(instanceId)
        continue
      }

      const selected = navigation.getSnapshot()
      const visible =
        isSessionToolVisible(panel, presentation.getSnapshot()) &&
        selected.status === 'idle' &&
        selected.workspaceId === panel.workspaceId &&
        selected.sessionId === panel.sessionId
      if (!visible) {
        if (!suspendedPanels.has(instanceId)) {
          suspendedPanels.add(instanceId)
          abortRequest(instanceId, new CommandError('QUERY_SUPERSEDED', 'Activity panel was hidden'))
          remove(instanceId)
        }
      } else {
        suspendedPanels.delete(instanceId)
      }
    }
  }

  const refresh = async ({ instanceId }: { instanceId: string }, execution: { signal?: AbortSignal }) =>
    read(instanceId, null, null, execution.signal)

  const loadMore = async ({ instanceId }: { instanceId: string }, execution: { signal?: AbortSignal }) => {
    const target = assertPanelTarget(instanceId, surfaces, presentation, navigation)
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry || entry.sessionId !== target.sessionId || entry.status !== 'ready' || !entry.nextCursor)
      throw new CommandError('NOT_READY', 'Refresh Activity before loading another page')
    if (entry.limitReached)
      throw new CommandError('CAPACITY_EXCEEDED', 'Activity reached the maximum number of loaded operations')
    return read(instanceId, entry.nextCursor, entry, execution.signal)
  }

  local.register(activityWorkspaceCommands['activityWorkspace.refresh'], refresh)
  local.register(activityWorkspaceCommands['activityWorkspace.loadMore'], loadMore)
  synchronizeVisibility()

  return {
    reader: state.reader,
    dispose() {
      disposed = true
      offSurfaces()
      offPresentation()
      offNavigation()
      for (const instanceId of requests.keys())
        abortRequest(instanceId, new CommandError('DISPOSED', 'Activity workspace was disposed'))
      requests.clear()
      ownedPanels.clear()
      suspendedPanels.clear()
      state.dispose()
    },
  }
}
