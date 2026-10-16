import { createCommandClient, COMMAND_PROTOCOL_VERSION, CommandError } from '@hbar/commands'
import { interactionCommands } from '@hbar/contracts/commands/interaction'
import { HbarError } from '@hbar/contracts'
import type { ClientTransport } from './transport'

export function createInteractionCommandClient(client: ClientTransport) {
  return createCommandClient(interactionCommands, {
    async execute(commandId, input, options) {
      try {
        return await client.call('command.execute', {
          protocol: COMMAND_PROTOCOL_VERSION,
          requestId: options?.requestId ?? crypto.randomUUID(),
          commandId,
          commandVersion: options?.version ?? 1,
          input,
          ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
        })
      } catch (error) {
        if (error instanceof HbarError && ['DISCONNECTED', 'TIMEOUT'].includes(error.code))
          throw new CommandError(
            'RESULT_UNKNOWN',
            `${commandId} response was lost; inspect the session before retrying`,
          )
        throw error
      }
    },
  })
}

/** Read missed facts without changing the reconnecting client's tracked timeline cursor. */
export function createInteractionRecoveryClient(client: ClientTransport) {
  return {
    getPlanExit(target: {
      readonly sessionId: string
      readonly approvalId: string
      readonly runId: string
      readonly callId: string
    }) {
      return createInteractionCommandClient(client).execute('planExit.get', target)
    },
    follow(sessionId: string, cursor: number) {
      return client.call('session.follow', { sessionId, cursor })
    },
  }
}
