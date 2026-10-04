import { z } from 'zod'
import {
  CommandError,
  defineCommand,
  type CommandExecutor,
  type CommandRegistry,
  type ExecuteOptions,
} from '@hbar/commands'
import { idSchema } from '@hbar/contracts'
import {
  WORKSPACE_ORGANIZATION_MAX_HIDDEN,
  workspaceOrganizationApplyInputSchema,
  workspaceOrganizationReceiptSchema,
  workspaceOrganizationRequestsEqual,
  workspaceOrganizationSnapshotSchema,
  type WorkspaceOrganizationApplyInput,
  type WorkspaceOrganizationReceipt,
} from '@hbar/contracts/commands/workspace-organization'
import { createState, type StateReader } from './state'

const statusSchema = z.enum(['unavailable', 'loading', 'ready', 'error', 'offline'])
const actionStatusSchema = z.enum(['idle', 'submitting', 'succeeded', 'failed', 'unknown', 'reconciling'])
const output = z.strictObject({ status: statusSchema, actionStatus: actionStatusSchema, error: z.string().nullable() })
const revision = z.number().int().nonnegative().safe()
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.workspace-organization',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  category: 'workspace.organization',
  scope: 'client' as const,
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as 'api'[],
})

export const workspaceOrganizationClientCommands = {
  'workspaceSidebar.setHidden': defineCommand(
    metadata('workspaceSidebar.setHidden'),
    z.strictObject({
      workspaceId: idSchema,
      expectedHidden: z.boolean(),
      hidden: z.boolean(),
      expectedRevision: revision,
    }),
    output,
  ),
  'workspaceSidebar.restoreHidden': defineCommand(
    metadata('workspaceSidebar.restoreHidden'),
    z.strictObject({ expectedRevision: revision }),
    output,
  ),
  'workspaceSidebar.refresh': defineCommand(metadata('workspaceSidebar.refresh'), z.strictObject({}), output),
  'workspaceSidebar.reconcile': defineCommand(metadata('workspaceSidebar.reconcile'), z.strictObject({}), output),
  'workspaceSidebar.reveal': defineCommand(
    metadata('workspaceSidebar.reveal'),
    z.strictObject({ workspaceId: idSchema }),
    output,
  ),
}

export interface WorkspaceOrganizationAction {
  readonly status: z.infer<typeof actionStatusSchema>
  readonly request: Readonly<WorkspaceOrganizationApplyInput> | null
  readonly key: string | null
  readonly receipt: Readonly<WorkspaceOrganizationReceipt> | null
  readonly error: string | null
}
export interface WorkspaceOrganizationState {
  readonly snapshot: {
    readonly schemaVersion: 1
    readonly revision: number
    readonly hiddenWorkspaceIds: readonly string[]
  } | null
  readonly status: z.infer<typeof statusSchema>
  readonly error: string | null
  readonly action: WorkspaceOrganizationAction
  /** Physical write/receipt slot, retained even after logical cancellation or timeout. */
  readonly requestInFlight: boolean
}
export interface WorkspaceOrganizationOptions {
  /** Supplied only after Host identity is confirmed. No device-local fallback. */
  readonly host?: CommandExecutor
  readonly events?: {
    subscribe(listener: () => void): () => void
    onConnection?(listener: (connected: boolean) => void): () => void
  }
  readonly onSubscriberError: (error: unknown) => void
  readonly isDisposed: () => boolean
  /** Captures explicit picker navigation identity; ordinary background selections never call reveal. */
  readonly beginRevealGuard?: (workspaceId: string) => () => boolean
}
export interface WorkspaceOrganization {
  readonly reader: StateReader<WorkspaceOrganizationState>
  readonly ready: Promise<void>
  reveal(workspaceId: string, isCurrent?: () => boolean): Promise<void>
  dispose(): void
}

const TIMEOUT_MS = 30_000
const rejectedCodes = new Set([
  'COMMAND_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'INVALID_INPUT',
  'NOT_FOUND',
  'INPUT_TOO_LARGE',
  'VERSION_MISMATCH',
  'INVALID_STATE',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'CAPABILITY_UNAVAILABLE',
  'BUSY',
])
const safeCodes = new Set([
  ...rejectedCodes,
  'RESULT_UNKNOWN',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'TIMEOUT',
  'TIMED_OUT',
  'CANCELLED',
  'EXECUTION_FAILED',
  'INVALID_OUTPUT',
  'QUERY_SUPERSEDED',
  'DISPOSED',
])
function code(error: unknown): string {
  return error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    safeCodes.has(error.code)
    ? error.code
    : 'EXECUTION_FAILED'
}
const idle: WorkspaceOrganizationAction = { status: 'idle', request: null, key: null, receipt: null, error: null }

/** One confirmed Host projection and one unresolved write. Navigation and directory facts are not owned here. */
export function createWorkspaceOrganization(
  local: CommandRegistry,
  options: WorkspaceOrganizationOptions,
): WorkspaceOrganization {
  const state = createState<WorkspaceOrganizationState>(
    {
      snapshot: null,
      status: options.host ? 'loading' : 'unavailable',
      error: null,
      action: idle,
      requestInFlight: false,
    },
    options.onSubscriberError,
  )
  let disposed = false
  let connected = Boolean(options.host)
  let epoch = 0
  let lowerBound = 0
  let queuedRead = false
  let readTask: { readonly promise: Promise<void>; cancel(error: string): void } | null = null
  let actionTask: { cancel(error: string): void } | null = null
  const current = () => state.reader.getSnapshot()
  const alive = () => !disposed && !options.isDisposed()
  const publish = (patch: Partial<WorkspaceOrganizationState>) => {
    if (alive()) state.replace({ ...current(), ...patch, requestInFlight: actionTask !== null })
  }
  const summary = () => ({
    status: current().status,
    actionStatus: current().action.status,
    error: current().action.error ?? current().error,
  })
  const locked = () => actionTask !== null || ['submitting', 'unknown', 'reconciling'].includes(current().action.status)
  const check = (execution?: ExecuteOptions) => {
    if (!alive()) throw new CommandError('DISPOSED', 'Workspace organization owner was disposed')
    if (execution?.signal?.aborted) throw new CommandError('CANCELLED', 'Workspace organization request was cancelled')
    if (!options.host) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Workspace organization is unavailable')
    if (!connected) throw new CommandError('DISCONNECTED', 'Workspace organization is offline')
  }

  // A cancelled/timed-out consumer settles promptly, but the physical slot is held
  // until its adapter actually settles. Notifications retain only one follow-up.
  function refresh(followup = false, allowFollowup = true): Promise<void> {
    if (!alive() || !options.host || !connected) return Promise.resolve()
    if (readTask) {
      if (followup) queuedRead = true
      return readTask.promise
    }
    queuedRead = false
    const capturedEpoch = epoch
    const controller = new AbortController()
    let finished = false
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
      resolve = done
    })
    const task = {
      promise,
      cancel(error: string) {
        if (finished) return
        finished = true
        controller.abort()
        clearTimeout(timer)
        if (alive() && epoch === capturedEpoch) publish({ status: connected ? 'error' : 'offline', error })
        resolve()
      },
    }
    const timer = setTimeout(() => task.cancel('TIMEOUT'), TIMEOUT_MS)
    readTask = task
    publish({ status: 'loading', error: null })
    const host = options.host
    void Promise.resolve()
      .then(() => {
        if (controller.signal.aborted || !alive() || epoch !== capturedEpoch)
          throw new CommandError('CANCELLED', 'Read was cancelled before dispatch')
        return host.execute('workspaceOrganization.get', {}, { signal: controller.signal })
      })
      .then(
        (value) => {
          if (finished || !alive() || epoch !== capturedEpoch || !connected) return
          const parsed = workspaceOrganizationSnapshotSchema.safeParse(value)
          if (!parsed.success) {
            publish({ status: 'error', error: 'INVALID_OUTPUT' })
            return
          }
          if (parsed.data.revision < Math.max(lowerBound, current().snapshot?.revision ?? 0)) {
            publish({ status: 'error', error: 'QUERY_SUPERSEDED' })
            return
          }
          const previous = current().snapshot
          if (
            previous?.revision === parsed.data.revision &&
            (previous.hiddenWorkspaceIds.length !== parsed.data.hiddenWorkspaceIds.length ||
              previous.hiddenWorkspaceIds.some((id, index) => parsed.data.hiddenWorkspaceIds[index] !== id))
          ) {
            publish({ status: 'error', error: 'INVALID_OUTPUT' })
            return
          }
          lowerBound = parsed.data.revision
          publish({ snapshot: parsed.data, status: queuedRead ? 'loading' : 'ready', error: null })
        },
        (error: unknown) => {
          if (!finished && alive() && epoch === capturedEpoch && connected)
            publish({ status: 'error', error: code(error) })
        },
      )
      .then(async () => {
        finished = true
        clearTimeout(timer)
        if (readTask === task) readTask = null
        const again = queuedRead
        queuedRead = false
        if (alive() && connected && again) {
          if (allowFollowup) await refresh(false, false)
          else publish({ status: 'error', error: 'QUERY_SUPERSEDED' })
        }
        resolve()
      })
      .catch((error: unknown) => {
        // Subscriber failures are caught by createState; this is a final internal guard.
        if (readTask === task) readTask = null
        clearTimeout(timer)
        if (alive()) publish({ status: 'error', error: code(error) })
        resolve()
      })
    return promise
  }

  async function perform(
    request: WorkspaceOrganizationApplyInput,
    key: string,
    reconcile: boolean,
    execution?: ExecuteOptions,
    isCurrent: () => boolean = () => true,
  ): Promise<void> {
    check(execution)
    if (!isCurrent()) return
    const host = options.host
    if (!host) return
    const capturedEpoch = epoch
    const previousAction = current().action
    const controller = new AbortController()
    let finished = false
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
      resolve = done
    })
    const action: WorkspaceOrganizationAction = {
      status: reconcile ? 'reconciling' : 'submitting',
      request,
      key,
      receipt: null,
      error: null,
    }
    const task = {
      cancel(error: string) {
        if (finished) return
        finished = true
        controller.abort()
        clearTimeout(timer)
        execution?.signal?.removeEventListener('abort', abort)
        if (alive()) publish({ action: { ...action, status: 'unknown', error } })
        resolve()
      },
    }
    const abort = () => task.cancel('CANCELLED')
    const timer = setTimeout(() => task.cancel('TIMEOUT'), TIMEOUT_MS)
    execution?.signal?.addEventListener('abort', abort, { once: true })
    actionTask = task
    publish({ action })
    let refreshAfter = false
    let skipped = false
    void Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) throw new CommandError('CANCELLED', 'Request was cancelled before dispatch')
        if (!isCurrent()) {
          skipped = true
          return null
        }
        return reconcile
          ? host.execute(
              'workspaceOrganization.receipt',
              { idempotencyKey: key, request },
              { signal: controller.signal },
            )
          : host.execute('workspaceOrganization.apply', request, { idempotencyKey: key, signal: controller.signal })
      })
      .then(
        (value) => {
          if (finished || !alive() || capturedEpoch !== epoch || !connected) return
          if (skipped) {
            publish({ action: previousAction })
            return
          }
          const parsed = workspaceOrganizationReceiptSchema.nullable().safeParse(value)
          if (
            !parsed.success ||
            (parsed.data && !workspaceOrganizationRequestsEqual(parsed.data.request, request)) ||
            (!reconcile && parsed.data === null)
          ) {
            publish({ action: { ...action, status: 'unknown', error: 'INVALID_OUTPUT' } })
            return
          }
          if (!parsed.data) {
            publish({ action: { ...action, status: 'unknown', error: 'RESULT_UNKNOWN' } })
            return
          }
          lowerBound = Math.max(lowerBound, parsed.data.revision)
          publish({ action: { ...action, status: 'succeeded', receipt: parsed.data, error: null } })
          refreshAfter = true
        },
        (error: unknown) => {
          if (finished || !alive() || capturedEpoch !== epoch) return
          const errorCode = code(error)
          const rejected = !reconcile && rejectedCodes.has(errorCode)
          publish({ action: { ...action, status: rejected ? 'failed' : 'unknown', error: errorCode } })
          refreshAfter = rejected && errorCode === 'COMMAND_CONFLICT'
        },
      )
      .then(async () => {
        finished = true
        clearTimeout(timer)
        execution?.signal?.removeEventListener('abort', abort)
        if (actionTask === task) {
          actionTask = null
          publish({})
        }
        if (refreshAfter && alive() && capturedEpoch === epoch && connected) await refresh(true)
        resolve()
      })
      .catch((error: unknown) => {
        if (actionTask === task) {
          actionTask = null
          publish({})
        }
        clearTimeout(timer)
        execution?.signal?.removeEventListener('abort', abort)
        if (alive()) publish({ action: { ...action, status: 'unknown', error: code(error) } })
        resolve()
      })
    return promise
  }

  async function mutate(
    request: WorkspaceOrganizationApplyInput,
    execution?: ExecuteOptions,
    isCurrent: () => boolean = () => true,
  ): Promise<void> {
    check(execution)
    if (!isCurrent()) return
    if (locked()) throw new CommandError('BUSY', 'Reconcile the original workspace organization request first')
    const captured = workspaceOrganizationApplyInputSchema.parse(request)
    const snapshot = current().snapshot
    let error: string | null = null
    if (current().status !== 'ready' || !snapshot || snapshot.revision < lowerBound) error = 'BUSY'
    else if (snapshot.revision !== captured.expectedRevision) error = 'COMMAND_CONFLICT'
    else if (captured.change.kind === 'setHidden') {
      const hidden = snapshot.hiddenWorkspaceIds.includes(captured.change.workspaceId)
      if (hidden !== captured.change.expectedHidden) error = 'COMMAND_CONFLICT'
      else if (
        !hidden &&
        captured.change.hidden &&
        snapshot.hiddenWorkspaceIds.length >= WORKSPACE_ORGANIZATION_MAX_HIDDEN
      )
        error = 'INPUT_TOO_LARGE'
    }
    if (error) {
      publish({ action: { status: 'failed', request: captured, key: null, receipt: null, error } })
      if (error === 'COMMAND_CONFLICT') await refresh(true)
      return
    }
    await perform(captured, crypto.randomUUID(), false, execution, isCurrent)
  }

  async function reveal(workspaceId: string, isCurrent: () => boolean = () => true): Promise<void> {
    // Explicit open already succeeded. This secondary action never changes its outcome.
    try {
      if (!alive() || !isCurrent()) return
      check()
      if (locked()) return
      const parsed = idSchema.safeParse(workspaceId)
      if (!parsed.success) throw new CommandError('INVALID_INPUT', 'Invalid workspace ID')
      if (current().status !== 'ready') await refresh()
      if (!alive() || !isCurrent() || locked()) return
      const snapshot = current().snapshot
      if (current().status !== 'ready' || !snapshot) return
      if (!snapshot.hiddenWorkspaceIds.includes(parsed.data)) return
      await mutate(
        {
          expectedRevision: snapshot.revision,
          change: { kind: 'setHidden', workspaceId: parsed.data, expectedHidden: true, hidden: false },
        },
        undefined,
        isCurrent,
      )
    } catch (error: unknown) {
      if (alive() && isCurrent() && !locked()) publish({ action: { ...idle, status: 'failed', error: code(error) } })
    }
  }

  const unregister = [
    local.register(workspaceOrganizationClientCommands['workspaceSidebar.setHidden'], async (input, context) => {
      const { expectedRevision, ...change } = input
      await mutate({ expectedRevision, change: { kind: 'setHidden', ...change } }, context)
      return summary()
    }),
    local.register(workspaceOrganizationClientCommands['workspaceSidebar.restoreHidden'], async (input, context) => {
      await mutate({ expectedRevision: input.expectedRevision, change: { kind: 'restoreHidden' } }, context)
      return summary()
    }),
    local.register(workspaceOrganizationClientCommands['workspaceSidebar.refresh'], async (_input, context) => {
      check(context)
      await refresh()
      return summary()
    }),
    local.register(workspaceOrganizationClientCommands['workspaceSidebar.reconcile'], async (_input, context) => {
      check(context)
      if (actionTask) throw new CommandError('BUSY', 'Workspace organization request is still in flight')
      const action = current().action
      if (action.status !== 'unknown' || !action.request || !action.key)
        throw new CommandError('COMMAND_CONFLICT', 'No unknown workspace organization request')
      await perform(action.request, action.key, true, context)
      return summary()
    }),
    local.register(workspaceOrganizationClientCommands['workspaceSidebar.reveal'], async (input, context) => {
      const guard = options.beginRevealGuard?.(input.workspaceId) ?? (() => true)
      if (!context.signal.aborted) await reveal(input.workspaceId, () => !context.signal.aborted && guard())
      return summary()
    }),
  ]
  const offEvents = options.events?.subscribe(() => {
    void refresh(true)
  })
  const offConnection = options.events?.onConnection?.((next) => {
    if (!alive() || !options.host || next === connected) return
    connected = next
    epoch++
    if (!next) {
      queuedRead = false
      readTask?.cancel('DISCONNECTED')
      actionTask?.cancel('DISCONNECTED')
      publish({ status: 'offline', error: 'DISCONNECTED' })
    } else void refresh(true)
  })
  const ready = refresh()
  return {
    reader: state.reader,
    ready,
    reveal,
    dispose() {
      if (disposed) return
      disposed = true
      epoch++
      queuedRead = false
      offEvents?.()
      offConnection?.()
      readTask?.cancel('DISPOSED')
      actionTask?.cancel('DISPOSED')
      for (const stop of unregister) stop()
      state.dispose()
    },
  }
}
