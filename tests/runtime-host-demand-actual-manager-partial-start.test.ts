import { expect, test } from 'bun:test'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type { RuntimeGeneration, RuntimeOwner, RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import {
  RuntimeManager,
  type DemandClock,
  type ManagedGenerationPort,
  type ManagedIdleSnapshot,
  type RuntimeArtifact,
  type RuntimeArtifactSet,
  type RuntimeIdleRetirement,
  type RuntimePhysicalRetirementReceipt,
} from '@hbar/runtime'
import { HostRuntimeDemand } from '../apps/host/src/runtime-host-demand'

// Actual Manager + HostDemand; only the managed generation/physical proof is synthetic.
// This does not exercise native processes, IPC, SQLite, or a complete Host.
class Clock implements DemandClock {
  private time = 0
  private readonly timers = new Set<{ callback(): void; at: number }>()
  now(): number {
    return this.time
  }
  schedule(callback: () => void, delayMs: number) {
    const timer = { callback, at: this.time + delayMs }
    this.timers.add(timer)
    return {
      cancel: () => {
        this.timers.delete(timer)
      },
    }
  }
  advance(ms: number): void {
    this.time += ms
    for (const timer of [...this.timers]) {
      if (timer.at > this.time) continue
      this.timers.delete(timer)
      timer.callback()
    }
  }
}

function sameOwner(left: RuntimeOwner, right: RuntimeOwner): boolean {
  return left.unitId === right.unitId && left.generation === right.generation && left.incarnation === right.incarnation
}

function gate() {
  let release: () => void = () => {
    throw new Error('Fixture gate not initialized')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

class Generation implements ManagedGenerationPort {
  readonly state: RuntimeGeneration
  activations = 0
  private physical: RuntimePhysicalRetirementReceipt | null = null
  constructor(
    readonly artifact: RuntimeArtifact,
    generation: number,
    private readonly changed: () => void,
    private readonly activationEntered: () => void,
    private readonly activationRelease: Promise<void>,
  ) {
    this.state = {
      unitId: artifact.unitId,
      generation,
      incarnation: `${artifact.unitId}-${generation}`,
      artifactId: artifact.id,
      role: 'candidate',
      phase: 'preparing',
      pid: 100 + generation,
      references: { runs: 0, resources: 0, requests: 0 },
      lastHeartbeatAt: null,
      failures: 0,
      nextAttemptAt: null,
      reasonCode: null,
    }
  }
  owner(): RuntimeOwner {
    return { unitId: this.state.unitId, generation: this.state.generation, incarnation: this.state.incarnation }
  }
  snapshot(): RuntimeGeneration {
    return structuredClone(this.state)
  }
  references(runs: number, resources: number): void {
    this.state.references.runs = runs
    this.state.references.resources = resources
  }
  prepare(): Promise<void> {
    this.state.phase = 'ready'
    this.changed()
    return Promise.resolve()
  }
  activate(): Promise<void> {
    this.activations++
    this.state.role = 'default'
    if (this.state.unitId === 'plugin' && this.state.generation === 2) {
      // Failure occurs only after Manager.create + prepare + activation dispatch.
      this.activationEntered()
      return this.activationRelease.then(() => {
        this.state.phase = 'failed'
        this.changed()
        throw new HbarError('FIXTURE_ACTIVATION_FAILURE', 'Synthetic dispatched activation failed')
      })
    }
    this.state.phase = 'serving'
    this.changed()
    return Promise.resolve()
  }
  drain(): Promise<{ runs: number; resources: number; requests: number }> {
    this.state.phase = 'draining'
    return Promise.resolve({ runs: 0, resources: 0, requests: 0 })
  }
  dispose(): Promise<void> {
    this.observePhysicalExit(this.owner())
    return Promise.resolve()
  }
  // Injected evidence belongs only to this fake managed process, not to Manager.
  observePhysicalExit(receiptOwner: RuntimeOwner): void {
    this.state.phase = 'disposed'
    this.state.pid = null
    this.physical = {
      owner: structuredClone(receiptOwner),
      childPid: 100 + this.state.generation,
      exitCode: 0,
      nativeJoined: true,
      onExitCompleted: true,
      forced: false,
      cleanDisposeAck: true,
    }
  }
  retirementReceipt(_expectedOwner: RuntimeOwner): RuntimePhysicalRetirementReceipt | null {
    // Deliberately return injected evidence verbatim: actual Manager must reject
    // wrong-owner evidence rather than relying on this fixture to filter it.
    return this.physical ? structuredClone(this.physical) : null
  }
  call<Output>(_method: string, input: unknown, output: z.ZodType<Output>): Promise<Output> {
    return Promise.resolve(output.parse(input))
  }
  idleSnapshot(): Promise<ManagedIdleSnapshot> {
    const ipc = {
      inFlight: 0,
      waiting: 0,
      queued: 0,
      queuedBytes: 0,
      incoming: 0,
      incomingWaiting: 0,
      incomingQueued: 0,
      incomingBytes: 0,
      bufferedBytes: 0,
      failed: false,
    }
    return Promise.resolve({
      owner: this.owner(),
      phase: this.state.phase,
      runs: 0,
      resources: 0,
      parent: ipc,
      child: { eligible: true, requests: 0, runs: 0, resources: 0, ipc },
      eligible: this.state.phase === 'serving',
    })
  }
  retireIdle(expectedOwner: RuntimeOwner): Promise<RuntimeIdleRetirement> {
    if (!sameOwner(expectedOwner, this.owner())) {
      return Promise.resolve({ status: 'unknown', owner: this.owner(), reasonCode: 'RUNTIME_IDLE_OWNER_CHANGED' })
    }
    this.observePhysicalExit(this.owner())
    return Promise.resolve({
      status: 'confirmed-physical-exit',
      owner: this.owner(),
      childPid: 100 + this.state.generation,
      exitCode: 0,
      disposalAcknowledged: true,
      nativeJoined: true,
    })
  }
}

function descriptor(id: string, dependencies: string[] = []): RuntimeUnitDescriptor {
  return {
    id,
    dependencies,
    kind: 'plugin',
    isolation: 'process',
    required: true,
    reloadable: true,
    contractFingerprint: 'a'.repeat(64),
    storageSchema: 23,
  }
}

function waitForSleeping(manager: RuntimeManager, unitId: string) {
  let unsubscribe: () => void = () => {}
  const ready = new Promise<void>((resolve) => {
    const inspect = () => {
      if (manager.snapshot().units.find((unit) => unit.descriptor.id === unitId)?.idle?.phase !== 'sleeping') return
      unsubscribe()
      resolve()
    }
    unsubscribe = manager.subscribe(inspect)
    inspect()
  })
  return { ready, dispose: () => unsubscribe() }
}

test('actual Manager preserves serving dependency and quarantines dispatched failed startup until exact proof', async () => {
  const descriptors = [descriptor('storage'), descriptor('plugin', ['storage'])]
  const artifacts: RuntimeArtifact[] = descriptors.map((value) => ({
    id: (value.id === 'storage' ? 'b' : 'c').repeat(64),
    unitId: value.id,
    descriptor: value,
    entry: 'unit.js',
    files: [{ name: 'unit.js', sha256: 'a'.repeat(64) }],
    inputs: [],
    resources: [],
    resourceFiles: [],
  }))
  const set: RuntimeArtifactSet = { id: 'partial-start-set', createdAt: 1, artifacts }
  const created: Generation[] = []
  const cleaned: RuntimeOwner[] = []
  const activationEntered = gate()
  const activationRelease = gate()
  const manager = new RuntimeManager({
    instanceId: 'partial-start-fixture',
    sweepMs: 60_000,
    artifacts: {
      artifactSet: (id) => {
        if (id !== set.id) throw new Error('Fixture artifact set missing')
        return set
      },
      preparedSets: () => [set.id],
    },
    references: () => ({ runs: 0, resources: 0, tools: 0 }),
    afterDispose: (owner) => {
      cleaned.push(structuredClone(owner))
      return Promise.resolve()
    },
    create: (artifact, generation, changed) => {
      const value = new Generation(artifact, generation, changed, activationEntered.release, activationRelease.promise)
      created.push(value)
      return value
    },
  })
  const clock = new Clock()
  const demand = new HostRuntimeDemand({ manager, units: descriptors, clock, idleTimeoutMs: 10 })
  const signal = new AbortController().signal
  const releases: (() => void)[] = []
  let cancelSleepingWait: (() => void) | undefined
  let primaryFailed = false
  let primary: unknown
  let acquisition: Promise<unknown> | undefined
  try {
    for (const value of descriptors) manager.register(value)
    const { operationId } = manager.reload(
      set.id,
      descriptors.map((value) => value.id),
      true,
    )
    await manager.reconcile()
    if (manager.getReload(operationId).phase !== 'completed') await manager.reconcile()
    expect(manager.getReload(operationId).phase).toBe('completed')
    expect(manager.snapshot().ready).toBe(true)
    await demand.adoptServing(signal)
    const storageHold = await demand.acquire(['storage'], signal)
    releases.push(() => storageHold.release())
    const oldStorage = manager.defaultOwner('storage')
    const sleeping = waitForSleeping(manager, 'plugin')
    cancelSleepingWait = sleeping.dispose
    clock.advance(10)
    await sleeping.ready
    expect(manager.defaultOwner('storage')).toEqual(oldStorage)

    acquisition = demand.acquire(['plugin'], signal).then(
      (hold) => {
        releases.push(() => hold.release())
        return null
      },
      (error: unknown) => error,
    )
    await activationEntered.promise
    expect(demand.snapshot().pendingAdmissions).toBeGreaterThan(0)
    expect(manager.snapshot().units.every((unit) => (unit.idle?.demandHolds ?? 0) > 0)).toBe(true)
    expect(manager.defaultOwner('storage')).toEqual(oldStorage)
    expect(created.filter((value) => value.state.unitId === 'plugin')).toHaveLength(2)
    activationRelease.release()
    const failure = await acquisition
    expect(failure).toHaveProperty('code', 'BLOCKED')
    const failed = created.find((value) => value.state.unitId === 'plugin' && value.state.generation === 2)
    if (!failed) throw new Error('Dispatched failed generation missing')
    expect(failed.activations).toBe(1)
    const owner = failed.owner()
    const pending = demand.pendingSettlements()
    expect(pending).toHaveLength(1)
    const attempt = pending[0]
    if (!attempt) throw new Error('Retained startup attempt missing')
    expect(attempt).toMatchObject({ kind: 'start', unitId: 'plugin' })
    expect(attempt.attemptId.length).toBeGreaterThan(0)
    const proof = await manager.reconcileDemandHold(attempt.attemptId)
    expect(proof).toMatchObject({ attemptId: attempt.attemptId, canRelease: false, settlement: { status: 'unknown' } })
    expect(proof.settlement.units).toEqual([
      { unitId: 'storage', owner: oldStorage, dispatch: 'not-started' },
      { unitId: 'plugin', owner, dispatch: 'started' },
    ])
    expect(demand.snapshot().unresolvedStarts).toBe(1)
    expect(manager.snapshot().units.every((unit) => (unit.idle?.demandHolds ?? 0) > 0)).toBe(true)
    expect(() => demand.beginReload(['plugin'])).toThrow()
    await expect(manager.reconcileDemandHold(`${attempt.attemptId}-wrong`)).rejects.toHaveProperty(
      'code',
      'RUNTIME_DEMAND_ATTEMPT_NOT_FOUND',
    )

    failed.observePhysicalExit({ ...owner, incarnation: `${owner.incarnation}-wrong` })
    expect((await manager.reconcileDemandHold(attempt.attemptId)).canRelease).toBe(false)
    await demand.reconcileRetirements()
    expect(demand.pendingSettlements()).toEqual(pending)
    expect(demand.snapshot().unresolvedStarts).toBe(1)
    expect(manager.retirement(owner).status).toBe('unverified')
    expect(cleaned.some((value) => sameOwner(value, owner))).toBe(false)
    expect(created.filter((value) => value.state.unitId === 'plugin')).toHaveLength(2)
    expect(manager.defaultOwner('storage')).toEqual(oldStorage)

    failed.observePhysicalExit(owner)
    await demand.reconcileRetirements()
    expect(demand.pendingSettlements()).toEqual([])
    expect(demand.snapshot().unresolvedStarts).toBe(0)
    expect(cleaned.filter((value) => sameOwner(value, owner))).toHaveLength(1)
    expect(manager.defaultOwner('storage')).toEqual(oldStorage)
    expect(created.filter((value) => value.state.unitId === 'storage')).toHaveLength(1)
    // Read-only proof reconciliation must not itself start another generation.
    expect(created.filter((value) => value.state.unitId === 'plugin')).toHaveLength(2)
    expect(failed.activations).toBe(1)
    const recovered = await demand.acquire(['plugin'], signal)
    releases.push(() => recovered.release())
    expect(recovered.owners.find((value) => value.unitId === 'storage')).toEqual(oldStorage)
    expect(recovered.owners.find((value) => value.unitId === 'plugin')?.generation).toBe(3)
    expect(failed.activations).toBe(1)
  } catch (error) {
    primaryFailed = true
    primary = error
  }
  cancelSleepingWait?.()
  activationRelease.release()
  await acquisition
  demand.stop()
  for (const release of releases.reverse()) release()
  let cleanup: unknown
  let cleanupFailed = false
  try {
    await manager.close()
  } catch (error) {
    cleanupFailed = true
    cleanup = error
  }
  if (primaryFailed && cleanupFailed) throw new AggregateError([primary, cleanup], 'Test and Manager cleanup failed')
  if (primaryFailed) throw primary
  if (cleanupFailed) throw cleanup
})
