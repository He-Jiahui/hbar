import { HbarError } from '@hbar/contracts'
import { createWorkspaceSessionCommandClient } from './workspaces'
import type { ClientTransport } from './transport'

/** Narrow read-only adapter. It never exposes ClientTransport to a View or imports app-runtime. */
export function createDirectoryQueryAdapter(client: ClientTransport) {
  const commands = createWorkspaceSessionCommandClient(client)
  return {
    async execute(name: string, input: unknown): Promise<unknown> {
      switch (name) {
        case 'workspace.list':
          return commands.execute(name, input as never)
        case 'workspace.get':
          return commands.execute(name, input as never)
        case 'session.list':
          return commands.execute(name, input as never)
        case 'session.get':
          return commands.execute(name, input as never)
        default:
          throw new HbarError('METHOD_NOT_FOUND', 'Unsupported directory query')
      }
    },
  }
}
