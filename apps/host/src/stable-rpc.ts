import { rpcSchemas } from '@hbar/contracts'

const connectionMethods = new Set([
  'command.client.register',
  'command.client.unregister',
  'command.client.reply',
  'command.client.list',
  'system.hello',
  'system.runtime.watch',
  'system.runtime.unwatch',
  'session.follow',
  'session.unfollow',
  'operation.watch',
  'operation.unwatch',
  'metrics.watch',
  'metrics.unwatch',
  'terminal.open',
  'terminal.input',
  'terminal.resize',
  'terminal.close',
  'terminal.list',
  'surface.register',
  'surface.unregister',
  'surface.list',
  'surface.invoke',
  'surface.resolve',
])
const managementCommands = new Set([
  'system.runtime.get',
  'system.runtime.reload',
  'system.runtime.reload.get',
  'system.runtime.reload.cancel',
  'node.invite',
  'node.list',
  'node.revoke',
  'workspace.create',
])
const maintenanceControls = new Set(['chatDatabase.operation', 'chatDatabase.receipt', 'chatDatabase.cancel'])
/** Listener identity, native resources and recovery management remain available across Controller replacement. */
export function isStableRpc(method: string, params: unknown): boolean {
  if (connectionMethods.has(method)) return true
  if (method !== 'command.execute') return false
  const input = rpcSchemas['command.execute'].safeParse(params)
  return (
    input.success && (managementCommands.has(input.data.commandId) || maintenanceControls.has(input.data.commandId))
  )
}
export function isRecoveryControl(method: string, params: unknown): boolean {
  if (isRuntimeMetadataRead(method, params)) return true
  if (method !== 'command.execute') return false
  const input = rpcSchemas['command.execute'].safeParse(params)
  return (
    input.success &&
    (maintenanceControls.has(input.data.commandId) || input.data.commandId === 'system.runtime.reload.cancel')
  )
}
/** These projections use only the already authenticated connection identity. */
export function isRuntimeMetadataRead(method: string, params: unknown): boolean {
  return method === 'system.runtime.watch' || method === 'system.runtime.unwatch' || isRuntimeStatusRead(method, params)
}
export function isRuntimeStatusRead(method: string, params: unknown): boolean {
  if (method !== 'command.execute') return false
  const input = rpcSchemas['command.execute'].safeParse(params)
  return (
    input.success &&
    (input.data.commandId === 'system.runtime.get' || input.data.commandId === 'system.runtime.reload.get')
  )
}
