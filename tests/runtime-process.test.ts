import { afterEach, expect, test } from 'bun:test'
import { ManagedProcess, type ManagedProcessOptions } from '@hbar/runtime'
import { z } from 'zod'
import { fileURLToPath } from 'node:url'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RuntimeOwner, RuntimeUnitDescriptor } from '@hbar/contracts/runtime'

const instances: ManagedProcess[] = []
const roots: string[] = []
afterEach(async () => {
  for (const instance of instances.splice(0)) await instance.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})
const descriptor: RuntimeUnitDescriptor = {
  id: 'fixture',
  kind: 'plugin',
  isolation: 'process',
  dependencies: [],
  required: true,
  reloadable: true,
  contractFingerprint: 'a'.repeat(64),
  storageSchema: 23,
}
function fixture(options: Partial<ManagedProcessOptions> = {}) {
  const instance = new ManagedProcess({
    descriptor,
    artifactId: 'c'.repeat(64),
    modulePath: fileURLToPath(new URL('./fixtures/runtime-service.ts', import.meta.url)),
    generation: 1,
    parent: { unitId: 'base', generation: 1, incarnation: 'stable-base' },
    heartbeatMs: 50,
    startupMs: 2_000,
    shutdownMs: 100,
    retryDelaysMs: [10, 20, 30],
    retrySlowMs: 80,
    jitter: 0,
    ...options,
  })
  instances.push(instance)
  return instance
}
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Managed runtime did not settle')
    await Bun.sleep(5)
  }
}

test('a candidate prepares without activation, then serves and drains in its own Bun process', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-generation-'))
  roots.push(root)
  const marker = join(root, 'activated')
  const runtime = fixture({ configuration: { marker } })
  await runtime.prepare()
  expect(runtime.snapshot()).toMatchObject({ phase: 'ready', role: 'candidate' })
  expect(runtime.snapshot().pid).not.toBe(process.pid)
  const pid = runtime.snapshot().pid
  await runtime.prepare()
  expect(runtime.snapshot().pid).toBe(pid)
  expect(await Bun.file(marker).exists()).toBe(false)
  await expect(runtime.call('fixture.echo', 'preparing', z.string())).rejects.toMatchObject({
    code: 'RUNTIME_RECOVERING',
  })
  await runtime.activate()
  expect(await runtime.call('fixture.echo', 'serving', z.string())).toBe('serving')
  expect(await runtime.drain()).toEqual({ requests: 0, runs: 0, resources: 0 })
  expect(runtime.snapshot()).toMatchObject({ phase: 'draining', role: 'draining' })
  await runtime.dispose()
  expect(runtime.snapshot().phase).toBe('disposed')
  expect(await readFile(marker, 'utf8')).toBe('1')
})

test('candidate failure and compatibility rejection never activate or schedule production recovery', async () => {
  for (const configuration of [{ prepareFail: true }, { incompatible: true }]) {
    const runtime = fixture({ configuration })
    await expect(runtime.prepare()).rejects.toBeInstanceOf(Error)
    await until(() => runtime.snapshot().pid === null)
    expect(runtime.snapshot().phase).toBe('failed')
    expect(runtime.snapshot().role).toBe('candidate')
    expect(runtime.snapshot().nextAttemptAt).toBeNull()
    await runtime.dispose()
  }
})

test('a crashed serving generation recovers its same artifact with a new incarnation and keeps its generation', async () => {
  const faults: RuntimeOwner[] = []
  const exits: RuntimeOwner[] = []
  const runtime = fixture({
    async onFault(owner) {
      faults.push(owner)
    },
    async onExit(owner) {
      exits.push(owner)
    },
  })
  await runtime.prepare()
  await runtime.activate()
  const before = runtime.snapshot()
  await expect(runtime.call('fixture.crash', undefined, z.undefined())).rejects.toMatchObject({
    code: 'IPC_DISCONNECTED',
  })
  await until(() => runtime.snapshot().phase === 'serving' && runtime.snapshot().incarnation !== before.incarnation)
  const after = runtime.snapshot()
  expect(after.generation).toBe(before.generation)
  expect(after.artifactId).toBe(before.artifactId)
  expect(after.pid).not.toBe(before.pid)
  expect(faults[0]?.incarnation).toBe(before.incarnation)
  expect(exits[0]?.incarnation).toBe(before.incarnation)
  expect(await runtime.call('fixture.echo', 'recovered', z.string())).toBe('recovered')
})

test('continuous crashes retry the activated artifact past the quick budget without reverting versions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-generation-failure-'))
  roots.push(root)
  const marker = join(root, 'activations')
  let failures = 0
  const runtime = fixture({
    configuration: { marker, crashActivations: 4 },
    async onFault() {
      failures++
    },
  })
  await runtime.prepare()
  await runtime.activate()
  await until(() => failures === 4 && runtime.snapshot().phase === 'serving')
  expect(runtime.snapshot()).toMatchObject({ artifactId: 'c'.repeat(64), generation: 1, failures: 4 })
  expect(await readFile(marker, 'utf8')).toBe('5')
})

test('recovery of a draining generation never activates new-work admission even briefly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-draining-recovery-'))
  roots.push(root)
  const marker = join(root, 'roles')
  const runtime = fixture({ configuration: { marker } })
  await runtime.prepare()
  await runtime.activate()
  await runtime.drain()
  const before = runtime.snapshot().incarnation
  await expect(runtime.call('fixture.crash', undefined, z.undefined())).rejects.toBeInstanceOf(Error)
  await until(() => runtime.snapshot().phase === 'draining' && runtime.snapshot().incarnation !== before)
  const activations = (await readFile(`${marker}.jsonl`, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => z.object({ role: z.string() }).parse(JSON.parse(line)).role)
  expect(activations).toEqual(['default', 'draining'])
})

test('event-loop loss fences the owner before its exit and replaces only that process', async () => {
  const order: string[] = []
  const runtime = fixture({
    async onFault() {
      order.push('fenced')
    },
    async onExit() {
      order.push('exited')
    },
  })
  await runtime.prepare()
  await runtime.activate()
  const before = runtime.snapshot().incarnation
  const request = runtime.call('fixture.freeze', undefined, z.undefined())
  await expect(request).rejects.toBeInstanceOf(Error)
  await until(() => runtime.snapshot().phase === 'serving' && runtime.snapshot().incarnation !== before)
  expect(order.slice(0, 2)).toEqual(['fenced', 'exited'])
})

test('stuck resource disposal is terminated and explicit stop cannot resurrect an activated process', async () => {
  let launched = 0
  const runtime = fixture({
    configuration: { hangDispose: true },
    onPeer() {
      launched++
    },
  })
  await runtime.prepare()
  await runtime.activate()
  const started = Date.now()
  await runtime.dispose()
  expect(Date.now() - started).toBeLessThan(1_500)
  await Bun.sleep(150)
  expect(runtime.snapshot()).toMatchObject({ phase: 'disposed', pid: null, nextAttemptAt: null })
  expect(launched).toBe(1)
})

test('generation observers cannot change startup, failure or disposal behavior', async () => {
  const runtime = fixture({
    onState() {
      throw new Error('observer fixture')
    },
  })
  await runtime.prepare()
  await runtime.activate()
  expect(await runtime.call('fixture.echo', 'healthy', z.string())).toBe('healthy')
  await runtime.dispose()
  expect(runtime.snapshot().phase).toBe('disposed')
})

test('failed fencing diagnostics still settle pending requests and confirm the actual child exit', async () => {
  let exited = 0
  const runtime = fixture({
    async onFault() {
      throw new Error('projection unavailable')
    },
    async onExit() {
      exited++
    },
  })
  await runtime.prepare()
  await runtime.activate()
  await expect(runtime.call('fixture.crash', undefined, z.undefined())).rejects.toMatchObject({
    code: 'IPC_DISCONNECTED',
  })
  await until(() => runtime.snapshot().reasonCode === 'RUNTIME_EXIT_RECONCILIATION_FAILED')
  expect(exited).toBe(1)
  expect(runtime.snapshot().pid).toBeNull()
  expect(runtime.snapshot().nextAttemptAt).toBeNull()
  await runtime.dispose()
})
