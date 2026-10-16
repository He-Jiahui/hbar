import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { afterEach, expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import { z } from 'zod'
import { HbarError, providerSchema, type Message, type SessionEvent } from '@hbar/contracts'
import type { DriverInput } from '@hbar/plugin-sdk'
import { ManagedProcess, RuntimeArtifactStore } from '@hbar/runtime'
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
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-runtime-driver-'))
  const descriptor: RuntimeUnitDescriptor = { id: 'driver.pi', kind: 'driver', isolation: 'process', dependencies: [], required: true, reloadable: true, contractFingerprint: DRIVER_RUNTIME_FINGERPRINT, storageSchema: STORAGE_SCHEMA_VERSION }
  const store = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
  const artifact = await store.build({ descriptor, entrypoint: 'apps/host/src/runtime-driver-process.ts' })
  let adapter!: RuntimeDriverAdapter
  const managed = new ManagedProcess({ descriptor, artifactId: artifact.id, modulePath: await store.modulePath(artifact.id), generation: 1,
    parent: { unitId: 'kernel', generation: 1, incarnation: 'kernel-one' },
    onPeer: peer => { adapter = new RuntimeDriverAdapter(peer) }, onExit: async () => { adapter.dispose() },
  })
  resources.push({ root, process: managed, adapter: () => adapter })
  await managed.prepare()
  const model = providerSchema.parse({ id: 'fixture', name: 'Fixture', protocol: 'mock', baseUrl: 'http://127.0.0.1', model: 'fixture' })
  const session = { id: 'session', workspaceId: 'workspace', title: 'Fixture', archived: false, parentId: null, createdAt: Date.now(), updatedAt: Date.now(), seq: 0 }
  const workspace = { id: 'workspace', path: root, name: 'Fixture', createdAt: Date.now() }
  const messages: Message[] = [{ id: 'input', sessionId: session.id, runId: 'run', role: 'user', content: [{ type: 'text', text: 'hello' }], seq: 1, createdAt: Date.now() }]
  const events: SessionEvent[] = []
  const writes: string[] = []
  const callbacks: string[] = []
  const streamTexts: string[] = []
  const authority = new AsyncLocalStorage<string>()
  const controller = new AbortController()
  const input: DriverInput = {
    session, workspace, run: { id: 'run', sessionId: session.id, requestId: 'request', input: { text: 'hello', images: [] }, modelId: model.id, status: 'running', createdAt: Date.now(), startedAt: Date.now(), endedAt: null, error: null },
    request: { system: 'Fixture', model, messages }, tools: [], apiKey: null, signal: controller.signal,
    resolveKey: async () => null,
    readImage: async () => ({ mime: 'image/png', data: '' }),
    readFile: async () => ({ name: 'test', mime: 'text/plain', size: 0, text: '', truncated: false }),
    async emit(type, data, stepId) {
      callbacks.push(authority.getStore() ?? 'missing')
      const event: SessionEvent = { eventId: crypto.randomUUID(), sessionId: session.id, seq: events.length + 1, runId: 'run', stepId: stepId ?? null, type, data, time: Date.now(), version: 1 }
      events.push(event)
      return event
    },
    async commit(role, content, id, providerData) {
      callbacks.push(authority.getStore() ?? 'missing')
      const message: Message = { id: id ?? crypto.randomUUID(), sessionId: session.id, runId: 'run', role, content, seq: messages.length + 1, createdAt: Date.now(), ...(providerData === undefined ? {} : { providerData }) }
      messages.push(message)
      return message
    },
    stream: (_id, text) => { streamTexts.push(text) },
    execute: async (name, _args, callId) => { writes.push(`${name}:${callId}`); return { text: 'executed' } },
    beforeRequest: async request => ({ ...request, messages: [...messages] }),
    stepEnded: async () => {},
  }
  return { root, process: managed, adapter, input, messages, events, writes, callbacks, streamTexts, authority, controller }
}

test('the real isolated Pi driver commits through named callbacks and preserves the original Kernel execution context', async () => {
  const f = await fixture()
  expect(await outcome(f.adapter.run(f.input))).toMatchObject({ code: 'DRIVER_NOT_SERVING' })
  expect(f.messages).toHaveLength(1)
  await f.process.activate()
  await f.authority.run('lease-one', () => f.adapter.run(f.input))
  expect(f.messages.some(message => message.role === 'assistant')).toBe(true)
  expect(f.callbacks.length).toBeGreaterThan(0)
  expect(new Set(f.callbacks)).toEqual(new Set(['lease-one']))
  expect(f.events.some(event => event.type === 'usage.recorded')).toBe(true)
  expect(f.streamTexts.length).toBeGreaterThan(0)
  expect(f.process.snapshot().references.requests).toBe(0)
})

test('tool schema instances stay in their owners and execution receives only validated arguments', async () => {
  const f = await fixture()
  f.input.request.messages[0]!.content = [{ type: 'text', text: '/tool echo {"text":"once"}' }]
  f.input.tools = [{ name: 'echo', description: 'Echo fixture', effect: 'read', inputSchema: z.object({ text: z.string() }), execute: async () => { throw new Error('Driver must use the callback') } }]
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
  f.input.tools = [{ name: 'hold', description: 'Wait for cancellation', effect: 'read', inputSchema: z.object({}), execute: async () => ({ text: '' }) }]
  let entered!: () => void, release!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const physical = new Promise<void>(resolve => { release = resolve })
  f.input.execute = async () => { entered(); await physical; return { text: 'Physical callback completed' } }
  await f.process.activate()
  const running = outcome(f.adapter.run(f.input))
  try {
    await started
    expect(f.process.snapshot().references.requests).toBe(0)
    f.controller.abort(new HbarError('USER_CANCELLED', 'Cancel held callback'))
    expect(await running).toMatchObject({ code: 'USER_CANCELLED' })
  } finally { release() }
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
