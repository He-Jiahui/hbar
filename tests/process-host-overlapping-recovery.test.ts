import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'

async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Overlapping owner recovery did not settle')
    await Bun.sleep(10)
  }
}

test('overlapping Kernel and driver faults reconcile one outcome before claiming the existing queued Run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-overlap-recovery-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  const runtime = await ProcessHostRuntime.create({
    layout,
    sourceRoot: process.cwd(),
    demo: true,
    workspace: root,
    secrets: new MemorySecrets(),
  })
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
  try {
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Expected fixture workspace')
    const session = await runtime.storage.call('createSession', workspace.id)
    const before = runtime.snapshot()
    const kernel = before.units.find((unit) => unit.descriptor.id === 'kernel')?.generations[0]
    const driver = before.units.find((unit) => unit.descriptor.id === 'driver.pi')?.generations[0]
    if (!kernel?.pid || !driver?.pid || kernel.pid === process.pid || driver.pid === process.pid)
      throw new Error('Expected two distinct owned runtime children')
    const original = await runtime.kernel.submit(
      session.id,
      'overlap-original',
      { text: '/slow', images: [] },
      'local-fixture',
    )
    await until(() => runtime.facade.streams.size > 0)
    const queued = await runtime.kernel.submit(
      session.id,
      'overlap-already-queued',
      { text: 'Return a short fixture response', images: [] },
      'local-fixture',
    )
    expect((await runtime.storage.call('run', queued.id)).status).toBe('queued')
    // Same turn, captured owned handles only: no name-based process discovery.
    process.kill(kernel.pid, 'SIGKILL')
    process.kill(driver.pid, 'SIGKILL')
    await until(() => {
      const snapshot = runtime.snapshot()
      const nextKernel = snapshot.units.find((unit) => unit.descriptor.id === 'kernel')?.generations[0]
      const nextDriver = snapshot.units.find((unit) => unit.descriptor.id === 'driver.pi')?.generations[0]
      return (
        snapshot.ready &&
        nextKernel?.incarnation !== kernel.incarnation &&
        nextDriver?.incarnation !== driver.incarnation &&
        denied > 0
      )
    })
    expect((await runtime.storage.call('run', queued.id)).status).toBe('queued')
    expect(await runtime.storage.call('runtimeExecutionRead', queued.id)).toBeNull()
    allowReconciliation = true
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
    const instanceId: string = runtime.instanceId
    expect(instanceId).toBe(before.instanceId)
  } finally {
    allowReconciliation = true
    runtime.coordinator.reconciled = reconcile
    await runtime.close()
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)
