import { COMMAND_PROTOCOL_VERSION, createCommandClient, type ExecuteOptions } from '@hbar/commands'
import { runBoardCommands } from '@hbar/contracts/commands/run-board'
import type { RunBoardInput, RunBoardPage } from '@hbar/contracts/commands/run-board'
import type { ClientTransport } from './transport'

/**
 * Typed transport adapter for the run board query.
 *
 * The board is a read-only projection owned by the Host. This client only
 * forwards the canonical command invocation and validates the response through
 * the command definition; run mutations remain on createRunCommandClient.
 */
export function createRunBoardCommandClient(client: ClientTransport) {
  const commands = createCommandClient(runBoardCommands, {
    execute(commandId, input, options) {
      options?.signal?.throwIfAborted()
      return client.call('command.execute', {
        protocol: COMMAND_PROTOCOL_VERSION,
        requestId: options?.requestId ?? crypto.randomUUID(),
        commandId,
        commandVersion: options?.version ?? 1,
        input,
      })
    },
  })

  return {
    ...commands,
    list(input: RunBoardInput, options?: ExecuteOptions): Promise<RunBoardPage> {
      return commands.execute('run.board.list', input, options)
    },
  }
}
