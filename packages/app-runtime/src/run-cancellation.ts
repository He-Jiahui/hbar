import { CommandError, type CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { operationCancelResultSchema, operationSnapshotSchema, runCommands } from '@hbar/contracts/commands/run'
import { runActionCommands, type CancellationReconciliation } from '@hbar/contracts/commands/run-action'
import type { RunActionState, RunActionsState, RunCommandPort } from './types'
import type { StateReader } from './state'

const DEADLINE_MS = 30_000
const MAX_READS = 32
const REJECTIONS = new Set([
  'INVALID_INPUT',
  'INPUT_TOO_LARGE',
  'NOT_FOUND',
  'FORBIDDEN',
  'UNAUTHORIZED',
  'BUSY',
  'CAPABILITY_UNAVAILABLE',
  'COMMAND_NOT_FOUND',
  'VERSION_MISMATCH',
])
const terminal = new Set(['guided', 'completed', 'cancelled', 'failed', 'interrupted'])
const SAFE_CODES = new Set([
  ...REJECTIONS,
  'RESULT_UNKNOWN',
  'TIMEOUT',
  'TIMED_OUT',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'CANCELLED',
  'INVALID_OUTPUT',
  'EXECUTION_FAILED',
  'DISPOSED',
])
function codeOf(reason: unknown): string {
  return reason &&
    typeof reason === 'object' &&
    'code' in reason &&
    typeof reason.code === 'string' &&
    SAFE_CODES.has(reason.code)
    ? reason.code
    : 'EXECUTION_FAILED'
}
interface Task {
  readonly kind: 'request' | 'state'
  readonly controller: AbortController
  action: RunActionState
  cancel: () => void
}

/** Cancellation shares the existing action state; readback is a snapshot, never an exact write receipt. */
export function createRunCancellation(options: {
  readonly local: CommandRegistry
  readonly run: RunCommandPort | undefined
  readonly actions: StateReader<RunActionsState>
  readonly replace: (operationId: string, action: RunActionState) => void
  readonly isDisposed: () => boolean
}) {
  const tasks = new Map<string, Task>()
  let disposed = false
  const inactive = () => disposed || options.isDisposed()
  const guard = (signal?: AbortSignal) => {
    if (inactive()) throw new CommandError('DISPOSED', 'Cancellation owner was disposed')
    if (signal?.aborted) throw new CommandError('CANCELLED', 'Operation was not dispatched')
    if (!options.run) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Run commands are unavailable')
  }
  const publish = (task: Task, patch: Partial<RunActionState>) => {
    if (
      inactive() ||
      tasks.get(task.action.operationId) !== task ||
      options.actions.getSnapshot()[task.action.operationId] !== task.action
    )
      return
    task.action = { ...task.action, ...patch }
    options.replace(task.action.operationId, task.action)
  }

  function execute<T>(
    original: RunActionState,
    kind: Task['kind'],
    execution: ExecuteOptions,
    work: (signal: AbortSignal) => Promise<unknown>,
    accept: (value: unknown) => { readonly patch: Partial<RunActionState>; readonly output: T },
  ): Promise<T> {
    const operationId = original.operationId
    if (tasks.has(operationId)) throw new CommandError('BUSY', 'The original operation request is still in flight')
    if (kind === 'state' && [...tasks.values()].filter((task) => task.kind === 'state').length >= MAX_READS)
      throw new CommandError('BUSY', 'Too many cancellation state reads are in flight')
    const action: RunActionState = {
      ...original,
      phase: kind,
      status: 'submitting',
      error: null,
      requestInFlight: true,
    }
    const task: Task = { kind, action, controller: new AbortController(), cancel: () => {} }
    tasks.set(operationId, task)
    try {
      options.replace(operationId, action)
    } catch (error) {
      tasks.delete(operationId)
      throw error
    }
    return new Promise<T>((resolve, reject) => {
      let done = false
      let dispatched = false
      const clear = () => {
        clearTimeout(timer)
        execution.signal?.removeEventListener('abort', abort)
      }
      const fail = (reason: unknown) => {
        if (done) return
        done = true
        clear()
        const code = codeOf(reason)
        // A failed read cannot undo an earlier accepted cancellation.
        const status =
          kind === 'state'
            ? original.status === 'succeeded'
              ? 'succeeded'
              : 'unknown'
            : dispatched && !REJECTIONS.has(code)
              ? 'unknown'
              : 'failed'
        publish(task, { status, error: code })
        reject(
          new CommandError(
            kind === 'request' && status === 'unknown' ? 'RESULT_UNKNOWN' : code,
            kind === 'request' ? 'Cancellation was not confirmed' : 'Cancellation state could not be read',
          ),
        )
      }
      const abort = () => {
        fail(new CommandError('CANCELLED', 'State read cancelled'))
        task.controller.abort()
      }
      const timer = setTimeout(() => {
        fail(new CommandError('TIMEOUT', 'Operation deadline elapsed'))
        task.controller.abort()
      }, DEADLINE_MS)
      task.cancel = () => {
        fail(new CommandError('DISPOSED', 'Cancellation owner disposed'))
        task.controller.abort()
      }
      execution.signal?.addEventListener('abort', abort, { once: true })
      const release = () => {
        clear()
        if (tasks.get(operationId) !== task) return
        tasks.delete(operationId)
        if (!inactive() && options.actions.getSnapshot()[operationId] === task.action)
          options.replace(operationId, { ...task.action, requestInFlight: false })
      }
      if (execution.signal?.aborted || inactive()) {
        fail(new CommandError(inactive() ? 'DISPOSED' : 'CANCELLED', 'Operation was not dispatched'))
        release()
        return
      }
      dispatched = true
      let physical: Promise<unknown>
      try {
        physical = work(task.controller.signal)
      } catch (reason) {
        fail(reason)
        release()
        return
      }
      void physical.then(
        (value) => {
          try {
            if (done) return
            const result = accept(value)
            done = true
            clear()
            publish(task, result.patch)
            resolve(result.output)
          } catch (reason) {
            fail(reason)
          } finally {
            release()
          }
        },
        (reason: unknown) => {
          fail(reason)
          release()
        },
      )
    })
  }

  async function cancel(input: unknown, execution: ExecuteOptions = {}) {
    const parsed = runCommands['operation.cancel'].input.safeParse(input)
    if (!parsed.success) throw new CommandError('INVALID_INPUT', 'Invalid cancellation target')
    guard(execution.signal)
    const { operationId } = parsed.data
    const current = options.actions.getSnapshot()[operationId]
    if (
      current &&
      (current.requestInFlight ||
        ['submitting', 'unknown'].includes(current.status) ||
        (current.commandId === 'operation.cancel' && current.status === 'succeeded'))
    )
      throw new CommandError('BUSY', 'Cancellation is pending or has already been accepted')
    return execute(
      { operationId, commandId: 'operation.cancel', status: 'submitting', error: null },
      'request',
      execution,
      (signal) => options.run!.execute('operation.cancel', parsed.data, { ...execution, signal }),
      (value) => {
        const result = operationCancelResultSchema.safeParse(value)
        if (!result.success || result.data.operationId !== operationId)
          throw new CommandError('INVALID_OUTPUT', 'Cancellation response does not match the original operation')
        return { patch: { status: 'succeeded', error: null, observedStatus: result.data.status }, output: result.data }
      },
    )
  }

  options.local.register(
    runActionCommands['runAction.reconcileCancellation'],
    async (input, context): Promise<CancellationReconciliation> => {
      guard(context.signal)
      const current = options.actions.getSnapshot()[input.operationId]
      if (!current || current.commandId !== 'operation.cancel' || !['unknown', 'succeeded'].includes(current.status))
        throw new CommandError(
          current?.status === 'submitting' ? 'BUSY' : 'INVALID_INPUT',
          'No cancellation state is available to reconcile',
        )
      if (current.sessionId && current.sessionId !== input.sessionId)
        throw new CommandError('STALE_TARGET', 'Cancellation belongs to another session')
      return execute(
        current,
        'state',
        { signal: context.signal },
        (signal) => options.run!.execute('operation.get', { operationId: input.operationId }, { signal }),
        (value) => {
          const parsed = operationSnapshotSchema.safeParse(value)
          if (
            !parsed.success ||
            parsed.data.operationId !== input.operationId ||
            parsed.data.sessionId !== input.sessionId
          )
            throw new CommandError('INVALID_OUTPUT', 'Operation state does not match the original target')
          const read = parsed.data.status
          if (current.observedStatus && terminal.has(current.observedStatus) && read !== current.observedStatus)
            throw new CommandError('INVALID_OUTPUT', 'Operation terminal state cannot regress or change')
          const accepted = read === 'cancelRequested' || terminal.has(read)
          const observedStatus =
            current.observedStatus &&
            (terminal.has(current.observedStatus) || current.observedStatus === 'cancelRequested') &&
            !accepted
              ? current.observedStatus
              : read
          const status = accepted || current.status === 'succeeded' ? ('succeeded' as const) : ('unknown' as const)
          return {
            patch: { sessionId: input.sessionId, observedStatus, status, error: null },
            output: { ...input, status, observedStatus, error: null },
          }
        },
      )
    },
  )

  return {
    cancel,
    dispose() {
      if (disposed) return
      disposed = true
      for (const task of tasks.values()) task.cancel()
      tasks.clear()
    },
  }
}
