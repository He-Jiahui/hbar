import { CommandError, type CommandExecutor } from '@hbar/commands'
import { operationCancelResultSchema } from '@hbar/contracts/commands/run'
import { createState } from './state'
import { readTabActivity, tabCloseError, visitTabCloseTargets, type TabActiveOperation } from './workspace-tab-activity'

export interface WorkspaceTabCloseTarget {
  readonly id: string
  readonly instanceKey: string
  readonly sessionId: string
}
export interface WorkspaceTabCloseRequest {
  readonly id: string
  readonly targets: readonly WorkspaceTabCloseTarget[]
  readonly status: 'checking' | 'choice' | 'stopping' | 'unknown' | 'failed'
  readonly operations: readonly TabActiveOperation[]
  readonly error: string | null
}
export type WorkspaceTabCloseChoice = 'cancel' | 'keepRunning' | 'stop' | 'recheck'
export interface WorkspaceTabCloseOptions {
  readonly run?: CommandExecutor | undefined
  readonly closeCaptured: (targets: readonly WorkspaceTabCloseTarget[], signal: AbortSignal) => Promise<void>
  readonly onSubscriberError: (reason: unknown) => void
  readonly timeoutMs?: number | undefined
}

/** Owns a single close intent, not session state. Acknowledged cancellation is never treated as settlement. */
export function createWorkspaceTabClose(options: WorkspaceTabCloseOptions) {
  const state = createState<{ readonly request: WorkspaceTabCloseRequest | null }>(
    { request: null },
    options.onSubscriberError,
  )
  let disposed = false
  let job: AbortController | null = null
  const sent = new Set<string>()
  let stopping = false

  function current(id: string): WorkspaceTabCloseRequest {
    const value = state.reader.getSnapshot().request
    if (disposed || !value || value.id !== id)
      throw new CommandError('CLOSE_SUPERSEDED', 'Tab close no longer owns this intent')
    return value
  }
  function update(id: string, patch: Partial<Omit<WorkspaceTabCloseRequest, 'id' | 'targets'>>) {
    if (!disposed && state.reader.getSnapshot().request?.id === id)
      state.replace({ request: { ...current(id), ...patch } })
  }
  async function bounded(id: string, action: (signal: AbortSignal) => Promise<void>) {
    if (job) throw new CommandError('BUSY', 'Tab close is already checking or stopping')
    const controller = new AbortController()
    job = controller
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000)
    let removeAbort = () => {}
    const interrupted = new Promise<never>((_resolve, reject) => {
      const onAbort = () =>
        reject(new CommandError(disposed ? 'DISPOSED' : 'TIMEOUT', 'Tab close requires reconciliation'))
      controller.signal.addEventListener('abort', onAbort, { once: true })
      removeAbort = () => controller.signal.removeEventListener('abort', onAbort)
    })
    try {
      await Promise.race([action(controller.signal), interrupted])
    } catch (reason) {
      update(id, { status: 'unknown', error: tabCloseError(reason) })
    } finally {
      clearTimeout(timeout)
      removeAbort()
      controller.abort()
      if (job === controller) job = null
    }
  }
  async function close(id: string, signal: AbortSignal) {
    signal.throwIfAborted()
    const value = current(id)
    try {
      await options.closeCaptured(value.targets, signal)
      signal.throwIfAborted()
      current(id)
      state.replace({ request: null })
      sent.clear()
      stopping = false
    } catch (reason) {
      update(id, { status: 'failed', error: tabCloseError(reason) })
    }
  }
  async function inspect(id: string, signal: AbortSignal) {
    const value = current(id)
    if (!options.run) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Activity query is unavailable')
    const operations = await readTabActivity(
      options.run,
      value.targets.map((target) => target.sessionId),
      signal,
    )
    signal.throwIfAborted()
    current(id)
    const activeIds = new Set(operations.map((operation) => operation.operationId))
    // The complete read proves these IDs are no longer active; do not retain unbounded past stop batches.
    for (const operationId of sent) if (!activeIds.has(operationId)) sent.delete(operationId)
    if (!operations.length) {
      await close(id, signal)
      return
    }
    if (stopping && operations.some((operation) => sent.has(operation.operationId))) {
      update(id, { status: 'unknown', operations, error: 'STOP_PENDING' })
      return
    }
    // New work was not part of the stop intent. Require another explicit confirmation.
    update(id, { status: 'choice', operations, error: stopping ? 'ACTIVITY_CHANGED' : null })
    stopping = false
  }
  async function request(targets: readonly WorkspaceTabCloseTarget[]) {
    if (disposed) throw new CommandError('DISPOSED', 'Tab close is disposed')
    if (job || state.reader.getSnapshot().request) throw new CommandError('BUSY', 'Another tab close is unresolved')
    if (!targets.length || targets.length > 32 || new Set(targets.map((target) => target.id)).size !== targets.length)
      throw new CommandError('INVALID_INPUT', 'Close requires one to 32 unique original tab targets')
    const id = crypto.randomUUID()
    sent.clear()
    stopping = false
    state.replace({
      request: {
        id,
        targets: targets.map((target) => ({ ...target })),
        status: 'checking',
        operations: [],
        error: null,
      },
    })
    await bounded(id, (signal) => inspect(id, signal))
  }
  async function resolve(id: string, choice: WorkspaceTabCloseChoice) {
    const value = current(id)
    if (job) throw new CommandError('BUSY', 'Tab close is already checking or stopping')
    if (choice === 'cancel') {
      state.replace({ request: null })
      sent.clear()
      stopping = false
      return
    }
    if (choice === 'keepRunning') {
      update(id, { status: 'checking', error: null })
      await bounded(id, (signal) => close(id, signal))
      return
    }
    if (choice === 'recheck') {
      update(id, { status: 'checking', error: null })
      await bounded(id, (signal) => inspect(id, signal))
      return
    }
    if (value.status !== 'choice' && value.status !== 'failed')
      throw new CommandError('RECONCILE_REQUIRED', 'Read the current status before sending any stop request')
    if (!options.run) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Cancellation is unavailable')
    const run = options.run
    for (const operation of value.operations)
      if (operation.status === 'cancelRequested') sent.add(operation.operationId)
    const operations = value.operations.filter((operation) => !sent.has(operation.operationId))
    stopping = true
    update(id, { status: 'stopping', error: null })
    await bounded(id, async (signal) => {
      let cancellationError: string | null = null
      await visitTabCloseTargets(operations, signal, async (operation) => {
        signal.throwIfAborted()
        current(id)
        // Record before dispatch: a lost reply cannot cause the same side effect to be automatically retried.
        sent.add(operation.operationId)
        try {
          const result = operationCancelResultSchema.safeParse(
            await run.execute('operation.cancel', { operationId: operation.operationId }, { signal }),
          )
          if (!result.success || result.data.operationId !== operation.operationId)
            throw new CommandError('INVALID_OUTPUT', 'Cancellation reply did not match its operation')
        } catch (reason) {
          cancellationError = tabCloseError(reason)
        }
      })
      signal.throwIfAborted()
      await inspect(id, signal)
      if (cancellationError && state.reader.getSnapshot().request?.status === 'unknown')
        update(id, { error: cancellationError })
    })
  }
  return {
    reader: state.reader,
    request,
    resolve,
    dispose() {
      disposed = true
      job?.abort()
      sent.clear()
      state.dispose()
    },
  }
}
