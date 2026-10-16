import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { HarnessDriver } from '@hbar/plugin-sdk'
import { emptyUsage, type Run } from '@hbar/contracts'
import { Storage, createPathLayout, ensurePathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'

async function until(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Kernel fanout fixture did not settle')
    await Bun.sleep(10)
  }
}

test('local fixture retains thirty-way execution, deduplicates wakes and closes a full pending queue', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-fanout-'))
  let kernel: Kernel | undefined
  let storage: Storage | undefined
  let primary: unknown
  let failed = false
  const cleanup: unknown[] = []
  const started = new Set<string>()
  let active = 0
  let peak = 0
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Bounded local scheduling fixture',
      description: 'No provider requests',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      permissions: [],
      provides: { driver: '1.0.0' },
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input) {
          if (started.has(input.run.id)) throw new Error('Duplicate execution claim')
          started.add(input.run.id)
          active++
          peak = Math.max(peak, active)
          try {
            await new Promise<void>((resolve) => {
              if (input.signal.aborted) resolve()
              else input.signal.addEventListener('abort', () => resolve(), { once: true })
            })
            input.signal.throwIfAborted()
          } finally {
            active--
          }
        },
        summarize: async () => ({ text: 'Unused local fixture summary', usage: emptyUsage() }),
      })
    },
  })
  try {
    storage = new Storage(join(root, 'state.sqlite'))
    await storage.call('ready')
    await storage.call('setPlugin', 'goal.codex', true, { autoContinue: false })
    const stable = storage
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      lifecycle: 'managed',
      profile: {
        replacements: { 'driver.pi': driver },
        createStorage: async () => ({ call: (method, ...args) => stable.call(method, ...args), close: async () => {} }),
      },
    })
    await kernel.saveProvider({
      id: 'local-fixture',
      name: 'Local fixture',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: 'fixture',
    })
    const workspace = await storage.call('createWorkspace', root, 'Bounded queue')
    const sessions = []
    const runs: Run[] = []
    for (let index = 0; index < 40; index++) {
      const session = await storage.call('createSession', workspace.id)
      sessions.push(session)
      runs.push(
        await kernel.submit(
          session.id,
          crypto.randomUUID(),
          { text: 'Wait for fixture shutdown', images: [] },
          'local-fixture',
        ),
      )
    }
    await kernel.activate()
    await until(async () => started.size >= 32)
    expect(peak).toBe(32)
    expect(active).toBeGreaterThanOrEqual(30)
    for (const session of sessions) {
      kernel.wake(session.id)
      kernel.wake(session.id)
    }
    await Bun.sleep(20)
    expect(started.size).toBe(32)
    await kernel.close()
    kernel = undefined
    expect(active).toBe(0)
    expect(started.size).toBe(32)
    for (const run of runs) {
      const current = await storage.call('run', run.id)
      expect(current.status).toBe(started.has(run.id) ? 'interrupted' : 'queued')
    }
  } catch (error) {
    failed = true
    primary = error
  }
  try {
    await kernel?.close()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    await storage?.close()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    const target = resolve(root)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-kernel-fanout-'))
      throw new Error('Unsafe fanout fixture cleanup path')
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch (error) {
    cleanup.push(error)
  }
  if (failed) {
    if (cleanup.length)
      throw new AggregateError([primary, ...cleanup], 'Kernel bounded queue and cleanup failed', { cause: primary })
    throw primary
  }
  if (cleanup.length) throw new AggregateError(cleanup, 'Kernel bounded queue cleanup failed')
}, 60_000)

for (const count of [160, 256]) {
  test(`managed startup drains ${count} historical Sessions without exhausting RPC and retains concurrent execution`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-fanout-'))
    const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
    let storage: Storage | undefined
    let runtime: ProcessHostRuntime | undefined
    let failed = false
    let primary: unknown
    const cleanup: unknown[] = []
    try {
      await ensurePathLayout(layout)
      storage = new Storage(layout.database, layout)
      await storage.call('ready')
      await storage.call('setPlugin', 'goal.codex', true, { autoContinue: false })
      await storage.call('setPlugin', 'budget.codex', true, { autoContinue: false })
      const workspace = await storage.call('createWorkspace', root, 'Fanout fixture')
      const sessions = []
      for (let index = 0; index < count; index++) sessions.push(await storage.call('createSession', workspace.id))
      await storage.close()
      storage = undefined
      runtime = await ProcessHostRuntime.create({
        layout,
        sourceRoot: process.cwd(),
        workspace: root,
        demo: true,
        secrets: new MemorySecrets(),
      })
      const managed = runtime
      await runtime.waitForIdle(30_000)
      expect(runtime.snapshot().ready).toBe(true)
      // The last startup Session must remain serviceable rather than having its wake discarded.
      const last = sessions.at(-1)
      if (!last) throw new Error('Expected seeded Sessions')
      const runs: Run[] = []
      for (const session of [...sessions.slice(0, 9), last]) {
        runs.push(
          await runtime.kernel.submit(session.id, crypto.randomUUID(), { text: '/slow', images: [] }, 'local-fixture'),
        )
      }
      await until(async () =>
        (await Promise.all(runs.map((run) => managed.storage.call('runtimeExecutionRead', run.id)))).every(
          (receipt) => receipt?.state === 'active',
        ),
      )
      expect(runtime.coordinator.snapshot().sessions).toBeGreaterThanOrEqual(10)
      for (const run of runs) await runtime.kernel.cancel(run.id)
      await runtime.waitForIdle(30_000)
      for (const run of runs) {
        expect((await runtime.storage.call('runtimeExecutionRead', run.id))?.state).toBe('released')
        expect((await runtime.storage.call('run', run.id)).status).toBe('cancelled')
      }
      expect(runtime.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0, physicalTools: 0 })
      expect(runtime.snapshot().ready).toBe(true)
    } catch (error) {
      failed = true
      primary = error
    }
    try {
      await runtime?.close()
    } catch (error) {
      cleanup.push(error)
    }
    try {
      await storage?.close()
    } catch (error) {
      cleanup.push(error)
    }
    try {
      const target = resolve(root)
      if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-kernel-fanout-'))
        throw new Error('Unsafe fanout fixture cleanup path')
      await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch (error) {
      cleanup.push(error)
    }
    if (failed) {
      if (cleanup.length)
        throw new AggregateError([primary, ...cleanup], 'Kernel fanout and cleanup failed', { cause: primary })
      throw primary
    }
    if (cleanup.length) throw new AggregateError(cleanup, 'Kernel fanout cleanup failed')
  }, 120_000)
}
