import { afterEach, expect, spyOn, test } from 'bun:test'
import { z } from 'zod'
import type { RuntimeGeneration, RuntimeOwner, RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import {
  RuntimeManager,
  type ManagedGenerationPort,
  type ManagedIdleSnapshot,
  type RuntimeArtifact,
  type RuntimeArtifactSet,
  type RuntimeIdleRetirement,
} from '@hbar/runtime'
import { HostRuntimeDemand } from '../apps/host/src/runtime-host-demand'

// Actual Manager + HostDemand. Synthetic children only: no native/IPC/Host memory qualification.
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  const errors: unknown[] = []
  for (const close of cleanup.splice(0).reverse()) {
    try {
      await close()
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Deferred Driver fixture cleanup failed')
})
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
  readonly idleSnapshot?: () => Promise<ManagedIdleSnapshot>
  constructor(
    artifact: RuntimeArtifact,
    generation: number,
    private readonly changed: () => void,
    private readonly preparation: Promise<void> | undefined,
    supported: boolean,
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
    if (supported)
      this.idleSnapshot = () => {
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
          child: { eligible: true, runs: 0, requests: 0, resources: 0, ipc },
          eligible: this.state.phase === 'serving',
        })
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
    await this.preparation
    this.state.phase = 'ready'
    this.changed()
  }
  activate(role: 'default' | 'draining' = 'default'): Promise<void> {
    this.state.role = role
    this.state.phase = role === 'default' ? 'serving' : 'draining'
    this.changed()
    return Promise.resolve()
  }
  drain(): Promise<{ runs: number; resources: number; requests: number }> {
    this.state.role = 'draining'
    this.state.phase = 'draining'
    this.changed()
    return Promise.resolve({ runs: 0, resources: 0, requests: 0 })
  }
  dispose(): Promise<void> {
    this.state.phase = 'disposed'
    this.state.pid = null
    this.changed()
    return Promise.resolve()
  }
  call<Output>(_method: string, input: unknown, output: z.ZodType<Output>): Promise<Output> {
    return Promise.resolve(output.parse(input))
  }
  retireIdle(): Promise<RuntimeIdleRetirement> {
    return Promise.resolve({ status: 'unknown', owner: this.owner(), reasonCode: 'RUNTIME_IDLE_BOUNDARY_UNKNOWN' })
  }
  retirementReceipt(): null {
    return null
  }
}
function descriptor(id: string, kind: RuntimeUnitDescriptor['kind']): RuntimeUnitDescriptor {
  return {
    id,
    kind,
    isolation: 'process',
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: 'a'.repeat(64),
    storageSchema: 23,
  }
}
async function fixture(
  options: { unsupportedDriver?: boolean; preparation?: Promise<void>; storageDependencies?: string[] } = {},
) {
  const units = [
    { ...descriptor('storage', 'storage'), dependencies: options.storageDependencies ?? [] },
    descriptor('driver.pi', 'driver'),
  ]
  const artifacts: RuntimeArtifact[] = units.map((unit, index) => ({
    id: String(index + 1).repeat(64),
    unitId: unit.id,
    descriptor: unit,
    entry: 'unit.js',
    files: [{ name: 'unit.js', sha256: 'a'.repeat(64) }],
    inputs: [],
    resources: [],
    resourceFiles: [],
  }))
  const set: RuntimeArtifactSet = { id: 'deferred-driver-set', createdAt: 1, artifacts }
  const created: Generation[] = []
  const driverCreated = gate()
  const manager = new RuntimeManager({
    instanceId: 'deferred-driver-fixture',
    sweepMs: 60_000,
    artifacts: {
      artifactSet: (id) => {
        if (id !== set.id) throw new Error('Fixture set missing')
        return set
      },
      preparedSets: () => [set.id],
    },
    references: () => ({ runs: 0, resources: 0, tools: 0 }),
    create(artifact, generation, changed) {
      const driver = artifact.unitId === 'driver.pi'
      const child = new Generation(
        artifact,
        generation,
        changed,
        driver ? options.preparation : undefined,
        !driver || !options.unsupportedDriver,
      )
      created.push(child)
      if (driver) driverCreated.release()
      return child
    },
  })
  const demands: HostRuntimeDemand[] = []
  cleanup.push(async () => {
    for (const demand of demands) demand.stop()
    await manager.close()
  })
  for (const unit of units) manager.register(unit)
  const reload = manager.reload(set.id, ['storage'], true)
  await manager.reconcile()
  expect(manager.getReload(reload.operationId).phase).toBe('completed')
  manager.stageInitialDriver(set.id, 'driver.pi')
  const selected = artifacts.find((value) => value.unitId === 'driver.pi')
  if (!selected) throw new Error('Fixture Driver artifact missing')
  const selection = { unitId: 'driver.pi', selectedArtifactId: selected.id }
  const createDemand = (descriptors: readonly RuntimeUnitDescriptor[] = units) => {
    const demand = new HostRuntimeDemand({ manager, units: descriptors, idleTimeoutMs: 60_000 })
    demands.push(demand)
    return demand
  }
  return { manager, created, units, selection, createDemand, driverCreated, set }
}
const signal = () => new AbortController().signal

// Synthetic Manager retirement replies exercise the Host admission boundary.
// The four real startup recovery cases independently cover actual child exit.
function retiredBootstrapOwner(
  owner: RuntimeOwner,
  physicalOwner: RuntimeOwner = owner,
): ReturnType<RuntimeManager['retirement']> {
  return {
    status: 'retired',
    owner: { ...owner },
    physical: {
      owner: { ...physicalOwner },
      childPid: 4242,
      exitCode: 1,
      nativeJoined: true,
      onExitCompleted: true,
      forced: true,
      cleanDisposeAck: false,
    },
    ownerCleanupCompleted: true,
    retiredAt: 1,
  }
}

test('a cold serving successor cannot clear an unverified or mismatched old-owner fault', async () => {
  const f = await fixture()
  const demand = f.createDemand()
  const old: RuntimeOwner = { unitId: 'storage', generation: 1, incarnation: 'old-bootstrap-storage' }
  const wrong = { ...old, incarnation: 'different-bootstrap-storage' }
  let proof: ReturnType<RuntimeManager['retirement']> = { status: 'unverified', owner: old }
  let canAcknowledge = false
  const retirement = spyOn(f.manager, 'retirement').mockImplementation(() => proof)
  const acknowledge = spyOn(f.manager, 'acknowledgeRetirement').mockImplementation(() => canAcknowledge)
  try {
    demand.fence(old)
    demand.fence(old)
    for (const next of [
      proof,
      retiredBootstrapOwner(wrong),
      retiredBootstrapOwner(old, wrong),
      retiredBootstrapOwner(old),
    ]) {
      proof = next
      await demand.reconcileRetirements()
      await expect(demand.acquireBootstrap(['storage'], signal())).rejects.toThrow(
        'Runtime default transition requires retry after retirement',
      )
      expect(f.manager.snapshot().units.find((unit) => unit.descriptor.id === 'storage')?.idle?.demandHolds).toBe(0)
    }
    expect(acknowledge).toHaveBeenCalledTimes(1)
    canAcknowledge = true
    await demand.reconcileRetirements()
    const hold = await demand.acquireBootstrap(['storage'], signal())
    try {
      expect(hold.owners).toEqual([f.manager.defaultOwner('storage')])
    } finally {
      hold.release()
    }
    await demand.adoptServing(signal(), f.selection)
    expect(demand.admissionReady()).toBe(true)
    expect(f.created.map((child) => child.state.unitId)).toEqual(['storage'])
    expect(acknowledge).toHaveBeenCalledTimes(2)
  } finally {
    retirement.mockRestore()
    acknowledge.mockRestore()
  }
})

test('cold retirement waits for every exact failed incarnation before admitting its existing successor', async () => {
  const f = await fixture()
  const demand = f.createDemand()
  const first: RuntimeOwner = { unitId: 'storage', generation: 1, incarnation: 'first-failed-bootstrap' }
  const second = { ...first, incarnation: 'second-failed-bootstrap' }
  const completed = new Set([first.incarnation])
  const retirement = spyOn(f.manager, 'retirement').mockImplementation((owner) =>
    completed.has(owner.incarnation) ? retiredBootstrapOwner(owner) : { status: 'unverified', owner },
  )
  const acknowledged: RuntimeOwner[] = []
  const acknowledge = spyOn(f.manager, 'acknowledgeRetirement').mockImplementation((owner) => {
    acknowledged.push({ ...owner })
    return true
  })
  try {
    demand.fence(first)
    demand.fence(second)
    await demand.reconcileRetirements()
    expect(acknowledged).toEqual([first])
    await expect(demand.acquireBootstrap(['storage'], signal())).rejects.toThrow(
      'Runtime default transition requires retry after retirement',
    )
    completed.add(second.incarnation)
    await demand.reconcileRetirements()
    const hold = await demand.acquireBootstrap(['storage'], signal())
    hold.release()
    expect(acknowledged).toEqual([first, second])
    expect(f.created.map((child) => child.state.unitId)).toEqual(['storage'])
  } finally {
    retirement.mockRestore()
    acknowledge.mockRestore()
  }
})

test('cold fault evidence capacity stays fenced even when all retained owners report retirement', async () => {
  const f = await fixture()
  const demand = f.createDemand()
  const retirement = spyOn(f.manager, 'retirement').mockImplementation((owner) => retiredBootstrapOwner(owner))
  const acknowledge = spyOn(f.manager, 'acknowledgeRetirement').mockReturnValue(true)
  try {
    for (let attempt = 0; attempt < 129; attempt++)
      demand.fence({ unitId: 'storage', generation: 1, incarnation: `bootstrap-fault-${attempt}` })
    await demand.reconcileRetirements()
    expect(acknowledge).toHaveBeenCalledTimes(128)
    await expect(demand.acquireBootstrap(['storage'], signal())).rejects.toThrow(
      'Runtime default transition requires retry after retirement',
    )
    expect(f.created.map((child) => child.state.unitId)).toEqual(['storage'])
    expect(demand.admissionReady()).toBe(false)
  } finally {
    retirement.mockRestore()
    acknowledge.mockRestore()
  }
})

test('explicit deferred adoption and repeated metadata leave Driver genuinely unstarted', async () => {
  const f = await fixture()
  const demand = f.createDemand()
  await demand.adoptServing(signal(), f.selection)
  await demand.adoptServing(signal(), f.selection)
  for (let read = 0; read < 10; read++) {
    expect(demand.admissionReady()).toBe(true)
    expect(f.manager.snapshot().units.find((unit) => unit.descriptor.id === 'driver.pi')).toMatchObject({
      generations: [],
      idle: { phase: 'dormant', enabled: false, demandHolds: 0, selectedArtifactId: f.selection.selectedArtifactId },
    })
    expect(demand.snapshot().unresolvedStarts).toBe(0)
  }
  await f.manager.reconcile()
  expect(f.created.map((child) => child.state.unitId)).toEqual(['storage'])
  expect(f.manager.snapshot().ready).toBe(false)
  await expect(demand.adoptServing(signal())).rejects.toThrow('Bootstrap selection cannot change during adoption')
})

test('ordinary adoption still rejects missing Driver and explicit selection rejects wrong facts', async () => {
  const f = await fixture()
  await expect(f.createDemand().adoptServing(signal())).rejects.toThrow('Serving bootstrap ownership is incomplete')
  for (const selection of [
    { ...f.selection, selectedArtifactId: 'f'.repeat(64) },
    { unitId: 'storage', selectedArtifactId: '1'.repeat(64) },
  ]) {
    await expect(f.createDemand().adoptServing(signal(), selection)).rejects.toThrow(
      'Explicit deferred Driver is not an exact unowned selection',
    )
  }
  const driver = f.units.find((unit) => unit.id === 'driver.pi')
  if (!driver) throw new Error('Fixture descriptor missing')
  const mismatched = f.units.map((unit) => (unit.id === driver.id ? { ...unit, storageSchema: 24 } : unit))
  await expect(f.createDemand(mismatched).adoptServing(signal(), f.selection)).rejects.toThrow(
    'Explicit deferred Driver is not an exact unowned selection',
  )
  const dependent = f.units.map((unit) => (unit.id === 'storage' ? { ...unit, dependencies: ['driver.pi'] } : unit))
  await expect(f.createDemand(dependent).adoptServing(signal(), f.selection)).rejects.toThrow(
    'Serving bootstrap depends on the deferred Driver',
  )
  expect(f.created).toHaveLength(1)
})

test('already started Driver cannot be adopted as an ownerless bootstrap selection', async () => {
  const f = await fixture()
  const hold = f.manager.holdDemand(['driver.pi'])
  try {
    await hold.ready
    await expect(f.createDemand().adoptServing(signal(), f.selection)).rejects.toThrow(
      'Explicit deferred Driver is not an exact unowned selection',
    )
    expect(f.created.filter((child) => child.state.unitId === 'driver.pi')).toHaveLength(1)
  } finally {
    hold.release()
  }
})

test('concurrent first demand installs idle on the exact serving Driver while its original Manager hold remains', async () => {
  const preparation = gate()
  const f = await fixture({ preparation: preparation.promise })
  const demand = f.createDemand()
  await demand.adoptServing(signal(), f.selection)
  const enable = f.manager.setIdleEnabled.bind(f.manager)
  const installed: Array<{ holds: number; owner: RuntimeOwner }> = []
  const spy = spyOn(f.manager, 'setIdleEnabled').mockImplementation((id, enabled) => {
    if (id === 'driver.pi' && enabled) {
      const unit = f.manager.snapshot().units.find((value) => value.descriptor.id === id)
      const owner = unit?.generations.find((value) => value.role === 'default' && value.phase === 'serving')
      if (!owner) throw new Error('Idle installed before serving owner')
      installed.push({ holds: unit?.idle?.demandHolds ?? 0, owner })
    }
    enable(id, enabled)
  })
  const acquisitions = [demand.acquire(['driver.pi'], signal()), demand.acquire(['driver.pi'], signal())]
  void Promise.allSettled(acquisitions)
  try {
    await f.driverCreated.promise
    expect(f.manager.snapshot().units.find((unit) => unit.descriptor.id === 'driver.pi')?.idle?.enabled).toBe(false)
    preparation.release()
    const results = await Promise.all(acquisitions)
    expect(results[0]?.owners).toEqual(results[1]?.owners)
    expect(installed).toHaveLength(1)
    expect(installed[0]?.holds).toBeGreaterThan(0)
    const owner = results[0]?.owners.find((value) => value.unitId === 'driver.pi')
    if (!owner) throw new Error('First demand returned no Driver owner')
    expect(installed[0]?.owner).toMatchObject(owner)
    expect(f.created.filter((child) => child.state.unitId === 'driver.pi')).toHaveLength(1)
    expect(f.manager.snapshot().units.find((unit) => unit.descriptor.id === 'driver.pi')?.idle?.enabled).toBe(true)
  } finally {
    preparation.release()
    try {
      for (const result of await Promise.allSettled(acquisitions))
        if (result.status === 'fulfilled') result.value.release()
    } finally {
      spy.mockRestore()
    }
  }
})

test('real unsupported idle protocol after first startup keeps physical admission fenced without replay', async () => {
  const f = await fixture({ unsupportedDriver: true })
  const demand = f.createDemand()
  await demand.adoptServing(signal(), f.selection)
  await expect(demand.acquire(['driver.pi'], signal())).rejects.toThrow('BLOCKED')
  expect(demand.snapshot().unresolvedStarts).toBe(1)
  expect(demand.admissionReady()).toBe(false)
  expect(f.manager.snapshot().units.find((unit) => unit.descriptor.id === 'driver.pi')).toMatchObject({
    idle: { phase: 'active', enabled: false, demandHolds: 1 },
  })
  await demand.reconcileRetirements()
  await expect(demand.acquire(['driver.pi'], signal())).rejects.toThrow('BLOCKED')
  expect(demand.snapshot().unresolvedStarts).toBe(1)
  expect(f.created.filter((child) => child.state.unitId === 'driver.pi')).toHaveLength(1)
  // The synthetic child's dispose supplies no native proof; no failed hold is released here.
})
test('Manager serving dependency hidden by Host descriptors is rejected before any Driver bootstrap demand', async () => {
  const f = await fixture({ storageDependencies: ['driver.pi'] })
  const hidden = f.units.map((unit) => (unit.id === 'storage' ? { ...unit, dependencies: [] } : unit))
  const demand = f.createDemand(hidden)
  await expect(demand.adoptServing(signal(), f.selection)).rejects.toThrow(
    'Deferred bootstrap serving descriptor differs from Manager',
  )
  expect(demand.admissionReady()).toBe(false)
  expect(f.created.map((child) => child.state.unitId)).toEqual(['storage'])
  expect(f.manager.snapshot().units.find((unit) => unit.descriptor.id === 'driver.pi')).toMatchObject({
    generations: [],
    queuedArtifactId: null,
    idle: { phase: 'dormant', selectedArtifactId: f.selection.selectedArtifactId, enabled: false, demandHolds: 0 },
  })
})
