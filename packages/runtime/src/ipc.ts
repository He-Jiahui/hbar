import { z } from 'zod'
import { HbarError } from '@hbar/contracts/errors'
import { runtimeDomainError } from './errors'
import { RpcDeadline } from './rpc-deadline'
import {
  executionOwnershipSchema,
  RUNTIME_LIMITS,
  runtimeOwnerSchema,
  type ExecutionOwnership,
  type RuntimeOwner,
} from '@hbar/contracts/runtime'

/** Fixed local channel failure descriptors; never copy transport messages or payloads into diagnostics. */
export function ipcChannelFailure(error: unknown): HbarError {
  const code = runtimeDomainError(error)?.code
  const allowed = new Set([
    'IPC_BUSY',
    'IPC_FRAGMENT_TIMEOUT',
    'IPC_PAYLOAD_LIMIT',
    'IPC_SERIALIZATION',
    'IPC_PROTOCOL',
    'IPC_OWNER_CHANGED',
    'IPC_DISCONNECTED',
    'IPC_TRANSPORT_FAILED',
  ])
  return new HbarError(
    code !== undefined && allowed.has(code) ? code : 'IPC_TRANSPORT_FAILED',
    'Runtime channel failed',
  )
}
const id = z.string().min(1).max(160)
const methodName = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z][a-zA-Z0-9_.:-]*$/)
const deadlineControlMethod = 'runtime.deadline.control'
const waitCapacityMethod = 'runtime.wait.capacity'
const waitAdmissionMethod = 'runtime.wait.admission'
const waitCapacitySchema = z.strictObject({
  version: z.literal(1),
  capacity: z.number().int().min(1).max(2_147_483_647),
})
const waitAdmissionSchema = z.strictObject({
  id: z.string().uuid(),
  token: z.string().uuid(),
  target: z.enum(['pending', 'incoming']),
  phase: z.enum(['pause', 'resume']),
})
const deadlineControlSchema = z.strictObject({
  id: z.string().uuid(),
  token: z.string().uuid(),
  phase: z.enum(['pause', 'resume']),
})
const frameSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('fragment'),
    version: z.literal(1),
    from: id,
    to: id,
    id,
    index: z.number().int().min(0).max(4095),
    total: z.number().int().min(1).max(4096),
    data: z.string().max(RUNTIME_LIMITS.fragmentChars),
  }),
  z.strictObject({
    kind: z.literal('ack'),
    version: z.literal(1),
    from: id,
    to: id,
    id,
    index: z.number().int().min(0).max(4095),
  }),
])
export type IpcFrame = z.infer<typeof frameSchema>
const callSchema = z.strictObject({
  kind: z.literal('call'),
  id,
  method: methodName,
  input: z.unknown(),
  requestId: id,
  ownership: executionOwnershipSchema.optional(),
})
const messageSchema = z.union([
  callSchema,
  z.strictObject({ kind: z.literal('reply'), id, ok: z.literal(true), result: z.unknown() }),
  z.strictObject({
    kind: z.literal('reply'),
    id,
    ok: z.literal(false),
    code: z.string().regex(/^[A-Z][A-Z0-9_.-]{0,127}$/),
    message: z.string().max(1_600),
  }),
  z.strictObject({ kind: z.literal('cancel'), id }),
  z.strictObject({ kind: z.literal('event'), method: methodName, input: z.unknown() }),
])
type IpcMessage = z.infer<typeof messageSchema>
type CallMessage = Extract<IpcMessage, { kind: 'call' }>
const packetSchema = z.strictObject({
  message: z.unknown(),
  undefinedPaths: z.array(z.array(z.union([z.string().max(256), z.number().int().nonnegative()])).max(64)).max(4_096),
})

export interface IpcTransport {
  send(frame: IpcFrame): void
}
export interface IpcProcedureContext {
  readonly sender: RuntimeOwner
  readonly requestId: string
  readonly signal: AbortSignal
  readonly ownership?: ExecutionOwnership | undefined
  /** Present only in the stable Host's authenticated child-process peer. */
  readonly callerDeadline?: { suspend(): () => void }
}
export interface IpcProcedure {
  invoke(input: unknown, context: IpcProcedureContext): Promise<unknown>
}
export function procedure<Input, Output>(
  input: z.ZodType<Input>,
  output: z.ZodType<Output>,
  handler: (input: Input, context: IpcProcedureContext) => Output | Promise<Output>,
): IpcProcedure {
  return {
    async invoke(value, context) {
      return output.parse(await handler(input.parse(value), context))
    },
  }
}
export interface IpcCallOptions {
  /** Local transport submission only: no remote admission, handler or side-effect guarantee. */
  readonly onDispatchStarted?: ((event: 'submitting' | 'sent' | 'send-failed') => void) | undefined
  /** Physical reply, or proof no dispatch occurred. Closing a dispatched peer is unknown. */
  readonly onDispatchSettled?: ((event: 'reply' | 'not-dispatched') => void) | undefined
  readonly signal?: AbortSignal | undefined
  /** Preserve local abort provenance for application bridges; remote failures retain their own error. */
  readonly preserveAbortReason?: boolean | undefined
  readonly timeoutMs?: number | undefined
  readonly requestId?: string | undefined
  readonly ownership?: ExecutionOwnership | undefined
}
export interface IpcCallTicket<Output> {
  /** Caller cancellation or deadline can reject this before the owner finishes. */
  readonly result: Promise<Output>
  /** The original owner's reply, or an explicit transport loss; cancellation is not settlement. */
  readonly settled: Promise<Output>
  /** The trusted composition pauses only a confirmed wait on this sent call; resources stay retained. */
  suspendDeadline(): () => void
}
interface Settlement<Output> {
  resolve(value: Output): void
  reject(error: unknown): void
  bindDeadline?(suspend: () => () => void): void
}
export interface IpcPeerOptions {
  /** Fixed protocol metadata only; delivered synchronously before fail-closed cleanup. */
  readonly onProtocolFailure?: (event: {
    readonly reason:
      | 'frame_schema'
      | 'owner'
      | 'fragment_sequence'
      | 'payload'
      | 'decode'
      | 'transport_send'
      | 'dispatch'
      | 'send_failure'
    readonly errorCode:
      | 'IPC_PROTOCOL'
      | 'IPC_OWNER_CHANGED'
      | 'IPC_PAYLOAD_LIMIT'
      | 'IPC_FRAGMENT_TIMEOUT'
      | 'IPC_BUSY'
      | 'IPC_TRANSPORT_SEND'
  }) => void
  readonly owner: RuntimeOwner
  readonly remote: RuntimeOwner
  readonly transport: IpcTransport
  readonly inFlight?: number
  readonly queued?: number
  /** Separate bound for physically retained calls in confirmed human waits. */
  readonly waiting?: number
  readonly bufferedBytes?: number
  readonly messageBytes?: number
  readonly timeoutMs?: number
  readonly fragmentTimeoutMs?: number
  readonly onFailure?: (error: HbarError) => void
  readonly onTimeout?: (
    requestId: string,
    timeout: {
      readonly callId: string
      readonly method: string
      readonly elapsedMs: number
      readonly timeoutMs: number
      readonly started: boolean
      readonly pending: number
      readonly inFlight: number
      readonly queued: number
      readonly incoming: number
      readonly incomingQueued: number
    },
  ) => void
  readonly onCallTimeout?: (event: IpcCallTimeout) => void
  /** Reserve active admission for named control ports; confirmed human waits retain separate physical accounting. */
  readonly controlMethods?: readonly string[]
  readonly reservedControl?: number
  /** Stable Host peers may pause an original child's caller deadline after business validation. */
  readonly controlRemoteDeadlines?: boolean
  /** Child bootstrap trusts only its authenticated stable parent to control caller deadlines. */
  readonly acceptRemoteDeadlineControl?: boolean
}

export interface IpcCallTimeout {
  readonly callId: string
  /** Only named protocol methods; invalid diagnostic vocabulary is redacted. */
  readonly method: string
  readonly phase: 'queued' | 'dispatched'
  readonly elapsedMs: number
}

interface Pending {
  transportStarted: boolean
  readonly dispatchStarted: (event: 'submitting' | 'sent' | 'send-failed') => void
  readonly dispatchSettled: (event: 'reply' | 'not-dispatched') => void
  readonly id: string
  readonly control: boolean
  encoded: string | undefined
  readonly bytes: number
  readonly resolve: (value: unknown) => void
  readonly reject: (error: unknown) => void
  readonly rejectSettlement?: ((error: unknown) => void) | undefined
  readonly signal: AbortSignal | undefined
  readonly abort: () => void
  deadline: RpcDeadline | undefined
  started: boolean
  settled: boolean
  remoteWaits?: Map<string, () => void>
  admissionWaits?: Set<string>
}
interface Incoming {
  readonly message: CallMessage
  readonly bytes: number
  readonly controller: AbortController
  started: boolean
  deadlineWaits?: Set<string>
  admissionWaits?: Set<string>
}
interface Assembly {
  readonly total: number
  readonly parts: string[]
  readonly timer: ReturnType<typeof setTimeout>
  bytes: number
}

function limit(value: number | undefined, fallback: number): number {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < 1 || result > 2_147_483_647) throw new RangeError('Invalid IPC bound')
  return result
}

/** Preserve optional arguments without transferring object instances or executable values. */
function encode(message: IpcMessage, maximum: number): string {
  const undefinedPaths: Array<Array<string | number>> = []
  const ancestors = new WeakSet<object>()
  let nodes = 0
  const inspect = (value: unknown, path: Array<string | number>): void => {
    if (++nodes > 500_000 || path.length > 64)
      throw new HbarError('IPC_PAYLOAD_LIMIT', 'IPC data structure exceeds its bound')
    if (value === undefined) {
      undefinedPaths.push(path)
      return
    }
    if (value === null || typeof value === 'boolean') return
    if (typeof value === 'string') {
      if (value.length > maximum) throw new HbarError('IPC_PAYLOAD_LIMIT', 'IPC string exceeds its bound')
      return
    }
    if (typeof value === 'number' && Number.isFinite(value)) return
    if (typeof value !== 'object' || ancestors.has(value))
      throw new HbarError('IPC_SERIALIZATION', 'IPC accepts data, not executable or cyclic values')
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      throw new HbarError('IPC_SERIALIZATION', 'IPC accepts plain data descriptions only')
    ancestors.add(value)
    if (Array.isArray(value)) value.forEach((item: unknown, index) => inspect(item, [...path, index]))
    else for (const [key, item] of Object.entries(value)) inspect(item, [...path, key])
    ancestors.delete(value)
  }
  inspect(message, [])
  if (undefinedPaths.length > 4_096) throw new HbarError('IPC_PAYLOAD_LIMIT', 'Too many optional IPC values')
  const encoded = JSON.stringify({ message, undefinedPaths })
  if (new TextEncoder().encode(encoded).byteLength > maximum)
    throw new HbarError('IPC_PAYLOAD_LIMIT', 'IPC message exceeds its bound')
  return encoded
}

function decode(text: string): IpcMessage {
  const packet = packetSchema.parse(JSON.parse(text))
  for (const path of packet.undefinedPaths) {
    if (!path.length) throw new HbarError('IPC_PROTOCOL', 'Invalid optional value path')
    let target: unknown = packet.message
    for (const key of path.slice(0, -1)) {
      if (typeof target !== 'object' || target === null || !Object.hasOwn(target, key))
        throw new HbarError('IPC_PROTOCOL', 'Invalid optional value owner')
      target = Reflect.get(target, key)
    }
    if (typeof target !== 'object' || target === null)
      throw new HbarError('IPC_PROTOCOL', 'Invalid optional value target')
    Object.defineProperty(target, path.at(-1)!, {
      value: undefined,
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  return messageSchema.parse(packet.message)
}

function fragmentEnds(text: string): number[] {
  const ends: number[] = []
  let offset = 0
  while (offset < text.length) {
    let end = Math.min(text.length, offset + RUNTIME_LIMITS.fragmentChars)
    const last = text.charCodeAt(end - 1)
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--
    ends.push(end)
    offset = end
  }
  return ends
}

/** One peer per process incarnation. Logical cancellation retains the physical slot until its owner replies or exits. */
export class IpcPeer {
  readonly owner: Readonly<RuntimeOwner>
  readonly remote: Readonly<RuntimeOwner>
  private readonly maximumInFlight: number
  private readonly maximumQueued: number
  private readonly maximumBytes: number
  private readonly maximumMessage: number
  private readonly timeoutMs: number
  private readonly fragmentTimeoutMs: number
  private readonly pending = new Map<string, Pending>()
  private queue: string[] = []
  private running = 0
  private runningNormal = 0
  private waiting = 0
  private waitingNormal = 0
  private incomingWaiting = 0
  private incomingWaitingNormal = 0
  private readonly maximumWaiting: number
  private remoteWaitCapacity = 0
  private queuedBytes = 0
  private readonly incoming = new Map<string, Incoming>()
  private incomingQueue: string[] = []
  private incomingRunning = 0
  private incomingRunningNormal = 0
  private readonly controlMethods: ReadonlySet<string>
  private readonly normalCapacity: number
  private incomingBytes = 0
  private readonly procedures = new Map<string, IpcProcedure>()
  private readonly events = new Map<string, Set<(input: unknown) => void>>()
  private readonly assemblies = new Map<string, Assembly>()
  private assemblyBytes = 0
  private readonly acknowledgements = new Map<
    string,
    { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
  >()
  private sendingBytes = 0
  private sendingMessages = 0
  private failure: HbarError | null = null
  private protocolFailureObserved = false

  private protocolFailure(
    reason: Parameters<NonNullable<IpcPeerOptions['onProtocolFailure']>>[0]['reason'],
    errorCode: Parameters<NonNullable<IpcPeerOptions['onProtocolFailure']>>[0]['errorCode'],
  ): void {
    if (this.failure || this.protocolFailureObserved) return
    this.protocolFailureObserved = true
    try {
      this.options.onProtocolFailure?.({ reason, errorCode })
    } catch {
      console.error('[hbar runtime] protocol diagnostic observer failed')
    }
  }

  private sendFrame(frame: IpcFrame): void {
    try {
      this.options.transport.send(frame)
    } catch (error) {
      this.protocolFailure('transport_send', 'IPC_TRANSPORT_SEND')
      throw error
    }
  }

  private closeSendFailure(error: unknown): void {
    const code =
      error instanceof HbarError && ['IPC_FRAGMENT_TIMEOUT', 'IPC_BUSY', 'IPC_PAYLOAD_LIMIT'].includes(error.code)
        ? error.code
        : 'IPC_PROTOCOL'
    this.protocolFailure(
      'send_failure',
      code === 'IPC_FRAGMENT_TIMEOUT'
        ? 'IPC_FRAGMENT_TIMEOUT'
        : code === 'IPC_BUSY'
          ? 'IPC_BUSY'
          : code === 'IPC_PAYLOAD_LIMIT'
            ? 'IPC_PAYLOAD_LIMIT'
            : 'IPC_PROTOCOL',
    )
    this.close(ipcChannelFailure(error))
  }

  constructor(private readonly options: IpcPeerOptions) {
    this.owner = Object.freeze(runtimeOwnerSchema.parse(options.owner))
    this.remote = Object.freeze(runtimeOwnerSchema.parse(options.remote))
    // Each owner can serve and initiate calls simultaneously; split the default unit budget across directions.
    this.maximumInFlight = limit(options.inFlight, RUNTIME_LIMITS.inFlight / 2)
    this.maximumWaiting = limit(options.waiting, RUNTIME_LIMITS.queued / 2)
    this.controlMethods = new Set(
      z
        .array(methodName)
        .max(128)
        .parse(options.controlMethods ?? []),
    )
    const reserved = options.reservedControl ?? (this.controlMethods.size ? Math.min(8, this.maximumInFlight - 1) : 0)
    if (!Number.isSafeInteger(reserved) || reserved < 0 || reserved >= this.maximumInFlight)
      throw new RangeError('Invalid IPC reserved control capacity')
    this.normalCapacity = this.maximumInFlight - reserved
    this.maximumQueued = limit(options.queued, RUNTIME_LIMITS.queued / 2)
    this.maximumBytes = limit(options.bufferedBytes, RUNTIME_LIMITS.bufferedBytes)
    this.maximumMessage = limit(options.messageBytes, RUNTIME_LIMITS.messageBytes)
    this.timeoutMs = limit(options.timeoutMs, 30_000)
    this.fragmentTimeoutMs = limit(options.fragmentTimeoutMs, 5_000)
  }

  snapshot() {
    return {
      inFlight: this.running,
      waiting: this.waiting,
      queued: this.queue.length,
      queuedBytes: this.queuedBytes,
      incoming: this.incomingRunning,
      incomingWaiting: this.incomingWaiting,
      incomingQueued: this.incomingQueue.length,
      incomingBytes: this.incomingBytes,
      bufferedBytes: this.assemblyBytes + this.sendingBytes,
      failed: this.failure !== null,
    }
  }

  /** New child bootstraps advertise support; older peers keep their original physical admission limits. */
  advertiseWaitCapacity(): Promise<void> {
    if (!this.options.acceptRemoteDeadlineControl)
      return Promise.reject(new HbarError('IPC_FORBIDDEN', 'Only a child may advertise trusted-parent wait admission'))
    return this.notify(waitCapacityMethod, { version: 1, capacity: this.maximumWaiting })
  }

  register(method: string, handler: IpcProcedure): () => void {
    methodName.parse(method)
    if (this.procedures.has(method)) throw new HbarError('IPC_PROCEDURE_EXISTS', 'Runtime procedure already exists')
    this.procedures.set(method, handler)
    return () => {
      if (this.procedures.get(method) === handler) this.procedures.delete(method)
    }
  }

  onEvent<Value>(method: string, schema: z.ZodType<Value>, listener: (value: Value) => void): () => void {
    methodName.parse(method)
    const handler = (value: unknown) => listener(schema.parse(value))
    const listeners = this.events.get(method) ?? new Set()
    listeners.add(handler)
    this.events.set(method, listeners)
    return () => {
      listeners.delete(handler)
      if (!listeners.size) this.events.delete(method)
    }
  }

  call<Output>(
    method: string,
    input: unknown,
    output: z.ZodType<Output>,
    options: IpcCallOptions = {},
  ): Promise<Output> {
    return this.request(method, input, output, options)
  }

  callTracked<Output>(
    method: string,
    input: unknown,
    output: z.ZodType<Output>,
    options: IpcCallOptions = {},
  ): IpcCallTicket<Output> {
    const settlement = Promise.withResolvers<Output>()
    let suspendDeadline: () => () => void = () => () => {}
    const result = this.request<Output>(method, input, output, options, {
      resolve: settlement.resolve,
      reject: settlement.reject,
      bindDeadline: (suspend) => {
        suspendDeadline = suspend
      },
    })
    // Both observations are optional for callers; retaining one must not cause an unhandled rejection of the other.
    void result.catch(() => undefined)
    void settlement.promise.catch(() => undefined)
    return { result, settled: settlement.promise, suspendDeadline: () => suspendDeadline() }
  }

  private request<Output>(
    method: string,
    input: unknown,
    output: z.ZodType<Output>,
    options: IpcCallOptions,
    settlement?: Settlement<Output>,
  ): Promise<Output> {
    const dispatchStarted = (event: 'submitting' | 'sent' | 'send-failed'): void => {
      try {
        options.onDispatchStarted?.(event)
      } catch {
        console.error('[hbar runtime] dispatch observer failed')
      }
    }
    let dispatchObserved = false
    const dispatchSettled = (event: 'reply' | 'not-dispatched'): void => {
      if (dispatchObserved) return
      dispatchObserved = true
      try {
        options.onDispatchSettled?.(event)
      } catch {
        console.error('[hbar runtime] dispatch settlement observer failed')
      }
    }
    const refuse = (error: unknown): Promise<Output> => {
      dispatchSettled('not-dispatched')
      settlement?.reject(error)
      return Promise.reject(error)
    }
    const { signal, preserveAbortReason } = options
    if (this.failure) return refuse(this.failure)
    if (signal?.aborted)
      return refuse(
        preserveAbortReason ? signal.reason : new HbarError('IPC_CANCELLED', 'Runtime request was cancelled'),
      )
    const deadlineMs = options.timeoutMs ?? this.timeoutMs
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 2_147_483_647)
      return refuse(new HbarError('INVALID_INPUT', 'Runtime request deadlines require a positive timer-safe integer'))
    const callId = crypto.randomUUID()
    const requestId = options.requestId ?? callId
    let message: CallMessage
    let bytes: number
    let encoded: string
    try {
      message = callSchema.parse({
        kind: 'call',
        id: callId,
        method,
        input,
        requestId,
        ...(options.ownership ? { ownership: options.ownership } : {}),
      })
      encoded = encode(message, this.maximumMessage)
      bytes = new TextEncoder().encode(encoded).byteLength
      limit(options.timeoutMs, this.timeoutMs)
    } catch (error) {
      return refuse(error)
    }
    if (
      ((this.controlMethods.has(method)
        ? this.running - this.waiting >= this.maximumInFlight
        : this.runningNormal - this.waitingNormal >= this.normalCapacity) &&
        this.queue.length >= this.maximumQueued) ||
      this.queuedBytes + bytes > this.maximumBytes
    )
      return refuse(new HbarError('IPC_BUSY', 'Runtime request capacity is exhausted'))
    return new Promise<Output>((resolve, reject) => {
      const enqueuedAt = performance.now()
      const pending: Pending = {
        dispatchStarted,
        dispatchSettled,
        id: callId,
        control: this.controlMethods.has(method),
        encoded,
        bytes,
        resolve(value) {
          try {
            const parsed = output.parse(value)
            resolve(parsed)
            settlement?.resolve(parsed)
          } catch (error) {
            reject(error)
            settlement?.reject(error)
          }
        },
        reject,
        rejectSettlement: settlement?.reject,
        signal: options.signal,
        deadline: undefined,
        started: false,
        transportStarted: false,
        settled: false,
        abort: () =>
          this.cancel(
            callId,
            preserveAbortReason ? signal?.reason : new HbarError('IPC_CANCELLED', 'Runtime request was cancelled'),
          ),
      }
      this.pending.set(callId, pending)
      this.queue.push(callId)
      this.queuedBytes += bytes
      pending.deadline = new RpcDeadline(deadlineMs, () => {
        const state = this.snapshot()
        const pendingCount = this.pending.size
        const diagnostic: IpcCallTimeout = {
          callId,
          method: /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(method) ? method : 'redacted',
          phase: pending.started ? 'dispatched' : 'queued',
          elapsedMs: Math.max(0, performance.now() - enqueuedAt),
        }
        this.cancel(callId, new HbarError('IPC_TIMEOUT', 'Runtime request deadline exceeded; reconcile its outcome'))
        try {
          this.options.onCallTimeout?.(diagnostic)
        } catch {
          console.error('[hbar runtime] timeout diagnostic observer failed')
        }
        if (pending.started) {
          try {
            this.options.onTimeout?.(requestId, {
              callId,
              method,
              elapsedMs: Math.max(0, performance.now() - enqueuedAt),
              timeoutMs: options.timeoutMs ?? this.timeoutMs,
              started: pending.started,
              pending: pendingCount,
              inFlight: state.inFlight,
              queued: state.queued,
              incoming: state.incoming,
              incomingQueued: state.incomingQueued,
            })
          } catch {
            console.error('[hbar runtime] timeout observer failed')
          }
        }
      })
      settlement?.bindDeadline?.(() => {
        if (pending.settled) return () => {}
        if (!pending.started)
          throw new HbarError('IPC_REQUEST_NOT_STARTED', 'Only a sent request can enter a confirmed wait')
        const resume = pending.deadline?.suspend() ?? (() => {})
        let resumeAdmission: (() => void) | undefined
        try {
          resumeAdmission = this.suspendAdmission('pending', pending.id)
        } catch (error) {
          resume()
          throw error
        }
        return () => {
          resumeAdmission?.()
          resume()
        }
      })
      options.signal?.addEventListener('abort', pending.abort, { once: true })
      if (options.signal?.aborted) pending.abort()
      this.drain()
    })
  }

  notify(method: string, input: unknown): Promise<void> {
    return this.sendMessage(messageSchema.parse({ kind: 'event', method, input }))
  }

  receive(value: unknown): void {
    if (this.failure) return
    let reason: Parameters<NonNullable<IpcPeerOptions['onProtocolFailure']>>[0]['reason'] = 'frame_schema'
    let errorCode: Parameters<NonNullable<IpcPeerOptions['onProtocolFailure']>>[0]['errorCode'] = 'IPC_PROTOCOL'
    try {
      const frame = frameSchema.parse(value)
      reason = 'owner'
      errorCode = 'IPC_OWNER_CHANGED'
      if (frame.from !== this.remote.incarnation || frame.to !== this.owner.incarnation)
        throw new HbarError('IPC_OWNER_CHANGED', 'IPC process incarnation does not match')
      if (frame.kind === 'ack') {
        const key = `${frame.id}:${frame.index}`
        const acknowledgement = this.acknowledgements.get(key)
        if (acknowledgement) {
          this.acknowledgements.delete(key)
          clearTimeout(acknowledgement.timer)
          acknowledgement.resolve()
        }
        return
      }
      reason = 'fragment_sequence'
      errorCode = 'IPC_PROTOCOL'
      if (frame.index >= frame.total) throw new HbarError('IPC_PROTOCOL', 'Invalid fragment index')
      let assembly = this.assemblies.get(frame.id)
      if (!assembly) {
        if (frame.index !== 0 || this.assemblies.size >= this.maximumInFlight + this.maximumQueued)
          throw new HbarError('IPC_PROTOCOL', 'Invalid fragment start')
        assembly = {
          total: frame.total,
          parts: [],
          bytes: 0,
          timer: setTimeout(() => {
            this.protocolFailure('fragment_sequence', 'IPC_FRAGMENT_TIMEOUT')
            this.close(new HbarError('IPC_FRAGMENT_TIMEOUT', 'Runtime transfer stalled'))
          }, this.fragmentTimeoutMs),
        }
        this.assemblies.set(frame.id, assembly)
      }
      const bytes = new TextEncoder().encode(frame.data).byteLength
      if (assembly.total !== frame.total || assembly.parts.length !== frame.index) {
        errorCode = 'IPC_PAYLOAD_LIMIT'
        throw new HbarError('IPC_PAYLOAD_LIMIT', 'Runtime transfer exceeds its bound or sequence')
      }
      reason = 'payload'
      errorCode = 'IPC_PAYLOAD_LIMIT'
      if (assembly.bytes + bytes > this.maximumMessage || this.assemblyBytes + bytes > this.maximumBytes)
        throw new HbarError('IPC_PAYLOAD_LIMIT', 'Runtime transfer exceeds its bound or sequence')
      assembly.parts.push(frame.data)
      assembly.bytes += bytes
      this.assemblyBytes += bytes
      reason = 'transport_send'
      errorCode = 'IPC_TRANSPORT_SEND'
      this.sendFrame({
        kind: 'ack',
        version: 1,
        from: this.owner.incarnation,
        to: this.remote.incarnation,
        id: frame.id,
        index: frame.index,
      })
      if (assembly.parts.length !== assembly.total) return
      clearTimeout(assembly.timer)
      this.assemblies.delete(frame.id)
      this.assemblyBytes -= assembly.bytes
      reason = 'decode'
      errorCode = 'IPC_PROTOCOL'
      const message = decode(assembly.parts.join(''))
      reason = 'dispatch'
      this.dispatch(message, assembly.bytes)
    } catch (error) {
      this.protocolFailure(reason, errorCode)
      this.close(new HbarError('IPC_PROTOCOL', 'Runtime channel failed validation', { cause: error }))
    }
  }

  close(error = new HbarError('IPC_DISCONNECTED', 'Runtime owner disconnected; reconcile unfinished calls')): void {
    if (this.failure) return
    this.failure = error
    for (const pending of this.pending.values()) {
      if (!pending.transportStarted) pending.dispatchSettled('not-dispatched')
      this.settle(pending)
      pending.reject(error)
      pending.rejectSettlement?.(error)
    }
    this.pending.clear()
    this.queue = []
    this.running = 0
    this.runningNormal = 0
    this.waiting = 0
    this.waitingNormal = 0
    this.queuedBytes = 0
    for (const request of this.incoming.values()) request.controller.abort(error)
    this.incoming.clear()
    this.incomingQueue = []
    this.incomingRunning = 0
    this.incomingRunningNormal = 0
    this.incomingWaiting = 0
    this.incomingWaitingNormal = 0
    this.incomingBytes = 0
    for (const assembly of this.assemblies.values()) clearTimeout(assembly.timer)
    this.assemblies.clear()
    this.assemblyBytes = 0
    for (const acknowledgement of this.acknowledgements.values()) {
      clearTimeout(acknowledgement.timer)
      acknowledgement.reject(error)
    }
    this.acknowledgements.clear()
    this.events.clear()
    this.procedures.clear()
    try {
      this.options.onFailure?.(error)
    } catch {
      console.error('[hbar runtime] failure observer failed')
    }
  }

  private settle(pending: Pending): void {
    pending.settled = true
    pending.deadline?.dispose()
    pending.remoteWaits?.clear()
    pending.signal?.removeEventListener('abort', pending.abort)
  }

  private cancel(callId: string, error: unknown): void {
    const pending = this.pending.get(callId)
    if (!pending || pending.settled) return
    this.settle(pending)
    pending.reject(error)
    if (!pending.started) {
      pending.dispatchSettled('not-dispatched')
      pending.rejectSettlement?.(error)
      this.pending.delete(callId)
      this.queue = this.queue.filter((id) => id !== callId)
      this.queuedBytes -= pending.bytes
    } else if (pending.transportStarted)
      void this.sendMessage({ kind: 'cancel', id: callId }).catch((error) => this.closeSendFailure(error))
  }

  private drain(): void {
    while (!this.failure && this.running - this.waiting < this.maximumInFlight && this.queue.length) {
      const controlIndex = this.queue.findIndex((id) => this.pending.get(id)?.control)
      if (controlIndex < 0 && this.runningNormal - this.waitingNormal >= this.normalCapacity) break
      const callId = this.queue.splice(controlIndex < 0 ? 0 : controlIndex, 1)[0]!
      const pending = this.pending.get(callId)
      if (!pending) continue
      this.queuedBytes -= pending.bytes
      pending.started = true
      this.running++
      if (!pending.control) this.runningNormal++
      const encoded = pending.encoded
      pending.encoded = undefined
      if (encoded === undefined) {
        this.close(new HbarError('IPC_PROTOCOL', 'Runtime request lost its captured input'))
        return
      }
      pending.dispatchStarted('submitting')
      // Observers can synchronously abort or close the peer before the first frame.
      // Reservation alone is not transport dispatch or evidence of remote execution.
      if (pending.settled || this.failure || this.pending.get(callId) !== pending) {
        if (this.pending.get(callId) === pending) {
          this.pending.delete(callId)
          this.running--
          if (!pending.control) this.runningNormal--
        }
        pending.dispatchSettled('not-dispatched')
        continue
      }
      pending.transportStarted = true
      void this.sendEncoded(encoded).then(
        () => pending.dispatchStarted('sent'),
        (error: unknown) => {
          pending.dispatchStarted('send-failed')
          this.closeSendFailure(error)
        },
      )
    }
  }

  private dispatch(message: IpcMessage, bytes: number): void {
    switch (message.kind) {
      case 'reply': {
        const pending = this.pending.get(message.id)
        if (!pending || !pending.started) return
        this.pending.delete(message.id)
        this.clearAdmission('pending', pending)
        this.running--
        if (!pending.control) this.runningNormal--
        pending.dispatchSettled('reply')
        if (!pending.settled || pending.rejectSettlement) {
          if (!pending.settled) this.settle(pending)
          if (message.ok) pending.resolve(message.result)
          else {
            const error = new HbarError(message.code, message.message)
            pending.reject(error)
            pending.rejectSettlement?.(error)
          }
        }
        this.drain()
        return
      }
      case 'cancel': {
        const request = this.incoming.get(message.id)
        if (request) request.controller.abort(new HbarError('IPC_CANCELLED', 'Caller cancelled the runtime request'))
        return
      }
      case 'event': {
        if (message.method === waitCapacityMethod) {
          const capability = waitCapacitySchema.safeParse(message.input)
          if (!capability.success) this.close(new HbarError('IPC_PROTOCOL', 'Invalid child wait-admission capability'))
          else if (this.options.controlRemoteDeadlines) this.remoteWaitCapacity = capability.data.capacity
          return
        }
        if (message.method === waitAdmissionMethod) {
          if (!this.options.acceptRemoteDeadlineControl) {
            this.close(new HbarError('IPC_FORBIDDEN', 'Only the stable parent may control wait admission'))
            return
          }
          const parsed = waitAdmissionSchema.safeParse(message.input)
          if (!parsed.success) this.close(new HbarError('IPC_PROTOCOL', 'Invalid wait-admission control'))
          else {
            try {
              this.changeAdmission(parsed.data.target, parsed.data.id, parsed.data.token, parsed.data.phase)
            } catch {
              this.close(new HbarError('IPC_PROTOCOL', 'Wait-admission capacity exceeded'))
            }
          }
          return
        }
        if (message.method === deadlineControlMethod) {
          this.controlDeadline(message.input)
          return
        }
        for (const listener of [...(this.events.get(message.method) ?? [])]) {
          try {
            listener(message.input)
          } catch {
            console.error('[hbar runtime] event observer failed')
          }
        }
        return
      }
      case 'call': {
        if (this.incoming.has(message.id)) {
          this.protocolFailure('dispatch', 'IPC_PROTOCOL')
          this.close(new HbarError('IPC_PROTOCOL', 'Duplicate runtime invocation'))
          return
        }
        if (
          ((this.controlMethods.has(message.method)
            ? this.incomingRunning - this.incomingWaiting >= this.maximumInFlight
            : this.incomingRunningNormal - this.incomingWaitingNormal >= this.normalCapacity) &&
            this.incomingQueue.length >= this.maximumQueued) ||
          this.incomingBytes + bytes > this.maximumBytes
        ) {
          void this.sendError(message.id, new HbarError('IPC_BUSY', 'Runtime execution capacity is exhausted')).catch(
            (error) => this.closeSendFailure(error),
          )
          return
        }
        this.incoming.set(message.id, { message, bytes, controller: new AbortController(), started: false })
        this.incomingBytes += bytes
        this.incomingQueue.push(message.id)
        this.drainIncoming()
        return
      }
    }
  }

  private drainIncoming(): void {
    while (
      !this.failure &&
      this.incomingRunning - this.incomingWaiting < this.maximumInFlight &&
      this.incomingQueue.length
    ) {
      const controlIndex = this.incomingQueue.findIndex((id) => {
        const method = this.incoming.get(id)?.message.method
        return method !== undefined && this.controlMethods.has(method)
      })
      if (controlIndex < 0 && this.incomingRunningNormal - this.incomingWaitingNormal >= this.normalCapacity) break
      const callId = this.incomingQueue.splice(controlIndex < 0 ? 0 : controlIndex, 1)[0]!
      const request = this.incoming.get(callId)
      if (!request) continue
      request.started = true
      this.incomingRunning++
      const control = this.controlMethods.has(request.message.method)
      if (!control) this.incomingRunningNormal++
      const complete = (): void => {
        request.deadlineWaits?.clear()
        if (!this.incoming.delete(callId)) return
        this.clearAdmission('incoming', request)
        this.incomingBytes -= request.bytes
        this.incomingRunning--
        if (!control) this.incomingRunningNormal--
        this.drainIncoming()
      }
      void this.invoke(request, complete)
        .catch((error) => this.closeSendFailure(error))
        .finally(complete)
    }
  }

  private async invoke(request: Incoming, confirmed: () => void): Promise<void> {
    try {
      request.controller.signal.throwIfAborted()
      const handler = this.procedures.get(request.message.method)
      if (!handler) throw new HbarError('IPC_METHOD_UNAVAILABLE', 'Runtime procedure is unavailable')
      const result = await handler.invoke(request.message.input, {
        sender: this.remote,
        requestId: request.message.requestId,
        signal: request.controller.signal,
        ...(request.message.ownership ? { ownership: request.message.ownership } : {}),
        ...(this.options.controlRemoteDeadlines
          ? { callerDeadline: { suspend: () => this.suspendCaller(request) } }
          : {}),
      })
      await this.sendMessage({ kind: 'reply', id: request.message.id, ok: true, result }, confirmed)
    } catch (error) {
      await this.sendError(request.message.id, error, confirmed)
    }
  }

  private suspendCaller(request: Incoming): () => void {
    if (this.incoming.get(request.message.id) !== request || !request.started)
      throw new HbarError('IPC_REQUEST_EXPIRED', 'The original caller deadline is unavailable')
    request.controller.signal.throwIfAborted()
    const waits = (request.deadlineWaits ??= new Set<string>())
    if (waits.size >= 64) throw new HbarError('BUSY', 'Remote caller wait capacity is full')
    const token = crypto.randomUUID()
    const resumeAdmission = this.suspendAdmission('incoming', request.message.id)
    waits.add(token)
    const send = (phase: 'pause' | 'resume') =>
      this.notify(deadlineControlMethod, { id: request.message.id, token, phase })
    const paused = send('pause').catch(() => this.close())
    let active = true
    return () => {
      if (!active) return
      active = false
      if (!waits.delete(token)) return
      resumeAdmission()
      void paused.then(() => send('resume')).catch(() => this.close())
    }
  }

  private suspendAdmission(target: 'pending' | 'incoming', id: string): () => void {
    if (!this.options.controlRemoteDeadlines || !this.remoteWaitCapacity) return () => {}
    const token = crypto.randomUUID()
    this.changeAdmission(target, id, token, 'pause')
    const remoteTarget = target === 'pending' ? 'incoming' : 'pending'
    const send = (phase: 'pause' | 'resume') =>
      this.notify(waitAdmissionMethod, { target: remoteTarget, id, token, phase })
    const paused = send('pause').catch(() => this.close())
    let active = true
    return () => {
      if (!active) return
      active = false
      this.changeAdmission(target, id, token, 'resume')
      void paused.then(() => send('resume')).catch(() => this.close())
    }
  }

  private changeAdmission(target: 'pending' | 'incoming', id: string, token: string, phase: 'pause' | 'resume'): void {
    const call = target === 'pending' ? this.pending.get(id) : this.incoming.get(id)
    if (!call) return
    if (!call.started) throw new HbarError('IPC_REQUEST_NOT_STARTED', 'Queued requests cannot claim waiting admission')
    const waits = (call.admissionWaits ??= new Set<string>())
    if (phase === 'resume') {
      if (waits.delete(token) && !waits.size) this.clearAdmission(target, call, true)
    } else if (!waits.has(token)) {
      const maximum = this.options.controlRemoteDeadlines
        ? Math.min(this.maximumWaiting, this.remoteWaitCapacity)
        : this.maximumWaiting
      if (waits.size >= 64 || (!waits.size && (target === 'pending' ? this.waiting : this.incomingWaiting) >= maximum))
        throw new HbarError('BUSY', 'Confirmed waiting-call admission is full')
      if (!waits.size) {
        if (target === 'pending') {
          this.waiting++
          if ('control' in call && !call.control) this.waitingNormal++
        } else {
          this.incomingWaiting++
          if ('message' in call && !this.controlMethods.has(call.message.method)) this.incomingWaitingNormal++
        }
      }
      waits.add(token)
    }
    if (target === 'pending') this.drain()
    else this.drainIncoming()
  }

  private clearAdmission(target: 'pending' | 'incoming', call: Pending | Incoming, removedLast = false): void {
    if (!removedLast && !call.admissionWaits?.size) return
    call.admissionWaits?.clear()
    if (target === 'pending') {
      this.waiting--
      if ('control' in call && !call.control) this.waitingNormal--
    } else {
      this.incomingWaiting--
      if ('message' in call && !this.controlMethods.has(call.message.method)) this.incomingWaitingNormal--
    }
  }

  private controlDeadline(value: unknown): void {
    if (!this.options.acceptRemoteDeadlineControl) {
      this.close(new HbarError('IPC_FORBIDDEN', 'This peer cannot control the original caller deadline'))
      return
    }
    const parsed = deadlineControlSchema.safeParse(value)
    if (!parsed.success) {
      this.close(new HbarError('IPC_PROTOCOL', 'Invalid caller deadline control'))
      return
    }
    const { id, token, phase } = parsed.data
    const pending = this.pending.get(id)
    if (!pending || pending.settled) return
    if (!pending.started) {
      this.close(new HbarError('IPC_PROTOCOL', 'Queued caller deadlines cannot be suspended remotely'))
      return
    }
    if (phase === 'resume') {
      pending.remoteWaits?.get(token)?.()
      pending.remoteWaits?.delete(token)
      return
    }
    const waits = (pending.remoteWaits ??= new Map<string, () => void>())
    if (waits.has(token)) return
    if (waits.size >= 64) {
      this.close(new HbarError('IPC_PROTOCOL', 'Caller deadline control exceeds its bound'))
      return
    }
    if (pending.deadline) waits.set(token, pending.deadline.suspend())
  }

  private sendError(callId: string, error: unknown, confirmed?: () => void): Promise<void> {
    // Immutable bundles contain their own contracts class. The error descriptor is validated
    // structurally so a legitimate domain error survives this local module boundary.
    const descriptor = runtimeDomainError(error)
    return this.sendMessage(
      {
        kind: 'reply',
        id: callId,
        ok: false,
        code: descriptor?.code ?? 'IPC_PROCEDURE_FAILED',
        message: descriptor?.message ?? 'Runtime procedure failed',
      },
      confirmed,
    )
  }

  private async sendMessage(message: IpcMessage, confirmed?: () => void): Promise<void> {
    if (this.failure) throw this.failure
    const encoded = encode(message, this.maximumMessage)
    await this.sendEncoded(encoded, confirmed)
  }

  private async sendEncoded(encoded: string, confirmed?: () => void): Promise<void> {
    if (this.failure) throw this.failure
    const bytes = new TextEncoder().encode(encoded).byteLength
    if (
      this.sendingBytes + bytes > this.maximumBytes ||
      this.sendingMessages >= this.maximumInFlight + this.maximumQueued
    )
      throw new HbarError('IPC_BUSY', 'Runtime transfer capacity is exhausted')
    this.sendingBytes += bytes
    this.sendingMessages++
    let completed = false
    const complete = (): void => {
      if (completed) return
      completed = true
      this.sendingBytes -= bytes
      this.sendingMessages--
    }
    const messageId = crypto.randomUUID()
    const ends = fragmentEnds(encoded)
    const total = ends.length
    try {
      for (let index = 0; index < total; index++) {
        if (this.failure) throw this.failure
        const key = `${messageId}:${index}`
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.acknowledgements.delete(key)
            reject(new HbarError('IPC_FRAGMENT_TIMEOUT', 'Runtime transfer was not acknowledged'))
          }, this.fragmentTimeoutMs)
          this.acknowledgements.set(key, {
            resolve: () => {
              if (index === total - 1) {
                // The real final ACK is the physical boundary, before the next FIFO frame.
                complete()
                confirmed?.()
              }
              resolve()
            },
            reject,
            timer,
          })
          try {
            this.sendFrame({
              kind: 'fragment',
              version: 1,
              from: this.owner.incarnation,
              to: this.remote.incarnation,
              id: messageId,
              index,
              total,
              data: encoded.slice(ends[index - 1] ?? 0, ends[index]),
            })
          } catch (error) {
            clearTimeout(timer)
            this.acknowledgements.delete(key)
            reject(error)
          }
        })
      }
    } finally {
      // Failed sends retain the existing cleanup path; confirmed sends are already settled.
      complete()
    }
  }
}
