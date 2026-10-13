import { Worker } from 'node:worker_threads'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import {
  nodeStateMethods,
  type NodeStateMethod,
  type NodeStateInput,
  type NodeStateOutput,
  type NodeStatePort,
} from '@hbar/contracts/node-state'

interface Pending {
  resolve(value: unknown): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}
const replySchema = z.discriminatedUnion('ok', [
  z.strictObject({ id: z.number().int(), ok: z.literal(true), output: z.unknown() }),
  z.strictObject({ id: z.number().int(), ok: z.literal(false), code: z.string(), message: z.string() }),
])
/** Separate node-owned receipt database. It never opens or exposes the conversation StoragePort. */
export class NodeStateStorage implements NodeStatePort {
  private readonly worker: Worker
  private readonly pending = new Map<number, Pending>()
  private next = 0
  private stopped = false
  private closing: Promise<void> | undefined
  constructor(path: string, workerPath?: URL | string) {
    const options = { workerData: { path } }
    this.worker = workerPath
      ? new Worker(workerPath, options)
      : Bun.isStandaloneExecutable
        ? new Worker('./packages/storage/src/node-state-worker.ts', options)
        : new Worker(new URL('./node-state-worker.ts', import.meta.url), options)
    this.worker.on('message', (value: unknown) => {
      const reply = replySchema.safeParse(value)
      if (!reply.success) {
        this.fail(new HbarError('NODE_STATE_ERROR', 'Invalid node state response'))
        return
      }
      const pending = this.pending.get(reply.data.id)
      if (!pending) return
      this.pending.delete(reply.data.id)
      clearTimeout(pending.timer)
      if (reply.data.ok) pending.resolve(reply.data.output)
      else pending.reject(new HbarError(reply.data.code, reply.data.message))
    })
    this.worker.on('error', (error: unknown) =>
      this.fail(error instanceof Error ? error : new Error('Node state worker failed')),
    )
    this.worker.on('exit', () => this.fail(new HbarError('NODE_STATE_OFFLINE', 'Node state worker exited')))
  }
  private fail(error: Error): void {
    this.stopped = true
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }
  async call<Method extends NodeStateMethod>(
    method: Method,
    input: NodeStateInput<Method>,
  ): Promise<NodeStateOutput<Method>> {
    if (this.stopped) throw new HbarError('NODE_STATE_OFFLINE', 'Node state worker is unavailable')
    if (this.pending.size >= 32) throw new HbarError('NODE_BUSY', 'Node state request capacity reached')
    const checked = nodeStateMethods[method].input.parse(input)
    const id = ++this.next
    const output = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(
          new HbarError(
            'NODE_STATE_RESULT_UNKNOWN',
            'Node state acknowledgement was lost; reconcile the operation key',
          ),
        )
      }, 5_000)
      this.pending.set(id, { resolve, reject, timer })
      this.worker.postMessage({ id, method, input: checked })
    })
    // This assertion follows the method-indexed runtime output schema, not an unchecked IPC result.
    return nodeStateMethods[method].output.parse(output) as NodeStateOutput<Method>
  }
  close(): Promise<void> {
    return (this.closing ??= (async () => {
      try {
        if (!this.stopped) await this.call('close', {})
      } finally {
        this.fail(new HbarError('NODE_STATE_OFFLINE', 'Node state storage closed'))
        await this.worker.terminate()
      }
    })())
  }
}
