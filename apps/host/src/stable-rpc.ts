import { z } from 'zod'
import { rpcSchemas } from '@hbar/contracts'

const connectionMethods = new Set([
  'system.hello', 'session.follow', 'session.unfollow', 'operation.watch', 'operation.unwatch', 'metrics.watch', 'metrics.unwatch',
  'terminal.open', 'terminal.write', 'terminal.resize', 'terminal.close', 'terminal.list',
  'surface.register', 'surface.unregister', 'surface.list', 'surface.invoke', 'surface.resolve',
])
const managementCommands = new Set(['system.runtime.get', 'system.runtime.reload', 'system.runtime.reload.get', 'system.runtime.reload.cancel'])
/** Listener identity, native resources and recovery management remain available across Controller replacement. */
export function isStableRpc(method: string, params: unknown): boolean {
  if (connectionMethods.has(method)) return true
  if (method !== 'command.execute') return false
  const input = rpcSchemas['command.execute'].safeParse(params)
  return input.success && managementCommands.has(z.object({ commandId: z.string() }).parse(input.data).commandId)
}
export function isRuntimeStatusRead(method: string, params: unknown): boolean {
  if (method !== 'command.execute') return false
  const input = rpcSchemas['command.execute'].safeParse(params)
  return input.success && (input.data.commandId === 'system.runtime.get' || input.data.commandId === 'system.runtime.reload.get')
}
