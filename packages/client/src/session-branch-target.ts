import { CommandError, createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { sessionBranchTargetCommands } from '@hbar/contracts/commands/session-branch-target'
import type { ClientTransport } from './transport'

/** Mutations retain their operation key when transport observation is lost. */
export function createSessionBranchTargetCommandClient(client: ClientTransport) {
  return createCommandClient(sessionBranchTargetCommands, {
    async execute(commandId, input, options) {
      const mutation = commandId === 'sessionBranchTarget.select' || commandId === 'sessionBranchTarget.reconcile'
      if (options?.signal?.aborted) throw new CommandError('CANCELLED', 'Branch operation was not dispatched')
      try {
        return await client.call('command.execute', {
          protocol: COMMAND_PROTOCOL_VERSION,
          requestId: options?.requestId ?? crypto.randomUUID(),
          commandId,
          commandVersion: options?.version ?? 1,
          ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
          input,
        })
      } catch (error) {
        if (
          mutation &&
          error instanceof HbarError &&
          ['DISCONNECTED', 'CONNECTION_CLOSED', 'TIMEOUT'].includes(error.code)
        )
          throw new CommandError(
            'RESULT_UNKNOWN',
            'The branch operation response was lost; read or reconcile the original operation',
          )
        throw error
      }
    },
  })
}
