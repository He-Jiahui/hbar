import { AsyncLocalStorage } from 'node:async_hooks'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import { resolveToolTimeoutMs, type HarnessDriver, type DriverInput } from '@hbar/plugin-sdk'
import {
  runtimeDriverCallbackSchema,
  runtimeDriverStartSchema,
  runtimeDriverStreamSchema,
  runtimeDriverTerminalSchema,
  runtimeDriverSummarySchema,
  runtimeDriverSummaryResultSchema,
} from '@hbar/plugin-sdk/runtime-driver'
import { procedure, type IpcPeer } from '@hbar/runtime'
import { DRIVER_COMPACTION_RPC_TIMEOUT_MS } from './runtime-driver-timeouts'

interface Invocation {
  readonly input: DriverInput
  readonly invoke: <Result>(operation: () => Result) => Result
  resolve(): void
  reject(error: Error): void
  dispose(): void
}

/** Callback functions stay local to their owning Kernel; only validated named descriptors travel. */
export class RuntimeDriverAdapter implements HarnessDriver {
  readonly supportsCanonicalSteering = true
  readonly supportsSteeringAdmissionClosure = true
  private readonly running = new Map<string, Invocation>()
  private readonly disposers: Array<() => void> = []
  private closed = false
  constructor(
    private readonly peer: IpcPeer,
    private readonly ownership?: (runId: string) => ExecutionOwnership | undefined,
  ) {
    this.disposers.push(
      peer.register(
        'driver.callback',
        procedure(runtimeDriverCallbackSchema, z.unknown(), (call) => {
          const invocation = this.running.get(call.invocationId)
          if (!invocation)
            throw new HbarError('DRIVER_INVOCATION_EXPIRED', 'The original driver callback owner is unavailable')
          return invocation.invoke(() => {
            const input = invocation.input
            switch (call.method) {
              case 'modelDiagnostic':
                return input.onModelDiagnostic?.(call.event)
              case 'resolveKey':
                return input.resolveKey(call.modelId)
              case 'readImage':
                return input.readImage(call.id)
              case 'readFile':
                return input.readFile(call.id)
              case 'emit':
                return input.emit(call.type, call.data, call.stepId)
              case 'commit':
                return input.commit(call.role, call.content, call.messageId, call.providerData)
              case 'execute':
                return input.execute(call.name, call.args, call.callId)
              case 'beforeRequest':
                return input.beforeRequest(call.request, call.stepId)
              case 'stepEnded':
                return input.stepEnded(call.stepId)
              case 'steering':
                return (
                  input.getSteeringMessages?.({
                    sessionId: input.session.id,
                    runId: input.run.id,
                    signal: input.signal,
                    ...(call.closeWhenEmpty ? { closeWhenEmpty: true } : {}),
                  }) ?? []
                )
              case 'closeSteering':
                return input.closeSteeringAdmission?.()
            }
          })
        }),
      ),
    )
    this.disposers.push(
      peer.onEvent('driver.stream', runtimeDriverStreamSchema, (stream) => {
        const invocation = this.running.get(stream.invocationId)
        invocation?.invoke(() => invocation.input.stream(stream.id, stream.text, stream.thinking))
      }),
    )
    this.disposers.push(
      peer.onEvent('driver.terminal', runtimeDriverTerminalSchema, (terminal) => {
        const invocation = this.running.get(terminal.invocationId)
        if (!invocation) return
        this.running.delete(terminal.invocationId)
        invocation.dispose()
        if (terminal.ok) invocation.resolve()
        else
          invocation.reject(new HbarError(terminal.reasonCode ?? 'DRIVER_EXECUTION_FAILED', 'Driver execution stopped'))
      }),
    )
  }
  async run(input: DriverInput): Promise<void> {
    if (this.closed) throw new HbarError('DRIVER_UNAVAILABLE', 'Driver owner is unavailable')
    if (this.running.size >= 64) throw new HbarError('DRIVER_CAPACITY', 'Driver execution capacity is exhausted')
    input.signal.throwIfAborted()
    const invocationId = crypto.randomUUID()
    const payload = runtimeDriverStartSchema.parse({
      invocationId,
      session: input.session,
      workspace: input.workspace,
      run: input.run,
      request: input.request,
      ...(this.ownership ? { ownership: this.ownership(input.run.id) } : {}),
      apiKey: input.apiKey,
      steering: Boolean(input.getSteeringMessages && input.closeSteeringAdmission),
      tools: input.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        effect: tool.effect,
        inputSchema: tool.inputJsonSchema ?? z.toJSONSchema(tool.inputSchema, { io: 'input' }),
        timeoutMs: resolveToolTimeoutMs(tool),
        ...(tool.timeoutArgument ? { timeoutArgument: tool.timeoutArgument } : {}),
      })),
    })
    let resolve!: () => void, reject!: (error: Error) => void
    const completion = new Promise<void>((done, fail) => {
      resolve = done
      reject = fail
    })
    void completion.catch(() => {})
    const invoke = AsyncLocalStorage.snapshot()
    const cancel = () => {
      const reason: unknown = input.signal.reason
      void this.peer
        .notify('driver.cancel', {
          invocationId,
          reasonCode: reason instanceof HbarError ? reason.code : 'USER_CANCELLED',
        })
        .catch(() => this.dispose(new HbarError('DRIVER_UNAVAILABLE', 'Driver cancellation channel closed')))
    }
    this.running.set(invocationId, {
      input,
      invoke,
      resolve,
      reject,
      dispose: () => input.signal.removeEventListener('abort', cancel),
    })
    input.signal.addEventListener('abort', cancel, { once: true })
    try {
      await this.peer.call('driver.start', payload, z.strictObject({ invocationId: z.literal(invocationId) }))
      if (input.signal.aborted) cancel()
      await completion
    } catch (error) {
      const invocation = this.running.get(invocationId)
      if (invocation) {
        this.running.delete(invocationId)
        invocation.dispose()
      }
      // Consume a terminal notification racing with a failed start acknowledgement.
      void completion.catch(() => {})
      throw error
    }
  }
  summarize(request: Parameters<HarnessDriver['summarize']>[0], apiKey: string | null, signal: AbortSignal) {
    return this.peer.call(
      'driver.summarize',
      runtimeDriverSummarySchema.parse({ request, apiKey }),
      runtimeDriverSummaryResultSchema,
      { signal, timeoutMs: DRIVER_COMPACTION_RPC_TIMEOUT_MS },
    )
  }
  dispose(error = new HbarError('DRIVER_UNAVAILABLE', 'Driver process exited')): void {
    this.closed = true
    for (const dispose of this.disposers.splice(0)) dispose()
    for (const invocation of this.running.values()) {
      invocation.dispose()
      invocation.reject(error)
    }
    this.running.clear()
  }
}
