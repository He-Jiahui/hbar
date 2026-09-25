import { CommandError, createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { directoryCommands } from '@hbar/contracts/commands'
import { workspaceSessionCommands } from '@hbar/contracts/commands/workspaces'
import type { SessionEvent } from '@hbar/contracts'
import type { ClientTransport } from './transport'

export const allWorkspaceSessionCommands = { ...directoryCommands, ...workspaceSessionCommands }
const writes = new Set(Object.keys(workspaceSessionCommands).filter((id) => id !== 'session.export'))

export function createWorkspaceSessionCommandClient(client: ClientTransport) {
  return createCommandClient(allWorkspaceSessionCommands, {
    async execute(commandId, input, options) {
      if (['session.create', 'session.fork', 'session.forkFromMessage'].includes(commandId) && !options?.idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'An idempotency key is required for this command')
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
        if (writes.has(commandId) && error instanceof HbarError && ['DISCONNECTED', 'TIMEOUT'].includes(error.code))
          throw new CommandError('RESULT_UNKNOWN', 'Entity command response was lost; inspect directory state')
        throw error
      }
    },
  })
}

export async function exportSessionEvents(client: ClientTransport, sessionId: string): Promise<SessionEvent[]> {
  const commands = createWorkspaceSessionCommandClient(client)
  const events: SessionEvent[] = []
  let after = 0
  for (;;) {
    const page = await commands.execute('session.export', { sessionId, after, limit: 500 })
    events.push(...page.events)
    if (events.length > 100_000) throw new CommandError('INPUT_TOO_LARGE', 'Session export exceeds 100000 events')
    if (page.nextCursor === null) return events
    if (page.nextCursor <= after) throw new CommandError('INVALID_OUTPUT', 'Session export cursor did not advance')
    after = page.nextCursor
  }
}
