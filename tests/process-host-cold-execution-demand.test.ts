import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import type { RuntimeOwner, RuntimeVersion } from '@hbar/contracts/runtime'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { prepareFirstDriverExecution } from './prepare-first-driver-execution'

// Root NativeJob only: 11 GiB admission, 4096 MiB family RSS, 180 s stage.
// Uses the original default demo Driver/tool command, without a profile or model service.
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Cold execution transition did not settle')
    await Bun.sleep(10)
  }
}

test('execution after all runtime processes sleep retains exact cold Driver and plugin owners', async () => {
  const temporaryParent = await realpath(tmpdir())
  const root = await mkdtemp(join(temporaryParent, 'hbar-cold-execution-'))
  const ownedRoot = await realpath(root)
  if (dirname(ownedRoot) !== temporaryParent || !basename(ownedRoot).startsWith('hbar-cold-execution-'))
    throw new Error('Unowned cold execution fixture root')
  let runtime: ProcessHostRuntime | undefined
  let unsubscribe: (() => void) | undefined
  let primary: { error: unknown } | undefined
  const observed = new Map<string, Map<string, { owner: RuntimeOwner; version: RuntimeVersion; pid: number }>>()
  const phase = (name: string) =>
    console.info(
      JSON.stringify({
        type: 'fullhost-cold-execution-phase',
        phase: name,
        observedAtUtc: new Date().toISOString(),
        hostPid: process.pid,
        hostRssBytes: process.memoryUsage.rss(),
        hostRssScope: 'Host PID only; family RSS is measured separately by NativeJob supervision',
        units: runtime?.snapshot().units ?? [],
      }),
    )
  try {
    phase('initialize.start')
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      idleTimeoutMs: 200,
    })
    const managed = runtime
    const application = managed.controller.application
    if (!application) throw new Error('Actual controller lifecycle is missing')
    const workspace = (await managed.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Actual cold execution workspace missing')
    const session = await managed.storage.call('createSession', workspace.id)
    phase('driver.first-business.start')
    const firstDriver = await prepareFirstDriverExecution(managed, workspace.id, 'cold-execution-first-driver')
    phase('driver.first-business.complete')
    await application.scheduleController.start()
    phase('initial.sleep.wait')
    const allSleeping = () => {
      const units = managed.snapshot().units
      return units.length === 15 && units.every((unit) => unit.idle?.phase === 'sleeping')
    }
    await until(allSleeping)
    phase('initial.sleep.complete')
    expect(managed.manager.retirement(firstDriver.owner)).toMatchObject({
      status: 'retired',
      ownerCleanupCompleted: true,
      physical: { nativeJoined: true, onExitCompleted: true, cleanDisposeAck: true, forced: false, exitCode: 0 },
    })
    const pluginIds = managed.buildUnits
      .filter((unit) => unit.descriptor.kind === 'plugin')
      .map((unit) => unit.descriptor.id)
    const required = ['kernel', 'driver.pi', ...pluginIds]
    unsubscribe = managed.subscribe((delta) => {
      for (const unit of delta.units) {
        if (!required.includes(unit.descriptor.id)) continue
        for (const generation of unit.generations) {
          if (generation.role !== 'default' || generation.phase !== 'serving' || generation.pid === null) continue
          const entries =
            observed.get(unit.descriptor.id) ??
            new Map<string, { owner: RuntimeOwner; version: RuntimeVersion; pid: number }>()
          entries.set(generation.incarnation, {
            owner: {
              unitId: unit.descriptor.id,
              generation: generation.generation,
              incarnation: generation.incarnation,
            },
            version: {
              unitId: unit.descriptor.id,
              generation: generation.generation,
              artifactId: generation.artifactId,
            },
            pid: generation.pid,
          })
          observed.set(unit.descriptor.id, entries)
        }
      }
    })
    phase('execution.submit')
    const started = performance.now()
    const run = await managed.kernel.submit(
      session.id,
      'cold-execution-request',
      { text: '/tool get_goal {}', images: [] },
      'local-fixture',
    )
    await managed.waitForIdle(30_000)
    const finished = await managed.storage.call('run', run.id)
    expect(finished).toMatchObject({ status: 'completed' })
    const receipt = await managed.storage.call('runtimeExecutionRead', run.id)
    if (!receipt) throw new Error('Actual cold execution ownership receipt missing')
    expect(receipt.state).toBe('released')
    expect(receipt.lease.runId).toBe(run.id)
    expect(receipt.lease.sessionId).toBe(session.id)
    const captured = (id: string) => {
      const entries = [...(observed.get(id)?.values() ?? [])]
      expect(entries).toHaveLength(1)
      const entry = entries[0]
      if (!entry) throw new Error(`Cold execution owner was not observed: ${id}`)
      expect(entry.owner.generation).toBeGreaterThan(1)
      expect(entry.pid).toBeGreaterThan(0)
      return entry
    }
    const kernel = captured('kernel')
    expect(receipt.lease.owner).toEqual(kernel.owner)
    expect(receipt.lease.versions.kernel).toEqual(kernel.version)
    const coldDriver = captured('driver.pi')
    expect(receipt.lease.versions.driver).toEqual(coldDriver.version)
    expect(coldDriver.owner.incarnation).not.toBe(firstDriver.owner.incarnation)
    expect(receipt.lease.versions.plugins.map((version) => version.unitId).sort()).toEqual([...pluginIds].sort())
    for (const id of pluginIds) {
      const entry = captured(id)
      expect(receipt.lease.versions.plugins.find((version) => version.unitId === id)).toEqual(entry.version)
    }
    for (const hook of receipt.lease.versions.hooks) {
      expect(receipt.lease.versions.plugins).toContainEqual(hook)
    }
    // A logical Run result alone cannot establish release of physical activity.
    expect(managed.coordinator.snapshot()).toMatchObject({ sessions: 0, physicalTools: 0, resources: 0 })
    phase('execution.released')
    console.info(
      JSON.stringify({
        type: 'fullhost-cold-execution-receipt',
        observedAtUtc: new Date().toISOString(),
        runId: run.id,
        receipt,
        owners: [...observed.values()].flatMap((entries) => [...entries.values()]),
        elapsedMs: performance.now() - started,
        metrics: 'Observed latency only; no performance threshold asserted',
      }),
    )
    phase('final.sleep.wait')
    await until(allSleeping)
    phase('final.sleep.complete')
    // Keep observing through retirement to detect replacement owners during settlement.
    for (const id of required) expect(observed.get(id)?.size).toBe(1)
  } catch (error) {
    primary = { error }
    phase('failure')
  }
  unsubscribe?.()
  const cleanupErrors: unknown[] = []
  phase('close.start')
  try {
    await runtime?.close()
  } catch (error) {
    cleanupErrors.push(error)
  }
  phase('close.complete')
  if (!primary && cleanupErrors.length === 0 && runtime) {
    try {
      const currentRoot = await realpath(root)
      if (
        currentRoot !== ownedRoot ||
        dirname(currentRoot) !== temporaryParent ||
        !basename(currentRoot).startsWith('hbar-cold-execution-')
      )
        throw new Error('Cold execution root identity changed before cleanup')
      await rm(root, { recursive: true, force: true })
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  if (cleanupErrors.length) {
    const errors = primary ? [primary.error, ...cleanupErrors] : cleanupErrors
    throw new AggregateError(errors, 'Cold execution fixture cleanup failed', { cause: errors[0] })
  }
  if (primary) throw primary.error
}, 120_000)
