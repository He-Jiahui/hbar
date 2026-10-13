import { HbarError } from '@hbar/contracts'
import { nodeOperationIdSchema } from '@hbar/contracts/node'
import { nodeExecOutputChunkSchema, type NodeExecOutputChunk } from '@hbar/contracts/node-execution-output'

export const NODE_EXEC_OUTPUT_LIMITS = Object.freeze({
  chunkBytes: 8 * 1024,
  retainedBytes: 256 * 1024,
  retainedFrames: 512,
  readBytes: 32 * 1024,
  readFrames: 32,
  maxCreditBytes: 64 * 1024,
  notificationFramesPerWindow: 128,
  notificationWindowMs: 1_000,
})

export { nodeExecOutputChunkSchema }
export type { NodeExecOutputChunk }

export interface NodeExecOutputPage {
  readonly operationId: string
  readonly streamId: string
  readonly items: readonly NodeExecOutputChunk[]
  readonly cursor: number
  readonly reset: boolean
  readonly terminal: boolean
}

/** B-owned bounded replay window. Notification delivery is advisory; readers resume from the retained sequence. */
export class NodeExecutionOutputBuffer {
  readonly streamId = crypto.randomUUID()
  private nextSeq = 1
  private firstSeq = 1
  private retainedBytes = 0
  private creditBytes = 0
  private acknowledgedSeq = 0
  private creditInitialized = false
  private resetAtSeq: number | undefined
  private notificationWindowAt = Date.now()
  private notificationFrames = 0
  private readonly frames: NodeExecOutputChunk[] = []
  private terminal = false

  constructor(
    readonly operationId: string,
    private readonly notify: (chunk: NodeExecOutputChunk) => void,
  ) {
    nodeOperationIdSchema.parse(operationId)
  }

  append(text: string): void {
    if (this.terminal || !text) return
    for (const part of splitUtf8(text, NODE_EXEC_OUTPUT_LIMITS.chunkBytes)) {
      const chunk = nodeExecOutputChunkSchema.parse({
        operationId: this.operationId,
        streamId: this.streamId,
        seq: this.nextSeq++,
        text: part,
      })
      const bytes = Buffer.byteLength(chunk.text)
      this.frames.push(chunk)
      this.retainedBytes += bytes
      while (
        this.retainedBytes > NODE_EXEC_OUTPUT_LIMITS.retainedBytes ||
        this.frames.length > NODE_EXEC_OUTPUT_LIMITS.retainedFrames
      ) {
        const removed = this.frames.shift()
        if (!removed) break
        this.retainedBytes -= Buffer.byteLength(removed.text)
        this.firstSeq = removed.seq + 1
      }
      const now = Date.now()
      if (now - this.notificationWindowAt >= NODE_EXEC_OUTPUT_LIMITS.notificationWindowMs) {
        this.notificationWindowAt = now
        this.notificationFrames = 0
      }
      if (bytes <= this.creditBytes && this.notificationFrames < NODE_EXEC_OUTPUT_LIMITS.notificationFramesPerWindow) {
        this.creditBytes -= bytes
        this.notificationFrames++
        try {
          this.notify(chunk)
        } catch {
          // A lost notification is recovered through read(); it is never the durable process result.
        }
      }
    }
  }

  grant(input: { streamId: string; throughSeq: number; bytes: number }): void {
    if (input.streamId !== this.streamId)
      throw new HbarError('NODE_OUTPUT_STREAM_CHANGED', 'Output credit belongs to another process generation')
    if (
      !Number.isSafeInteger(input.throughSeq) ||
      input.throughSeq < this.acknowledgedSeq ||
      input.throughSeq >= this.nextSeq ||
      (this.creditInitialized && input.throughSeq === this.acknowledgedSeq && input.bytes > 0)
    )
      throw new HbarError('INVALID_INPUT', 'Output acknowledgement is outside the produced sequence')
    if (!Number.isSafeInteger(input.bytes) || input.bytes < 0 || input.bytes > NODE_EXEC_OUTPUT_LIMITS.maxCreditBytes)
      throw new HbarError('INVALID_INPUT', 'Output credit exceeds its bounded window')
    this.acknowledgedSeq = input.throughSeq
    this.creditInitialized = true
    this.creditBytes = Math.min(NODE_EXEC_OUTPUT_LIMITS.maxCreditBytes, this.creditBytes + input.bytes)
  }

  read(afterSeq: number, limitBytes = NODE_EXEC_OUTPUT_LIMITS.readBytes): NodeExecOutputPage {
    if (!Number.isSafeInteger(afterSeq) || afterSeq < 0)
      throw new HbarError('INVALID_INPUT', 'Output cursor must be a nonnegative sequence')
    if (!Number.isSafeInteger(limitBytes) || limitBytes < 1 || limitBytes > NODE_EXEC_OUTPUT_LIMITS.readBytes)
      throw new HbarError('INVALID_INPUT', 'Output page exceeds its bounded byte limit')
    if (afterSeq >= this.nextSeq) throw new HbarError('INVALID_INPUT', 'Output cursor is ahead of the producer')
    const resetCursor = Math.max(this.firstSeq - 1, (this.resetAtSeq ?? 1) - 1)
    const reset = afterSeq < resetCursor || (this.resetAtSeq !== undefined && afterSeq < this.resetAtSeq)
    const cursor = reset ? resetCursor : afterSeq
    const items: NodeExecOutputChunk[] = []
    let bytes = 0
    for (const frame of this.frames) {
      if (frame.seq <= cursor) continue
      const frameBytes = Buffer.byteLength(frame.text)
      if (items.length >= NODE_EXEC_OUTPUT_LIMITS.readFrames || bytes + frameBytes > limitBytes) break
      items.push(frame)
      bytes += frameBytes
    }
    return {
      operationId: this.operationId,
      streamId: this.streamId,
      items,
      cursor: items.at(-1)?.seq ?? cursor,
      reset,
      terminal: this.terminal,
    }
  }

  finish(): void {
    this.terminal = true
  }
  reset(): void {
    this.resetAtSeq = this.nextSeq
  }

  get bytes(): number {
    return this.retainedBytes
  }
  get isTerminal(): boolean {
    return this.terminal
  }
  get availableCreditBytes(): number {
    return NODE_EXEC_OUTPUT_LIMITS.maxCreditBytes - this.creditBytes
  }
}

function splitUtf8(value: string, maxBytes: number): string[] {
  const chunks: string[] = []
  let current = ''
  let bytes = 0
  for (const codePoint of value) {
    const size = Buffer.byteLength(codePoint)
    if (current && bytes + size > maxBytes) {
      chunks.push(current)
      current = ''
      bytes = 0
    }
    current += codePoint
    bytes += size
  }
  if (current) chunks.push(current)
  return chunks
}
