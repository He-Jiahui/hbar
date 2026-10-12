import { setTimeout as pause } from 'node:timers/promises'
import { HbarError } from '@hbar/contracts'
import { nodeReceiptSchema, type NodeReceipt } from '@hbar/contracts/node'
import type { ToolResult } from '@hbar/plugin-sdk'
import { nodeOperationKey, nodeTargetBinding, type NodeExecutionPort, type NodeExecutionTarget } from './execution-port'

function unknownResult(): ToolResult {
  return {
    text: 'The workspace node execution has no verified terminal receipt; do not replay it.',
    isError: true,
    details: { code: 'EFFECT_UNKNOWN', executionStarted: true },
  }
}
function terminal(receipt: NodeReceipt): ToolResult | undefined {
  if (receipt.state === 'settled') return receipt.result
  if (receipt.state === 'lost') return unknownResult()
  return undefined
}
/** One stable start, bounded receipt polling and explicit cancellation; never replay a start after uncertainty. */
export async function executeNodeCommand(
  port: NodeExecutionPort,
  target: NodeExecutionTarget,
  command: string,
  timeoutMs: number,
): Promise<ToolResult> {
  const operationId = nodeOperationKey(target.authority)
  let sent = false,
    cancelling: Promise<NodeReceipt | null> | undefined
  const cancel = () => {
    if (!sent) return Promise.resolve<NodeReceipt | null>(null)
    cancelling ??= port
      .call(target.location.nodeId, 'exec.cancel', { operationId }, AbortSignal.timeout(125_000))
      .then(
        (value) => nodeReceiptSchema.parse(value),
        () => null,
      )
      .catch(() => null)
    return cancelling
  }
  const onAbort = () => {
    void cancel()
  }
  target.signal.addEventListener('abort', onAbort, { once: true })
  const end = Date.now() + timeoutMs + 5_000
  try {
    target.signal.throwIfAborted()
    sent = true
    let receipt = nodeReceiptSchema.parse(
      await port.call(
        target.location.nodeId,
        'exec.start',
        {
          ...nodeTargetBinding(target),
          ...target.authority,
          operationId,
          cwd: '.',
          command,
          timeoutMs,
        },
        target.signal,
      ),
    )
    let pollMs = 50
    while (!terminal(receipt)) {
      if (receipt.state === 'absent') {
        // Serialize cancellation with admission so absence cannot race a still-pending start.
        const confirmed = await cancel()
        if (confirmed?.state === 'absent')
          return {
            text: 'The node never accepted this execution.',
            isError: true,
            details: { code: 'NODE_NOT_STARTED', executionStarted: false },
          }
        return confirmed ? (terminal(confirmed) ?? unknownResult()) : unknownResult()
      }
      if (target.signal.aborted || Date.now() >= end) {
        const confirmed = await cancel()
        return confirmed ? (terminal(confirmed) ?? unknownResult()) : unknownResult()
      }
      await pause(Math.min(pollMs, Math.max(1, end - Date.now())), undefined, { signal: target.signal })
      pollMs = Math.min(1_000, pollMs * 2)
      receipt = nodeReceiptSchema.parse(
        await port.call(target.location.nodeId, 'exec.receipt', { operationId }, target.signal),
      )
    }
    return terminal(receipt) ?? unknownResult()
  } catch (error) {
    if (!sent)
      return {
        text: error instanceof Error ? error.message : 'Node execution was not sent.',
        isError: true,
        details: { code: 'CANCELLED', executionStarted: false },
      }
    if (error instanceof HbarError && error.code === 'IDEMPOTENCY_CONFLICT') return unknownResult()
    // A cancellation acknowledgement also fences an original start that was interrupted during admission.
    const confirmed = await cancel()
    if (confirmed?.state === 'absent')
      return {
        text: 'The node did not start the interrupted execution.',
        isError: true,
        details: { code: error instanceof HbarError ? error.code : 'NODE_NOT_STARTED', executionStarted: false },
      }
    return confirmed ? (terminal(confirmed) ?? unknownResult()) : unknownResult()
  } finally {
    target.signal.removeEventListener('abort', onAbort)
  }
}
