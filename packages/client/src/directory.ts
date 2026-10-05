import { HbarError } from '@hbar/contracts'
import { directoryCommands } from '@hbar/contracts/commands'
import { createWorkspaceSessionCommandClient } from './workspaces'
import type { ClientTransport } from './transport'

/** Narrow read-only adapter. It never exposes ClientTransport to a View or imports app-runtime. */
export function createDirectoryQueryAdapter(client: ClientTransport) {
  const commands = createWorkspaceSessionCommandClient(client)
  return {
    async execute(name: string, input: unknown): Promise<unknown> {
      switch (name) {
        case 'session.agentChildren.list':
        case 'session.agentAncestors.get': {
          const parsed = directoryCommands[name].input.safeParse(input)
          if (!parsed.success) throw new HbarError('INVALID_INPUT', 'Invalid Agent directory query')
          return commands.execute(name, parsed.data)
        }
        case 'session.execution.get':
        case 'workspace.sidebar.list':
        case 'session.activity.global.list':
        case 'workspace.activity.list':
          return commands.execute(name, input as never)
        case 'workspace.list':
          return commands.execute(name, input as never)
        case 'workspace.get':
          return commands.execute(name, input as never)
        case 'session.list':
          return commands.execute(name, input as never)
        case 'session.activity.list':
        case 'session.sidebar.list':
          return commands.execute(name, input as never)
        case 'session.get':
          return commands.execute(name, input as never)
        default:
          throw new HbarError('METHOD_NOT_FOUND', 'Unsupported directory query')
      }
    },
  }
}
