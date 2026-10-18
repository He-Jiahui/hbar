import { expect, spyOn, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { ManagedProcess } from '@hbar/runtime'
import { Storage, createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { hostRuntimeBuildUnits } from '../apps/host/src/runtime-build'
import { prepareFirstDriverExecution } from './prepare-first-driver-execution'

async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('All-module writer handoff did not settle')
    await Bun.sleep(10)
  }
}

test('two all-module natural idle rounds release the real writer and reopen one cold read closure', async () => {
  const parent = await realpath(tmpdir())
  const root = await mkdtemp(join(parent, 'hbar-two-round-writer-'))
  const canonical = await realpath(root)
  if (dirname(canonical) !== parent || !basename(canonical).startsWith('hbar-two-round-writer-'))
    throw new Error('Unowned all-module writer fixture')
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  let runtime: ProcessHostRuntime | undefined
  let writer: Storage | undefined
  let primary: { error: unknown } | undefined
  const expectedUnits = new Set(hostRuntimeBuildUnits().map((unit) => unit.descriptor.id))
  const served = new Map<string, { owner: RuntimeOwner; pid: number }>()
  const originalSnapshot = ManagedProcess.prototype.snapshot
  const snapshots = spyOn(ManagedProcess.prototype, 'snapshot').mockImplementation(function (this: ManagedProcess) {
    const value = originalSnapshot.call(this)
    if (expectedUnits.has(value.unitId) && value.role === 'default' && value.phase === 'serving' && value.pid !== null)
      served.set(value.unitId, {
        owner: { unitId: value.unitId, generation: value.generation, incarnation: value.incarnation },
        pid: value.pid,
      })
    return value
  })
  try {
    runtime = await ProcessHostRuntime.create({
      layout,
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      noLocalExec: true,
      secrets: new MemorySecrets(),
      idleTimeoutMs: 200,
      diagnosticFullCoverage: true,
    })
    const managed = runtime
    const application = managed.controller.application
    if (!application) throw new Error('Actual Controller lifecycle missing')
    const workspace = (await managed.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Actual fixture workspace missing')
    await prepareFirstDriverExecution(managed, workspace.id, 'two-round-writer-initial-local-driver')
    const owners = new Map<string, RuntimeOwner>()
    // Local Driver completion may overlap another unit's original retirement.
    // Observe its real settled boundary before requiring the exact exit receipt.
    await until(() => {
      const units = managed.snapshot().units
      return (
        units.length === 15 &&
        units.every(
          (unit) =>
            unit.generations.some((value) => value.role === 'default' && value.phase === 'serving') ||
            unit.idle?.phase === 'sleeping',
        )
      )
    })
    const initial = managed.snapshot().units
    expect(initial).toHaveLength(15)
    for (const unit of initial) {
      const observed = served.get(unit.descriptor.id)
      if (!observed) throw new Error(`No actual serving owner observed: ${unit.descriptor.id}`)
      const selected = unit.generations.find((value) => value.role === 'default' && value.phase === 'serving')
      if (selected) expect(selected).toMatchObject({ ...observed.owner, pid: observed.pid })
      else {
        // Unrelated owners may already have slept while the first Driver ran.
        // Keep their observed identity and exact native/cleanup receipt; no wake.
        expect(unit.idle?.phase).toBe('sleeping')
        expect(managed.manager.retirement(observed.owner)).toMatchObject({
          status: 'retired',
          ownerCleanupCompleted: true,
          physical: { owner: observed.owner, childPid: observed.pid, nativeJoined: true, onExitCompleted: true },
        })
      }
      owners.set(unit.descriptor.id, { ...observed.owner })
    }
    const closure = new Set<string>()
    const include = (unitId: string): void => {
      if (closure.has(unitId)) return
      const descriptor = initial.find((unit) => unit.descriptor.id === unitId)?.descriptor
      if (!descriptor) throw new Error('Real cold-read descriptor missing')
      closure.add(unitId)
      descriptor.dependencies.forEach(include)
    }
    include('kernel')
    expect(closure.has('plugin.goal')).toBe(true)
    expect(closure.has('driver.pi')).toBe(false)
    await application.scheduleController.start()
    for (let round = 1; round <= 2; round++) {
      await until(() => {
        const units = managed.snapshot().units
        return units.length === 15 && units.every((unit) => unit.idle?.phase === 'sleeping')
      })
      const sleeping = managed.snapshot().units
      const checkpointSuccessors: Array<{ previous: RuntimeOwner; observed: RuntimeOwner; pid: number }> = []
      for (const [unitId, previous] of owners) {
        const latest = served.get(unitId)
        if (!latest) throw new Error('Latest actually served checkpoint owner missing')
        if (latest.owner.generation !== previous.generation || latest.owner.incarnation !== previous.incarnation)
          checkpointSuccessors.push({ previous, observed: latest.owner, pid: latest.pid })
        owners.set(unitId, { ...latest.owner })
      }
      expect(sleeping.every((unit) => unit.generations.length === 0 && unit.idle?.demandHolds === 0)).toBe(true)
      expect(managed.storage.snapshot()).toMatchObject({
        phase: 'waiting',
        owner: null,
        inFlight: 0,
        queued: 0,
        bufferedBytes: 0,
        queuedSessionCount: 0,
      })
      const physical = [...owners.values()].map((owner) => {
        const observed = served.get(owner.unitId)
        if (!observed) throw new Error('Exact retired owner PID observation missing')
        const receipt = managed.manager.retirement(owner)
        expect(receipt).toMatchObject({ owner, physical: { owner, childPid: observed.pid } })
        return receipt
      })
      for (const receipt of physical)
        expect(receipt).toMatchObject({
          status: 'retired',
          ownerCleanupCompleted: true,
          physical: { nativeJoined: true, onExitCompleted: true, forced: false, cleanDisposeAck: true, exitCode: 0 },
        })
      const storageOwner = owners.get('storage')
      if (!storageOwner) throw new Error('Retired real writer owner missing')
      // A separate public Storage actor must actually acquire this same database
      // after the old process, Worker and writer lease have acknowledged release.
      // No Host RPC runs until this writer has itself closed and joined.
      writer = new Storage(layout.database, layout)
      await writer.call('ready')
      const session = await writer.call('createSession', workspace.id, `writer-handoff-round-${round}`)
      expect((await writer.call('session', session.id)).id).toBe(session.id)
      await writer.close()
      writer = undefined
      for (let read = 0; read < 30; read++) managed.snapshot()
      await Bun.sleep(250)
      expect(managed.snapshot().units.every((unit) => unit.idle?.phase === 'sleeping')).toBe(true)
      expect(managed.storage.snapshot()).toMatchObject({ phase: 'waiting', owner: null })
      const started = performance.now()
      let firstReplyMs: number | undefined
      const replies = await Promise.all(
        Array.from({ length: 30 }, async () => {
          const reply = await managed.kernel.plugins.get('goal').get(session.id)
          firstReplyMs ??= performance.now() - started
          return reply
        }),
      )
      const waveMs = performance.now() - started
      expect(replies).toHaveLength(30)
      expect(replies.every((reply) => reply.goal === null)).toBe(true)
      expect(await managed.storage.call('session', session.id)).toMatchObject({
        id: session.id,
        title: `writer-handoff-round-${round}`,
      })
      const after = managed.snapshot().units
      for (const unit of after) {
        const old = owners.get(unit.descriptor.id)
        if (!old) throw new Error('Previously owned runtime unit missing')
        if (closure.has(unit.descriptor.id)) {
          const serving = unit.generations.filter((value) => value.role === 'default' && value.phase === 'serving')
          expect(serving).toHaveLength(1)
          const current = serving[0]
          if (!current) throw new Error('Actual cold owner missing')
          expect(current.generation).toBe(old.generation + 1)
          expect(current.incarnation).not.toBe(old.incarnation)
          owners.set(unit.descriptor.id, {
            unitId: unit.descriptor.id,
            generation: current.generation,
            incarnation: current.incarnation,
          })
        } else expect(unit).toMatchObject({ generations: [], idle: { phase: 'sleeping', demandHolds: 0 } })
      }
      const reopened = managed.storage.snapshot()
      const successor = owners.get('storage')
      if (!successor) throw new Error('Actual reopened writer owner missing')
      expect(reopened.phase).toBe('serving')
      expect(reopened.owner).toEqual(successor)
      expect(reopened.owner?.incarnation).not.toBe(storageOwner.incarnation)
      console.info(
        JSON.stringify({
          type: 'fullhost-all-module-writer-handoff-round',
          round,
          naturallySleepingUnits: sleeping.length,
          checkpointSuccessors,
          retiredWriter: storageOwner,
          retiredPhysical: physical,
          externalWriterCreatedSession: session.id,
          reopenedWriter: reopened.owner,
          coldClosure: [...closure],
          coldRequests: replies.length,
          firstReplyMs,
          waveMs,
          actualExternalModelRequests: 0,
          metrics: 'Observed latency only; no performance threshold asserted',
        }),
      )
    }
  } catch (error) {
    primary = { error }
  }
  const cleanup: unknown[] = []
  try {
    await writer?.close()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    await runtime?.close()
  } catch (error) {
    cleanup.push(error)
  }
  snapshots.mockRestore()
  if (!primary && cleanup.length === 0 && runtime) {
    expect(runtime.storage.snapshot().phase).toBe('closed')
    expect(runtime.coordinator.snapshot()).toMatchObject({ sessions: 0, physicalTools: 0, resources: 0 })
    const current = await realpath(root)
    if (current !== canonical || dirname(current) !== parent || !basename(current).startsWith('hbar-two-round-writer-'))
      throw new Error('Owned writer fixture root changed before cleanup')
    await rm(root, { recursive: true, force: true })
  }
  if (cleanup.length) {
    const errors = primary ? [primary.error, ...cleanup] : cleanup
    throw new AggregateError(errors, 'All-module writer handoff cleanup failed', { cause: errors[0] })
  }
  if (primary) throw primary.error
}, 120_000)
