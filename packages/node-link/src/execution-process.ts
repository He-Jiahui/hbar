import { setTimeout as pause } from 'node:timers/promises'
import { AsyncLocalStorage } from 'node:async_hooks'
import { HbarError } from '@hbar/contracts'
import { canonicalSandboxJSON } from '@hbar/sandbox'
import { nodeExecStartSchema, nodeReceiptSchema, type NodeReceipt } from '@hbar/contracts/node'
import { nodeLocalConfirmationStatusSchema } from '@hbar/contracts/node-confirmations'
import type { ToolResult } from '@hbar/plugin-sdk'
import { nodeOperationKey, nodeTargetBinding, type NodeExecutionPort, type NodeExecutionTarget } from './execution-port'
import { createHash } from 'node:crypto'

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
function noStartResult(code: string, text: string): ToolResult {
  return { text, isError: true, details: { code, executionStarted: false } }
}
/** One stable start, bounded receipt polling and explicit cancellation; never replay a start after uncertainty. */
export async function executeNodeCommand(
  port: NodeExecutionPort,
  target: NodeExecutionTarget,
  command: string,
  timeoutMs: number,
): Promise<ToolResult> {
  const operationId = nodeOperationKey(target.authority)
  const startInput = nodeExecStartSchema.parse({
    ...nodeTargetBinding(target),
    ...target.authority,
    operationId,
    cwd: '.',
    command,
    timeoutMs,
  })
  const lookup = {
    operationId,
    rootId: target.location.rootId,
    expectedRoot: target.location.nodePath,
    authority: target.authority,
    admissionDigest: createHash('sha256')
      .update(canonicalSandboxJSON({ sandbox: target.authority.sandbox, admission: target.authority.admission }))
      .digest('hex'),
    argumentsDigest: createHash('sha256').update(canonicalSandboxJSON(startInput)).digest('hex'),
  }
  let sent = false,
    retriedAfterApproval = false,
    cancelling: Promise<NodeReceipt | null> | undefined
  let outputCursor = 0
  let outputStreamId: string | undefined
  let outputAvailable = true
  let outputCreditInitialized = false
  const pumpOutput = async () => {
    if (!target.reportOutput || !outputAvailable) return
    for (;;) {
      let page
      try {
        page = await port.call(
          target.location.nodeId,
          'exec.output.read',
          { operationId, afterSeq: outputCursor },
          target.signal,
        )
      } catch (error) {
        if (error instanceof HbarError && error.code === 'NODE_OUTPUT_UNAVAILABLE') {
          outputAvailable = false
          return
        }
        throw error
      }
      if (outputStreamId !== page.streamId || page.reset) {
        outputStreamId = page.streamId
        outputCursor = page.items[0] ? page.items[0].seq - 1 : page.cursor
        await target.reportOutput({
          streamId: page.streamId,
          seq: outputCursor,
          text: '',
          reset: true,
          ...(page.reset ? { reason: 'retention' as const } : {}),
        })
      }
      let consumedBytes = 0
      for (const item of page.items) {
        if (item.seq <= outputCursor) continue
        if (item.seq !== outputCursor + 1) {
          outputCursor = item.seq - 1
          await target.reportOutput({
            streamId: page.streamId,
            seq: outputCursor,
            text: '',
            reset: true,
            reason: 'gap',
          })
        }
        await target.reportOutput({ streamId: page.streamId, seq: item.seq, text: item.text })
        outputCursor = item.seq
        consumedBytes += Buffer.byteLength(item.text)
      }
      if (!outputCreditInitialized || consumedBytes > 0) {
        await port.call(
          target.location.nodeId,
          'exec.output.credit',
          {
            operationId,
            streamId: page.streamId,
            throughSeq: outputCursor,
            bytes: consumedBytes || 32 * 1024,
          },
          target.signal,
        )
        outputCreditInitialized = true
      }
      // A terminal producer can still have multiple retained pages. Drain every available
      // page before returning the settled receipt to the caller.
      if (page.items.length === 0) return
    }
  }
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
  const cancelConfirmation = () =>
    port.call(target.location.nodeId, 'node.confirmation.cancel', lookup, AbortSignal.timeout(10_000)).then(
      () => undefined,
      () => undefined,
    )
  const originalInvocation = AsyncLocalStorage.snapshot()
  const onAbort = () =>
    originalInvocation(() => {
      void cancel()
    })
  target.signal.addEventListener('abort', onAbort, { once: true })
  const end = Date.now() + timeoutMs + 5_000
  try {
    target.signal.throwIfAborted()
    sent = true
    let receipt = nodeReceiptSchema.parse(
      await port.call(target.location.nodeId, 'exec.start', startInput, target.signal),
    )
    let pollMs = 50
    for (;;) {
      await pumpOutput()
      const completed = terminal(receipt)
      if (completed) return completed
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
      if (receipt.state === 'accepted' && !retriedAfterApproval) {
        const confirmation = nodeLocalConfirmationStatusSchema.parse(
          await port.call(target.location.nodeId, 'node.confirmation.status', lookup, target.signal),
        )
        if (confirmation === 'approved') {
          // Mark before sending. A lost acknowledgement can only be reconciled by reading the receipt.
          retriedAfterApproval = true
          try {
            receipt = nodeReceiptSchema.parse(
              await port.call(target.location.nodeId, 'exec.start', startInput, target.signal),
            )
          } catch {
            receipt = nodeReceiptSchema.parse(
              await port.call(target.location.nodeId, 'exec.receipt', { operationId }, target.signal),
            )
          }
          continue
        }
        if (confirmation === 'rejected' || confirmation === 'expired' || confirmation === 'cancelled') {
          const confirmed = await cancel()
          if (confirmed?.state === 'settled' && !confirmed.result.details.executionStarted) {
            const code =
              confirmation === 'rejected'
                ? 'NODE_LOCAL_CONFIRMATION_REJECTED'
                : confirmation === 'expired'
                  ? 'NODE_LOCAL_CONFIRMATION_EXPIRED'
                  : 'CANCELLED'
            return noStartResult(code, 'The B-local confirmation did not authorize execution.')
          }
          return confirmed ? (terminal(confirmed) ?? unknownResult()) : unknownResult()
        }
      }
      if (target.signal.aborted || Date.now() >= end) {
        await cancelConfirmation()
        const confirmed = await cancel()
        return confirmed ? (terminal(confirmed) ?? unknownResult()) : unknownResult()
      }
      await pause(Math.min(pollMs, Math.max(1, end - Date.now())), undefined, { signal: target.signal })
      pollMs = Math.min(1_000, pollMs * 2)
      receipt = nodeReceiptSchema.parse(
        await port.call(target.location.nodeId, 'exec.receipt', { operationId }, target.signal),
      )
    }
  } catch (error) {
    if (!sent)
      return {
        text: error instanceof Error ? error.message : 'Node execution was not sent.',
        isError: true,
        details: { code: 'CANCELLED', executionStarted: false },
      }
    if (error instanceof HbarError && error.code === 'IDEMPOTENCY_CONFLICT') return unknownResult()
    await cancelConfirmation()
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
