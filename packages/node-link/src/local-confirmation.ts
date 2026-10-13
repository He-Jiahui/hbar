import { setTimeout as pause } from 'node:timers/promises'
import { createHash } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import { canonicalSandboxJSON } from '@hbar/sandbox'
import type { NodeLocalConfirmationRunLookup } from '@hbar/contracts/node-confirmations'
import { nodeLocalConfirmationStatusSchema } from '@hbar/contracts/node-confirmations'
import { nodeOperationKey } from './execution-port'
import type { NodeExecutionPort, NodeExecutionTarget } from './execution-port'

export function nodeRunConfirmationLookup(
  target: NodeExecutionTarget,
  rootId: string,
  expectedRoot: string,
  argumentsValue: unknown,
): NodeLocalConfirmationRunLookup {
  return {
    operationId: nodeOperationKey(target.authority),
    rootId,
    expectedRoot,
    authority: target.authority,
    admissionDigest: createHash('sha256')
      .update(canonicalSandboxJSON({ sandbox: target.authority.sandbox, admission: target.authority.admission }))
      .digest('hex'),
    argumentsDigest: createHash('sha256').update(canonicalSandboxJSON(argumentsValue)).digest('hex'),
  }
}

/** Polls only the named confirmation query; it never retries an effectful method. */
export async function waitForNodeConfirmation(
  port: NodeExecutionPort,
  target: NodeExecutionTarget,
  input: NodeLocalConfirmationRunLookup,
  maxWaitMs = 60_000,
): Promise<'approved' | 'rejected' | 'cancelled' | 'expired'> {
  const end = Date.now() + maxWaitMs
  let delayMs = 100
  try {
    while (Date.now() < end) {
      target.signal.throwIfAborted()
      const status = nodeLocalConfirmationStatusSchema.parse(
        await port.call(target.location.nodeId, 'node.confirmation.status', input, target.signal),
      )
      if (status === 'approved' || status === 'rejected' || status === 'cancelled' || status === 'expired')
        return status
      if (status === 'consumed')
        throw new HbarError('EFFECT_UNKNOWN', 'The approved operation was already consumed; reconcile its receipt')
      if (status === 'absent')
        throw new HbarError('NODE_CONFIRMATION_UNKNOWN', 'The B node has no matching confirmation record')
      await pause(Math.min(delayMs, Math.max(1, end - Date.now())), undefined, { signal: target.signal })
      delayMs = Math.min(1_000, delayMs * 2)
    }
    await port
      .call(target.location.nodeId, 'node.confirmation.cancel', input, AbortSignal.timeout(5_000))
      .catch(() => undefined)
    return 'expired'
  } catch (error) {
    if (target.signal.aborted)
      await port
        .call(target.location.nodeId, 'node.confirmation.cancel', input, AbortSignal.timeout(5_000))
        .catch(() => undefined)
    throw error
  }
}

export async function cancelNodeConfirmation(
  port: NodeExecutionPort,
  target: NodeExecutionTarget,
  input: NodeLocalConfirmationRunLookup,
): Promise<void> {
  await port
    .call(target.location.nodeId, 'node.confirmation.cancel', input, AbortSignal.timeout(5_000))
    .catch(() => undefined)
}
