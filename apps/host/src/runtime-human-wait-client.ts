import { z } from 'zod'
import { executionHumanWaitSchema, type ExecutionWaitDecision } from '@hbar/contracts/execution-waits'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import type { IpcPeer } from '@hbar/runtime'

export async function withRuntimeHumanWait<Result>(
  peer: IpcPeer,
  execution: ExecutionOwnership,
  callId: string,
  decision: ExecutionWaitDecision,
  operation: () => Promise<Result>,
): Promise<Result> {
  const input = executionHumanWaitSchema.parse({ waitId: crypto.randomUUID(), execution, callId, decision })
  try {
    await peer.call('execution.humanWait.begin', input, z.boolean(), { timeoutMs: 30_000, ownership: execution })
    return await operation()
  } finally {
    // Cleanup belongs to the original caller even if its claim was revoked or begin's acknowledgement was lost.
    await peer.call('execution.humanWait.end', input, z.undefined(), { timeoutMs: 30_000 })
  }
}
