import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { PiDriver } from '@hbar/pi-driver'
import type { DriverInput, ToolDefinition, ModelDiagnosticEvent } from '@hbar/plugin-sdk'
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
  runtimeDriverDecisionSchema,
  runtimeDriverDecisionResultSchema,
  runtimeDriverModelActivitySchema,
  type RuntimeDriverCallbackValue,
} from '@hbar/plugin-sdk/runtime-driver'
import { procedure, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { DRIVER_RUNTIME_FINGERPRINT } from './runtime-driver-contract'
import { stopDriverWithDiagnostic, type DriverStopReason } from './runtime-driver-stop-diagnostics'
import { driverCallbackCorrelation, observeDriverCallback } from './runtime-driver-callback-diagnostics'
import { RuntimeDriverCallbackAdmission } from './runtime-driver-callback-gate'
import { driverCallbackTimeoutMs } from './runtime-driver-timeouts'
export { DRIVER_RUNTIME_FINGERPRINT } from './runtime-driver-contract'

export function create(context: RuntimeProcessContext): RuntimeProcessService {
  const driver = new PiDriver()
  const callbacks = new RuntimeDriverCallbackAdmission()
  const { physicalModelActivity } = z
    .object({ physicalModelActivity: z.boolean().default(false) })
    .parse(context.configuration ?? {})
  const active = new Map<
    string,
    {
      controller: AbortController
      cancellation: ReturnType<typeof setTimeout> | undefined
      runId: string
      sessionId: string
      model: DriverInput['request']['model']
    }
  >()
  const decisions = new Set<AbortController>()
  const streams = new Map<string, { invocationId: string; id: string; text: string; thinking: string }>()
  let summaryRequests = 0
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
      const invocation = {
        controller,
        cancellation: undefined as ReturnType<typeof setTimeout> | undefined,
        runId: input.run.id,
        sessionId: input.session.id,
        model: input.request.model,
      }
      active.set(input.invocationId, invocation)
      const call = <Output>(value: RuntimeDriverCallbackValue, result: z.ZodType<Output>) => {
        const rpcId = driverCallbackCorrelation()
        return observeDriverCallback({
          side: 'source',
          owner: context.peer.owner,
          rpcId,
          invocationId: input.invocationId,
          runId: input.run.id,
          sessionId: input.session.id,
          method: value.method,
          emit: (event) => {
            context.peer.notify('runtime.diagnostic', event).catch(() => {})
          },
          operation: (observe) =>
            callbacks.run(
              value.method,
              controller.signal,
              driverCallbackTimeoutMs(value.method),
              ({ timeoutMs, onDispatchSettled, onDispatchStarted }) =>
                context.peer.call('driver.callback', { invocationId: input.invocationId, ...value }, result, {
                  requestId: rpcId,
                  signal: controller.signal,
                  timeoutMs,
                  onDispatchSettled,
                  onDispatchStarted,
                  ...(input.ownership ? { ownership: input.ownership } : {}),
                }),
              observe,
            ),
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
        ...(physicalModelActivity
          ? {
              modelActivity: {
                begin: () =>
                  context.peer.call(
                    'driver.modelActivity.begin',
                    runtimeDriverModelActivitySchema.parse({
                      invocationId: input.invocationId,
                      requestId: crypto.randomUUID(),
                    }),
                    z.string().uuid(),
                  ),
                settle: (requestId: string) =>
                  context.peer.call(
                    'driver.modelActivity.settle',
                    runtimeDriverModelActivitySchema.parse({ invocationId: input.invocationId, requestId }),
                    z.undefined(),
                  ),
              },
            }
          : {}),
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
    procedure(runtimeDriverSummarySchema, runtimeDriverSummaryResultSchema, async (input, call) => {
      if (context.preparing() || draining)
        throw new HbarError('DRIVER_NOT_SERVING', 'Driver is not accepting summary requests')
      if (summaryRequests >= 64) throw new HbarError('DRIVER_CAPACITY', 'Driver summary capacity is exhausted')
      summaryRequests++
      try {
        return await driver.summarize(input.request, input.apiKey, call.signal)
      } finally {
        summaryRequests--
      }
    }),
  )
  context.peer.register(
    'driver.completeDecision',
    procedure(runtimeDriverDecisionSchema, runtimeDriverDecisionResultSchema, async (input, call) => {
      if (context.preparing())
        throw new HbarError('DRIVER_NOT_SERVING', 'Driver candidate cannot perform model requests')
      const source = [...active.values()].find(
        (invocation) =>
          invocation.runId === input.request.context?.runId && invocation.sessionId === input.request.context.sessionId,
      )
      if (!source) throw new HbarError('DRIVER_DECISION_SOURCE', 'The original model Run is no longer active')
      source.controller.signal.throwIfAborted()
      if (
        input.maxOutputTokens > source.model.maxOutput ||
        JSON.stringify({ ...input.request.model, maxOutput: 0 }) !== JSON.stringify({ ...source.model, maxOutput: 0 })
      )
        throw new HbarError('DRIVER_DECISION_MODEL', 'Decision completion must use the original Run model')
      if (decisions.size >= 16) throw new HbarError('DRIVER_CAPACITY', 'Decision completion capacity is exhausted')
      const controller = new AbortController()
      const signal = AbortSignal.any([call.signal, controller.signal, source.controller.signal])
      const timeout = setTimeout(
        () => controller.abort(new HbarError('DECISION_TIMEOUT', 'Decision completion timed out')),
        90_000,
      )
      let cancellation: ReturnType<typeof setTimeout> | undefined
      const cancelled = () => {
        cancellation ??= setTimeout(() => {
          if (decisions.has(controller)) stop('cancel_grace_expired')
        }, 5_000)
      }
      signal.addEventListener('abort', cancelled, { once: true })
      decisions.add(controller)
      const diagnostics: ModelDiagnosticEvent[] = []
      try {
        signal.throwIfAborted()
        const result = await driver.completeDecision(
          { request: input.request, maxOutputTokens: input.maxOutputTokens },
          input.apiKey,
          signal,
          (event) => {
            if (diagnostics.length < 32) diagnostics.push(event)
          },
        )
        return { ...result, diagnostics }
      } finally {
        clearTimeout(timeout)
        clearTimeout(cancellation)
        signal.removeEventListener('abort', cancelled)
        decisions.delete(controller)
      }
    }),
  )
  return {
    async prepare() {
      return {
        contractFingerprint: DRIVER_RUNTIME_FINGERPRINT,
        storageSchema: STORAGE_SCHEMA_VERSION,
        capabilities: ['driver.start', 'driver.summarize', 'driver.completeDecision'],
      }
    },
    async activate(role) {
      draining = role === 'draining'
    },
    idle() {
      const callback = callbacks.snapshot()
      const requests = summaryRequests + decisions.size + callback.active + callback.queued
      const resources = streams.size + Number(timer !== undefined) + Number(flushing !== undefined)
      const unavailable =
        context.preparing() ||
        callback.recursive.closed ||
        callback.leaf.closed ||
        callback.recursive.fenced ||
        callback.leaf.fenced ||
        callback.recursive.unconfirmed > 0 ||
        callback.leaf.unconfirmed > 0
      return {
        eligible: !unavailable && active.size === 0 && requests === 0 && resources === 0,
        runs: active.size,
        requests,
        resources,
      }
    },
    async drain() {
      draining = true
      return { runs: active.size, requests: summaryRequests + decisions.size, resources: 0 }
    },
    async dispose() {
      callbacks.close()
      draining = true
      clearTimeout(timer)
      for (const invocation of active.values()) {
        clearTimeout(invocation.cancellation)
        invocation.controller.abort(new HbarError('HOST_SHUTTING_DOWN', 'Driver owner is shutting down'))
      }
      for (const controller of decisions)
        controller.abort(new HbarError('HOST_SHUTTING_DOWN', 'Driver owner is shutting down'))
      streams.clear()
    },
  }
}
