import { expect, test } from 'bun:test'
import { z } from 'zod'
import type { RuntimeGeneration, RuntimeOwner, RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import {
  RuntimeManager,
  type ManagedGenerationPort,
  type ManagedIdleSnapshot,
  type RuntimeArtifact,
  type RuntimeIdleRetirement,
  type RuntimePhysicalRetirementReceipt,
} from '@hbar/runtime'
import { HostRuntimeDemand } from '../apps/host/src/runtime-host-demand'

// Actual Manager + HostDemand. Only process state/native evidence is synthetic.
// No native process, Host, IPC, SQLite or automatic recovery is claimed by this test.
class RecoveringGeneration implements ManagedGenerationPort {
  readonly state: RuntimeGeneration
  proof: RuntimePhysicalRetirementReceipt | null = null
  acknowledgements = 0
  acknowledgeAllowed = true
  nativeJoined = true
  onExitCompleted = true
  constructor(
    artifact: RuntimeArtifact,
    generation: number,
    private readonly changed: () => void,
  ) {
    this.state = {
      unitId: artifact.unitId,
      artifactId: artifact.id,
      generation,
      incarnation: 'old-owner',
      role: 'candidate',
      phase: 'preparing',
      pid: 100,
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
    this.state.phase = 'serving'
    this.state.role = 'default'
    this.changed()
    return Promise.resolve()
  }
  drain(): Promise<{ runs: number; resources: number; requests: number }> {
    return Promise.resolve({ runs: 0, resources: 0, requests: 0 })
  }
  dispose(): Promise<void> {
    this.state.phase = 'disposed'
    this.state.pid = null
    return Promise.resolve()
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
    return Promise.resolve({
      owner: this.owner(),
      phase: this.state.phase,
      runs: 0,
      resources: 0,
      parent: ipc,
      child: { eligible: true, requests: 0, runs: 0, resources: 0, ipc },
      eligible: true,
    })
  }
  retireIdle(): Promise<RuntimeIdleRetirement> {
    return Promise.resolve({ status: 'unknown', owner: this.owner(), reasonCode: 'RUNTIME_IDLE_BOUNDARY_UNKNOWN' })
  }
  retirementReceipt(): RuntimePhysicalRetirementReceipt | null {
    // The public receipt DTO requires literal true for both proofs. An incomplete
    // producer exposes absence, never an invalid DTO cast to a completed receipt.
    return this.proof && this.nativeJoined && this.onExitCompleted ? structuredClone(this.proof) : null
  }
  acknowledgeRetirement(owner: RuntimeOwner): boolean {
    if (!this.acknowledgeAllowed || this.proof?.owner.incarnation !== owner.incarnation) return false
    this.acknowledgements++
    this.proof = null
    return true
  }
  recover(incarnation = 'successor-owner'): void {
    this.state.incarnation = incarnation
    this.state.pid = 101
    this.changed()
  }
}

test('ordinary recovery retains exact old proof until Demand reconciles and normally admits the successor', async () => {
  const descriptor: RuntimeUnitDescriptor = {
    id: 'kernel',
    kind: 'kernel',
    isolation: 'process',
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: 'c'.repeat(64),
    storageSchema: 23,
  }
  const artifact: RuntimeArtifact = {
    id: 'a'.repeat(64),
    unitId: 'kernel',
    descriptor,
    entry: 'unit.js',
    files: [{ name: 'unit.js', sha256: 'b'.repeat(64) }],
    inputs: [],
    resources: [],
    resourceFiles: [],
  }
  const set = { id: 'recovery-proof-set', createdAt: 1, artifacts: [artifact] }
  let generation: RecoveringGeneration | undefined
  let permitted = false,
    oldRuns = 0,
    cleanups = 0
  let cleanupFails = false
  let cleanupGate: Promise<void> | undefined
  let enteredCleanup = (): void => {}
  const manager = new RuntimeManager({
    instanceId: 'recovery-proof',
    sweepMs: 60_000,
    artifacts: { artifactSet: () => set, preparedSets: () => [set.id] },
    references: () => ({ runs: oldRuns, tools: 0, resources: 0 }),
    canConsumeRetirement: () => permitted,
    afterDispose: async () => {
      enteredCleanup()
      await cleanupGate
      if (cleanupFails) throw new Error('Synthetic owner cleanup failed')
      cleanups++
    },
    create: (value, number, changed) => {
      generation = new RecoveringGeneration(value, number, changed)
      return generation
    },
  })
  const demand = new HostRuntimeDemand({
    manager,
    units: [descriptor],
    clock: { now: () => 0, schedule: () => ({ cancel() {} }) },
  })
  const signal = new AbortController().signal
  try {
    manager.register(descriptor)
    manager.reload(set.id, ['kernel'], true)
    await manager.reconcile()
    await demand.adoptServing(signal)
    if (!generation) throw new Error('Actual Manager did not construct its generation port')
    const process = generation
    const old = process.owner()
    demand.fence(old)
    process.recover()
    const successor = process.owner()
    const exact: RuntimePhysicalRetirementReceipt = {
      owner: old,
      childPid: 100,
      exitCode: 1,
      forced: true,
      cleanDisposeAck: false,
      nativeJoined: true,
      onExitCompleted: true,
    }
    expect(demand.admissionReady()).toBe(false)
    expect(await manager.consumeRetirementReceipt(process, old)).toBe(false)
    expect(manager.retirement(old).status).toBe('unverified')
    permitted = true
    for (const proof of [
      { ...exact, owner: { ...old, incarnation: 'wrong-owner' } },
      { ...exact, owner: { ...old, generation: old.generation + 1 } },
    ]) {
      process.proof = proof
      expect(await manager.consumeRetirementReceipt(process, old)).toBe(false)
      expect(manager.retirement(old).status).toBe('unverified')
      expect(demand.admissionReady()).toBe(false)
    }
    process.proof = exact
    for (const missing of ['nativeJoined', 'onExitCompleted'] as const) {
      process[missing] = false
      expect(process.retirementReceipt()).toBeNull()
      expect(await manager.consumeRetirementReceipt(process, old)).toBe(false)
      expect(manager.retirement(old).status).toBe('unverified')
      expect(process.proof).toEqual(exact)
      expect(process.acknowledgements).toBe(0)
      expect(demand.admissionReady()).toBe(false)
      process[missing] = true
    }
    oldRuns = 1
    expect(await manager.consumeRetirementReceipt(process, old)).toBe(false)
    expect(cleanups).toBe(0)
    oldRuns = 0
    cleanupFails = true
    await expect(manager.consumeRetirementReceipt(process, old)).rejects.toThrow('Synthetic owner cleanup failed')
    expect(manager.retirement(old).status).toBe('unverified')
    expect(process.proof).toEqual(exact)
    expect(process.acknowledgements).toBe(0)
    expect(demand.admissionReady()).toBe(false)
    expect(cleanups).toBe(0)
    cleanupFails = false
    let finishCleanup = (): void => {
      throw new Error('Cleanup gate is not initialized')
    }
    cleanupGate = new Promise<void>((resolve) => {
      finishCleanup = resolve
    })
    const cleanupEntered = new Promise<void>((resolve) => {
      enteredCleanup = resolve
    })
    const pendingCleanup = manager.consumeRetirementReceipt(process, old)
    try {
      await cleanupEntered
      expect(manager.retirement(old).status).toBe('unverified')
      expect(process.proof).toEqual(exact)
      expect(process.acknowledgements).toBe(0)
      expect(demand.admissionReady()).toBe(false)
      expect(cleanups).toBe(0)
    } finally {
      finishCleanup()
    }
    expect(await pendingCleanup).toBe(false)
    cleanupGate = undefined
    enteredCleanup = () => {}
    expect(manager.retirement(old)).toMatchObject({
      status: 'retired',
      owner: old,
      ownerCleanupCompleted: true,
      physical: { owner: old, exitCode: 1, forced: true, cleanDisposeAck: false },
    })
    expect(process.acknowledgements).toBe(0)
    expect(process.proof).toEqual(exact)
    expect(await manager.consumeRetirementReceipt(process, old)).toBe(false)
    await demand.reconcileRetirements()
    expect(demand.admissionReady()).toBe(true)
    expect(process.acknowledgements).toBe(0)
    const hold = await demand.acquire(['kernel'], signal)
    expect(hold.owners).toEqual([successor])
    hold.release()
    process.acknowledgeAllowed = false
    expect(await manager.consumeRetirementReceipt(process, old)).toBe(false)
    expect(manager.retirement(old).status).toBe('retired')
    process.acknowledgeAllowed = true
    expect(await manager.consumeRetirementReceipt(process, old)).toBe(true)
    expect(process.acknowledgements).toBe(1)
    expect(manager.retirement(old).status).toBe('unverified')
    expect(manager.defaultOwner('kernel')).toEqual(successor)
    expect(cleanups).toBe(1)
    // Capacity is observed through 1024 independently identified old receipts,
    // not private-map writes. Only this synthetic producer bypasses native limits.
    const firstCapacityOwner = process.owner()
    demand.fence(firstCapacityOwner)
    for (let index = 0; index < 1024; index++) {
      const retiredOwner = process.owner()
      process.proof = { ...exact, owner: retiredOwner }
      process.recover(`capacity-successor-${index}`)
      expect(await manager.consumeRetirementReceipt(process, retiredOwner)).toBe(false)
      expect(manager.retirement(retiredOwner).status).toBe('retired')
    }
    const overflowOwner = process.owner()
    const overflowProof = { ...exact, owner: overflowOwner }
    process.proof = overflowProof
    process.recover('capacity-overflow-successor')
    const beforeCapacityCleanup = cleanups
    expect(await manager.consumeRetirementReceipt(process, overflowOwner)).toBe(false)
    expect(manager.retirement(overflowOwner).status).toBe('unverified')
    expect(manager.retirement(firstCapacityOwner).status).toBe('retired')
    expect(process.proof).toEqual(overflowProof)
    expect(process.acknowledgements).toBe(1)
    expect(demand.admissionReady()).toBe(false)
    expect(cleanups).toBe(beforeCapacityCleanup)
  } finally {
    demand.stop()
    await manager.close()
  }
}, 30_000)
