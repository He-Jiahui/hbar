import { afterEach, expect, test } from 'bun:test'
import { ManagedProcess, procedure, type ManagedProcessOptions } from '@hbar/runtime'
import { z } from 'zod'
import { fileURLToPath } from 'node:url'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RuntimeOwner, RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import { HbarError as PublicHbarError } from '@hbar/contracts/errors'
import { internalRuntimeCommand } from '../apps/cli/src/host-process'

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

test('activation descriptions finish before serving routes open and deliberate shutdown cancels their wait', async () => {
  let entered = false, release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const runtime = fixture({ onActivated: async () => { entered = true; await gate } })
  await runtime.prepare()
  const activation = runtime.activate()
  void activation.catch(() => {})
  await until(() => entered)
  expect(runtime.snapshot().phase).toBe('ready')
  await expect(runtime.call('fixture.echo', 'pending', z.string())).rejects.toMatchObject({ code: 'RUNTIME_RECOVERING' })
  release(); await activation
  expect(await runtime.call('fixture.echo', 'ready', z.string())).toBe('ready')
  const stuck = fixture({ onActivated: async () => { await new Promise(() => {}) } })
  await stuck.prepare()
  const pending = stuck.activate().catch((error: unknown) => error)
  await Bun.sleep(10)
  await stuck.dispose()
  expect(await pending).toMatchObject({ code: 'RUNTIME_ACTIVATION_EXPIRED' })
  expect(stuck.snapshot().phase).toBe('disposed')
})

test('the lightweight CLI runtime role owns a real IPC service independently of interactive command startup', async () => {
  const runtime = fixture({ command: internalRuntimeCommand(), heartbeatMs: 200, startupMs: 5_000, shutdownMs: 500 })
  await runtime.prepare()
  expect(runtime.snapshot()).toMatchObject({ phase: 'ready', role: 'candidate' })
  await runtime.activate()
  expect(await runtime.call('fixture.echo', 'CLI runtime role', z.string())).toBe('CLI runtime role')
  await runtime.dispose()
  expect(runtime.snapshot().phase).toBe('disposed')
})

test('the public error subpath crosses a real Bun runtime IPC boundary', async () => {
  const runtime = fixture({
    modulePath: fileURLToPath(new URL('./fixtures/runtime-entry-error-service.ts', import.meta.url)),
  })
  try {
    await runtime.prepare()
    await runtime.activate()
    const failure = await runtime.call('fixture.domainError', undefined, z.unknown()).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PublicHbarError)
    expect(failure).toMatchObject({ code: 'FIXTURE_DOMAIN_ERROR', message: 'Public error survived runtime IPC' })
  } finally {
    await runtime.dispose()
  }
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

test('a rejected registered module never spawns or imports a candidate, and stuck verification cancels on shutdown', async () => {
  let spawned = 0
  const invalid = fixture({
    verifyModule: async () => {
      throw new Error('Artifact bytes changed')
    },
    onPeer: () => {
      spawned++
    },
  })
  await expect(invalid.prepare()).rejects.toThrow('Artifact bytes changed')
  expect(spawned).toBe(0)
  expect(invalid.snapshot()).toMatchObject({ phase: 'failed', pid: null, nextAttemptAt: null })
  const stuck = fixture({
    verifyModule: async (signal) => {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
      signal.throwIfAborted()
    },
    onPeer: () => {
      spawned++
    },
  })
  const pending = stuck.prepare().catch((error: unknown) => error)
  await Bun.sleep(10)
  await stuck.dispose()
  expect(await pending).toBeInstanceOf(Error)
  expect(spawned).toBe(0)
  expect(stuck.snapshot().phase).toBe('disposed')
})

test('a crashed serving generation recovers its same artifact with a new incarnation and keeps its generation', async () => {
  const faults: RuntimeOwner[] = []
  const exits: RuntimeOwner[] = []
  const lifecycle: string[] = []
  const exitDetails: Array<{
    childPid: number
    exitCode: number
    reasonCode: string | null
    deliberate: boolean
    restartExpected: boolean
  }> = []
  const runtime = fixture({
    async onFault(owner) {
      faults.push(owner)
      lifecycle.push(`fault:${owner.incarnation}`)
      await Bun.sleep(5)
      lifecycle.push(`fenced:${owner.incarnation}`)
    },
    async onExit(owner, exit) {
      exits.push(owner)
      exitDetails.push(exit)
      lifecycle.push(`exit:${owner.incarnation}`)
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
  expect(faults[0]).toMatchObject({ unitId: 'fixture', generation: before.generation, incarnation: before.incarnation })
  expect(exits[0]).toMatchObject({ unitId: 'fixture', generation: before.generation, incarnation: before.incarnation })
  expect(exitDetails[0]).toMatchObject({
    childPid: before.pid,
    exitCode: 23,
    reasonCode: 'RUNTIME_PROCESS_EXITED',
    deliberate: false,
    restartExpected: true,
  })
  expect(lifecycle.slice(0, 3)).toEqual([
    `fault:${before.incarnation}`,
    `fenced:${before.incarnation}`,
    `exit:${before.incarnation}`,
  ])
  expect(await runtime.call('fixture.echo', 'recovered', z.string())).toBe('recovered')
})

test('an IPC deadline records its fixed fault reason and deliberate close reports its actual exit', async () => {
  let timeoutExit:
    | { childPid: number; exitCode: number; reasonCode: string | null; deliberate: boolean; restartExpected: boolean }
    | undefined
  let timeoutReason: string | undefined
  const timed = fixture({
    onFault: async (_owner, reason) => {
      timeoutReason = reason
    },
    onExit: async (_owner, exit) => {
      timeoutExit = exit
    },
  })
  await timed.prepare()
  await timed.activate()
  const timedPid = timed.snapshot().pid
  await expect(timed.call('fixture.freeze', undefined, z.undefined(), { timeoutMs: 40 })).rejects.toMatchObject({
    code: 'IPC_TIMEOUT',
  })
  await until(() => timeoutExit !== undefined)
  expect(timeoutReason).toBe('RUNTIME_CALL_TIMEOUT')
  expect(timeoutExit).toMatchObject({
    childPid: timedPid,
    reasonCode: 'RUNTIME_CALL_TIMEOUT',
    deliberate: false,
    restartExpected: true,
  })
  expect(typeof timeoutExit?.exitCode).toBe('number')
  await timed.dispose()

  let deliberateExit:
    | { childPid: number; exitCode: number; reasonCode: string | null; deliberate: boolean; restartExpected: boolean }
    | undefined
  let deliberateFaults = 0
  const normal = fixture({
    onFault: async () => {
      deliberateFaults++
    },
    onExit: async (_owner, exit) => {
      deliberateExit = exit
    },
  })
  await normal.prepare()
  await normal.activate()
  const normalPid = normal.snapshot().pid
  await normal.dispose()
  expect(deliberateExit).toMatchObject({
    childPid: normalPid,
    reasonCode: null,
    deliberate: true,
    restartExpected: false,
  })
  expect(typeof deliberateExit?.exitCode).toBe('number')
  expect(deliberateFaults).toBe(0)
})

test('recovery revalidates the selected artifact and keeps retrying that version without importing rejected bytes', async () => {
  let verified = 0,
    spawned = 0
  const runtime = fixture({
    verifyModule: async () => {
      verified++
      if (verified > 1) throw new Error('Recovered artifact differs from registered bytes')
    },
    onPeer: () => {
      spawned++
    },
  })
  await runtime.prepare()
  await runtime.activate()
  const artifact = runtime.snapshot().artifactId
  await expect(runtime.call('fixture.crash', undefined, z.undefined())).rejects.toBeInstanceOf(Error)
  await until(() => verified >= 3)
  expect(spawned).toBe(1)
  expect(runtime.snapshot()).toMatchObject({ artifactId: artifact, generation: 1, phase: 'recovering', pid: null })
})

test('activation opens production authority before construction and repeats the gate for each recovered incarnation', async () => {
  const authorized = new Set<string>()
  const roles: string[] = []
  const runtime = fixture({
    configuration: { requireAuthority: true },
    onPeer: (peer, owner) =>
      peer.register(
        'fixture.activation',
        procedure(z.undefined(), z.undefined(), () => {
          if (!authorized.has(owner.incarnation)) throw new Error('Production authority is not activated')
        }),
      ),
    onActivating: (owner, role) => {
      authorized.add(owner.incarnation)
      roles.push(role)
    },
  })
  await runtime.prepare()
  expect(authorized.size).toBe(0)
  await runtime.activate()
  expect(authorized.size).toBe(1)
  await runtime.drain()
  const before = runtime.owner().incarnation
  await expect(runtime.call('fixture.crash', undefined, z.undefined())).rejects.toBeInstanceOf(Error)
  await until(() => runtime.snapshot().phase === 'draining' && runtime.owner().incarnation !== before)
  expect(authorized.size).toBe(2)
  expect(roles).toEqual(['default', 'draining'])
})

test('a stuck activation gate expires and explicit disposal cancels it without starting production', async () => {
  const runtime = fixture({
    onActivating: async (_owner, _role, signal) => {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
      signal.throwIfAborted()
    },
  })
  await runtime.prepare()
  const activation = runtime.activate().catch((error: unknown) => error)
  await Bun.sleep(10)
  await runtime.dispose()
  expect(await activation).toBeInstanceOf(Error)
  expect(runtime.snapshot()).toMatchObject({ phase: 'disposed', pid: null, nextAttemptAt: null })
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

test('failed durable fencing retains ownership and retries before admitting a recovered incarnation', async () => {
  let exited = 0,
    faults = 0,
    allowed = false
  const runtime = fixture({
    async onFault() {
      faults++
      if (!allowed) throw new Error('projection unavailable')
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
  expect(exited).toBe(0)
  expect(runtime.snapshot().pid).toBeNull()
  await until(() => faults >= 2)
  expect(exited).toBe(0)
  allowed = true
  await until(() => runtime.snapshot().phase === 'serving')
  expect(exited).toBe(1)
  await runtime.dispose()
})

test('an unconfirmed native exit keeps the old ownership and prevents a replacement until join succeeds', async () => {
  let joined = false,
    attempts = 0,
    released = 0,
    launched = 0
  const runtime = fixture({
    onPeer: () => {
      launched++
    },
    onExit: async () => {
      released++
    },
    processTree: {
      environment: {},
      async attach() {
        return {
          terminate() {},
          close() {
            if (!joined) throw new Error('Native tree still alive')
          },
          async join() {
            attempts++
            if (!joined) throw new Error('Native tree exit could not be confirmed')
          },
        }
      },
    },
  })
  try {
    await runtime.prepare()
    await runtime.activate()
    const previous = runtime.owner().incarnation
    const crash = await runtime.call('fixture.crash', undefined, z.undefined()).catch((error: unknown) => error)
    expect(crash).toMatchObject({ code: 'IPC_DISCONNECTED' })
    await until(() => attempts >= 2)
    expect(launched).toBe(1)
    expect(released).toBe(0)
    expect(runtime.owner().incarnation).toBe(previous)
    expect(runtime.snapshot().pid).toBeNull()
    joined = true
    await until(() => runtime.snapshot().phase === 'serving' && runtime.owner().incarnation !== previous)
    expect(launched).toBe(2)
    expect(released).toBe(1)
  } finally {
    joined = true
    await runtime.dispose()
  }
})
