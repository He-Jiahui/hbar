import { afterEach, expect, test } from 'bun:test'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type { RuntimeGeneration, RuntimeOwner, RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import {
  RuntimeManager,
  type ManagedGenerationPort,
  type ManagedIdleSnapshot,
  type RuntimeIdleRetirement,
  type RuntimeArtifact,
  type RuntimeArtifactSet,
  type RuntimePhysicalRetirementReceipt,
  type RuntimeManagerOptions,
} from '@hbar/runtime'

// These are Manager state-machine tests. Fake retirement is not native physical-exit evidence.
const managers: RuntimeManager[] = []
afterEach(async () => {
  for (const manager of managers.splice(0)) await manager.close()
})
const fingerprint = 'a'.repeat(64)
function descriptor(id: string, dependencies: string[] = []): RuntimeUnitDescriptor {
  return {
    id,
    dependencies,
    kind: 'plugin',
    isolation: 'process',
    required: true,
    reloadable: true,
    contractFingerprint: fingerprint,
    storageSchema: 23,
  }
}
function gate() {
  let release: () => void = () => {
    throw new Error('Gate not initialized')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}
class Generation implements ManagedGenerationPort {
  readonly state: RuntimeGeneration
  retireCalls = 0
  activations = 0
  disposals = 0
  retirement: 'confirmed' | 'unknown' | 'busy' = 'confirmed'
  physical: RuntimePhysicalRetirementReceipt | null = null
  openResource = false
  prepareGate: Promise<void> | undefined
  retireGate: Promise<void> | undefined
  constructor(
    readonly artifact: RuntimeArtifact,
    generation: number,
    readonly changed: () => void,
    readonly purpose?: 'idle-wake',
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
  async prepare(): Promise<void> {
    await this.prepareGate
    this.state.phase = 'ready'
    this.changed()
  }
  activate(): Promise<void> {
    this.activations++
    this.state.phase = 'serving'
    this.state.role = 'default'
    this.changed()
    return Promise.resolve()
  }
  drain(): Promise<{ runs: number; resources: number; requests: number }> {
    this.state.phase = 'draining'
    return Promise.resolve({ runs: 0, resources: 0, requests: 0 })
  }
  dispose(): Promise<void> {
    this.disposals++
    this.confirmPhysical()
    return Promise.resolve()
  }
  confirmPhysical(forced = false, cleanDisposeAck = true): void {
    this.state.phase = 'disposed'
    this.state.pid = null
    this.physical = {
      owner: this.owner(),
      childPid: 100 + this.state.generation,
      exitCode: 0,
      nativeJoined: true,
      onExitCompleted: true,
      forced,
      cleanDisposeAck,
    }
  }
  retirementReceipt(expectedOwner: RuntimeOwner): RuntimePhysicalRetirementReceipt | null {
    return this.physical && JSON.stringify(this.physical.owner) === JSON.stringify(expectedOwner)
      ? structuredClone(this.physical)
      : null
  }
  call<Output>(_method: string, input: unknown, output: z.ZodType<Output>): Promise<Output> {
    return Promise.resolve(output.parse(input))
  }
  idleSnapshot(): Promise<ManagedIdleSnapshot> {
    const ipc = {
      inFlight: 0,
      queued: 0,
      queuedBytes: 0,
      incoming: 0,
      incomingQueued: 0,
      incomingBytes: 0,
      bufferedBytes: 0,
      failed: false,
    }
    const resources = this.openResource ? 1 : 0
    return Promise.resolve({
      owner: this.owner(),
      phase: this.state.phase,
      runs: 0,
      resources,
      parent: ipc,
      child: { eligible: !this.openResource, requests: 0, runs: 0, resources, ipc },
      eligible: this.state.phase === 'serving' && !this.openResource,
    })
  }
  async retireIdle(_owner: RuntimeOwner): Promise<RuntimeIdleRetirement> {
    this.retireCalls++
    await this.retireGate
    if (this.retirement === 'unknown')
      return { status: 'unknown', owner: this.owner(), reasonCode: 'RUNTIME_IDLE_BOUNDARY_UNKNOWN' }
    if (this.retirement === 'busy') return { status: 'busy', owner: this.owner(), reasonCode: 'RUNTIME_IDLE_BUSY' }
    this.confirmPhysical()
    return {
      status: 'confirmed-physical-exit',
      owner: this.owner(),
      childPid: 100 + this.state.generation,
      exitCode: 0,
      disposalAcknowledged: true,
      nativeJoined: true,
    }
  }
}
async function fixture(
  options: {
    cleanup?: (owner: RuntimeOwner) => Promise<void>
    dependencies?: boolean
    wakePrepareGate?: Promise<void>
    beforeIdle?: RuntimeManagerOptions['beforeIdle']
    afterIdle?: RuntimeManagerOptions['afterIdle']
    idleCheckpointMs?: number
  } = {},
) {
  const created: Generation[] = []
  const refs = { runs: 0, resources: 0, tools: 0 }
  const descriptors = options.dependencies
    ? [descriptor('storage'), descriptor('plugin', ['storage'])]
    : [descriptor('plugin')]
  const artifacts: RuntimeArtifact[] = descriptors.map((value) => ({
    id: (value.id === 'storage' ? 'b' : 'c').repeat(64),
    unitId: value.id,
    descriptor: value,
    entry: 'unit.js',
    files: [{ name: 'unit.js', sha256: fingerprint }],
    inputs: [],
    resources: [],
    resourceFiles: [],
  }))
  const set: RuntimeArtifactSet = { id: 'fixture-set', createdAt: 1, artifacts }
  const sets = new Map([[set.id, set]])
  const manager = new RuntimeManager({
    instanceId: 'idle-fixture',
    sweepMs: 60_000,
    artifacts: {
      artifactSet: (id) => {
        const value = sets.get(id)
        if (!value) throw new Error('Fixture artifact set missing')
        return value
      },
      preparedSets: () => [...sets.keys()],
    },
    references: () => ({ ...refs }),
    ...(options.cleanup ? { afterDispose: options.cleanup } : {}),
    ...(options.beforeIdle ? { beforeIdle: options.beforeIdle } : {}),
    ...(options.afterIdle ? { afterIdle: options.afterIdle } : {}),
    ...(options.idleCheckpointMs ? { idleCheckpointMs: options.idleCheckpointMs } : {}),
    create: (artifact, generation, changed, purpose) => {
      const value = new Generation(artifact, generation, changed, purpose)
      if (generation > 1) value.prepareGate = options.wakePrepareGate
      created.push(value)
      return value
    },
  })
  managers.push(manager)
  for (const value of descriptors) manager.register(value)
  const { operationId } = manager.reload(
    set.id,
    descriptors.map((value) => value.id),
    true,
  )
  await manager.reconcile()
  // A ready unit may yield while another target is still preparing. One reconcile
  // settles that preparation round; the next activates the now-ready group.
  if (manager.getReload(operationId).phase !== 'completed') await manager.reconcile()
  expect(manager.getReload(operationId)).toMatchObject({
    phase: 'completed',
    units: descriptors.map((value) => ({ unitId: value.id, phase: 'completed' })),
  })
  expect(manager.snapshot().ready).toBe(true)
  for (const value of descriptors) manager.setIdleEnabled(value.id, true)
  const plugin = created.find((value) => value.state.unitId === 'plugin')
  if (!plugin) throw new Error('Fixture plugin missing')
  return { manager, created, refs, plugin, set, sets }
}

test('adopt serving default; synchronous dependency holds protect pending admission and release once', async () => {
  const { manager, created, plugin, set } = await fixture({ dependencies: true })
  const hold = manager.holdDemand(['plugin'])
  expect(manager.snapshot().units.map((unit) => unit.idle?.demandHolds)).toEqual([1, 1])
  expect(await manager.retireIdle('plugin', plugin.owner())).toBe('busy')
  expect(() => manager.reload(set.id, ['plugin'])).toThrow('Demand admission pins')
  const owners = await hold.ready
  expect(owners.map((owner) => owner.unitId)).toEqual(['storage', 'plugin'])
  expect(created.length).toBe(2)
  hold.release()
  hold.release()
  expect(manager.snapshot().units.map((unit) => unit.idle?.demandHolds)).toEqual([0, 0])
})

test('physical confirmation is insufficient until afterDispose settles; wake creates a fresh generation from selected bytes', async () => {
  const cleanup = gate()
  const { manager, created, plugin } = await fixture({ cleanup: () => cleanup.promise })
  const sleeping = manager.retireIdle('plugin', plugin.owner())
  // Let read-only probe and retire settle, leaving cleanup deliberately pending.
  for (let i = 0; i < 12; i++) await Promise.resolve()
  expect(manager.snapshot().units[0]?.idle?.phase).toBe('retiring')
  expect(manager.snapshot().units[0]?.generations.length).toBe(1)
  cleanup.release()
  expect(await sleeping).toBe('sleeping')
  expect(manager.snapshot().ready).toBe(true)
  expect(manager.snapshot().units[0]?.generations.length).toBe(0)
  expect(() => manager.defaultOwner('plugin')).toThrow('unavailable')
  const hold = manager.holdDemand(['plugin'])
  const owners = await hold.ready
  expect(owners[0]?.generation).toBe(2)
  expect(owners[0]?.incarnation).not.toBe(plugin.owner().incarnation)
  expect(created[1]?.artifact.id).toBe(plugin.artifact.id)
  expect(plugin.activations).toBe(1)
  expect(created[1]?.activations).toBe(1)
  expect(created[1]?.purpose).toBe('idle-wake')
  hold.release()
})

test('unknown retirement retains owner, blocks replacement and leaves failed demand held', async () => {
  const { manager, plugin, set, created } = await fixture()
  plugin.retirement = 'unknown'
  expect(await manager.retireIdle('plugin', plugin.owner())).toBe('unknown')
  expect(manager.snapshot().ready).toBe(false)
  expect(manager.snapshot().units[0]?.generations[0]?.incarnation).toBe(plugin.owner().incarnation)
  expect(() => manager.reload(set.id, ['plugin'])).toThrow('Unresolved idle owner')
  const hold = manager.holdDemand(['plugin'])
  let failure: unknown
  try {
    await hold.ready
  } catch (error) {
    failure = error
  }
  expect(failure).toMatchObject({ code: 'RUNTIME_EXIT_UNKNOWN' })
  expect(manager.snapshot().units[0]?.idle?.demandHolds).toBe(1)
  expect(created.length).toBe(1)
  hold.release()
})

test('afterDispose failure retains physically exited owner and prevents a replacement', async () => {
  const { manager, plugin, set } = await fixture({
    cleanup: () => Promise.reject(new HbarError('FIXTURE_CLEANUP', 'Owner cleanup failed')),
  })
  expect(await manager.retireIdle('plugin', plugin.owner())).toBe('unknown')
  expect(manager.snapshot().units[0]?.generations.length).toBe(1)
  expect(() => manager.reload(set.id, ['plugin'])).toThrow('Unresolved idle owner')
})

test('Host aggregate leases and queued retire calls never double-retire an owner', async () => {
  const { manager, plugin, refs } = await fixture()
  refs.runs = 1
  expect(await manager.retireIdle('plugin', plugin.owner())).toBe('busy')
  expect(plugin.retireCalls).toBe(0)
  refs.runs = 0
  const results = await Promise.all([
    manager.retireIdle('plugin', plugin.owner()),
    manager.retireIdle('plugin', plugin.owner()),
  ])
  expect(results).toEqual(['sleeping', 'retired'])
  expect(plugin.retireCalls).toBe(1)
})

test('close prevents a late wake from activating and disposes its new candidate', async () => {
  const preparing = gate()
  const { manager, plugin, created } = await fixture({ wakePrepareGate: preparing.promise })
  expect(await manager.retireIdle('plugin', plugin.owner())).toBe('sleeping')
  const hold = manager.holdDemand(['plugin'])
  for (let i = 0; i < 40 && created.length < 2; i++) await Promise.resolve()
  expect(created.length).toBe(2)
  // The child has been constructed and preparation is pending. Close seals late activation.
  const closed = manager.close()
  preparing.release()
  let failure: unknown
  try {
    await hold.ready
  } catch (error) {
    failure = error
  }
  await closed
  expect(failure).toMatchObject({ code: 'RUNTIME_STOPPING' })
  expect(created[1]?.activations).toBe(0)
  expect(created[1]?.disposals).toBe(1)
  hold.release()
})

test('Storage checkpoint sees the real open resource before the final eligible probe', async () => {
  const order: string[] = []
  let checkpointGeneration: Generation | undefined
  const f = await fixture({
    beforeIdle: async (owner, generation) => {
      const probe = await generation.idleSnapshot?.()
      expect(probe?.resources).toBe(1)
      expect(probe?.eligible).toBe(false)
      order.push('checkpoint')
      const instance = checkpointGeneration
      if (!instance) throw new Error('Checkpoint fixture owner missing')
      expect(instance.owner()).toEqual(owner)
      instance.openResource = false
      return { status: 'prepared', owner }
    },
    cleanup: () => {
      order.push('cleanup')
      return Promise.resolve()
    },
    afterIdle: (_owner, status) => {
      order.push(status)
      return Promise.resolve()
    },
  })
  checkpointGeneration = f.plugin
  f.plugin.openResource = true
  expect(await f.manager.retireIdle('plugin', f.plugin.owner())).toBe('sleeping')
  expect(order).toEqual(['checkpoint', 'cleanup', 'confirmed-physical-exit'])
  expect(f.manager.retirement(f.plugin.owner())).toMatchObject({ status: 'retired', ownerCleanupCompleted: true })
})

test('prepared checkpoint followed by process busy is UNKNOWN; a noop busy remains retryable', async () => {
  const prepared = await fixture({ beforeIdle: (owner) => Promise.resolve({ status: 'prepared', owner }) })
  prepared.plugin.retirement = 'busy'
  expect(await prepared.manager.retireIdle('plugin', prepared.plugin.owner())).toBe('unknown')
  expect(prepared.manager.snapshot().units[0]?.idle?.phase).toBe('unknown')
  const noop = await fixture({ beforeIdle: (owner) => Promise.resolve({ status: 'noop', owner }) })
  noop.plugin.retirement = 'busy'
  expect(await noop.manager.retireIdle('plugin', noop.plugin.owner())).toBe('busy')
  expect(noop.manager.snapshot().units[0]?.idle?.phase).toBe('active')
})

test('hot reload retirement proves old A without calling the current B sleeping; acknowledgement is exact', async () => {
  const f = await fixture()
  const old = f.plugin.owner()
  const replacement: RuntimeArtifactSet = {
    id: 'next-set',
    createdAt: 2,
    artifacts: f.set.artifacts.map((value) => ({ ...value, id: 'd'.repeat(64) })),
  }
  f.sets.set(replacement.id, replacement)
  const operation = f.manager.reload(replacement.id, ['plugin'])
  await f.manager.reconcile()
  expect(f.manager.getReload(operation.operationId).phase).toBe('completed')
  expect(f.manager.defaultOwner('plugin').generation).toBe(2)
  expect(f.manager.retirement(old)).toMatchObject({
    status: 'retired',
    owner: old,
    physical: { nativeJoined: true, onExitCompleted: true },
    ownerCleanupCompleted: true,
  })
  expect(await f.manager.retireIdle('plugin', old)).toBe('retired')
  expect(f.manager.snapshot().units[0]?.idle?.phase).toBe('active')
  expect(f.manager.defaultOwner('plugin').generation).toBe(2)
  const wrong = { ...old, incarnation: 'wrong-incarnation' }
  expect(f.manager.retirement(wrong).status).toBe('unverified')
  expect(f.manager.acknowledgeRetirement(wrong)).toBe(false)
  expect(f.manager.acknowledgeRetirement(old)).toBe(true)
  expect(f.manager.retirement(old).status).toBe('unverified')
})

test('same-owner reconciliation requires a physical clean receipt and successful owner cleanup', async () => {
  const f = await fixture()
  f.plugin.retirement = 'unknown'
  expect(await f.manager.retireIdle('plugin', f.plugin.owner())).toBe('unknown')
  expect(await f.manager.reconcileIdle(f.plugin.owner())).toBe('unknown')
  expect(await f.manager.reconcileIdle({ ...f.plugin.owner(), incarnation: 'wrong-incarnation' })).toBe('unknown')
  f.plugin.confirmPhysical()
  expect(await f.manager.reconcileIdle(f.plugin.owner())).toBe('sleeping')
  expect(f.created.length).toBe(1)
  expect(f.manager.retirement(f.plugin.owner()).status).toBe('retired')
  const unclean = await fixture()
  unclean.plugin.retirement = 'unknown'
  expect(await unclean.manager.retireIdle('plugin', unclean.plugin.owner())).toBe('unknown')
  unclean.plugin.confirmPhysical(true, false)
  expect(await unclean.manager.reconcileIdle(unclean.plugin.owner())).toBe('unknown')
  expect(unclean.manager.retirement(unclean.plugin.owner()).status).toBe('unverified')
  expect(unclean.manager.snapshot().units[0]?.generations.length).toBe(1)
})

test('checkpoint timeout retains pending action and prevents reconciliation until it really settles', async () => {
  const pending = gate()
  const f = await fixture({
    idleCheckpointMs: 5,
    beforeIdle: async (owner) => {
      await pending.promise
      return { status: 'prepared', owner }
    },
  })
  expect(await f.manager.retireIdle('plugin', f.plugin.owner())).toBe('unknown')
  expect(f.manager.snapshot().units[0]?.idle?.checkpointPending).toBe(true)
  f.plugin.confirmPhysical()
  expect(await f.manager.reconcileIdle(f.plugin.owner())).toBe('unknown')
  pending.release()
  for (let i = 0; i < 12; i++) await Promise.resolve()
  expect(f.manager.snapshot().units[0]?.idle?.checkpointPending).toBe(false)
  expect(await f.manager.reconcileIdle(f.plugin.owner())).toBe('sleeping')
})

test('hold settlement binds adoption without inventing a startup and returns detached metadata', async () => {
  const f = await fixture()
  const hold = f.manager.holdDemand(['plugin'])
  expect(hold.settlement().status).toBe('pending')
  expect((await f.manager.reconcileDemandHold(hold.attemptId)).canRelease).toBe(false)
  await hold.ready
  expect(hold.settlement()).toMatchObject({
    attemptId: hold.attemptId,
    status: 'settled',
    units: [{ unitId: 'plugin', owner: f.plugin.owner(), dispatch: 'not-started' }],
  })
  expect((await f.manager.reconcileDemandHold(hold.attemptId)).canRelease).toBe(true)
  let missing: unknown
  try {
    await f.manager.reconcileDemandHold('unknown-attempt')
  } catch (error) {
    missing = error
  }
  expect(missing).toMatchObject({ code: 'RUNTIME_DEMAND_ATTEMPT_NOT_FOUND' })
  hold.release()
  let released: unknown
  try {
    await f.manager.reconcileDemandHold(hold.attemptId)
  } catch (error) {
    released = error
  }
  expect(released).toMatchObject({ code: 'RUNTIME_DEMAND_ATTEMPT_NOT_FOUND' })
})

test('a completed real wake remains physically outstanding until its exact retirement proof exists', async () => {
  const f = await fixture()
  expect(await f.manager.retireIdle('plugin', f.plugin.owner())).toBe('sleeping')
  const hold = f.manager.holdDemand(['plugin'])
  const owners = await hold.ready
  expect(hold.settlement()).toMatchObject({
    status: 'settled',
    units: [{ unitId: 'plugin', owner: owners[0], dispatch: 'started' }],
  })
  expect((await f.manager.reconcileDemandHold(hold.attemptId)).canRelease).toBe(false)
  expect(await f.manager.retireIdle('plugin', owners[0] ?? f.plugin.owner())).toBe('busy')
  const awakened = f.created[1]
  if (!awakened) throw new Error('Wake fixture owner missing')
  awakened.confirmPhysical()
  expect((await f.manager.reconcileDemandHold(hold.attemptId)).canRelease).toBe(true)
  expect(f.manager.snapshot().units[0]?.idle?.phase).toBe('sleeping')
  expect(f.manager.snapshot().units[0]?.idle?.demandHolds).toBe(1)
  hold.release()
})

test('failed no-dispatch admission has an explicit safe release proof and keeps its registry until release', async () => {
  const f = await fixture()
  f.plugin.retirement = 'unknown'
  expect(await f.manager.retireIdle('plugin', f.plugin.owner())).toBe('unknown')
  const hold = f.manager.holdDemand(['plugin'])
  let failure: unknown
  try {
    await hold.ready
  } catch (error) {
    failure = error
  }
  expect(failure).toMatchObject({ code: 'RUNTIME_EXIT_UNKNOWN' })
  expect(hold.settlement()).toMatchObject({
    status: 'unknown',
    units: [{ unitId: 'plugin', owner: null, dispatch: 'not-started' }],
  })
  expect((await f.manager.reconcileDemandHold(hold.attemptId)).canRelease).toBe(true)
  expect(f.manager.snapshot().units[0]?.idle?.phase).toBe('unknown')
  expect(f.manager.snapshot().units[0]?.idle?.demandHolds).toBe(1)
  hold.release()
})
