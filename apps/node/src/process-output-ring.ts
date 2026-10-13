import { HbarError } from '@hbar/contracts'

export const PROCESS_OUTPUT_LIMITS = Object.freeze({
  chunkBytes: 8 * 1024,
  retainedBytes: 256 * 1024,
  retainedFrames: 512,
  pageBytes: 32 * 1024,
  pageFrames: 32,
})

export interface ProcessOutputFrame {
  readonly seq: number
  readonly text: string
}
export interface ProcessOutputPage {
  readonly items: readonly ProcessOutputFrame[]
  readonly cursor: number
  readonly reset: boolean
  readonly active: boolean
}

/** B's trusted process IPC uses this bounded ring; network output has its own operation-scoped cursor. */
export class ProcessOutputRing {
  private readonly frames: ProcessOutputFrame[] = []
  private firstSeq = 1
  private nextSeq = 1
  private bytes = 0

  append(input: string): void {
    let text = ''
    let size = 0
    const flush = () => {
      if (!text) return
      const frame = { seq: this.nextSeq++, text }
      const frameBytes = Buffer.byteLength(text)
      this.frames.push(frame)
      this.bytes += frameBytes
      while (
        this.bytes > PROCESS_OUTPUT_LIMITS.retainedBytes ||
        this.frames.length > PROCESS_OUTPUT_LIMITS.retainedFrames
      ) {
        const removed = this.frames.shift()
        if (!removed) break
        this.bytes -= Buffer.byteLength(removed.text)
        this.firstSeq = removed.seq + 1
      }
      text = ''
      size = 0
    }
    for (const char of input) {
      const charBytes = Buffer.byteLength(char)
      if (size + charBytes > PROCESS_OUTPUT_LIMITS.chunkBytes) flush()
      text += char
      size += charBytes
    }
    flush()
  }

  read(afterSeq: number, active: boolean): ProcessOutputPage {
    if (!Number.isSafeInteger(afterSeq) || afterSeq < 0 || afterSeq >= this.nextSeq)
      throw new HbarError('INVALID_INPUT', 'Managed process output cursor is outside the produced sequence')
    const reset = afterSeq < this.firstSeq - 1
    const cursor = reset ? this.firstSeq - 1 : afterSeq
    const items: ProcessOutputFrame[] = []
    let pageBytes = 0
    for (const frame of this.frames) {
      if (frame.seq <= cursor) continue
      const frameBytes = Buffer.byteLength(frame.text)
      if (items.length >= PROCESS_OUTPUT_LIMITS.pageFrames || pageBytes + frameBytes > PROCESS_OUTPUT_LIMITS.pageBytes)
        break
      items.push(frame)
      pageBytes += frameBytes
    }
    return { items, cursor: items.at(-1)?.seq ?? cursor, reset, active }
  }

  get retainedBytes(): number {
    return this.bytes
  }
  get retainedFrames(): number {
    return this.frames.length
  }
}
