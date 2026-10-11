import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
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

const resources: { root: string; process: ManagedProcess; adapter(): RuntimeDriverAdapter }[] = []
afterEach(async () => {
  for (const entry of resources.splice(0)) {
    await entry.process.dispose()
    entry.adapter().dispose()
    await rm(entry.root, { recursive: true, force: true })
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
