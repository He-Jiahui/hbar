import {
  CommandError,
  createCommandClient,
  defineCommand,
  type CommandRegistry,
  type ExecuteOptions,
} from '@hbar/commands'
import { agentCommands, agentRecordSchema, type AgentRecord } from '@hbar/contracts/commands/agents'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import type { DirectoryState, NavigationState, RuntimeOptions } from './types'
import type { WorkspaceTabsState } from './workspace-tabs-runtime'

export const COMPOSER_BACKGROUND_AGENTS_MAX_ITEMS = 128
export const COMPOSER_BACKGROUND_AGENTS_PAGE_SIZE = 100
export const COMPOSER_BACKGROUND_AGENTS_MAX_CONCURRENT_CANCELS = 4
const REQUEST_TIMEOUT_MS = 12_000
const REFRESH_DEBOUNCE_MS = 300
const MAX_ENTRIES = 32

const idSchema = z.string().min(1).max(160)
const targetSchema = z.strictObject({
  sessionId: idSchema,
  workspaceId: idSchema,
  sourceTabInstanceKey: z.string().uuid(),
})
const readStatusSchema = z.enum(['idle', 'loading', 'ready', 'error', 'unknown'])
const actionStatusSchema = z.enum(['idle', 'busy', 'unknown', 'failed', 'requested', 'settled'])
const targetActionSchema = z.strictObject({
  agentId: idSchema,
  status: z.enum(['requested', 'unknown', 'failed', 'settled']),
  error: z.string().nullable(),
})
const actionSchema = z.strictObject({
  status: actionStatusSchema,
  phase: z.enum(['cancel', 'reconcile']).nullable(),
  id: idSchema.nullable(),
  error: z.string().nullable(),
  targets: z.array(targetActionSchema).max(COMPOSER_BACKGROUND_AGENTS_MAX_ITEMS),
})
const entrySchema = z.strictObject({
  sessionId: idSchema,
  workspaceId: idSchema,
  sourceTabInstanceKey: z.string().uuid(),
  items: z.array(agentRecordSchema).max(COMPOSER_BACKGROUND_AGENTS_MAX_ITEMS),
  readStatus: readStatusSchema,
  error: z.string().nullable(),
  action: actionSchema,
})

const metadata = (id: string, kind: 'command' | 'query', stateEffect: 'none' | 'application') => ({
  id,
  version: 1,
  owner: 'hbar.composer-background-agents',
  kind,
  execution: 'client' as const,
  stateEffect,
  scope: 'session' as const,
  category: 'agent.goal.plan',
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'cli' | 'tui' | 'palette')[],
})

export const composerBackgroundAgentsCommands = {
  'composerBackgroundAgents.refresh': defineCommand(
    metadata('composerBackgroundAgents.refresh', 'query', 'none'),
    targetSchema,
    entrySchema,
  ),
  'composerBackgroundAgents.cancel': defineCommand(
    metadata('composerBackgroundAgents.cancel', 'command', 'application'),
    targetSchema.extend({ actionId: idSchema.optional() }),
    actionSchema,
  ),
  'composerBackgroundAgents.reconcile': defineCommand(
    metadata('composerBackgroundAgents.reconcile', 'query', 'none'),
    targetSchema.extend({ actionId: idSchema }),
    actionSchema,
  ),
}

export type ComposerBackgroundAgentsReadStatus = z.output<typeof readStatusSchema>
export type ComposerBackgroundAgentsActionStatus = z.output<typeof actionStatusSchema>
export type ComposerBackgroundAgentTarget = z.output<typeof targetActionSchema>
export type ComposerBackgroundAgentsAction = z.output<typeof actionSchema>
export type ComposerBackgroundAgentsEntry = z.output<typeof entrySchema>
export interface ComposerBackgroundAgentsState {
  readonly entries: Readonly<Record<string, Readonly<ComposerBackgroundAgentsEntry>>>
}

interface Target {
  readonly sessionId: string
  readonly workspaceId: string
  readonly sourceTabInstanceKey: string
}

interface TargetAgent {
  readonly record: Readonly<AgentRecord>
  readonly target: Target
}

// Host AgentRuntime.cancel requires a persisted runId; newly-created records
// (created + null runId) are visible but not cancellable yet.
const ACTIVE_STATUSES = new Set<AgentRecord['status']>(['queued', 'running', 'waiting_approval'])
const TERMINAL_STATUSES = new Set<AgentRecord['status']>(['completed', 'cancelled', 'failed', 'interrupted'])
const UNKNOWN_CODES = new Set([
  'RESULT_UNKNOWN',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'TIMEOUT',
  'TIMED_OUT',
  'CANCELLED',
  'INVALID_OUTPUT',
  'EXECUTION_FAILED',
])

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function initialAction(): ComposerBackgroundAgentsAction {
  return { status: 'idle', phase: null, id: null, error: null, targets: [] }
}

interface ComposerBackgroundAgentsOptions {
  readonly navigation: StateReader<NavigationState>
  readonly tabs: StateReader<WorkspaceTabsState>
  readonly directory: StateReader<DirectoryState>
  readonly onSubscriberError: (reason: unknown) => void
  readonly isDisposed: () => boolean
}

function sameTarget(left: Target, right: Target): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.workspaceId === right.workspaceId &&
    left.sourceTabInstanceKey === right.sourceTabInstanceKey
  )
}

export function createComposerBackgroundAgents(
  local: CommandRegistry,
  runtimeOptions: RuntimeOptions,
  options: ComposerBackgroundAgentsOptions,
) {
  const state = createState<ComposerBackgroundAgentsState>({ entries: {} }, options.onSubscriberError)
  const client = runtimeOptions.agents ? createCommandClient(agentCommands, runtimeOptions.agents) : null
  const requests = new Map<string, { readonly target: Target; readonly controller: AbortController }>()
  const refreshes = new Map<string, object>()
  const actionRequests = new Map<string, { readonly target: Target; readonly controller: AbortController }>()
  const capturedActions = new Map<string, ReadonlyMap<string, Readonly<AgentRecord>>>()
  let disposed = false
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let refreshPending = false

  const requireClient = () => {
    if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Agent commands are unavailable')
    return client
  }

  function selectedTarget(input: Target): Target {
    const navigation = options.navigation.getSnapshot()
    const tabs = options.tabs.getSnapshot()
    const directory = options.directory.getSnapshot()
    const session = directory.sessions[input.sessionId]
    const tab = tabs.items.find((item) => item.id === tabs.activeId)
    if (
      navigation.status !== 'idle' ||
      navigation.sessionId !== input.sessionId ||
      navigation.workspaceId !== input.workspaceId ||
      !session ||
      session.workspaceId !== input.workspaceId ||
      session.archived ||
      !tab ||
      tab.kind !== 'session' ||
      tab.sessionId !== input.sessionId ||
      tab.workspaceId !== input.workspaceId ||
      tab.instanceKey !== input.sourceTabInstanceKey
    )
      throw new CommandError('STALE_TARGET', 'The selected Session target changed')
    return input
  }

  function replaceEntry(entry: ComposerBackgroundAgentsEntry): void {
    if (disposed || options.isDisposed()) return
    const current = state.reader.getSnapshot()
    if (current.entries[entry.sessionId] === undefined && Object.keys(current.entries).length >= MAX_ENTRIES) {
      const evictable = Object.entries(current.entries).find(
        ([, value]) => value.action.status === 'idle' || value.action.status === 'settled',
      )
      if (!evictable)
        throw new CommandError('CAPACITY_EXCEEDED', 'Too many unresolved Background Agent session targets')
      const entries = { ...current.entries }
      delete entries[evictable[0]]
      for (const key of capturedActions.keys()) {
        if (key.startsWith(`${evictable[0]}:`)) capturedActions.delete(key)
      }
      state.replace({ ...current, entries: { ...entries, [entry.sessionId]: entry } })
      return
    }
    state.replace({ ...current, entries: { ...current.entries, [entry.sessionId]: entry } })
  }

  function readEntry(target: Target): ComposerBackgroundAgentsEntry | undefined {
    const entry = state.reader.getSnapshot().entries[target.sessionId]
    return entry && sameTarget(entry, target) ? entry : undefined
  }

  function updateAction(target: Target, action: ComposerBackgroundAgentsAction): void {
    const entry = readEntry(target)
    if (!entry) return
    replaceEntry({ ...entry, action })
  }

  function isSelectedTarget(target: Target): boolean {
    try {
      selectedTarget(target)
      return true
    } catch {
      return false
    }
  }

  async function abortable<Value>(promise: Promise<Value>, signal: AbortSignal): Promise<Value> {
    if (signal.aborted) throw signal.reason ?? new CommandError('CANCELLED', 'Operation cancelled')
    return new Promise<Value>((resolve, reject) => {
      let settled = false
      let onAbort: () => void = () => undefined
      const cleanup = () => signal.removeEventListener('abort', onAbort)
      onAbort = () => {
        if (settled) return
        settled = true
        cleanup()
        reject(signal.reason ?? new CommandError('CANCELLED', 'Operation cancelled'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
      promise.then(
        (value) => {
          if (settled) return
          settled = true
          cleanup()
          resolve(value)
        },
        (reason: unknown) => {
          if (settled) return
          settled = true
          cleanup()
          reject(reason)
        },
      )
    })
  }

  function timeoutController(execution?: ExecuteOptions): {
    readonly controller: AbortController
    readonly dispose: () => void
  } {
    const controller = new AbortController()
    const onAbort = () =>
      controller.abort(execution?.signal?.reason ?? new CommandError('CANCELLED', 'Operation cancelled'))
    execution?.signal?.addEventListener('abort', onAbort, { once: true })
    if (execution?.signal?.aborted) onAbort()
    const timer = setTimeout(
      () => controller.abort(new CommandError('TIMEOUT', 'Background Agent request timed out')),
      REQUEST_TIMEOUT_MS,
    )
    return {
      controller,
      dispose: () => {
        clearTimeout(timer)
        execution?.signal?.removeEventListener('abort', onAbort)
      },
    }
  }

  async function list(target: Target, execution?: ExecuteOptions): Promise<readonly AgentRecord[]> {
    const typed = requireClient()
    const current = requests.get(target.sessionId)
    if (current) current.controller.abort(new CommandError('QUERY_SUPERSEDED', 'Agent refresh superseded'))
    const { controller, dispose } = timeoutController(execution)
    const request = { target, controller }
    requests.set(target.sessionId, request)
    const items: AgentRecord[] = []
    const seen = new Set<string>()
    let cursor: string | undefined
    try {
      for (;;) {
        const remaining = COMPOSER_BACKGROUND_AGENTS_MAX_ITEMS - items.length
        const limit = Math.min(COMPOSER_BACKGROUND_AGENTS_PAGE_SIZE, remaining)
        if (limit < 1) throw new CommandError('AGENT_LIMIT_EXCEEDED', 'More than 128 direct child Agents were returned')
        const page = await abortable(
          typed.execute(
            'agent.list',
            { parentSessionId: target.sessionId, limit, ...(cursor ? { after: cursor } : {}) },
            { signal: controller.signal },
          ),
          controller.signal,
        )
        if (requests.get(target.sessionId) !== request || disposed || options.isDisposed() || !isSelectedTarget(target))
          throw new CommandError('QUERY_SUPERSEDED', 'Agent refresh target changed')
        if (page.items.length > limit || (page.items.length === 0 && page.nextCursor !== null))
          throw new CommandError('INVALID_OUTPUT', 'Agent list page is invalid')
        for (const item of page.items) {
          if (
            item.parentSessionId !== target.sessionId ||
            item.sessionId === target.sessionId ||
            seen.has(item.agentId)
          )
            throw new CommandError('INVALID_OUTPUT', 'Agent list returned a foreign or duplicate record')
          seen.add(item.agentId)
          items.push(item)
        }
        if (page.nextCursor === null) break
        if (!page.items.length || page.nextCursor === cursor || page.nextCursor !== page.items.at(-1)?.agentId)
          throw new CommandError('INVALID_OUTPUT', 'Agent list returned an invalid continuation cursor')
        if (items.length >= COMPOSER_BACKGROUND_AGENTS_MAX_ITEMS)
          throw new CommandError('AGENT_LIMIT_EXCEEDED', 'More than 128 direct child Agents were returned')
        cursor = page.nextCursor
      }
      return items
    } finally {
      dispose()
      if (requests.get(target.sessionId) === request) requests.delete(target.sessionId)
    }
  }

  async function refresh(input: Target, execution?: ExecuteOptions): Promise<ComposerBackgroundAgentsEntry> {
    const target = selectedTarget(input)
    requireClient()
    const prior = readEntry(target)
    const loading: ComposerBackgroundAgentsEntry = {
      sessionId: target.sessionId,
      workspaceId: target.workspaceId,
      sourceTabInstanceKey: target.sourceTabInstanceKey,
      items: prior?.items ?? [],
      readStatus: 'loading',
      error: null,
      action: prior?.action ?? initialAction(),
    }
    replaceEntry(loading)
    const refreshToken = {}
    refreshes.set(target.sessionId, refreshToken)
    try {
      const items = await list(target, execution)
      const latest = readEntry(target)
      const action = latest?.action ?? loading.action
      const entry: ComposerBackgroundAgentsEntry = {
        ...loading,
        items: [...items],
        readStatus: 'ready',
        error: null,
        action: advanceRequestedAction(target, action, items),
      }
      if (!isSelectedTarget(target) || refreshes.get(target.sessionId) !== refreshToken) return entry
      replaceEntry(entry)
      return entry
    } catch (reason) {
      const error = errorCode(reason)
      const latest = readEntry(target)
      const entry: ComposerBackgroundAgentsEntry = {
        ...loading,
        readStatus: UNKNOWN_CODES.has(error) ? 'unknown' : 'error',
        error,
        action: latest?.action ?? loading.action,
      }
      if (isSelectedTarget(target) && refreshes.get(target.sessionId) === refreshToken) replaceEntry(entry)
      throw reason
    } finally {
      if (refreshes.get(target.sessionId) === refreshToken) refreshes.delete(target.sessionId)
    }
  }

  function targetRecordValid(expected: Readonly<AgentRecord>, actual: Readonly<AgentRecord>): boolean {
    return (
      actual.agentId === expected.agentId &&
      actual.parentSessionId === expected.parentSessionId &&
      actual.sessionId === expected.sessionId &&
      actual.requestId === expected.requestId
    )
  }

  function targetStatus(status: AgentRecord['status']): ComposerBackgroundAgentTarget['status'] {
    if (TERMINAL_STATUSES.has(status)) return 'settled'
    if (status === 'cancelRequested') return 'requested'
    return 'failed'
  }

  function overallStatus(
    targets: readonly ComposerBackgroundAgentTarget[],
    error: string | null,
  ): ComposerBackgroundAgentsActionStatus {
    if (targets.some((target) => target.status === 'unknown')) return 'unknown'
    if (targets.some((target) => target.status === 'failed')) return 'failed'
    if (targets.some((target) => target.status === 'requested')) return 'requested'
    return error ? 'failed' : 'settled'
  }

  function advanceRequestedAction(
    target: Target,
    action: ComposerBackgroundAgentsAction,
    items: readonly AgentRecord[],
  ): ComposerBackgroundAgentsAction {
    if (action.status !== 'requested' || !action.id) return action
    const snapshots = capturedActions.get(`${target.sessionId}:${action.id}`)
    if (!snapshots) return action
    const current = new Map(items.map((item) => [item.agentId, item]))
    const targets = action.targets.map((targetState) => {
      if (targetState.status !== 'requested') return targetState
      const expected = snapshots.get(targetState.agentId)
      const actual = current.get(targetState.agentId)
      if (!expected || !actual || !targetRecordValid(expected, actual)) return targetState
      if (TERMINAL_STATUSES.has(actual.status)) return { ...targetState, status: 'settled' as const, error: null }
      return targetState
    })
    return { ...action, status: overallStatus(targets, null), targets }
  }

  async function cancelTarget(
    expected: TargetAgent,
    execution: ExecuteOptions | undefined,
  ): Promise<{ readonly target: ComposerBackgroundAgentTarget; readonly record: AgentRecord | null }> {
    const typed = requireClient()
    const { controller, dispose } = timeoutController(execution)
    try {
      const actual = await abortable(
        typed.execute(
          'agent.result.get',
          { parentSessionId: expected.target.sessionId, agentId: expected.record.agentId },
          { signal: controller.signal },
        ),
        controller.signal,
      )
      if (!targetRecordValid(expected.record, actual))
        throw new CommandError('INVALID_OUTPUT', 'Agent identity changed before cancellation')
      if (TERMINAL_STATUSES.has(actual.status))
        return { target: { agentId: actual.agentId, status: 'settled', error: null }, record: actual }
      if (actual.status === 'cancelRequested')
        return { target: { agentId: actual.agentId, status: 'requested', error: null }, record: actual }
      if (!ACTIVE_STATUSES.has(actual.status) || !actual.runId)
        return { target: { agentId: actual.agentId, status: 'failed', error: 'NOT_READY' }, record: actual }
      const cancelled = await abortable(
        typed.execute(
          'agent.cancel',
          { parentSessionId: expected.target.sessionId, agentId: expected.record.agentId },
          { signal: controller.signal },
        ),
        controller.signal,
      )
      if (!targetRecordValid(expected.record, cancelled))
        throw new CommandError('INVALID_OUTPUT', 'Agent identity changed after cancellation')
      return {
        target: { agentId: cancelled.agentId, status: targetStatus(cancelled.status), error: null },
        record: cancelled,
      }
    } catch (reason) {
      const code = errorCode(reason)
      return {
        target: {
          agentId: expected.record.agentId,
          status: UNKNOWN_CODES.has(code) ? 'unknown' : 'failed',
          error: code,
        },
        record: null,
      }
    } finally {
      dispose()
    }
  }

  async function cancel(
    input: Target & { readonly actionId?: string | undefined },
    execution?: ExecuteOptions,
  ): Promise<ComposerBackgroundAgentsAction> {
    const target = selectedTarget(input)
    const entry = readEntry(target)
    if (!entry || entry.readStatus !== 'ready') throw new CommandError('NOT_READY', 'Refresh direct Agent state first')
    const existing = entry.action
    if (existing.status === 'busy' || existing.status === 'requested')
      throw new CommandError('BUSY', 'Background Agent cancellation is already pending')
    if (existing.status === 'unknown' && !input.actionId)
      throw new CommandError('RESULT_UNKNOWN', 'Reconcile the unresolved Background Agent cancellation first')
    if (input.actionId && input.actionId !== existing.id)
      throw new CommandError('STALE_TARGET', 'Cancellation action is no longer current')
    if (input.actionId && existing.status !== 'failed')
      throw new CommandError('STALE_TARGET', 'Only failed Background Agent targets can be retried')
    if (!input.actionId && existing.status === 'failed')
      throw new CommandError('STALE_TARGET', 'Retry the failed Background Agent targets explicitly')
    const captured = input.actionId ? capturedActions.get(`${target.sessionId}:${input.actionId}`) : undefined
    if (input.actionId && !captured) throw new CommandError('RESULT_UNKNOWN', 'Cancellation targets are unavailable')
    const snapshots = input.actionId
      ? existing.targets
          .filter((item) => item.status === 'failed')
          .map((item) => {
            const record = captured!.get(item.agentId)
            if (!record) throw new CommandError('RESULT_UNKNOWN', 'Cancellation target is unavailable')
            return { record, target }
          })
      : entry.items
          .filter((item) => ACTIVE_STATUSES.has(item.status) || item.status === 'cancelRequested')
          .map((record) => ({ record, target }))
    if (!snapshots.length) {
      const action = {
        status: 'settled' as const,
        phase: null,
        id: execution?.requestId ?? crypto.randomUUID(),
        error: null,
        targets: [],
      }
      updateAction(target, action)
      return action
    }
    if (actionRequests.has(target.sessionId))
      throw new CommandError('BUSY', 'Background Agent cancellation is already running')
    const actionId = execution?.requestId ?? crypto.randomUUID()
    const previousActionId = existing.id
    capturedActions.set(
      `${target.sessionId}:${actionId}`,
      new Map(snapshots.map((snapshot) => [snapshot.record.agentId, snapshot.record])),
    )
    if (previousActionId && previousActionId !== actionId)
      capturedActions.delete(`${target.sessionId}:${previousActionId}`)
    const busy: ComposerBackgroundAgentsAction = {
      status: 'busy',
      phase: 'cancel',
      id: actionId,
      error: null,
      targets: snapshots.map((item) => ({ agentId: item.record.agentId, status: 'requested', error: null })),
    }
    updateAction(target, busy)
    const { controller, dispose } = timeoutController(execution)
    const actionRequest = { target, controller }
    actionRequests.set(target.sessionId, actionRequest)
    const results: Array<{ readonly target: ComposerBackgroundAgentTarget; readonly record: AgentRecord | null }> = []
    let cursor = 0
    const worker = async () => {
      while (cursor < snapshots.length && !controller.signal.aborted) {
        const index = cursor++
        const result = await cancelTarget(snapshots[index]!, { signal: controller.signal })
        results[index] = result
      }
    }
    try {
      await Promise.all(
        Array.from({ length: Math.min(COMPOSER_BACKGROUND_AGENTS_MAX_CONCURRENT_CANCELS, snapshots.length) }, worker),
      )
      const targets = snapshots.map(
        (snapshot, index) =>
          results[index]?.target ?? {
            agentId: snapshot.record.agentId,
            status: 'unknown' as const,
            error: errorCode(controller.signal.reason),
          },
      )
      const resultRecords = new Map(
        results.flatMap((result) => (result?.record ? [[result.record.agentId, result.record] as const] : [])),
      )
      const latest = readEntry(target)
      if (latest) {
        const items = latest.items.map((item) => resultRecords.get(item.agentId) ?? item)
        replaceEntry({
          ...latest,
          items,
          action: { status: overallStatus(targets, null), phase: null, id: actionId, error: null, targets },
        })
      }
      return { status: overallStatus(targets, null), phase: null, id: actionId, error: null, targets }
    } finally {
      dispose()
      if (actionRequests.get(target.sessionId) === actionRequest) actionRequests.delete(target.sessionId)
    }
  }

  async function reconcile(
    input: Target & { readonly actionId: string },
    execution?: ExecuteOptions,
  ): Promise<ComposerBackgroundAgentsAction> {
    const target = selectedTarget(input)
    const entry = readEntry(target)
    if (!entry || entry.action.id !== input.actionId)
      throw new CommandError('STALE_TARGET', 'Cancellation action is no longer current')
    const snapshots = capturedActions.get(`${target.sessionId}:${input.actionId}`)
    if (!snapshots) throw new CommandError('RESULT_UNKNOWN', 'Cancellation targets are unavailable')
    if (entry.action.status === 'busy' || actionRequests.has(target.sessionId))
      throw new CommandError('BUSY', 'Background Agent cancellation is already running')
    const targets = entry.action.targets
    const checking: ComposerBackgroundAgentsAction = {
      status: 'busy',
      phase: 'reconcile',
      id: input.actionId,
      error: null,
      targets,
    }
    updateAction(target, checking)
    const { controller, dispose } = timeoutController(execution)
    const actionRequest = { target, controller }
    actionRequests.set(target.sessionId, actionRequest)
    try {
      const refreshed: ComposerBackgroundAgentTarget[] = []
      for (const targetState of targets) {
        const expected = snapshots.get(targetState.agentId)
        if (!expected || targetState.status === 'failed') {
          refreshed.push(targetState)
          continue
        }
        try {
          const actual = await abortable(
            requireClient().execute(
              'agent.result.get',
              { parentSessionId: target.sessionId, agentId: expected.agentId },
              { signal: controller.signal },
            ),
            controller.signal,
          )
          if (!targetRecordValid(expected, actual)) throw new CommandError('INVALID_OUTPUT', 'Agent identity changed')
          refreshed.push({
            agentId: expected.agentId,
            status: TERMINAL_STATUSES.has(actual.status)
              ? 'settled'
              : actual.status === 'cancelRequested'
                ? 'requested'
                : 'failed',
            error: null,
          })
        } catch (reason) {
          refreshed.push({
            agentId: expected.agentId,
            status: UNKNOWN_CODES.has(errorCode(reason)) ? 'unknown' : 'failed',
            error: errorCode(reason),
          })
        }
      }
      const action: ComposerBackgroundAgentsAction = {
        status: overallStatus(refreshed, null),
        phase: null,
        id: input.actionId,
        error: null,
        targets: refreshed,
      }
      const latest = readEntry(target)
      if (latest) replaceEntry({ ...latest, action })
      return action
    } finally {
      dispose()
      if (actionRequests.get(target.sessionId) === actionRequest) actionRequests.delete(target.sessionId)
    }
  }

  const scheduleRefresh = () => {
    refreshPending = true
    if (refreshTimer !== null || disposed || options.isDisposed()) return
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      if (!refreshPending || disposed || options.isDisposed()) return
      refreshPending = false
      const navigation = options.navigation.getSnapshot()
      const tabs = options.tabs.getSnapshot()
      const tab = tabs.items.find((item) => item.id === tabs.activeId)
      if (
        navigation.status !== 'idle' ||
        !navigation.sessionId ||
        !navigation.workspaceId ||
        !tab ||
        tab.kind !== 'session'
      )
        return
      const target = {
        sessionId: navigation.sessionId,
        workspaceId: navigation.workspaceId,
        sourceTabInstanceKey: tab.instanceKey,
      }
      void local
        .execute(composerBackgroundAgentsCommands['composerBackgroundAgents.refresh'].metadata.id, target)
        .catch(() => undefined)
    }, REFRESH_DEBOUNCE_MS)
  }

  const offNavigation = options.navigation.subscribe(scheduleRefresh)
  const offEvents = runtimeOptions.sidebarActivityEvents?.subscribe(scheduleRefresh) ?? (() => undefined)
  const offConnection =
    runtimeOptions.sidebarActivityEvents?.onConnection?.((connected) => connected && scheduleRefresh()) ??
    (() => undefined)
  local.register(composerBackgroundAgentsCommands['composerBackgroundAgents.refresh'], (input, context) =>
    refresh(input, context),
  )
  local.register(composerBackgroundAgentsCommands['composerBackgroundAgents.cancel'], (input, context) =>
    cancel(input, context),
  )
  local.register(composerBackgroundAgentsCommands['composerBackgroundAgents.reconcile'], (input, context) =>
    reconcile(input, context),
  )
  scheduleRefresh()

  return {
    reader: state.reader,
    dispose() {
      if (disposed) return
      disposed = true
      offNavigation()
      offEvents()
      offConnection()
      if (refreshTimer !== null) clearTimeout(refreshTimer)
      for (const request of requests.values())
        request.controller.abort(new CommandError('DISPOSED', 'Runtime disposed'))
      for (const request of actionRequests.values())
        request.controller.abort(new CommandError('DISPOSED', 'Runtime disposed'))
      requests.clear()
      refreshes.clear()
      actionRequests.clear()
      state.dispose()
    },
  }
}
