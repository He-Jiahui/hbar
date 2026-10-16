import { z } from 'zod'
import { AsyncLocalStorage } from 'node:async_hooks'
import { HbarError } from '@hbar/contracts'
import { procedure, type IpcPeer, type IpcCallOptions, type IpcCallTicket } from './ipc'

type Value =
  | { kind: 'scalar'; value: string | number | boolean | null }
  | { kind: 'undefined' }
  | { kind: 'array'; items: Value[] }
  | { kind: 'object'; fields: Record<string, Value> }
  | { kind: 'bytes'; data: string }
  | { kind: 'signal' }
  | { kind: 'callback'; id: string }
/** A repeated-group expression exhausts the regex engine on legal multi-MiB attachments in Bun. */
function validBase64(value: string): boolean {
  if (value.length > 24 * 1024 * 1024 || value.length % 4 !== 0) return false
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return !/[^A-Za-z0-9+/]/.test(value.slice(0, value.length - padding))
}
const valueSchema: z.ZodType<Value> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('scalar'),
      value: z.union([z.string().max(16 * 1024 * 1024), z.number().finite(), z.boolean(), z.null()]),
    }),
    z.strictObject({ kind: z.literal('undefined') }),
    z.strictObject({ kind: z.literal('array'), items: z.array(valueSchema).max(65_536) }),
    z.strictObject({ kind: z.literal('object'), fields: z.record(z.string().max(4_000), valueSchema) }),
    z.strictObject({
      kind: z.literal('bytes'),
      data: z
        .string()
        .max(24 * 1024 * 1024)
        .refine(validBase64, 'Application bytes must contain complete base64 data'),
    }),
    z.strictObject({ kind: z.literal('signal') }),
    z.strictObject({ kind: z.literal('callback'), id: z.string().uuid() }),
  ]),
)
const invocationSchema = z.strictObject({ method: z.string().min(1).max(128), args: z.array(valueSchema).max(32) })
const callbackSchema = z.strictObject({ id: z.string().uuid(), args: z.array(valueSchema).max(32) })
type Operation = (args: unknown[], signal: AbortSignal) => unknown | Promise<unknown>
type CallbackTimeout = number | (() => number)
const MAX_CALLBACK_TIMEOUT_MS = 1_325_000
interface Encoding {
  readonly seen: Set<object>
  readonly callbacks?: string[]
  readonly signals?: AbortSignal[]
  nodes: number
  bytes: number
}
export interface RuntimeValuePortOptions {
  readonly prefix: string
  readonly controlMethods?: readonly string[]
  /** Trusted, owner-local callback deadline. Omission preserves the peer's configured default timeout. */
  readonly callbackTimeoutMs?: CallbackTimeout
  /** Enter the captured local application scope when a named callback returns to its owner. */
  readonly callbackScope?: <Result>(operation: () => Result) => Result
  /** Owned effect chains can wait for callbacks already running when logical cancellation arrives. */
  readonly callbackSettlement?: 'physical'
}

/** Plain, bounded argument descriptions. Functions and signals remain local and use authenticated named callbacks. */
export class RuntimeValuePort {
  private readonly callbacks = new Map<string, (...args: unknown[]) => unknown>()
  private readonly operations = new Map<string, Operation>()
  private readonly disposers: Array<() => void>
  private closed = false
  constructor(
    private readonly peer: IpcPeer,
    private readonly options: RuntimeValuePortOptions,
  ) {
    if (!/^[a-z][a-z0-9.-]{0,79}$/.test(options.prefix))
      throw new HbarError('INVALID_INPUT', 'Invalid named application port')
    if (typeof options.callbackTimeoutMs === 'number') this.validateCallbackTimeout(options.callbackTimeoutMs)
    this.disposers = [
      peer.register(
        `${options.prefix}.invoke`,
        procedure(invocationSchema, valueSchema, async (input, call) => {
          const operation = this.operations.get(input.method)
          if (!operation)
            throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Application method is absent from the declared port')
          const args = input.args.map((value) => this.decode(value, call.signal))
          return this.encode(await operation(args, call.signal), this.encoding())
        }),
      ),
      peer.register(
        `${options.prefix}.callback`,
        procedure(callbackSchema, valueSchema, async (input, call) => {
          const callback = this.callbacks.get(input.id)
          if (!callback)
            throw new HbarError('RUNTIME_CALLBACK_EXPIRED', 'The original application callback is no longer owned')
          const invoke = () => callback(...input.args.map((value) => this.decode(value, call.signal)))
          const result = this.options.callbackScope ? await this.options.callbackScope(invoke) : await invoke()
          return this.encode(result, this.encoding())
        }),
      ),
    ]
    this.disposers.push(
      peer.register(
        `${options.prefix}.control`,
        procedure(invocationSchema, valueSchema, async (input, call) => {
          if (!options.controlMethods?.includes(input.method))
            throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Application method is not a declared control port')
          const operation = this.operations.get(input.method)
          if (!operation) throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Application control is unavailable')
          return this.encode(
            await operation(
              input.args.map((value) => this.decode(value, call.signal)),
              call.signal,
            ),
            this.encoding(),
          )
        }),
      ),
    )
  }
  register(method: string, operation: Operation): () => void {
    if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(method) || this.operations.has(method))
      throw new HbarError('RUNTIME_METHOD_INVALID', 'Application method is invalid or duplicated')
    if (this.closed || this.operations.size >= 512)
      throw new HbarError('RUNTIME_METHOD_CAPACITY', 'Declared application port capacity is exhausted')
    this.operations.set(method, operation)
    return () => {
      if (this.operations.get(method) === operation) this.operations.delete(method)
    }
  }
  async call<Result>(method: string, args: readonly unknown[], options: IpcCallOptions = {}): Promise<Result> {
    if (this.closed) throw new HbarError('IPC_DISCONNECTED', 'Application port owner has exited')
    const callbacks: string[] = []
    const signals: AbortSignal[] = []
    const encoding = this.encoding(callbacks, signals)
    try {
      const input = invocationSchema.parse({ method, args: args.map((value) => this.encode(value, encoding)) })
      if (options.signal) signals.push(options.signal)
      const signal = signals.length ? AbortSignal.any(signals) : undefined
      const kind = this.options.controlMethods?.includes(method) ? 'control' : 'invoke'
      const result = await this.peer.call(`${this.options.prefix}.${kind}`, input, valueSchema, {
        ...options,
        ...(signal ? { signal } : {}),
      })
      // The declared public method supplies Result; transport values have passed the bounded description schema.
      return this.decode(result, signal ?? new AbortController().signal) as Result
    } finally {
      for (const id of callbacks) this.callbacks.delete(id)
    }
  }
  callTracked<Result>(method: string, args: readonly unknown[], options: IpcCallOptions = {}): IpcCallTicket<Result> {
    const callbacks: string[] = []
    const signals: AbortSignal[] = []
    const release = () => {
      for (const id of callbacks) this.callbacks.delete(id)
    }
    try {
      if (this.closed) throw new HbarError('IPC_DISCONNECTED', 'Application port owner has exited')
      const encoding = this.encoding(callbacks, signals)
      const input = invocationSchema.parse({ method, args: args.map((value) => this.encode(value, encoding)) })
      if (options.signal) signals.push(options.signal)
      const signal = signals.length ? AbortSignal.any(signals) : undefined
      const kind = this.options.controlMethods?.includes(method) ? 'control' : 'invoke'
      const ticket = this.peer.callTracked(`${this.options.prefix}.${kind}`, input, valueSchema, {
        ...options,
        ...(signal ? { signal } : {}),
      })
      // Decode the owner's result once, including late replies; the logical promise retains its original deadline.
      const settled = ticket.settled.then(
        (value) => this.decode(value, signal ?? new AbortController().signal) as Result,
      )
      const result = ticket.result.then(() => settled)
      // No new callback can start after logical completion. Already running callbacks own their captured operation.
      void result.then(release, release)
      void settled.catch(() => undefined)
      return { result, settled, suspendDeadline: () => ticket.suspendDeadline() }
    } catch (error) {
      release()
      const rejected: Promise<Result> = Promise.reject(error)
      void rejected.catch(() => undefined)
      return { result: rejected, settled: rejected, suspendDeadline: () => () => {} }
    }
  }
  snapshot() {
    return { callbacks: this.callbacks.size, methods: this.operations.size }
  }
  dispose(): void {
    this.closed = true
    this.callbacks.clear()
    this.operations.clear()
    for (const dispose of this.disposers) dispose()
  }
  private encoding(callbacks?: string[], signals?: AbortSignal[]): Encoding {
    return { seen: new Set(), nodes: 0, bytes: 0, ...(callbacks ? { callbacks } : {}), ...(signals ? { signals } : {}) }
  }
  private encode(value: unknown, state: Encoding, depth = 0): Value {
    if (++state.nodes > 65_536 || depth > 32)
      throw new HbarError('IPC_PAYLOAD_LIMIT', 'Application description exceeds its structural bound')
    if (value === undefined) return { kind: 'undefined' }
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
      if (typeof value === 'number' && !Number.isFinite(value))
        throw new HbarError('IPC_SERIALIZATION', 'Application numbers must be finite')
      if (typeof value === 'string') state.bytes += Buffer.byteLength(value)
      if (state.bytes > 24 * 1024 * 1024)
        throw new HbarError('IPC_PAYLOAD_LIMIT', 'Application description exceeds its byte bound')
      return { kind: 'scalar', value }
    }
    if (value instanceof Uint8Array) {
      state.bytes += (value.byteLength * 4) / 3
      if (state.bytes > 24 * 1024 * 1024)
        throw new HbarError('IPC_PAYLOAD_LIMIT', 'Application bytes exceed their transfer bound')
      return { kind: 'bytes', data: Buffer.from(value).toString('base64') }
    }
    if (value instanceof AbortSignal && state.signals) {
      state.signals.push(value)
      return { kind: 'signal' }
    }
    if (typeof value === 'function' && state.callbacks) {
      if (this.callbacks.size >= 256)
        throw new HbarError('RUNTIME_CALLBACK_CAPACITY', 'Local callback capacity is exhausted')
      const id = crypto.randomUUID()
      const captured = AsyncLocalStorage.snapshot()
      this.callbacks.set(id, (...args) =>
        captured(() => {
          const result: unknown = Reflect.apply(value, undefined, args)
          return result
        }),
      )
      state.callbacks.push(id)
      return { kind: 'callback', id }
    }
    if (
      typeof value !== 'object' ||
      value === null ||
      (!Array.isArray(value) &&
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
    )
      throw new HbarError(
        'IPC_SERIALIZATION',
        'Only declared plain data, local signals and local callbacks can use application ports',
      )
    if (state.seen.has(value))
      throw new HbarError('IPC_SERIALIZATION', 'Application descriptions cannot contain cycles')
    state.seen.add(value)
    try {
      if (Array.isArray(value))
        return { kind: 'array', items: value.map((item) => this.encode(item, state, depth + 1)) }
      const fields: Record<string, Value> = Object.create(null) as Record<string, Value>
      for (const [key, item] of Object.entries(value)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype')
          throw new HbarError('IPC_SERIALIZATION', 'Application field is reserved')
        state.bytes += Buffer.byteLength(key)
        fields[key] = this.encode(item, state, depth + 1)
      }
      return { kind: 'object', fields }
    } finally {
      state.seen.delete(value)
    }
  }
  private decode(value: Value, signal: AbortSignal): unknown {
    switch (value.kind) {
      case 'scalar':
        return value.value
      case 'undefined':
        return undefined
      case 'array':
        return value.items.map((item) => this.decode(item, signal))
      case 'object': {
        const result: Record<string, unknown> = {}
        for (const [key, item] of Object.entries(value.fields)) {
          if (key === '__proto__' || key === 'constructor' || key === 'prototype')
            throw new HbarError('IPC_SERIALIZATION', 'Application field is reserved')
          result[key] = this.decode(item, signal)
        }
        return result
      }
      case 'bytes':
        return new Uint8Array(Buffer.from(value.data, 'base64'))
      case 'signal':
        return signal
      case 'callback': {
        // Snapshot the owner-selected budget while decoding the original call. The original
        // request signal remains captured as the cancellation fence for nested callback values.
        const timeoutMs = this.callbackTimeout()
        const physical = this.options.callbackSettlement === 'physical'
        return async (...args: unknown[]) => {
          signal.throwIfAborted()
          const callbacks: string[] = [],
            signals: AbortSignal[] = [signal]
          const state = this.encoding(callbacks, signals)
          let nestedSignal: AbortSignal | undefined
          const release = () => {
            for (const id of callbacks) this.callbacks.delete(id)
          }
          try {
            const described = args.map((item) => this.encode(item, state))
            nestedSignal = AbortSignal.any(signals)
            nestedSignal.addEventListener('abort', release, { once: true })
            const method = `${this.options.prefix}.callback`
            const input = { id: value.id, args: described }
            const options = { signal: nestedSignal, ...(timeoutMs === undefined ? {} : { timeoutMs }) }
            const result = physical
              ? await this.peer.callTracked(method, input, valueSchema, options).settled
              : await this.peer.call(method, input, valueSchema, options)
            return this.decode(result, nestedSignal)
          } finally {
            nestedSignal?.removeEventListener('abort', release)
            release()
          }
        }
      }
    }
  }
  private callbackTimeout(): number | undefined {
    const configured = this.options.callbackTimeoutMs
    if (configured === undefined) return undefined
    return this.validateCallbackTimeout(typeof configured === 'function' ? configured() : configured)
  }
  private validateCallbackTimeout(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_CALLBACK_TIMEOUT_MS)
      throw new HbarError(
        'INVALID_INPUT',
        `Callback timeout must be an integer between 1 and ${MAX_CALLBACK_TIMEOUT_MS} ms`,
      )
    return value
  }
}
