import { CONTEXT_COMPACTION_RPC_TIMEOUT_MS } from '@hbar/contracts/commands/run'
import type { RuntimeDriverCallbackValue } from '@hbar/plugin-sdk/runtime-driver'

/** Both routing hops must outlive Kernel's independently bounded compaction. */
export const DRIVER_COMPACTION_RPC_TIMEOUT_MS = CONTEXT_COMPACTION_RPC_TIMEOUT_MS
export const DRIVER_CALLBACK_TIMEOUT_CONTRACT = 'compaction-capable-callbacks-v1'
export function driverCallbackTimeoutMs(method: RuntimeDriverCallbackValue['method']): number {
  if (method === 'execute') return 2_147_483_647
  if (method === 'beforeRequest' || method === 'stepEnded') return DRIVER_COMPACTION_RPC_TIMEOUT_MS
  return 30_000
}
