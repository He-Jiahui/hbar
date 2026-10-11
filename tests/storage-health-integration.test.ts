import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import {
  Storage,
  createPathLayout,
  ensurePathLayout,
  type StorageFatalEvent,
  type StorageMethods,
  type StoragePort,
} from '@hbar/storage'
import { HbarClient } from '@hbar/client'
import { startServer } from '../apps/host/src/server.ts'
import { z } from 'zod'

type FaultStorage = StoragePort & {
  readonly callCount: number
  fail(event: StorageFatalEvent): void
  holdAppend(): Promise<void>
  releaseAppend(): void
  methodCount(method: keyof StorageMethods): number
}

/** Real SQLite storage with a typed, test-only fatal signal injected at the public StoragePort boundary. */
class FaultInjectingStorage implements FaultStorage {
  private readonly listeners = new Set<(event: StorageFatalEvent) => void>()
  private calls = 0
  private readonly counts = new Map<keyof StorageMethods, number>()
  private appendHold:
    | {
        readonly resolveCommitted: () => void
        readonly release: Promise<void>
        readonly resolveRelease: () => void
      }
    | undefined
  constructor(private readonly delegate: Storage) {}
  get callCount() {
    return this.calls
  }
  methodCount(method: keyof StorageMethods) {
    return this.counts.get(method) ?? 0
  }
  async call<K extends keyof StorageMethods>(
    method: K,
    ...args: Parameters<StorageMethods[K]>
  ): Promise<ReturnType<StorageMethods[K]>> {
    this.calls++
    this.counts.set(method, this.methodCount(method) + 1)
    const result = await this.delegate.call(method, ...args)
    const hold = method === 'append' ? this.appendHold : undefined
    if (hold) {
      hold.resolveCommitted()
      await hold.release
      this.appendHold = undefined
    }
    return result
  }
  holdAppend(): Promise<void> {
    if (this.appendHold) throw new Error('Append hold is already active')
    let resolveCommitted: (() => void) | undefined
    let resolveRelease: (() => void) | undefined
    const committed = new Promise<void>((resolve) => {
      resolveCommitted = resolve
    })
    const release = new Promise<void>((resolve) => {
      resolveRelease = resolve
    })
    if (!resolveCommitted || !resolveRelease) throw new Error('Append hold gate was not initialized')
    this.appendHold = { resolveCommitted, release, resolveRelease }
    return committed
  }
  releaseAppend() {
    this.appendHold?.resolveRelease()
  }
  close() {
    return this.delegate.close()
  }
  onFatal(listener: (event: StorageFatalEvent) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  fail(event: StorageFatalEvent) {
    for (const listener of this.listeners) listener(event)
  }
}

const healthSchema = z
  .object({
    ready: z.boolean(),
    status: z.string().optional(),
    failure: z
      .object({
        kind: z.enum(['timeout', 'worker-error', 'worker-exit']),
        code: z.string(),
        method: z.string().optional(),
        occurredAt: z.number(),
      })
      .strict()
      .optional(),
  })
  .passthrough()
const resources: Array<{
  root: string
  created?: boolean
  host?: Awaited<ReturnType<typeof startServer>>
  kernel?: Kernel
  client?: HbarClient
}> = []
afterEach(async () => {
  const cleanupErrors: unknown[] = []
  for (const resource of resources.splice(0)) {
    resource.client?.disconnect()
    const closeErrors: unknown[] = []
    try {
      await resource.host?.close()
    } catch (error) {
      closeErrors.push(error)
    }
    try {
      await resource.kernel?.close()
    } catch (error) {
      closeErrors.push(error)
    }
    const fixtureRoot = await realpath(resource.root).catch(() => '')
    const temporaryRoot = await realpath(tmpdir())
    if (
      resource.created === true &&
      closeErrors.length === 0 &&
      fixtureRoot &&
      dirname(fixtureRoot) === temporaryRoot &&
      basename(fixtureRoot).startsWith('hbar-storage-health-')
    )
      await rm(fixtureRoot, { recursive: true, force: true })
    if (closeErrors.length) cleanupErrors.push(new AggregateError(closeErrors, 'Storage health fixture cleanup failed'))
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Storage health fixtures cleanup failed')
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-storage-health-'))
  const resource: {
    root: string
    created?: boolean
    host?: Awaited<ReturnType<typeof startServer>>
    kernel?: Kernel
    client?: HbarClient
  } = { root }
  resources.push(resource)
  let storage: FaultStorage | undefined
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    pointerFile: join(root, 'system', 'paths.json'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    profile: {
      createStorage: async (home) => {
        const layout = createPathLayout(home, join(home, 'cache'), join(root, 'system', 'paths.json'))
        await ensurePathLayout(layout)
        storage = new FaultInjectingStorage(new Storage(layout.database, layout))
        return storage
      },
    },
  })
  resource.created = true
  resource.kernel = kernel
  if (!storage) throw new Error('Storage fixture was not created')
  const host = await startServer(kernel, { hostname: '127.0.0.1', port: 0 })
  resource.host = host
  const url = `http://127.0.0.1:${host.server.port}`
  const pair = await fetch(`${url}/auth/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: host.pairing.code, name: 'storage-health-test' }),
  })
  expect(pair.status).toBe(200)
  const paired = z.object({ token: z.string().min(1) }).parse(await pair.json())
  const client = new HbarClient(url, paired.token)
  resource.client = client
  await client.connect()
  const bootstrap = await client.call('system.bootstrap', {})
  const workspace = bootstrap.workspaces[0]
  if (!workspace) throw new Error('Fixture workspace missing')
  const session = await client.call('session.create', { workspaceId: workspace.id })
  return { root, resource, storage, url, token: paired.token, session, host, kernel, client }
}

function waitForClose(socket: WebSocket) {
  return new Promise<CloseEvent>((resolve) => {
    socket.addEventListener('close', resolve, { once: true })
  })
}

test('real Host health and authenticated WebSocket fail closed after typed storage fatal', async () => {
  const { storage, kernel, url, token, client } = await fixture()
  const healthBefore = await fetch(`${url}/healthz`)
  expect(healthBefore.status).toBe(200)
  const healthBeforeBody = healthSchema.parse(await healthBefore.json())
  expect(healthBeforeBody.ready).toBe(true)

  const socket = new WebSocket(url.replace('http://', 'ws://') + '/rpc')
  const hello = new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'system.hello', params: { protocol: 1, token } }))
    })
    socket.addEventListener('message', (event) => {
      const message = z
        .object({ id: z.number().optional(), result: z.unknown().optional(), error: z.unknown().optional() })
        .parse(JSON.parse(String(event.data)))
      if (message.id !== 1) return
      if (message.error) reject(message.error)
      else resolve()
    })
    socket.addEventListener('error', () => reject(new Error('WebSocket failed before hello')))
  })
  await hello
  const callsBeforeFatal = storage.callCount
  const closed = waitForClose(socket)
  storage.fail({
    kind: 'timeout',
    code: 'STORAGE_TIMEOUT',
    message: 'API_KEY_CANARY SQL_CANARY PAYLOAD_CANARY injected timeout',
    method: 'append',
    occurredAt: Date.now(),
  })
  const close = await closed
  expect(close.code).toBe(1012)
  expect(kernel.storageHealth()).toMatchObject({ ready: false, failure: { code: 'STORAGE_TIMEOUT', method: 'append' } })

  const healthAfter = await fetch(`${url}/healthz`)
  expect(healthAfter.status).toBe(503)
  const healthAfterText = await healthAfter.text()
  expect(healthAfterText).not.toContain('API_KEY_CANARY')
  expect(healthAfterText).not.toContain('SQL_CANARY')
  expect(healthAfterText).not.toContain('PAYLOAD_CANARY')
  const healthAfterBody = healthSchema.parse(JSON.parse(healthAfterText))
  expect(healthAfterBody).toMatchObject({
    ready: false,
    status: 'storage-failed',
    failure: { code: 'STORAGE_TIMEOUT', method: 'append' },
  })
  expect(storage.callCount).toBe(callsBeforeFatal)
  const upgrade = await fetch(`${url}/rpc`, { headers: { Authorization: `Bearer ${token}` } })
  expect(upgrade.status).toBe(503)
  const upgradeText = await upgrade.text()
  expect(upgradeText).not.toContain('API_KEY_CANARY')
  expect(upgradeText).not.toContain('SQL_CANARY')
  expect(upgradeText).not.toContain('PAYLOAD_CANARY')
  const upgradeBody = z.object({ code: z.string() }).passthrough().parse(JSON.parse(upgradeText))
  expect(upgradeBody).toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
  client.disconnect()
  for (let attempts = 0; attempts < 5 && client.connectionStatus() !== 'disconnected'; attempts++) await Bun.sleep(5)
})

test('normal Kernel and Host close does not report a storage fatal event', async () => {
  const { storage, kernel, host, client, resource } = await fixture()
  const events: StorageFatalEvent[] = []
  const remove = storage.onFatal?.((event) => events.push(event))
  client.disconnect()
  for (let attempts = 0; attempts < 5 && client.connectionStatus() !== 'disconnected'; attempts++) await Bun.sleep(5)
  await host.close()
  await kernel.close()
  delete resource.host
  delete resource.kernel
  remove?.()
  expect(events).toEqual([])
})

test('storage admission rejects a new run after typed fatal', async () => {
  const { storage, kernel, session } = await fixture()
  const callsBeforeFatal = storage.callCount
  storage.fail({
    kind: 'timeout',
    code: 'STORAGE_TIMEOUT',
    message: 'API_KEY_CANARY SQL_CANARY PAYLOAD_CANARY injected timeout',
    method: 'append',
    occurredAt: Date.now(),
  })
  await expect(
    kernel.submit(session.id, 'after-fatal', { text: 'must reject', images: [], files: [] }, 'local-fixture'),
  ).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
  expect(storage.callCount).toBe(callsBeforeFatal)
})

test('a committed append delivered after storage fatal does not schedule a session summary read', async () => {
  const { storage, kernel, session } = await fixture()
  const committed = storage.holdAppend()
  const append = kernel.append(session.id, 'diagnostic.late-event', { value: 'committed-before-fatal' })
  await committed
  storage.fail({
    kind: 'timeout',
    code: 'STORAGE_TIMEOUT',
    message: 'injected timeout',
    method: 'append',
    occurredAt: Date.now(),
  })
  storage.releaseAppend()
  await append
  const summariesAfterFatal = storage.methodCount('sessionSummary')
  await Bun.sleep(120)
  expect(storage.methodCount('sessionSummary')).toBe(summariesAfterFatal)
})
