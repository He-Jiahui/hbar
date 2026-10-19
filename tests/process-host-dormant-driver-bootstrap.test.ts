import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { MemorySecrets } from '@hbar/kernel/secrets'
import type { RuntimeOwner, RuntimeVersion } from '@hbar/contracts/runtime'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { dormantDriverBootstrapReady } from '../apps/host/src/runtime-dormant-driver-bootstrap'

// Full real Host, Root NativeJob only. Demo's local fixture model does not call a provider.
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Dormant Driver transition did not settle')
    await Bun.sleep(10)
  }
}

test('no-profile Host retains an ownerless Driver until concurrent real business claims', async () => {
  const parent = await realpath(tmpdir())
  const root = await mkdtemp(join(parent, 'hbar-dormant-driver-'))
  const canonical = await realpath(root)
  if (dirname(canonical) !== parent || !basename(canonical).startsWith('hbar-dormant-driver-'))
    throw new Error('Unowned dormant Driver fixture')
  let runtime: ProcessHostRuntime | undefined
  let unsubscribe: (() => void) | undefined
  let primary: { error: unknown } | undefined
  const drivers = new Map<string, { owner: RuntimeOwner; version: RuntimeVersion; pid: number }>()
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      noLocalExec: true,
      secrets: new MemorySecrets(),
      idleTimeoutMs: 200,
    })
    const managed = runtime
    await until(() => managed.snapshot().ready)
    const initial = managed.manager.snapshot()
    const driver = initial.units.find((unit) => unit.descriptor.id === 'driver.pi')
    if (!driver?.idle?.selectedArtifactId) throw new Error('Explicit Driver artifact missing')
    const selection = { unitId: 'driver.pi', selectedArtifactId: driver.idle.selectedArtifactId }
    const descriptors = managed.buildUnits.map((unit) => unit.descriptor)
    expect(initial.ready).toBe(false) // Required dormant is physically unready in Manager.
    expect(managed.snapshot().ready).toBe(true) // Exact cold entry after Kernel restore ACK.
    expect(driver.generations).toEqual([]) // No owner, incarnation or PID has ever been created.
    expect(driver).toMatchObject({
      queuedArtifactId: null,
      idle: {
        phase: 'dormant',
        enabled: false,
        demandHolds: 0,
        checkpointPending: false,
      },
    })
    expect(dormantDriverBootstrapReady(initial, descriptors, selection)).toBe(true)
    expect(dormantDriverBootstrapReady(initial, descriptors, { ...selection, selectedArtifactId: 'wrong' })).toBe(false)
    const hiddenDependency = descriptors.map((value) =>
      value.id === 'kernel' ? { ...value, dependencies: [...value.dependencies, 'driver.pi'] } : value,
    )
    expect(dormantDriverBootstrapReady(initial, hiddenDependency, selection)).toBe(false)
    for (const phase of ['unknown', 'sleeping', 'active'] as const) {
      const altered = structuredClone(initial)
      const alteredDriver = altered.units.find((unit) => unit.descriptor.id === 'driver.pi')
      if (!alteredDriver?.idle) throw new Error('Driver idle DTO missing')
      alteredDriver.idle.phase = phase
      expect(dormantDriverBootstrapReady(altered, descriptors, selection)).toBe(false)
    }
    for (const fault of ['hold', 'checkpoint', 'descriptor', 'missing'] as const) {
      const altered = structuredClone(initial)
      const alteredDriver = altered.units.find((unit) => unit.descriptor.id === 'driver.pi')
      if (!alteredDriver?.idle) throw new Error('Driver idle DTO missing')
      if (fault === 'hold') alteredDriver.idle.demandHolds = 1
      if (fault === 'checkpoint') alteredDriver.idle.checkpointPending = true
      if (fault === 'descriptor') alteredDriver.descriptor.contractFingerprint = 'wrong'
      if (fault === 'missing') altered.units = altered.units.filter((unit) => unit.descriptor.id !== 'kernel')
      expect(dormantDriverBootstrapReady(altered, descriptors, selection)).toBe(false)
    }
    const beforeMetadata = JSON.stringify(driver)
    for (let read = 0; read < 30; read++) {
      managed.snapshot()
      managed.manager.snapshot()
    }
    expect(JSON.stringify(managed.manager.snapshot().units.find((unit) => unit.descriptor.id === 'driver.pi'))).toBe(
      beforeMetadata,
    ) // Includes selected artifact/idle deadline; no TTL refresh.
    const workspace = (await managed.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Fixture workspace missing')
    const sessions = await Promise.all([0, 1].map(() => managed.storage.call('createSession', workspace.id)))
    await Promise.all(sessions.map((session) => managed.kernel.plugins.get('goal').get(session.id)))
    expect(managed.manager.snapshot().units.find((unit) => unit.descriptor.id === 'driver.pi')?.generations).toEqual([])
    console.info(
      JSON.stringify({
        type: 'fullhost-dormant-driver-phase',
        phase: 'before-business',
        observedAtUtc: new Date().toISOString(),
        hostPid: process.pid,
        driver,
        managerReady: initial.ready,
        hostReady: managed.snapshot().ready,
      }),
    )
    unsubscribe = managed.subscribe((snapshot) => {
      for (const unit of snapshot.units) {
        if (unit.descriptor.id !== 'driver.pi') continue
        for (const generation of unit.generations) {
          if (generation.role !== 'default' || generation.phase !== 'serving' || generation.pid === null) continue
          drivers.set(generation.incarnation, {
            owner: { unitId: 'driver.pi', generation: generation.generation, incarnation: generation.incarnation },
            version: { unitId: 'driver.pi', generation: generation.generation, artifactId: generation.artifactId },
            pid: generation.pid,
          })
        }
      }
    })
    const runs = await Promise.all(
      sessions.map((session, index) =>
        managed.kernel.submit(
          session.id,
          `dormant-first-request-${index}`,
          { text: '/tool get_goal {}', images: [] },
          'local-fixture',
        ),
      ),
    )
    await managed.waitForIdle(30_000)
    expect(drivers.size).toBe(1)
    const first = [...drivers.values()][0]
    if (!first) throw new Error('First physical Driver owner not observed')
    expect(first.owner.generation).toBe(1)
    expect(first.pid).toBeGreaterThan(0)
    for (const run of runs) {
      expect(await managed.storage.call('run', run.id)).toMatchObject({ status: 'completed' })
      const receipt = await managed.storage.call('runtimeExecutionRead', run.id)
      expect(receipt).toMatchObject({
        state: 'released',
        lease: { runId: run.id, versions: { driver: first.version } },
      })
    }
    expect(managed.coordinator.snapshot()).toMatchObject({ sessions: 0, physicalTools: 0, resources: 0 })
    await until(
      () =>
        managed.manager.snapshot().units.find((unit) => unit.descriptor.id === 'driver.pi')?.idle?.phase === 'sleeping',
    )
    expect(managed.manager.retirement(first.owner)).toMatchObject({
      status: 'retired',
      ownerCleanupCompleted: true,
      physical: { nativeJoined: true, onExitCompleted: true, cleanDisposeAck: true, forced: false, exitCode: 0 },
    })
    expect(drivers.size).toBe(1)
    console.info(
      JSON.stringify({
        type: 'fullhost-dormant-driver-proof',
        owner: first.owner,
        pid: first.pid,
        requests: runs.length,
        retirement: managed.manager.retirement(first.owner),
        externalModelRequests: 0,
      }),
    )
  } catch (error) {
    primary = { error }
  } finally {
    unsubscribe?.()
  }
  const errors: unknown[] = []
  try {
    await runtime?.close()
  } catch (error) {
    errors.push(error)
  }
  if (!primary && !errors.length && runtime) {
    try {
      const current = await realpath(root)
      if (current !== canonical || dirname(current) !== parent || !basename(current).startsWith('hbar-dormant-driver-'))
        throw new Error('Owned root changed')
      await rm(root, { recursive: true, force: true })
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length)
    throw new AggregateError(primary ? [primary.error, ...errors] : errors, 'Dormant Host cleanup failed')
  if (primary) throw primary.error
}, 120_000)
