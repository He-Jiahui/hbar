import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { CommandError } from '@hbar/commands/protocol'
import { procedure, type IpcPeer } from '@hbar/runtime'
import { runtimeControllerInvokeSchema, runtimeControllerRequestSchema, isRuntimeControllerControl, type RuntimeControllerPort, type RuntimeControllerRequest } from './runtime-controller-contract'

/** Native sockets and their identity remain in the listener. A candidate only receives bounded request data. */
export class RuntimeControllerAdapter implements RuntimeControllerPort {
  private readonly invocations = new Map<string, {
    invoke(request: RuntimeControllerRequest, signal: AbortSignal): Promise<unknown>
    signature: string | null
    result: Promise<unknown> | null
  }>()
  private readonly unregister: () => void
  private closed = false
  constructor(private readonly peer: IpcPeer) {
    this.unregister = peer.register('controller.invoke', procedure(runtimeControllerInvokeSchema, z.unknown(), async (input, call) => {
      const invocation = this.invocations.get(input.invocationId)
      if (!invocation) throw new HbarError('CONTROLLER_INVOCATION_EXPIRED', 'The request no longer belongs to this Controller incarnation')
      const signature = JSON.stringify(input.request)
      if (invocation.signature !== signature)
        throw new HbarError('CONTROLLER_REQUEST_MISMATCH', 'An accepted request cannot change its payload')
      call.signal.throwIfAborted()
      invocation.result ??= Promise.resolve().then(() => invocation.invoke(input.request, call.signal))
      try { return await invocation.result }
      catch (error) {
        if (error instanceof CommandError) throw new HbarError(error.code, error.message)
        throw error
      }
    }))
  }
  async dispatch(payload: string, invoke: (request: RuntimeControllerRequest, signal: AbortSignal) => Promise<unknown>): Promise<string> {
    if (this.closed) throw new HbarError('RUNTIME_RECOVERING', 'The accepted Controller incarnation exited')
    if (this.invocations.size >= 320) throw new HbarError('CONTROLLER_CAPACITY', 'Controller request admission is exhausted')
    const invocationId = crypto.randomUUID()
    let method = 'controller.handle'
    let signature: string | null = null
    try {
      const request = runtimeControllerRequestSchema.safeParse(JSON.parse(payload))
      if (request.success) {
        signature = JSON.stringify(request.data)
        if (isRuntimeControllerControl(request.data)) method = 'controller.control'
      }
    } catch { /* The owning Controller returns the malformed request response. */ }
    this.invocations.set(invocationId, { invoke, signature, result: null })
    try { return await this.peer.call(method, { invocationId, payload }, z.string().max(33_554_432), { timeoutMs: 120_000 }) }
    finally { this.invocations.delete(invocationId) }
  }
  dispose(): void { this.closed = true; this.unregister(); this.invocations.clear() }
}
