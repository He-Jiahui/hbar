import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { DeferredRuntimeWakeups, ProcessHostRuntime } from '../apps/host/src/process-host-runtime'

async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Overlapping owner recovery did not settle')
    await Bun.sleep(10)
  }
}

test('a saturated two-slot notification queue cannot prevent exact overlapping-owner recovery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-overlap-recovery-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  const runtime = await ProcessHostRuntime.create({
    layout,
    sourceRoot: process.cwd(),
    demo: true,
    workspace: root,
    secrets: new MemorySecrets(),
  })
  const queue = new DeferredRuntimeWakeups(2)
  const prototype = DeferredRuntimeWakeups.prototype
  const originalDefer = prototype.defer
  const originalFlush = prototype.flush
  const originalClose = prototype.close
  let blockedFlushes = 0
  prototype.defer = function (this: DeferredRuntimeWakeups, sessionId: string): void {
    originalDefer.call(queue, sessionId)
  }
  prototype.flush = function (this: DeferredRuntimeWakeups, ...args: Parameters<typeof originalFlush>): Promise<void> {
    blockedFlushes++
    // Existing notifications are deliberately still denied. Recovery must not require a third slot.
    return originalFlush.call(queue, () => false, args[1], args[2])
  }
  prototype.close = function (this: DeferredRuntimeWakeups): void {
    originalClose.call(queue)
  }
  const reconcile = runtime.coordinator.reconciled.bind(runtime.coordinator)
  let allowReconciliation = false
  let denied = 0
  // A fixture-only coordinator boundary holds BOTH actual fault records until
  // their owners exit. The original physical-resource checks remain mandatory.
  runtime.coordinator.reconciled = (sessionId) => {
    if (!allowReconciliation) {
      denied++
      throw new HbarError('EXECUTION_RESOURCES_ACTIVE', 'Fixture retains the reconciliation boundary')
    }
    reconcile(sessionId)
  }
  let primary: { error: unknown } | undefined
  try {
    const application = runtime.controller.application
    if (!application) throw new Error('Actual controller lifecycle is missing')
    await application.scheduleController.start()
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Expected fixture workspace')
    const session = await runtime.storage.call('createSession', workspace.id)
    const original = await runtime.kernel.submit(
      session.id,
      'overlap-original',
      { text: '/slow', images: [] },
      'local-fixture',
    )
    await until(() => runtime.facade.streams.size > 0)
    // Capture physical identities only after the existing first business has started Driver.
    const before = runtime.snapshot()
    const kernel = before.units.find((unit) => unit.descriptor.id === 'kernel')?.generations[0]
    const driver = before.units.find((unit) => unit.descriptor.id === 'driver.pi')?.generations[0]
    if (!kernel?.pid || !driver?.pid || kernel.pid === process.pid || driver.pid === process.pid)
      throw new Error('Expected two distinct owned runtime children')
    const queued = await runtime.kernel.submit(
      session.id,
      'overlap-already-queued',
      { text: 'Return a short fixture response', images: [] },
      'local-fixture',
    )
    expect((await runtime.storage.call('run', queued.id)).status).toBe('queued')
    const unrelated = await Promise.all([0, 1].map(() => runtime.storage.call('createSession', workspace.id)))
    for (const value of unrelated) originalDefer.call(queue, value.id)
    expect(() => originalDefer.call(queue, session.id)).toThrow('capacity')
    // Same turn, captured owned handles only: no name-based process discovery.
    process.kill(kernel.pid, 'SIGKILL')
    process.kill(driver.pid, 'SIGKILL')
    await until(() => {
      const snapshot = runtime.snapshot()
      const nextKernel = snapshot.units.find((unit) => unit.descriptor.id === 'kernel')?.generations[0]
      const nextDriver = snapshot.units.find((unit) => unit.descriptor.id === 'driver.pi')?.generations[0]
      return (
        !snapshot.ready &&
        nextKernel?.phase === 'serving' &&
        nextDriver?.phase === 'serving' &&
        nextKernel?.incarnation !== kernel.incarnation &&
        nextDriver?.incarnation !== driver.incarnation &&
        denied > 0
      )
    })
    expect((await runtime.storage.call('run', queued.id)).status).toBe('queued')
    expect(runtime.snapshot().ready).toBe(false)
    expect(await runtime.storage.call('runtimeExecutionRead', queued.id)).toBeNull()
    allowReconciliation = true
    await until(() => runtime.snapshot().ready)
    await until(
      async () =>
        (await runtime.storage.call('run', queued.id)).status === 'completed' &&
        (await runtime.storage.call('runtimeExecutionRead', queued.id))?.state === 'released',
    )
    const recovery = await runtime.storage.call('runtimeRecoveryRead', original.id)
    if (!recovery?.run) throw new Error('Expected exactly one durable recovery successor')
    const recovered = recovery.run
    await until(
      async () =>
        (await runtime.storage.call('run', recovered.id)).status === 'completed' &&
        (await runtime.storage.call('runtimeExecutionRead', recovered.id))?.state === 'released',
    )
    expect((await runtime.storage.call('run', original.id)).status).toBe('interrupted')
    const snapshot = await runtime.storage.call('snapshot', session.id)
    expect(snapshot.runs.map((run) => run.id).sort()).toEqual([original.id, queued.id, recovered.id].sort())
    expect(snapshot.runs.filter((run) => run.recovery?.predecessorRunId === original.id)).toHaveLength(1)
    expect((await runtime.storage.call('runByRequest', session.id, queued.requestId))?.run.id).toBe(queued.id)
    expect(snapshot.messages.filter((message) => message.role === 'user')).toHaveLength(2)
    expect(blockedFlushes).toBeGreaterThan(0)
    // The original two entries still occupy both slots; no notification was evicted to recover.
    expect(() => originalDefer.call(queue, session.id)).toThrow('capacity')
    const instanceId: string = runtime.instanceId
    expect(instanceId).toBe(before.instanceId)
  } catch (error) {
    primary = { error }
  }
  prototype.defer = originalDefer
  prototype.flush = originalFlush
  prototype.close = originalClose
  originalClose.call(queue)
  allowReconciliation = true
  runtime.coordinator.reconciled = reconcile
  const cleanupErrors: unknown[] = []
  try {
    await runtime.close()
  } catch (error) {
    cleanupErrors.push(error)
  }
  if (!primary && cleanupErrors.length === 0) {
    try {
      await rm(root, { recursive: true, force: true })
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  if (cleanupErrors.length)
    throw new AggregateError(
      primary ? [primary.error, ...cleanupErrors] : cleanupErrors,
      'Overlapping recovery cleanup failed',
    )
  if (primary) throw primary.error
}, 120_000)
