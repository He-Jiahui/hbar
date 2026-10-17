import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import {
  sessionLaunchTargetCommands,
  sessionLaunchTargetSchema,
  sessionLaunchTargetPreparationSnapshotSchema,
  sessionLaunchTargetPreparationStartReceiptSchema,
  sessionLaunchTargetSetReceiptSchema,
} from '@hbar/contracts/commands/session-launch-target'
import type { SessionLaunchTargetSetInput } from '@hbar/contracts/commands/session-launch-target'
import type { SessionLaunchTargetCommandKernelPort } from './controller-port'

const rejectedBeforeCommit = new Set([
  'COMMAND_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'INVALID_INPUT',
  'NOT_FOUND',
  'SESSION_ARCHIVED',
  'SESSION_LAUNCH_TARGET_LOCKED',
  'BUSY',
])

function requestsEqual(left: SessionLaunchTargetSetInput, right: SessionLaunchTargetSetInput): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function createSessionLaunchTargetCommands(kernel: SessionLaunchTargetCommandKernelPort, changed: () => void) {
  const registry = new CommandRegistry({ execution: 'host' })
  const read = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }

  registry.register(sessionLaunchTargetCommands['sessionLaunchTarget.get'], async ({ sessionId }, context) => {
    if (!context.actorId) throw new CommandError('INVALID_INPUT', 'Authenticated actor is required')
    return sessionLaunchTargetSchema.parse(await read(() => kernel.getSessionLaunchTarget(sessionId)))
  })
  registry.register(
    sessionLaunchTargetCommands['sessionLaunchTarget.set'],
    async (request, context) => {
      const { actorId, idempotencyKey } = context
      if (!actorId || !idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
      try {
        const result = await kernel.setSessionLaunchTarget({ ...request, actorId, idempotencyKey })
        const parsed = sessionLaunchTargetSetReceiptSchema.safeParse(result)
        if (!parsed.success || !requestsEqual(parsed.data.request, request))
          throw new CommandError('RESULT_UNKNOWN', 'Launch target acknowledgement does not match this request')
        if (parsed.data.changed) changed()
        return parsed.data
      } catch (error) {
        if (error instanceof HbarError && rejectedBeforeCommit.has(error.code))
          throw new CommandError(error.code, error.message)
        if (error instanceof CommandError) throw error
        throw new CommandError('RESULT_UNKNOWN', 'Launch target acknowledgement was lost; inspect its receipt')
      }
    },
    { durable: true },
  )
  registry.register(sessionLaunchTargetCommands['sessionLaunchTarget.receipt'], async (input, context) => {
    if (!context.actorId) throw new CommandError('INVALID_INPUT', 'Authenticated actor is required')
    return read(async () => {
      const result = await kernel.storage.call('sessionLaunchTargetReceipt', {
        actorId: context.actorId!,
        ...input,
      })
      const parsed = sessionLaunchTargetSetReceiptSchema.nullable().safeParse(result)
      if (
        !parsed.success ||
        (parsed.data && parsed.data.request.sessionId !== input.sessionId)
      )
        throw new CommandError('INVALID_OUTPUT', 'Launch target receipt does not match the requested session')
      return parsed.data
    })
  })
  registry.register(
    sessionLaunchTargetCommands['sessionLaunchTarget.prepare'],
    async ({ sessionId, expectedRevision }, context) =>
      read(async () => {
        const target = await kernel.prepareSessionLaunchTarget(sessionId, expectedRevision, context.signal)
        changed()
        return sessionLaunchTargetSchema.parse(target)
      }),
    { durable: true },
  )
  registry.register(
    sessionLaunchTargetCommands['sessionLaunchTarget.reconcile'],
    async ({ sessionId, expectedRevision }, context) =>
      read(async () => {
        const target = await kernel.reconcileSessionLaunchTarget(sessionId, expectedRevision, context.signal)
        changed()
        return sessionLaunchTargetSchema.parse(target)
      }),
    { durable: true },
  )
  registry.register(
    sessionLaunchTargetCommands['sessionLaunchTarget.cancel'],
    async ({ sessionId, expectedRevision }) =>
      read(async () => {
        const target = await kernel.cancelSessionLaunchTarget(sessionId, expectedRevision)
        changed()
        return sessionLaunchTargetSchema.parse(target)
      }),
    { durable: true },
  )
  registry.register(
    sessionLaunchTargetCommands['sessionLaunchTarget.startPreparation'],
    async (request, context) => {
      if (!context.actorId || !context.idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
      try {
        const receipt = await kernel.startSessionLaunchTargetPreparation({
          ...request,
          actorId: context.actorId,
          idempotencyKey: context.idempotencyKey,
        })
        const parsed = sessionLaunchTargetPreparationStartReceiptSchema.safeParse(receipt)
        if (
          !parsed.success ||
          parsed.data.sessionId !== request.sessionId ||
          parsed.data.targetRevision !== request.expectedRevision
        )
          throw new CommandError('RESULT_UNKNOWN', 'Preparation acknowledgement does not match this request')
        changed()
        return parsed.data
      } catch (error) {
        if (error instanceof HbarError && rejectedBeforeCommit.has(error.code))
          throw new CommandError(error.code, error.message)
        if (error instanceof CommandError) throw error
        throw new CommandError('RESULT_UNKNOWN', 'Preparation acknowledgement was lost; retry with the same key')
      }
    },
    { durable: true },
  )
  registry.register(sessionLaunchTargetCommands['sessionLaunchTarget.preparation'], async (request, context) => {
    if (!context.actorId) throw new CommandError('INVALID_INPUT', 'Authenticated actor is required')
    return sessionLaunchTargetPreparationSnapshotSchema.parse(
      await read(() => kernel.readSessionLaunchTargetPreparation(request)),
    )
  })
  registry.register(
    sessionLaunchTargetCommands['sessionLaunchTarget.cancelPreparation'],
    async (request) => {
      const snapshot = sessionLaunchTargetPreparationSnapshotSchema.parse(
        await read(() => kernel.cancelSessionLaunchTargetPreparation(request)),
      )
      changed()
      return snapshot
    },
    { durable: true },
  )
  registry.register(
    sessionLaunchTargetCommands['sessionLaunchTarget.reconcilePreparation'],
    async (request) => {
      const snapshot = sessionLaunchTargetPreparationSnapshotSchema.parse(
        await read(() => kernel.reconcileSessionLaunchTargetPreparation(request)),
      )
      changed()
      return snapshot
    },
    { durable: true },
  )
  return {
    ...createCommandClient(sessionLaunchTargetCommands, registry),
    dispatchPrepared: registry.dispatchPrepared.bind(registry),
    dispatchPreparedTracked: registry.dispatchPreparedTracked.bind(registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
