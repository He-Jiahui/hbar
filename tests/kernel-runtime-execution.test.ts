import { afterEach, expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets, type KernelExecutionPort } from '@hbar/kernel'
import { Storage, type StoragePort } from '@hbar/storage'
import { RuntimeCoordinator } from '@hbar/runtime'
import { definePlugin, provide, type HarnessDriver } from '@hbar/plugin-sdk'
import type { GoalService } from '@hbar/plugin-sdk'
import { HbarError, providerSchema, emptyUsage } from '@hbar/contracts'
import type { RuntimeOwner, RuntimeVersion } from '@hbar/contracts/runtime'

const resources: { root: string; storage: Storage; kernels: Kernel[]; release(): void }[] = []
afterEach(async () => {
  for (const entry of resources.splice(0)) {
    entry.release()
    for (const kernel of entry.kernels) await kernel.close()
    await entry.storage.close()
    await rm(entry.root, { recursive: true, force: true })
  }
})
function version(owner: RuntimeOwner): RuntimeVersion {
  return { unitId: owner.unitId, generation: owner.generation, artifactId: 'a'.repeat(64) }
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-runtime-'))
  const storage = new Storage(join(root, 'state.sqlite'))
  await storage.call('ready')
  await storage.call(
    'saveProvider',
    providerSchema.parse({
      id: 'fixture',
      name: 'Fixture',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: 'fixture',
      imageInput: true,
      reasoning: true,
    }),
  )
  const workspace = await storage.call('createWorkspace', root, 'fixture')
  const session = await storage.call('createSession', workspace.id)
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  let entered!: () => void
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const record = { root, storage, kernels: [] as Kernel[], release }
  resources.push(record)
  const executions: { generation: number; runId: string }[] = []
  const released: string[] = []
  const interrupted: string[] = []
  let defaultKernel: Kernel | undefined
  const coordinator = new RuntimeCoordinator({
    claim: (lease) => storage.call('runtimeExecutionClaim', lease),
    release: async (lease) => {
      await storage.call('runtimeExecutionRelease', lease)
      released.push(lease.runId)
    },
    revoke: async (owner, ids) => {
      await storage.call('runtimeExecutionRevoke', owner, ids)
    },
  })
  const driverOwner: RuntimeOwner = { unitId: 'driver', generation: 1, incarnation: 'driver-one' }
  const register = (owner: RuntimeOwner, kind: 'kernel' | 'driver') =>
    coordinator.register(owner, version(owner), {
      id: owner.unitId,
      kind,
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: 24,
    })
  register(driverOwner, 'driver')
  coordinator.activate(driverOwner)
  const make = async (generation: number, activate = false, fail = false) => {
    const owner: RuntimeOwner = { unitId: 'kernel', generation, incarnation: `kernel-${generation}` }
    register(owner, 'kernel')
    if (activate) coordinator.activate(owner)
    const execution: KernelExecutionPort = {
      async claim(sessionId) {
        const run = await storage.call('nextQueuedRun', sessionId)
        if (!run) return null
        const lease = await coordinator.claim(owner, sessionId, run.id, {
          kernel: version(owner),
          driver: version(driverOwner),
          plugins: [],
          hooks: [],
        })
        return lease ? { lease, run: await storage.call('run', run.id) } : null
      },
      release: async (lease) => {
        await coordinator.releaseExecution(lease)
        defaultKernel?.wake(lease.sessionId)
      },
      interrupted: async (lease) => {
        coordinator.acknowledgeRunStopped(owner, lease.runId)
        interrupted.push(lease.runId)
      },
      call: (lease, method, ...args) => {
        coordinator.assertCanWrite(owner, lease)
        return storage.callOwned(lease, method, ...args)
      },
    }
    const driver = definePlugin({
      manifest: {
        id: 'driver.pi',
        name: 'Owned fixture',
        description: 'Own one generation',
        version: '1.0.0',
        apiVersion: '^1.0.0',
        scope: 'host',
        provides: { driver: '1.0.0' },
        permissions: [],
      },
      apply(ctx) {
        provide<HarnessDriver>(ctx, 'driver', {
          async run(input) {
            executions.push({ generation, runId: input.run.id })
            if (generation === 1) {
              entered()
              await waiting
            }
            input.signal.throwIfAborted()
            if (fail) throw new HbarError('FIXTURE_DRIVER_FAILED', 'Controlled terminal failure')
            await input.commit('assistant', [{ type: 'text', text: `generation ${generation}` }])
          },
          summarize: async () => ({ text: '', usage: emptyUsage() }),
        })
      },
    })
    const source: StoragePort = { call: (method, ...args) => storage.call(method, ...args), close: async () => {} }
    const kernel = await Kernel.create({
      home: join(root, 'data'),
      demo: true,
      secrets: new MemorySecrets(),
      lifecycle: 'managed',
      execution,
      profile: { createStorage: async () => source, replacements: { 'driver.pi': driver } },
    })
    record.kernels.push(kernel)
    if (activate) defaultKernel = kernel
    return { kernel, owner }
  }
  const selectDefault = (value: { kernel: Kernel; owner: RuntimeOwner }) => {
    coordinator.activate(value.owner)
    defaultKernel = value.kernel
  }
  return { storage, session, coordinator, make, selectDefault, executions, released, interrupted, started, release }
}

test('managed construction leaves active and queued Runs untouched until explicit activation', async () => {
  const f = await fixture()
  const active = await f.storage.call('enqueue', f.session.id, 'active', { text: 'active', images: [] }, 'fixture')
  await f.storage.call('claim', f.session.id)
  const queued = await f.storage.call('enqueue', f.session.id, 'queued', { text: 'queued', images: [] }, 'fixture')
  const prepared = await f.make(2)
  expect(prepared.kernel.recovered).toBe(0)
  expect((await f.storage.call('run', active.id)).status).toBe('running')
  expect((await f.storage.call('run', queued.id)).status).toBe('queued')
  expect(f.executions).toHaveLength(0)
  await f.storage.call('setRun', active.id, 'completed')
})

test('a managed Goal projection does not repair accounting or create continuation intents during construction', async () => {
  const f = await fixture()
  const first = await f.make(1)
  const goal = await first.kernel.plugins
    .get<GoalService>('goal')
    .create(f.session.id, 'Keep the original authorization', 100)
  const run = await f.storage.call(
    'enqueue',
    f.session.id,
    'unaccounted',
    { text: 'unaccounted', images: [] },
    'fixture',
  )
  await f.storage.call('claim', f.session.id)
  await f.storage.call(
    'append',
    f.session.id,
    'goal.run_bound',
    {
      accounting: {
        goalId: goal.goal?.goalId,
        sessionId: f.session.id,
        startedAt: Date.now(),
        usageThroughSeq: 0,
        tokensAccounted: 0,
        timeAccounted: 0,
      },
    },
    run.id,
  )
  await f.storage.call('append', f.session.id, 'usage.recorded', { ...emptyUsage(), output: 7 }, run.id)
  await f.storage.call('setRun', run.id, 'completed')
  const before = (await f.storage.call('session', f.session.id)).seq
  await f.make(2)
  expect((await f.storage.call('session', f.session.id)).seq).toBe(before)
  expect(await f.storage.call('queuedSessions')).toHaveLength(0)
  expect(f.executions).toHaveLength(0)
})

test('Session handoff waits for the old Run, carries fenced leases, and new work uses the new Kernel', async () => {
  const f = await fixture()
  const first = await f.make(1, true)
  const run = await first.kernel.submit(f.session.id, 'old', { text: 'old', images: [] }, 'fixture')
  expect((await f.storage.call('run', run.id)).status).toBe('queued')
  await first.kernel.activate()
  await f.started
  const next = await first.kernel.submit(f.session.id, 'new', { text: 'new', images: [] }, 'fixture')
  const second = await f.make(2)
  first.kernel.beginDrain()
  f.selectDefault(second)
  await second.kernel.activate()
  expect(f.executions).toEqual([{ generation: 1, runId: run.id }])
  expect((await f.storage.call('run', next.id)).status).toBe('queued')
  f.release()
  await first.kernel.waitForIdle()
  await second.kernel.waitForIdle()
  expect(f.executions).toEqual([
    { generation: 1, runId: run.id },
    { generation: 2, runId: next.id },
  ])
  expect(f.released).toEqual([run.id, next.id])
  expect((await f.storage.call('runtimeExecutionRead', run.id))?.lease.owner).toEqual(first.owner)
  expect((await f.storage.call('runtimeExecutionRead', next.id))?.lease.owner).toEqual(second.owner)
  expect((await f.storage.call('runtimeExecutionRead', next.id))?.state).toBe('released')
})

test('fencing a running Kernel rejects settlement but still disposes its local Run and acknowledges stopping', async () => {
  const f = await fixture()
  const first = await f.make(1, true)
  const run = await first.kernel.submit(f.session.id, 'fenced', { text: 'fenced', images: [] }, 'fixture')
  await first.kernel.activate()
  await f.started
  await f.coordinator.revoke(first.owner)
  first.kernel.beginDrain()
  first.kernel.fenceRuns([run.id])
  f.release()
  await first.kernel.waitForIdle()
  expect(first.kernel.active.size).toBe(0)
  expect(f.interrupted).toEqual([run.id])
  expect(f.released).toHaveLength(0)
  expect((await f.storage.call('run', run.id)).status).toBe('running')
  await f.storage.call('recover', { runIds: [run.id], preserveQueued: true, preserveApprovals: true })
  expect((await f.storage.call('run', run.id)).status).toBe('interrupted')
})

test('user cancellation retains execution authority for Goal control and pauses the original Goal', async () => {
  const f = await fixture()
  const first = await f.make(1, true)
  const goals = first.kernel.plugins.get<GoalService>('goal')
  await goals.create(f.session.id, 'Respect cancellation', 100)
  const run = await first.kernel.submit(f.session.id, 'cancel', { text: 'cancel', images: [] }, 'fixture')
  await first.kernel.activate()
  await f.started
  await first.kernel.cancel(run.id)
  expect((await goals.get(f.session.id)).goal?.status).toBe('paused')
  f.release()
  await first.kernel.waitForIdle()
  expect((await f.storage.call('run', run.id)).status).toBe('cancelled')
  expect(f.released).toEqual([run.id])
})

for (const terminal of ['completed', 'failed'] as const) {
  test(`known ${terminal} Run releases original authority after notification metadata rejects`, async () => {
    const f = await fixture()
    const first = await f.make(1, true, terminal === 'failed')
    const goals = first.kernel.plugins.get<GoalService>('goal')
    const get = goals.get.bind(goals)
    const requestId = `terminal-observation-${terminal}`
    let rejectedReads = 0
    const observation = spyOn(goals, 'get').mockImplementation(async (...args) => {
      const existing = await f.storage.call('runByRequest', f.session.id, requestId)
      if (existing?.run.status === terminal) {
        rejectedReads++
        throw new HbarError('RUNTIME_STOPPING', 'Controlled post-terminal observation failure')
      }
      return get(...args)
    })
    try {
      const run = await first.kernel.submit(
        f.session.id,
        requestId,
        { text: 'Finish the original Run', images: [] },
        'fixture',
      )
      await first.kernel.activate()
      await f.started
      f.release()
      await first.kernel.waitForIdle()
      expect(rejectedReads).toBeGreaterThan(0)
      expect((await f.storage.call('run', run.id)).status).toBe(terminal)
      expect((await f.storage.call('runtimeExecutionRead', run.id))?.state).toBe('released')
      expect(f.released).toEqual([run.id])
      expect(f.interrupted).toHaveLength(0)
      expect(f.coordinator.snapshot().sessions).toBe(0)
    } finally {
      observation.mockRestore()
    }
  })
}
