import { HbarError, rpcSchemas } from '@hbar/contracts'
import type { ClientTransport } from './transport'

/** Narrow read-only adapter. It never exposes ClientTransport to a View or imports app-runtime. */
export function createDirectoryQueryAdapter(client: ClientTransport) {
  return {
    async execute(name: string, input: unknown): Promise<unknown> {
      switch (name) {
        case 'workspace.list':
          return client.call(name, rpcSchemas[name].parse(input))
        case 'workspace.get':
          return client.call(name, rpcSchemas[name].parse(input))
        case 'session.list':
          return client.call(name, rpcSchemas[name].parse(input))
        case 'session.get':
          return client.call(name, rpcSchemas[name].parse(input))
        default:
          throw new HbarError('METHOD_NOT_FOUND', 'Unsupported directory query')
      }
    },
  }
}
