import { CommandError, createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import {
  sessionLaunchTargetCommands,
  sessionLaunchTargetSetInputSchema,
  type SessionLaunchTargetPreparationManager,
  type SessionLaunchTargetReadOptions,
} from '@hbar/contracts/commands/session-launch-target'
import { createSessionLaunchTargetReader, type SessionLaunchTargetReadTransport } from './session-launch-target'

/** Leaving an observation is not a remote cancellation or proof a write failed. */
function observe<Result>(
  pending: Promise<Result>,
  options: SessionLaunchTargetReadOptions | undefined,
  mutation: boolean,
): Promise<Result> {
  const signal = options?.signal
  if (!signal) return pending
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', cancel)
    const cancel = () => {
      cleanup()
      reject(
        new CommandError(
          mutation ? 'RESULT_UNKNOWN' : 'CANCELLED',
          mutation
            ? 'Launch preparation observation ended after dispatch; reconcile the original idempotency key'
            : 'Launch preparation query observation was cancelled',
        ),
      )
    }
    signal.addEventListener('abort', cancel, { once: true })
    // Consume both late outcomes, including an abort synchronously during dispatch.
    void pending.then(
      (result) => {
        cleanup()
        resolve(result)
      },
      (error: unknown) => {
        cleanup()
        reject(error)
      },
    )
    if (signal.aborted) cancel()
  })
}

async function verifyWrite<Result>(pending: Promise<Result>, matches: (result: Result) => boolean): Promise<Result> {
  try {
    const result = await pending
    if (!matches(result)) throw new CommandError('INVALID_OUTPUT', 'Launch preparation acknowledgement does not match')
    return result
  } catch (error: unknown) {
    // A malformed acknowledgement is not evidence that its dispatched mutation did not happen.
    if (error instanceof CommandError && error.code === 'INVALID_OUTPUT')
      throw new CommandError(
        'RESULT_UNKNOWN',
        'Launch preparation acknowledgement could not be verified; reconcile the original request',
      )
    throw error
  }
}

/** Narrow authenticated adapter. It neither chooses a cwd nor invokes legacy slow preparation. */
export function createSessionLaunchTargetPreparationManager(
  transport: SessionLaunchTargetReadTransport,
): SessionLaunchTargetPreparationManager {
  const reader = createSessionLaunchTargetReader(transport)
  const definitions = {
    'sessionLaunchTarget.set': sessionLaunchTargetCommands['sessionLaunchTarget.set'],
    'sessionLaunchTarget.receipt': sessionLaunchTargetCommands['sessionLaunchTarget.receipt'],
    'sessionLaunchTarget.startPreparation': sessionLaunchTargetCommands['sessionLaunchTarget.startPreparation'],
    'sessionLaunchTarget.preparation': sessionLaunchTargetCommands['sessionLaunchTarget.preparation'],
    'sessionLaunchTarget.cancelPreparation': sessionLaunchTargetCommands['sessionLaunchTarget.cancelPreparation'],
    'sessionLaunchTarget.reconcilePreparation': sessionLaunchTargetCommands['sessionLaunchTarget.reconcilePreparation'],
  }
  const commands = createCommandClient(definitions, {
    async execute(commandId, input, options) {
      const mutation = commandId !== 'sessionLaunchTarget.receipt' && commandId !== 'sessionLaunchTarget.preparation'
      const idempotencyKey = options?.idempotencyKey
      if (mutation && !idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Launch preparation writes require an original idempotency key')
      if (options?.signal?.aborted) throw new CommandError('CANCELLED', 'Launch preparation request was not dispatched')
      try {
        return await observe(
          transport.call('command.execute', {
            protocol: COMMAND_PROTOCOL_VERSION,
            requestId: options?.requestId ?? crypto.randomUUID(),
            commandId,
            commandVersion: options?.version ?? 1,
            ...(mutation && idempotencyKey ? { idempotencyKey } : {}),
            input,
          }),
          options,
          mutation,
        )
      } catch (error: unknown) {
        if (mutation && error instanceof HbarError && ['TIMEOUT', 'DISCONNECTED'].includes(error.code))
          throw new CommandError('RESULT_UNKNOWN', 'Launch preparation response was lost; reconcile the original key')
        throw error
      }
    },
  })
  return {
    readTarget(sessionId, options) {
      return reader.read(sessionId, options)
    },
    setSelection(input, options) {
      // Compare canonical schema output: branch whitespace is normalized at the boundary.
      return verifyWrite(
        commands.execute('sessionLaunchTarget.set', input, options),
        (receipt) => JSON.stringify(receipt.request) === JSON.stringify(sessionLaunchTargetSetInputSchema.parse(input)),
      )
    },
    async readSelectionReceipt(input, options) {
      const receipt = await commands.execute('sessionLaunchTarget.receipt', input, options)
      if (receipt && receipt.request.sessionId !== input.sessionId)
        throw new CommandError('INVALID_OUTPUT', 'Launch selection receipt belongs to another session')
      return receipt
    },
    startPreparation(input, options) {
      return verifyWrite(
        commands.execute('sessionLaunchTarget.startPreparation', input, options),
        (receipt) => receipt.sessionId === input.sessionId && receipt.targetRevision === input.expectedRevision,
      )
    },
    async readPreparation(input, options) {
      const snapshot = await commands.execute('sessionLaunchTarget.preparation', input, options)
      if (
        snapshot.sessionId !== input.sessionId ||
        snapshot.targetRevision !== input.expectedRevision ||
        snapshot.operationId !== input.operationId
      )
        throw new CommandError('INVALID_OUTPUT', 'Preparation snapshot belongs to another operation')
      return snapshot
    },
    cancelPreparation(input, options) {
      return verifyWrite(
        commands.execute('sessionLaunchTarget.cancelPreparation', input, options),
        (snapshot) =>
          snapshot.sessionId === input.sessionId &&
          snapshot.targetRevision === input.expectedRevision &&
          snapshot.operationId === input.operationId,
      )
    },
    reconcilePreparation(input, options) {
      return verifyWrite(
        commands.execute('sessionLaunchTarget.reconcilePreparation', input, options),
        (snapshot) =>
          snapshot.sessionId === input.sessionId &&
          snapshot.targetRevision === input.expectedRevision &&
          snapshot.operationId === input.operationId,
      )
    },
  }
}
