import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { executionOwnershipSchema } from '@hbar/contracts/runtime'
import type { StorageMethods } from './types'
import { STORAGE_RPC_METHODS } from './rpc-catalog'

export const storageRpcCallSchema = z.strictObject({
  method: z.enum(STORAGE_RPC_METHODS),
  args: z.array(z.unknown()).max(32),
  authority: executionOwnershipSchema.optional(),
})
export type StorageRpcCall = z.infer<typeof storageRpcCallSchema>
export interface StorageRpcPort {
  execute(call: StorageRpcCall): Promise<unknown>
}
const methodNames: ReadonlySet<keyof StorageMethods> = new Set(STORAGE_RPC_METHODS)
export function storageRpcInput<K extends keyof StorageMethods>(method: K, args: Parameters<StorageMethods[K]>, authority?: z.infer<typeof executionOwnershipSchema>): StorageRpcCall {
  if (!methodNames.has(method)) throw new HbarError('STORAGE_METHOD_UNAVAILABLE', 'Storage method is absent from the registered contract')
  return storageRpcCallSchema.parse({ method, args, ...(authority ? { authority } : {}) })
}
/** The same public typed method port is used on both sides of the validated IPC descriptor. */
export async function callStorageRpc<K extends keyof StorageMethods>(port: StorageRpcPort, method: K, args: Parameters<StorageMethods[K]>, authority?: z.infer<typeof executionOwnershipSchema>): Promise<ReturnType<StorageMethods[K]>> {
  const result: unknown = await port.execute(storageRpcInput(method, args, authority))
  return result as ReturnType<StorageMethods[K]>
}
