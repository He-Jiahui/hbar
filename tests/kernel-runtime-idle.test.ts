import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { SessionWakeups } from '../packages/kernel/src/session-wakeups'
async function fixture(action: (kernel: Kernel, root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-idle-'))
  let kernel: Kernel | undefined
  let failed = false,
    primary: unknown
  const errors: unknown[] = []
  try {
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      lifecycle: 'managed',
    })
    await action(kernel, root)
  } catch (error) {
    failed = true
    primary = error
  }
  if (kernel) {
    try {
      await kernel.close()
    } catch (error) {
      errors.push(error)
    }
  }
  try {
    const resolved = await realpath(root),
      temporary = await realpath(tmpdir())
    if (
      dirname(resolved).toLowerCase() !== temporary.toLowerCase() ||
      !basename(resolved).startsWith('hbar-kernel-idle-')
    )
      throw new Error('Unowned cleanup target')
    await rm(resolved, { recursive: true, force: true })
  } catch (error) {
    errors.push(error)
  }
  if (failed) {
    if (errors.length)
      throw new AggregateError([primary, ...errors], 'Kernel idle fixture and cleanup failed', { cause: primary })
    throw primary
  }
  if (errors.length) throw new AggregateError(errors, 'Kernel idle fixture cleanup failed')
}
test('actual managed Kernel can prove a completely quiet local domain without draining', () =>
  fixture(async (kernel) => {
    await kernel.activate('default', 'idle-wake')
    const first = kernel.runtimeIdleCheckpoint({ queuedRuns: false }),
      second = kernel.runtimeIdleCheckpoint({ queuedRuns: false })
    expect(first.eligible).toBe(true)
    expect(first.coverage).toBe('kernel-domain')
    expect(first.queuedRuns).toBe(false)
    expect(first.scheduledWakeups).toBe(0)
    expect(kernel.runtimeIdleCheckpoint({ queuedRuns: null }).eligible).toBe(false)
    expect(kernel.runtimeIdleCheckpoint({ queuedRuns: true }).eligible).toBe(false)
    expect(second).toEqual(first)
    expect(kernel.active.size).toBe(0)
  }))
test('durable queued run blocks local idle and idle-wake does not claim/replay it', () =>
  fixture(async (kernel, root) => {
    const workspace = await kernel.storage.call('createWorkspace', root, 'Idle queue fixture')
    const session = await kernel.storage.call('createSession', workspace.id)
    const run = await kernel.storage.call(
      'enqueue',
      session.id,
      crypto.randomUUID(),
      { text: 'Do not execute this fixture', images: [] },
      'local-fixture',
    )
    expect(await kernel.storage.call('hasQueuedRuns')).toBe(true)
    const before = kernel.runtimeIdleCheckpoint({ queuedRuns: await kernel.storage.call('hasQueuedRuns') })
    expect(before.eligible).toBe(false)
    expect(before.queuedRuns).toBe(true)
    await kernel.activate('default', 'idle-wake')
    expect((await kernel.storage.call('run', run.id)).status).toBe('queued')
    expect(kernel.active.size).toBe(0)
  }))

function controlledCallback() {
  let release: () => void = () => {
    throw new Error('Callback gate not initialized')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

test('a real public Kernel operation remains idle-busy until its async subscriber physically settles', () =>
  fixture(async (kernel, root) => {
    await kernel.activate('default', 'idle-wake')
    const callback = controlledCallback()
    let observed = 0
    let completed = false
    const unsubscribe = kernel.subscribe((event) => {
      if (event.method !== 'host.changed' || event.params.kind !== 'workspaces') return
      observed++
      return callback.promise.then(() => {
        completed = true
      })
    })
    try {
      // createWorkspace awaits actual filesystem validation + SQLite mutation, then publishes.
      const workspace = await kernel.createWorkspace(root)
      expect((await kernel.storage.call('workspace', workspace.id)).id).toBe(workspace.id)
      expect(observed).toBe(1)
      expect(completed).toBe(false)
      const held = kernel.runtimeIdleCheckpoint({ queuedRuns: false })
      expect(held.counts.subscriberPublications).toBeGreaterThan(0)
      expect(held.eligible).toBe(false)
      callback.release()
      await callback.promise
      // Flush the observer Promise.then/catch/finally chain; no elapsed-time sleeps.
      for (let turn = 0; turn < 16; turn++) await Promise.resolve()
      expect(completed).toBe(true)
      const settled = kernel.runtimeIdleCheckpoint({ queuedRuns: false })
      expect(settled.counts.subscriberPublications).toBe(0)
      expect(settled.eligible).toBe(true)
      expect(observed).toBe(1)
    } finally {
      callback.release()
      unsubscribe()
    }
  }))

test('the original public SessionWakeups timer remains counted until explicitly cancelled', async () => {
  let fired = 0
  const wakeups = new SessionWakeups(() => {
    fired++
  })
  try {
    wakeups.schedule('future-session', Date.now() + 60_000)
    expect(wakeups.pendingCount).toBe(1)
    expect(wakeups.has('future-session')).toBe(true)
    expect(wakeups.waiting).toHaveLength(1)
    const originalWaiting = wakeups.waiting
    wakeups.cancel('future-session')
    await Promise.all(originalWaiting)
    expect(wakeups.pendingCount).toBe(0)
    expect(wakeups.has('future-session')).toBe(false)
    expect(wakeups.waiting).toHaveLength(0)
    expect(fired).toBe(0)
  } finally {
    wakeups.close()
  }
})
