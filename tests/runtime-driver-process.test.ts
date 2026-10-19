import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { afterEach, expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import { z } from 'zod'
import {
  HbarError,
  providerSchema,
  resolveModelContextMode,
  resolveProviderModel,
  type Message,
  type SessionEvent,
} from '@hbar/contracts'
import type { DriverInput } from '@hbar/plugin-sdk'
import { runtimeModelRequestSchema, runtimeResolvedModelSchema } from '@hbar/plugin-sdk/runtime-driver'
import { ManagedProcess, RuntimeArtifactStore, procedure } from '@hbar/runtime'
import { DRIVER_RUNTIME_FINGERPRINT } from '../apps/host/src/runtime-driver-process'
import { RuntimeDriverAdapter } from '../apps/host/src/runtime-driver-adapter'
import type { RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import { removeOwnedTestDirectory } from './owned-temp-directory'
import type { DecisionCompletionRequest, ModelDiagnosticEvent } from '@hbar/plugin-sdk'

const resources: { root: string; process: ManagedProcess; adapter(): RuntimeDriverAdapter }[] = []
afterEach(async () => {
  for (const entry of resources.splice(0)) {
    await entry.process.dispose()
    entry.adapter().dispose()
    await removeOwnedTestDirectory(entry.root, 'hbar-runtime-driver-')
  }
})
const outcome = (promise: Promise<unknown>) => promise.catch((error: unknown) => error)
async function fixture(physicalModelActivity = false) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-runtime-driver-'))
  const descriptor: RuntimeUnitDescriptor = {
    id: 'driver.pi',
    kind: 'driver',
    isolation: 'process',
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: DRIVER_RUNTIME_FINGERPRINT,
    storageSchema: STORAGE_SCHEMA_VERSION,
  }
  const store = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
  const artifact = await store.build({ descriptor, entrypoint: 'apps/host/src/runtime-driver-process.ts' })
  let adapter!: RuntimeDriverAdapter
  const physical: Array<{ phase: 'begin' | 'settle'; requestId: string }> = []
  const managed = new ManagedProcess({
    descriptor,
    artifactId: artifact.id,
    modulePath: await store.modulePath(artifact.id),
    generation: 1,
    configuration: { physicalModelActivity },
    parent: { unitId: 'kernel', generation: 1, incarnation: 'kernel-one' },
    onPeer: (peer) => {
      adapter = new RuntimeDriverAdapter(peer)
      const schema = z.strictObject({ invocationId: z.string(), requestId: z.string().uuid() })
      peer.register(
        'driver.modelActivity.begin',
        procedure(schema, z.string().uuid(), (input) => {
          physical.push({ phase: 'begin', requestId: input.requestId })
          return input.requestId
        }),
      )
      peer.register(
        'driver.modelActivity.settle',
        procedure(schema, z.undefined(), (input) => {
          physical.push({ phase: 'settle', requestId: input.requestId })
        }),
      )
    },
    onExit: async () => {
      adapter.dispose()
    },
  })
  resources.push({ root, process: managed, adapter: () => adapter })
  await managed.prepare()
  const model = providerSchema.parse({
    id: 'fixture',
    name: 'Fixture',
    protocol: 'mock',
    baseUrl: 'http://127.0.0.1',
    model: 'fixture',
  })
  const session = {
    id: 'session',
    workspaceId: 'workspace',
    title: 'Fixture',
    archived: false,
    parentId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    seq: 0,
  }
  const workspace = { id: 'workspace', path: root, name: 'Fixture', createdAt: Date.now() }
  const messages: Message[] = [
    {
      id: 'input',
      sessionId: session.id,
      runId: 'run',
      role: 'user',
      content: [{ type: 'text', text: 'hello' }],
      seq: 1,
      createdAt: Date.now(),
    },
  ]
  const events: SessionEvent[] = []
  const writes: string[] = []
  const callbacks: string[] = []
  const streamTexts: string[] = []
  const authority = new AsyncLocalStorage<string>()
  const controller = new AbortController()
  const input: DriverInput = {
    session,
    workspace,
    run: {
      id: 'run',
      sessionId: session.id,
      requestId: 'request',
      input: { text: 'hello', images: [] },
      modelId: model.id,
      status: 'running',
      createdAt: Date.now(),
      startedAt: Date.now(),
      endedAt: null,
      error: null,
    },
    request: { system: 'Fixture', model, messages },
    tools: [],
    apiKey: null,
    signal: controller.signal,
    resolveKey: async () => null,
    readImage: async () => ({ mime: 'image/png', data: '' }),
    readFile: async () => ({ name: 'test', mime: 'text/plain', size: 0, text: '', truncated: false }),
    async emit(type, data, stepId) {
      callbacks.push(authority.getStore() ?? 'missing')
      const event: SessionEvent = {
        eventId: crypto.randomUUID(),
        sessionId: session.id,
        seq: events.length + 1,
        runId: 'run',
        stepId: stepId ?? null,
        type,
        data,
        time: Date.now(),
        version: 1,
      }
      events.push(event)
      return event
    },
    async commit(role, content, id, providerData) {
      callbacks.push(authority.getStore() ?? 'missing')
      const message: Message = {
        id: id ?? crypto.randomUUID(),
        sessionId: session.id,
        runId: 'run',
        role,
        content,
        seq: messages.length + 1,
        createdAt: Date.now(),
        ...(providerData === undefined ? {} : { providerData }),
      }
      messages.push(message)
      return message
    },
    stream: (_id, text) => {
      streamTexts.push(text)
    },
    execute: async (name, _args, callId) => {
      writes.push(`${name}:${callId}`)
      return { text: 'executed' }
    },
    beforeRequest: async (request) => ({ ...request, messages: [...messages] }),
    stepEnded: async () => {},
  }
  return {
    root,
    process: managed,
    adapter,
    input,
    messages,
    events,
    writes,
    callbacks,
    streamTexts,
    authority,
    controller,
    physical,
  }
}

test('an explicitly enabled isolated Pi driver reports its original physical request before and after a real HTTP body', async () => {
  const f = await fixture(true)
  const chunk = (text: string, finish: string | null) =>
    `data: ${JSON.stringify({
      id: 'physical',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'fixture',
      choices: [{ index: 0, delta: { content: text }, finish_reason: finish }],
    })}\n\n`
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      new Response(chunk('physical reply', null) + chunk('', 'stop') + 'data: [DONE]\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      }),
  })
  try {
    f.input.request.model = {
      ...f.input.request.model,
      protocol: 'openai-completions',
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
    }
    await f.process.activate()
    await f.adapter.run(f.input)
    const deadline = Date.now() + 2_000
    while (f.physical.length < 2 && Date.now() < deadline) await Bun.sleep(10)
    expect(f.physical.map((value) => value.phase)).toEqual(['begin', 'settle'])
    expect(f.physical[0]?.requestId).toBe(f.physical[1]?.requestId)
  } finally {
    await server.stop(true)
  }
})

test('an explicitly enabled mock driver completes without inventing an HTTP physical request receipt', async () => {
  const f = await fixture(true)
  await f.process.activate()
  await f.adapter.run(f.input)
  expect(f.physical).toEqual([])
  expect(f.messages.some((message) => message.role === 'assistant')).toBe(true)
})

test('the real isolated Pi driver commits through named callbacks and preserves the original Kernel execution context', async () => {
  const f = await fixture()
  expect(await outcome(f.adapter.run(f.input))).toMatchObject({ code: 'DRIVER_NOT_SERVING' })
  expect(f.messages).toHaveLength(1)
  await f.process.activate()
  await f.authority.run('lease-one', () => f.adapter.run(f.input))
  expect(f.messages.some((message) => message.role === 'assistant')).toBe(true)
  expect(f.callbacks.length).toBeGreaterThan(0)
  expect(new Set(f.callbacks)).toEqual(new Set(['lease-one']))
  expect(f.events.some((event) => event.type === 'usage.recorded')).toBe(true)
  expect(f.streamTexts.length).toBeGreaterThan(0)
  expect(f.process.snapshot().references.requests).toBe(0)
})

test('tool schema instances stay in their owners and execution receives only validated arguments', async () => {
  const f = await fixture()
  f.input.request.messages[0]!.content = [{ type: 'text', text: '/tool echo {"text":"once"}' }]
  f.input.tools = [
    {
      name: 'echo',
      description: 'Echo fixture',
      effect: 'read',
      inputSchema: z.object({ text: z.string() }),
      execute: async () => {
        throw new Error('Driver must use the callback')
      },
    },
  ]
  await f.process.activate()
  await f.adapter.run(f.input)
  expect(f.writes).toHaveLength(1)
  expect(f.writes[0]?.startsWith('echo:')).toBe(true)
})

test('cancellation ends the original remote execution and intentional disposal prevents recovery', async () => {
  const f = await fixture()
  await f.process.activate()
  const running = outcome(f.adapter.run(f.input))
  f.controller.abort(new HbarError('USER_CANCELLED', 'User cancelled the original Run'))
  expect(await running).toMatchObject({ code: 'USER_CANCELLED' })
  await f.process.dispose()
  expect(f.process.snapshot().phase).toBe('disposed')
})

test('a hung tool callback does not retain a start RPC slot, and cancellation preserves its true terminal cause', async () => {
  const f = await fixture()
  f.input.request.messages[0]!.content = [{ type: 'text', text: '/tool hold {}' }]
  f.input.tools = [
    {
      name: 'hold',
      description: 'Wait for cancellation',
      effect: 'read',
      inputSchema: z.object({}),
      execute: async () => ({ text: '' }),
    },
  ]
  let entered!: () => void, release!: () => void
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const physical = new Promise<void>((resolve) => {
    release = resolve
  })
  f.input.execute = async () => {
    entered()
    await physical
    return { text: 'Physical callback completed' }
  }
  await f.process.activate()
  const running = outcome(f.adapter.run(f.input))
  try {
    await started
    expect(f.process.snapshot().references.requests).toBe(0)
    f.controller.abort(new HbarError('USER_CANCELLED', 'Cancel held callback'))
    expect(await running).toMatchObject({ code: 'USER_CANCELLED' })
  } finally {
    release()
  }
})

for (const { selectionId, rawModelId } of [
  { selectionId: 'gpt-6.1-sol', rawModelId: 'gpt-6.1-sol' },
  { selectionId: 'vendor/model:2026', rawModelId: 'vendor/model:2026' },
  { selectionId: 'provider/gpt-6.1-sol', rawModelId: 'gpt-6.1-sol' },
  { selectionId: 'provider/vendor/model:2026', rawModelId: 'vendor/model:2026' },
]) {
  test(`real managed driver preserves resolved selection ${selectionId} until typed pre-request hook rejection`, async () => {
    const f = await fixture()
    const originalProvider = providerSchema.parse({
      id: 'provider',
      name: 'Fixture model catalog',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: rawModelId,
      models: [
        {
          id: rawModelId,
          name: 'External model fixture',
          contextWindow: 128_000,
          maxOutput: 16_000,
          contextTiers: [
            { id: 'expanded', contextWindow: 256_000, inputTokensAbove: 128_000, inputPrice: 0, outputPrice: 0 },
          ],
        },
      ],
    })
    const active = resolveProviderModel(originalProvider, selectionId)
    expect(active.model).toBe(rawModelId)
    // Capture real MAX values using public context-mode resolution, then retain the caller's raw/selection ID.
    // Pi.model.id uses config.model (raw external namespace); config.id is the selection/provider namespace.
    const resolved = { ...resolveModelContextMode(active, true), id: selectionId }
    expect(resolved.contextMode).toBe('max')
    expect(resolved.contextWindow).toBe(256_000)
    expect(resolved.maxOutput).toBe(16_000)
    expect(resolved.models[0]?.id).toBe(rawModelId)
    expect(resolved.models[0]?.contextWindow).toBe(128_000)
    // Provider-save IDs remain slugs. The transport schema consumes the resolved selection instead.
    expect(providerSchema.safeParse({ ...originalProvider, id: selectionId }).success).toBe(false)
    expect(runtimeResolvedModelSchema.parse(resolved)).toEqual(resolved)
    expect(runtimeModelRequestSchema.parse({ ...f.input.request, model: resolved }).model).toEqual(resolved)
    f.input.request.model = resolved
    f.input.run.modelId = selectionId
    let entered = 0
    let keyRequests = 0
    const phases: string[] = []
    f.input.resolveKey = async () => {
      keyRequests++
      throw new Error('Guard refusal must happen before key/provider request')
    }
    f.input.onModelDiagnostic = (event) => {
      phases.push(event.phase)
    }
    f.input.beforeRequest = async (request) => {
      entered++
      expect(request.model).toEqual(resolved)
      throw new HbarError('PRESSURE_GUARD_SESSION_UNKNOWN', 'PRESSURE_GUARD_SESSION_UNKNOWN')
    }
    await f.process.activate()
    expect(await outcome(f.adapter.run(f.input))).toMatchObject({ code: 'PRESSURE_GUARD_SESSION_UNKNOWN' })
    expect(entered).toBe(1)
    expect(keyRequests).toBe(0)
    expect(phases).not.toContain('started')
    expect(phases).not.toContain('response')
    expect(f.writes).toEqual([])
    expect(f.messages.some((message) => message.role === 'assistant')).toBe(false)
    expect(f.process.snapshot().references.requests).toBe(0)
  })
}

test('resolved runtime model validates existing capability limits without normalizing effective values', () => {
  const provider = providerSchema.parse({
    id: 'fixture',
    name: 'Fixture',
    protocol: 'mock',
    baseUrl: 'http://127.0.0.1',
    model: 'fixture',
  })
  expect(runtimeResolvedModelSchema.safeParse({ ...provider, id: '' }).success).toBe(false)
  expect(runtimeResolvedModelSchema.safeParse({ ...provider, id: 'x'.repeat(226) }).success).toBe(false)
  expect(runtimeResolvedModelSchema.safeParse({ ...provider, id: 'invalid.provider/model' }).success).toBe(false)
  expect(runtimeResolvedModelSchema.safeParse({ ...provider, id: 'provider/' }).success).toBe(false)
  expect(runtimeResolvedModelSchema.safeParse({ ...provider, id: `provider/${'x'.repeat(161)}` }).success).toBe(false)
  expect(runtimeResolvedModelSchema.safeParse({ ...provider, contextWindow: 0 }).success).toBe(false)
  expect(runtimeResolvedModelSchema.safeParse({ ...provider, maxOutput: 0 }).success).toBe(false)
  expect(runtimeResolvedModelSchema.safeParse({ ...provider, protocol: 'invalid' }).success).toBe(false)
})

function completionFor(input: DriverInput, text = 'Choose the safe task preference.'): DecisionCompletionRequest {
  return {
    maxOutputTokens: 256,
    request: {
      system: 'Complete a decision without calling any tools.',
      model: input.request.model,
      toolNames: [],
      context: { sessionId: input.session.id, runId: input.run.id, selectedToolNames: [] },
      messages: [
        {
          id: 'decision',
          sessionId: input.session.id,
          runId: input.run.id,
          role: 'user',
          seq: 0,
          createdAt: 0,
          content: [{ type: 'text', text }],
        },
      ],
    },
  }
}

test('owned decision completion rejects candidates, inactive sources and model changes, while a draining original Run can finish', async () => {
  const f = await fixture()
  const completion = completionFor(f.input)
  expect(await outcome(f.adapter.completeDecision(completion, null, new AbortController().signal))).toMatchObject({
    code: 'DRIVER_NOT_SERVING',
  })
  await f.process.activate()
  expect(await outcome(f.adapter.completeDecision(completion, null, new AbortController().signal))).toMatchObject({
    code: 'DRIVER_DECISION_SOURCE',
  })
  const message = f.input.request.messages[0]
  if (!message) throw new Error('Expected original Run message')
  message.content = [{ type: 'text', text: '/tool hold {}' }]
  f.input.tools = [
    {
      name: 'hold',
      description: 'Hold the source Run',
      effect: 'read',
      inputSchema: z.object({}),
      execute: async () => ({ text: '' }),
    },
  ]
  let entered!: () => void, release!: () => void
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  f.input.execute = async () => {
    entered()
    await gate
    return { text: 'Source task continues.' }
  }
  const running = outcome(f.adapter.run(f.input))
  try {
    await started
    const changed = {
      ...completion,
      request: { ...completion.request, model: { ...completion.request.model, id: 'different-model' } },
    }
    expect(await outcome(f.adapter.completeDecision(changed, null, new AbortController().signal))).toMatchObject({
      code: 'DRIVER_DECISION_MODEL',
    })
    await f.process.drain()
    const diagnostics: ModelDiagnosticEvent[] = []
    const result = await f.adapter.completeDecision(completion, null, new AbortController().signal, (event) =>
      diagnostics.push(event),
    )
    expect(result.text).toContain('Choose the safe task preference.')
    expect(result.usage.input + result.usage.output).toBeGreaterThan(0)
    expect(new Set(diagnostics.map((event) => event.purpose))).toEqual(new Set(['decision']))
    expect(f.process.snapshot().references.requests).toBe(0)
  } finally {
    release()
    await running
  }
})

test('the actual driver bounds sixteen decision requests and releases their physical slots after cancellation', async () => {
  const f = await fixture()
  const message = f.input.request.messages[0]
  if (!message) throw new Error('Expected source Run message')
  message.content = [{ type: 'text', text: '/tool hold {}' }]
  f.input.tools = [
    {
      name: 'hold',
      description: 'Hold the source Run',
      effect: 'read',
      inputSchema: z.object({}),
      execute: async () => ({ text: '' }),
    },
  ]
  let entered!: () => void, release!: () => void
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  f.input.execute = async () => {
    entered()
    await gate
    return { text: 'Source task continues.' }
  }
  await f.process.activate()
  const running = outcome(f.adapter.run(f.input))
  const controller = new AbortController()
  const requests: Promise<unknown>[] = []
  try {
    await started
    const completion = completionFor(f.input, '/slow bounded decision')
    for (let index = 0; index < 16; index++)
      requests.push(outcome(f.adapter.completeDecision(completion, null, controller.signal)))
    const deadline = Date.now() + 10_000
    while (f.process.snapshot().references.requests < 16) {
      if (Date.now() >= deadline) throw new Error('Owned decision requests did not occupy their physical slots')
      await Bun.sleep(5)
    }
    expect(await outcome(f.adapter.completeDecision(completion, null, new AbortController().signal))).toMatchObject({
      code: 'DRIVER_CAPACITY',
    })
    f.controller.abort(new HbarError('USER_CANCELLED', 'Cancel the source Run and its owned decision completions'))
    expect(controller.signal.aborted).toBe(false)
    expect((await Promise.all(requests)).every((result) => result instanceof Error)).toBe(true)
    expect(f.process.snapshot().references.requests).toBe(0)
  } finally {
    controller.abort()
    await Promise.all(requests)
    release()
    await running
  }
})
