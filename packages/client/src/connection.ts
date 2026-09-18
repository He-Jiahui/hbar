import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError, type HostInfo } from '@hbar/contracts'
import { connectionCommands, type ConnectionCommandState } from '@hbar/contracts/commands/connection'
import type { ConnectionStatus } from './index'

export interface ConnectionCommandPort {
  connect(): Promise<HostInfo>
  disconnect(): void
  pair(code: string, name: string, signal?: AbortSignal): Promise<HostInfo>
  connectionStatus(): ConnectionStatus
  connectionHost(): HostInfo | null
}

export function createConnectionCommands(client: ConnectionCommandPort) {
  const registry = new CommandRegistry({ execution: 'client' })
  const translate = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  const state = (): ConnectionCommandState => ({
    status: client.connectionStatus(),
    host: client.connectionHost(),
  })
  registry.register(connectionCommands['connection.status'], state)
  registry.register(connectionCommands['connection.connect'], async () => {
    await translate(() => client.connect())
    return state()
  })
  registry.register(connectionCommands['connection.disconnect'], () => {
    client.disconnect()
    return state()
  })
  registry.register(connectionCommands['connection.reconnect'], async () => {
    client.disconnect()
    await translate(() => client.connect())
    return state()
  })
  registry.register(connectionCommands['pairing.accept'], async ({ code, name }, context) => {
    if (['connected', 'connecting'].includes(client.connectionStatus()))
      throw new CommandError('INVALID_INPUT', 'Disconnect before accepting a new pairing code')
    await translate(() => client.pair(code, name, context.signal))
    return state()
  })
  return {
    ...createCommandClient(connectionCommands, registry),
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
