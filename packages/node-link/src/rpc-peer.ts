import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { NODE_LIMITS } from '@hbar/contracts/node'
import { nodeRpcFrameSchema, type NodeRpcFrame } from '@hbar/contracts/node-wire'
import { decodeNodeFrame, encodeNodeFrame } from './wire'

export type NodeMethodTable = Readonly<Record<string, { readonly input: z.ZodType; readonly output: z.ZodType }>>
export interface NodeWireTransport {
  send(text: string): boolean
  close(code: number, reason: string): void
}
interface Pending {
  resolve(value: unknown): void
  reject(error: Error): void
  release(): void
}
export class NodeRpcPeer<Remote extends NodeMethodTable> {
  private readonly pending = new Map<string, Pending>()
  private readonly active = new Map<string, AbortController>()
  private closed = false
  constructor(
    private readonly options: {
      remote: Remote
      local: NodeMethodTable
      transport: NodeWireTransport
      handle(method: string, input: unknown, signal: AbortSignal): Promise<unknown>
      incomingNotifications?: Readonly<Record<string, z.ZodType>>
      outgoingNotifications?: Readonly<Record<string, z.ZodType>>
      onNotification?(method: string, input: unknown): void
      onClose?(): void
      requestMs?: number
    },
  ) {
    if (options.requestMs !== undefined) z.number().int().min(1).max(1_205_000).parse(options.requestMs)
  }
  call<Method extends Extract<keyof Remote, string>>(
    method: Method,
    input: z.input<Remote[Method]['input']>,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<z.output<Remote[Method]['output']>> {
    if (this.closed) return Promise.reject(new HbarError('NODE_OFFLINE', 'Node link is closed'))
    if (this.pending.size >= NODE_LIMITS.inflight)
      return Promise.reject(new HbarError('NODE_BUSY', 'Node request capacity reached'))
    if (options.signal?.aborted) return Promise.reject(new HbarError('CANCELLED', 'Node call cancelled before sending'))
    const entry = this.options.remote[method]
    if (!entry || !Object.hasOwn(this.options.remote, method))
      return Promise.reject(new HbarError('METHOD_NOT_FOUND', 'Method is absent from the node catalog'))
    let frame: string, timeoutMs: number
    const id = crypto.randomUUID()
    try {
      frame = encodeNodeFrame({ jsonrpc: '2.0', id, method, params: entry.input.parse(input) })
      timeoutMs = z
        .number()
        .int()
        .min(1)
        .max(1_205_000)
        .parse(options.timeoutMs ?? this.options.requestMs ?? 30_000)
    } catch (error) {
      return Promise.reject(error)
    }
    return new Promise((resolve, reject) => {
      const abort = () => {
        const pending = this.pending.get(id)
        if (!pending) return
        this.pending.delete(id)
        pending.release()
        reject(
          new HbarError('NODE_RESULT_UNKNOWN', 'Node call was interrupted after sending; reconcile its operation key'),
        )
      }
      const timer = setTimeout(abort, timeoutMs)
      this.pending.set(id, {
        resolve(value) {
          try {
            // The selected remote method's schema validates this indexed generic output.
            resolve(entry.output.parse(value) as z.output<Remote[Method]['output']>)
          } catch (error) {
            reject(error)
          }
        },
        reject,
        release() {
          clearTimeout(timer)
          options.signal?.removeEventListener('abort', abort)
        },
      })
      options.signal?.addEventListener('abort', abort, { once: true })
      try {
        if (!this.options.transport.send(frame)) this.close()
        if (options.signal?.aborted) abort()
      } catch {
        this.close()
      }
    })
  }
  notify(method: string, input: unknown): void {
    if (this.closed) throw new HbarError('NODE_OFFLINE', 'Node link is closed')
    const schema = this.options.outgoingNotifications?.[method]
    if (!schema || !Object.hasOwn(this.options.outgoingNotifications ?? {}, method))
      throw new HbarError('METHOD_NOT_FOUND', 'Notification is absent from the node catalog')
    const frame = encodeNodeFrame({ jsonrpc: '2.0', method, params: schema.parse(input) })
    if (!this.options.transport.send(frame)) this.close()
  }
  async receive(text: string): Promise<void> {
    if (this.closed) return
    let frame: NodeRpcFrame
    try {
      frame = nodeRpcFrameSchema.parse(decodeNodeFrame(text))
    } catch {
      this.close(4002, 'Invalid node frame')
      return
    }
    if (!('method' in frame)) {
      const pending = this.pending.get(frame.id)
      if (!pending) return
      this.pending.delete(frame.id)
      pending.release()
      if ('error' in frame) pending.reject(new HbarError(frame.error.data.code, frame.error.message))
      else pending.resolve(frame.result)
      return
    }
    if (!('id' in frame)) {
      const schema = this.options.incomingNotifications?.[frame.method]
      if (!schema || !Object.hasOwn(this.options.incomingNotifications ?? {}, frame.method)) {
        this.close(4002, 'Unknown node notification')
        return
      }
      try {
        this.options.onNotification?.(frame.method, schema.parse(frame.params))
      } catch {
        this.close(4002, 'Invalid node notification')
      }
      return
    }
    if (this.active.has(frame.id)) {
      this.close(4002, 'Duplicate in-flight node request')
      return
    }
    if (this.active.size >= NODE_LIMITS.inflight) {
      this.close(1013, 'Node request capacity reached')
      return
    }
    const controller = new AbortController()
    this.active.set(frame.id, controller)
    const timer = setTimeout(() => this.close(4003, 'Node handler deadline exceeded'), this.options.requestMs ?? 30_000)
    let output: NodeRpcFrame
    try {
      const entry = this.options.local[frame.method]
      if (!entry || !Object.hasOwn(this.options.local, frame.method))
        throw new HbarError('METHOD_NOT_FOUND', 'Method is absent from this node direction')
      const input = entry.input.parse(frame.params)
      const result = entry.output.parse(await this.options.handle(frame.method, input, controller.signal))
      output = nodeRpcFrameSchema.parse({ jsonrpc: '2.0', id: frame.id, result })
    } catch (error) {
      output = {
        jsonrpc: '2.0',
        id: frame.id,
        error: {
          code: error instanceof HbarError && error.code === 'METHOD_NOT_FOUND' ? -32601 : -32000,
          message:
            error instanceof HbarError
              ? error.message.slice(0, 1_600)
              : 'Node method input or output failed validation',
          data: { code: error instanceof HbarError ? error.code : 'INVALID_REQUEST' },
        },
      }
    } finally {
      clearTimeout(timer)
      this.active.delete(frame.id)
    }
    if (!this.closed) {
      try {
        if (!this.options.transport.send(encodeNodeFrame(output))) this.close()
      } catch {
        this.close(4002, 'Node response limit exceeded')
      }
    }
  }
  close(code = 1001, reason = 'Node link closed'): void {
    if (this.closed) return
    this.closed = true
    for (const pending of this.pending.values()) {
      pending.release()
      pending.reject(new HbarError('NODE_RESULT_UNKNOWN', 'Node connection was lost; reconcile pending operations'))
    }
    this.pending.clear()
    for (const active of this.active.values()) active.abort()
    this.active.clear()
    try {
      this.options.transport.close(code, reason)
    } finally {
      this.options.onClose?.()
    }
  }
}
