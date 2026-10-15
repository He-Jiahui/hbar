import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { PiDriver } from '@hbar/pi-driver'
import type { DriverInput, ToolDefinition } from '@hbar/plugin-sdk'
import {
  runtimeDriverStartSchema,
  runtimeDriverCancelSchema,
  runtimeDriverSummarySchema,
  runtimeDriverSummaryResultSchema,
  runtimeModelRequestSchema,
  runtimeMessageSchema,
  runtimeToolResultSchema,
  runtimeDriverStepResultSchema,
  runtimeDriverEventResultSchema,
  type RuntimeDriverCallbackValue,
} from '@hbar/plugin-sdk/runtime-driver'
import { procedure, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { DRIVER_RUNTIME_FINGERPRINT } from './runtime-driver-contract'
import { stopDriverWithDiagnostic, type DriverStopReason } from './runtime-driver-stop-diagnostics'
import { driverCallbackCorrelation, observeDriverCallback } from './runtime-driver-callback-diagnostics'
import { driverCallbackTimeoutMs } from './runtime-driver-timeouts'
export { DRIVER_RUNTIME_FINGERPRINT } from './runtime-driver-contract'

export function create(context: RuntimeProcessContext): RuntimeProcessService {
  const driver = new PiDriver()
  const active = new Map<
    string,
    { controller: AbortController; cancellation: ReturnType<typeof setTimeout> | undefined }
  >()
  const streams = new Map<string, { invocationId: string; id: string; text: string; thinking: string }>()
  let draining = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let flushing: Promise<void> | undefined
  const stop = (reason: DriverStopReason, invocationId?: string): never =>
    stopDriverWithDiagnostic({
      owner: context.peer.owner,
      reason,
      activeCount: active.size,
      ...(invocationId === undefined ? {} : { invocationId }),
      notify: (event) => context.peer.notify('runtime.diagnostic', event),
      exit: (code) => process.exit(code),
    })
  const flush = (): Promise<void> => {
    if (flushing) return flushing
    flushing = (async () => {
      for (const [key, stream] of [...streams].slice(0, 64)) {
        if (streams.get(key) === stream) streams.delete(key)
        await context.peer.notify('driver.stream', stream)
      }
    })().finally(() => {
      flushing = undefined
      if (streams.size && !timer)
        timer = setTimeout(() => {
          timer = undefined
          void flush().catch(() => stop('stream_flush_requeued_failure'))
        }, 50)
    })
    return flushing
  }
  context.peer.onEvent('driver.cancel', runtimeDriverCancelSchema, (input) => {
    const invocation = active.get(input.invocationId)
    if (!invocation) return
    invocation.controller.abort(new HbarError(input.reasonCode, 'The original Run was cancelled'))
    invocation.cancellation ??= setTimeout(() => {
      if (active.has(input.invocationId)) stop('cancel_grace_expired', input.invocationId)
    }, 5_000)
  })
  context.peer.register(
    'driver.start',
    procedure(runtimeDriverStartSchema, z.strictObject({ invocationId: z.string() }), (input) => {
      if (context.preparing()) throw new HbarError('DRIVER_NOT_SERVING', 'Driver candidate is not serving')
      const bindings = input.ownership ? [input.ownership.versions.driver, ...input.ownership.versions.plugins] : []
      if (
        input.ownership &&
        (input.ownership.runId !== input.run.id ||
          input.ownership.sessionId !== input.session.id ||
          !bindings.some(
            (version) =>
              version.unitId === context.peer.owner.unitId && version.generation === context.peer.owner.generation,
          ))
      )
        throw new HbarError('DRIVER_OWNER_MISMATCH', 'Driver generation is not bound to this Run')
      if (draining && !input.ownership)
        throw new HbarError('DRIVER_NOT_SERVING', 'Draining driver requires the original Run ownership')
      if (active.size >= 64) throw new HbarError('DRIVER_CAPACITY', 'Driver execution capacity is exhausted')
      if (active.has(input.invocationId))
        throw new HbarError('DRIVER_INVOCATION_EXISTS', 'Driver invocation already started')
      const controller = new AbortController()
      const invocation = { controller, cancellation: undefined as ReturnType<typeof setTimeout> | undefined }
      active.set(input.invocationId, invocation)
      const call = <Output>(value: RuntimeDriverCallbackValue, result: z.ZodType<Output>) => {
        const rpcId = driverCallbackCorrelation()
        return observeDriverCallback({
          side: 'source',
          owner: context.peer.owner,
          rpcId,
          invocationId: input.invocationId,
          method: value.method,
          emit: (event) => {
            context.peer.notify('runtime.diagnostic', event).catch(() => {})
          },
          operation: () =>
            context.peer.call('driver.callback', { invocationId: input.invocationId, ...value }, result, {
              requestId: rpcId,
              signal: controller.signal,
              timeoutMs: driverCallbackTimeoutMs(value.method),
              ...(input.ownership ? { ownership: input.ownership } : {}),
            }),
        })
      }
      const tools: ToolDefinition[] = input.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        effect: tool.effect,
        timeoutMs: tool.timeoutMs,
        ...(tool.timeoutArgument ? { timeoutArgument: tool.timeoutArgument } : {}),
        inputSchema: z.record(z.string(), z.unknown()),
        inputJsonSchema: Object.freeze(tool.inputSchema),
        execute: () => {
          throw new HbarError('DRIVER_TOOL_AUTHORITY', 'Tool execution belongs to the Kernel callback owner')
        },
      }))
      const run: DriverInput = {
        session: input.session,
        workspace: input.workspace,
        run: input.run,
        request: input.request,
        tools,
        apiKey: input.apiKey,
        signal: controller.signal,
        onModelDiagnostic: (event) => {
          void call({ method: 'modelDiagnostic', event }, z.undefined()).catch(() => {
            /* A diagnostic observer cannot interrupt the original model invocation. */
          })
        },
        resolveKey: (modelId) => call({ method: 'resolveKey', modelId }, z.string().nullable()),
        readImage: (id) => call({ method: 'readImage', id }, z.strictObject({ mime: z.string(), data: z.string() })),
        readFile: (id) =>
          call(
            { method: 'readFile', id },
            z.strictObject({
              name: z.string(),
              mime: z.string(),
              size: z.number().nonnegative(),
              text: z.string().nullable(),
              truncated: z.boolean(),
            }),
          ),
        emit: (type, data, stepId) =>
          call({ method: 'emit', type, data, ...(stepId ? { stepId } : {}) }, runtimeDriverEventResultSchema),
        commit: (role, content, messageId, providerData) =>
          call(
            {
              method: 'commit',
              role,
              content,
              ...(messageId ? { messageId } : {}),
              ...(providerData !== undefined ? { providerData } : {}),
            },
            runtimeMessageSchema,
          ),
        execute: (name, args, callId) => call({ method: 'execute', name, args, callId }, runtimeToolResultSchema),
        beforeRequest: (request, stepId) =>
          call({ method: 'beforeRequest', request, stepId }, runtimeModelRequestSchema),
        stepEnded: (stepId) => call({ method: 'stepEnded', stepId }, runtimeDriverStepResultSchema),
        stream(id, text, thinking) {
          if (!active.has(input.invocationId)) return
          streams.set(`${input.invocationId}:${id}`, { invocationId: input.invocationId, id, text, thinking })
          if (
            streams.size > 256 ||
            [...streams.values()].reduce(
              (bytes, stream) => bytes + (stream.text.length + stream.thinking.length) * 2,
              0,
            ) >
              32 * 1024 * 1024
          )
            throw new HbarError('DRIVER_STREAM_CAPACITY', 'Driver stream buffer capacity is exhausted')
          timer ??= setTimeout(() => {
            timer = undefined
            void flush().catch(() => stop('stream_flush_scheduled_failure'))
          }, 50)
        },
        ...(input.steering
          ? {
              getSteeringMessages: (target) =>
                call(
                  { method: 'steering', ...(target.closeWhenEmpty ? { closeWhenEmpty: true as const } : {}) },
                  z.array(runtimeMessageSchema).max(20),
                ),
              closeSteeringAdmission: () => call({ method: 'closeSteering' }, z.undefined()),
            }
          : {}),
      }
      let terminalStage: DriverStopReason = 'completion_event_failure'
      void Promise.resolve()
        .then(() => driver.run(run))
        .then(
          async () => {
            terminalStage = 'completion_event_failure'
            await run.emit('run.driverCompleted', { version: 1 })
            terminalStage = 'completion_flush_failure'
            await flush()
            terminalStage = 'terminal_delivery_failure'
            await context.peer.notify('driver.terminal', {
              invocationId: input.invocationId,
              ok: true,
              reasonCode: null,
            })
          },
          async (error: unknown) => {
            const cause: unknown = controller.signal.aborted ? controller.signal.reason : error
            terminalStage = 'terminal_delivery_failure'
            await context.peer.notify('driver.terminal', {
              invocationId: input.invocationId,
              ok: false,
              reasonCode:
                cause instanceof Error && 'code' in cause && typeof cause.code === 'string'
                  ? cause.code.slice(0, 128)
                  : 'DRIVER_EXECUTION_FAILED',
            })
          },
        )
        .catch(() => stop(terminalStage, input.invocationId))
        .finally(() => {
          clearTimeout(invocation.cancellation)
          active.delete(input.invocationId)
          for (const [key, stream] of streams) if (stream.invocationId === input.invocationId) streams.delete(key)
        })
      return { invocationId: input.invocationId }
    }),
  )
  context.peer.register(
    'driver.summarize',
    procedure(runtimeDriverSummarySchema, runtimeDriverSummaryResultSchema, (input, call) => {
      if (context.preparing())
        throw new HbarError('DRIVER_NOT_SERVING', 'Driver candidate cannot perform model requests')
      return driver.summarize(input.request, input.apiKey, call.signal)
    }),
  )
  return {
    async prepare() {
      return {
        contractFingerprint: DRIVER_RUNTIME_FINGERPRINT,
        storageSchema: STORAGE_SCHEMA_VERSION,
        capabilities: ['driver.start', 'driver.summarize'],
      }
    },
    async activate(role) {
      draining = role === 'draining'
    },
    async drain() {
      draining = true
      return { runs: active.size, requests: 0, resources: 0 }
    },
    async dispose() {
      draining = true
      clearTimeout(timer)
      for (const invocation of active.values()) {
        clearTimeout(invocation.cancellation)
        invocation.controller.abort(new HbarError('HOST_SHUTTING_DOWN', 'Driver owner is shutting down'))
      }
      streams.clear()
    },
  }
}
