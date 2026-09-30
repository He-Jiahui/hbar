import { createHash } from 'node:crypto'
import { CommandError, CommandRegistry, createCommandClient, type CommandContext } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { runCommands, runCommandRecordSchema } from '@hbar/contracts/commands/run'
import type { RunAccepted, RunCommandRecord, SubmitRunInput } from '@hbar/contracts/commands/run'
import type { Run } from '@hbar/contracts'
import type { Kernel } from './index'

function accepted(run: Run, command: RunCommandRecord): RunAccepted {
  return {
    status: 'accepted',
    commandId: 'run.submit',
    commandVersion: 1,
    requestId: command.requestId,
    idempotencyKey: command.idempotencyKey,
    operationId: run.id,
    sessionId: run.sessionId,
    acceptedAt: run.createdAt,
  }
}

export function createRunCommands(kernel: Kernel) {
  const registry = new CommandRegistry({ execution: 'host' })
  const locks = new Map<string, Promise<void>>()
  const uncertainSessions = new Set<string>()
  async function serial<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    locks.set(key, current)
    await previous
    try {
      return await action()
    } finally {
      release()
      if (locks.get(key) === current) locks.delete(key)
    }
  }
  async function lookup(input: SubmitRunInput, command: RunCommandRecord, requestId: string) {
    const found = await kernel.storage.call('runByRequest', input.sessionId, requestId)
    if (!found) return null
    if (
      !found.command ||
      found.command.actorId !== command.actorId ||
      found.command.idempotencyKey !== command.idempotencyKey ||
      found.command.inputHash !== command.inputHash
    )
      throw new CommandError('IDEMPOTENCY_CONFLICT', 'Run key was used with different input')
    return accepted(found.run, found.command)
  }
  function receiptScope(
    commandId: 'run.submit' | 'run.retry',
    sessionId: string,
    actorId: string,
    idempotencyKey: string,
  ) {
    return JSON.stringify(
      commandId === 'run.submit'
        ? [sessionId, actorId, idempotencyKey]
        : [sessionId, actorId, commandId, idempotencyKey],
    )
  }
  async function submit(
    input: SubmitRunInput,
    context: CommandContext,
    identity: { readonly id: 'run.submit' | 'run.retry'; readonly input: unknown },
  ) {
    const actorId = context.actorId,
      idempotencyKey = context.idempotencyKey
    if (!actorId || !idempotencyKey)
      throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
    const scope = receiptScope(identity.id, input.sessionId, actorId, idempotencyKey)
    const requestId = `command-${createHash('sha256').update(scope).digest('hex')}`
    const command = runCommandRecordSchema.parse({
      actorId,
      idempotencyKey,
      requestId: context.requestId,
      inputHash: createHash('sha256')
        .update(JSON.stringify({ id: identity.id, version: 1, input: identity.input }))
        .digest('hex'),
    })
    return serial(scope, async () => {
      if (uncertainSessions.has(input.sessionId))
        throw new CommandError('RESULT_UNKNOWN', 'Run journal requires Host recovery')
      let prior: RunAccepted | null
      try {
        prior = await lookup(input, command, requestId)
      } catch (error) {
        if (error instanceof CommandError) throw error
        throw new CommandError('RESULT_UNKNOWN', 'Run journal is unavailable')
      }
      if (prior) return prior
      try {
        const run = await kernel.submit(
          input.sessionId,
          requestId,
          input.input,
          input.modelId,
          command,
          context.signal,
          input.expectedLaunchTargetRevision,
        )
        return accepted(run, command)
      } catch (error) {
        // Admission may have committed before the response was lost. Inspect the canonical queued fact.
        let recovered: RunAccepted | null
        try {
          recovered = await lookup(input, command, requestId)
        } catch (lookupError) {
          if (lookupError instanceof CommandError) throw lookupError
          uncertainSessions.add(input.sessionId)
          throw new CommandError('RESULT_UNKNOWN', 'Run acceptance requires reconciliation')
        }
        if (recovered) return recovered
        if (
          error instanceof HbarError &&
          [
            'FILE_LIMIT',
            'EMPTY_INPUT',
            'MODEL_NOT_FOUND',
            'DEMO_DISABLED',
            'UNSUPPORTED_IMAGE',
            'ARCHIVED',
            'NOT_FOUND',
            'INVALID_INPUT',
            'COMMAND_CONFLICT',
            'IDEMPOTENCY_CONFLICT',
            'BRANCH_IN_USE',
            'BRANCH_EXISTS',
            'BRANCH_NOT_FOUND',
            'BUSY',
            'GIT_INVALID_BRANCH',
            'GIT_REF_NOT_FOUND',
            'GIT_NOT_REPOSITORY',
            'GIT_OPERATION_FAILED',
            'SESSION_LAUNCH_TARGET_LOCKED',
            'SESSION_LAUNCH_TARGET_PATH_OCCUPIED',
            'SESSION_LAUNCH_TARGET_INVALID_ROOT',
            'SESSION_LAUNCH_TARGET_SUBDIRECTORY_UNSUPPORTED',
            'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
            'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
            'SESSION_LAUNCH_TARGET_UNRESOLVED',
            'SESSION_LAUNCH_TARGET_TIMEOUT',
            'USER_CANCELLED',
            'HOST_SHUTTING_DOWN',
          ].includes(error.code)
        )
          throw new CommandError(error.code, error.message)
        uncertainSessions.add(input.sessionId)
        throw new CommandError('RESULT_UNKNOWN', 'Run acceptance requires reconciliation')
      }
    })
  }
  registry.register(
    runCommands['run.submit'],
    (input, context) => submit(input, context, { id: 'run.submit', input }),
    { durable: true },
  )
  registry.register(
    runCommands['run.retry'],
    async ({ sessionId, operationId }, context) => {
      const actorId = context.actorId,
        idempotencyKey = context.idempotencyKey
      if (!actorId || !idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
      let prior: Run
      try {
        prior = await kernel.storage.call('run', operationId)
      } catch (error) {
        if (error instanceof HbarError) throw new CommandError(error.code, error.message)
        throw error
      }
      if (prior.sessionId !== sessionId)
        throw new CommandError('COMMAND_NOT_FOUND', 'Operation does not belong to the selected session')
      if (['queued', 'running', 'waiting_approval'].includes(prior.status))
        throw new CommandError('BUSY', 'Wait for the original operation to settle before retrying')
      return submit({ sessionId, modelId: prior.modelId, input: prior.input }, context, {
        id: 'run.retry',
        input: { sessionId, operationId },
      })
    },
    { durable: true },
  )
  registry.register(runCommands['session.activeOperations'], async (input) => {
    try {
      return await kernel.storage.call('activeOperations', input)
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(runCommands['session.queuedUserRuns'], async (input) => {
    try {
      return await kernel.storage.call('queuedUserRuns', input)
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(runCommands['queuedRun.getEditable'], async (input) => {
    try {
      return await kernel.storage.call('queuedRunEditable', input)
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(
    runCommands['queuedRun.editText'],
    async (input, context) => {
      const actorId = context.actorId,
        idempotencyKey = context.idempotencyKey
      if (!actorId || !idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
      try {
        return await kernel.editQueuedRunText(input, actorId, idempotencyKey)
      } catch (error) {
        if (
          error instanceof HbarError &&
          [
            'NOT_FOUND',
            'FORBIDDEN',
            'COMMAND_CONFLICT',
            'IDEMPOTENCY_CONFLICT',
            'INVALID_INPUT',
            'INPUT_TOO_LARGE',
          ].includes(error.code)
        )
          throw new CommandError(error.code, error.message)
        throw new CommandError('RESULT_UNKNOWN', 'Queue edit requires receipt reconciliation')
      }
    },
    { durable: true },
  )
  registry.register(
    runCommands['queuedRun.remove'],
    async (input, context) => {
      const actorId = context.actorId,
        idempotencyKey = context.idempotencyKey
      if (!actorId || !idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
      try {
        return await kernel.removeQueuedRun(input, actorId, idempotencyKey)
      } catch (error) {
        if (
          error instanceof HbarError &&
          ['NOT_FOUND', 'FORBIDDEN', 'COMMAND_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'INVALID_INPUT'].includes(error.code)
        )
          throw new CommandError(error.code, error.message)
        throw new CommandError('RESULT_UNKNOWN', 'Queue removal requires receipt reconciliation')
      }
    },
    { durable: true },
  )
  registry.register(runCommands['operation.get'], async ({ operationId }) => {
    try {
      const run = await kernel.storage.call('run', operationId)
      const cancelRequested =
        ['running', 'waiting_approval'].includes(run.status) &&
        (await kernel.storage.call('cancelRequested', operationId))
      return {
        operationId: run.id,
        sessionId: run.sessionId,
        status: cancelRequested ? ('cancelRequested' as const) : run.status,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        error: run.error,
        ...(run.failure ? { failure: run.failure } : {}),
      }
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(
    runCommands['operation.cancel'],
    async ({ operationId }) => {
      try {
        await kernel.cancel(operationId)
        const run = await kernel.storage.call('run', operationId)
        if (run.status === 'queued' || run.status === 'running' || run.status === 'waiting_approval')
          return { operationId, status: 'cancelRequested' as const }
        return { operationId, status: run.status }
      } catch (error) {
        if (error instanceof HbarError && error.code === 'NOT_FOUND') throw new CommandError(error.code, error.message)
        throw new CommandError('RESULT_UNKNOWN', 'Cancellation requires operation reconciliation')
      }
    },
    { durable: true },
  )
  registry.register(
    runCommands['context.compact'],
    async ({ sessionId, modelId }, context) => {
      try {
        return await kernel.compact(sessionId, modelId, context.signal)
      } catch (error) {
        if (
          error instanceof HbarError &&
          ['NOTHING_TO_COMPACT', 'MODEL_NOT_FOUND', 'DEMO_DISABLED', 'BUSY'].includes(error.code)
        )
          throw new CommandError(error.code, error.message)
        if (error instanceof CommandError) throw error
        throw new CommandError('RESULT_UNKNOWN', 'Compaction outcome requires session reconciliation')
      }
    },
    { durable: true },
  )
  return {
    ...createCommandClient(runCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    async getReceipt(
      commandId: 'run.submit' | 'run.retry',
      sessionId: string,
      actorId: string,
      idempotencyKey: string,
    ): Promise<RunAccepted | null> {
      if (uncertainSessions.has(sessionId))
        throw new CommandError('RESULT_UNKNOWN', 'Run journal requires Host recovery')
      const scope = receiptScope(commandId, sessionId, actorId, idempotencyKey)
      const requestId = `command-${createHash('sha256').update(scope).digest('hex')}`
      let found
      try {
        found = await kernel.storage.call('runByRequest', sessionId, requestId)
      } catch {
        throw new CommandError('RESULT_UNKNOWN', 'Run journal is unavailable')
      }
      if (!found) return null
      if (!found.command || found.command.actorId !== actorId || found.command.idempotencyKey !== idempotencyKey)
        throw new CommandError('IDEMPOTENCY_CONFLICT', 'Run key belongs to another actor')
      return accepted(found.run, found.command)
    },
    async getQueuedRemoveReceipt(sessionId: string, actorId: string, idempotencyKey: string) {
      try {
        return await kernel.storage.call('queuedRunRemoveReceipt', actorId, idempotencyKey, sessionId)
      } catch (error) {
        if (error instanceof HbarError) throw new CommandError(error.code, error.message)
        throw new CommandError('RESULT_UNKNOWN', 'Queue removal receipt is unavailable')
      }
    },
    async getQueuedEditTextReceipt(sessionId: string, actorId: string, idempotencyKey: string) {
      try {
        return await kernel.storage.call('queuedRunEditTextReceipt', actorId, idempotencyKey, sessionId)
      } catch (error) {
        if (error instanceof HbarError) throw new CommandError(error.code, error.message)
        throw new CommandError('RESULT_UNKNOWN', 'Queue edit receipt is unavailable')
      }
    },
    dispose: () => registry.dispose(),
  }
}
