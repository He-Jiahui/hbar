import { CommandError, createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { gitCommands } from '@hbar/contracts/commands/git'
import type { ClientTransport } from './transport'

const externalCommands = new Set(['git.commit', 'git.branch', 'git.worktree'])

export function createGitCommandClient(client: ClientTransport) {
  return createCommandClient(gitCommands, {
    async execute(commandId, input, options) {
      try {
        return await client.call('command.execute', {
          protocol: COMMAND_PROTOCOL_VERSION,
          requestId: options?.requestId ?? crypto.randomUUID(),
          commandId,
          commandVersion: options?.version ?? 1,
          input,
        })
      } catch (error) {
        if (
          externalCommands.has(commandId) &&
          error instanceof HbarError &&
          ['DISCONNECTED', 'TIMEOUT'].includes(error.code)
        )
          throw new CommandError('RESULT_UNKNOWN', 'Git mutation response was lost; inspect repository state')
        throw error
      }
    },
  })
}
