import { z } from 'zod'
import {
  executionHumanWaitSchema,
  executionHumanWaitFinishSchema,
  type ExecutionWaitDecision,
} from '@hbar/contracts/execution-waits'
import { HbarError } from '@hbar/contracts/errors'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import type { IpcPeer } from '@hbar/runtime'

export async function withRuntimeHumanWait<Result>(
  peer: IpcPeer,
  execution: ExecutionOwnership,
  callId: string,
  decision: ExecutionWaitDecision,
  operation: (confirmed: boolean) => Promise<Result>,
  options: { readonly suspendLocal?: () => () => void; readonly pollIntervalMs?: number } = {},
): Promise<Result> {
  const input = executionHumanWaitSchema.parse({
    waitId: crypto.randomUUID(),
    execution,
    callId,
    decision,
    capacity: true,
  })
  const pollIntervalMs = options.pollIntervalMs ?? 250
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1 || pollIntervalMs > 1_000)
    throw new HbarError('INVALID_INPUT', 'Execution capacity polling requires a bounded interval')
  let resumeLocal: (() => void) | undefined
  let outcome: { kind: 'value'; value: Result } | { kind: 'error'; error: unknown }
  try {
    const confirmed = await peer.call('execution.humanWait.begin', input, z.boolean(), {
      timeoutMs: 30_000,
      ownership: execution,
    })
    if (confirmed) resumeLocal = options.suspendLocal?.()
    outcome = { kind: 'value', value: await operation(confirmed) }
  } catch (error) {
    outcome = { kind: 'error', error }
  }
  // Cleanup belongs to the original caller even if its claim was revoked or begin's acknowledgement was lost.
  try {
    let state = await peer.call('execution.humanWait.finish', input, executionHumanWaitFinishSchema, {
      timeoutMs: 30_000,
    })
    while (state === 'waiting_capacity') {
      await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs))
      state = await peer.call('execution.humanWait.finish', input, executionHumanWaitFinishSchema, {
        timeoutMs: 30_000,
      })
    }
    if (state === 'stopped' && outcome.kind === 'value')
      outcome = {
        kind: 'error',
        error: new HbarError('USER_CANCELLED', 'The source Run stopped before execution capacity was reacquired'),
      }
  } catch (error) {
    if (outcome.kind === 'value') outcome = { kind: 'error', error }
  } finally {
    resumeLocal?.()
  }
  if (outcome.kind === 'error') throw outcome.error
  return outcome.value
}
