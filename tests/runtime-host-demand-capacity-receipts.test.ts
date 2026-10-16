import { afterEach, expect, test } from 'bun:test'
import { runtimeSnapshotSchema, type RuntimeOwner, type RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import type { DemandClock, RuntimeManager } from '@hbar/runtime'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { HostRuntimeDemand } from '../apps/host/src/runtime-host-demand'

type Manager = Pick<
  RuntimeManager,
  | 'holdDemand'
  | 'retireIdle'
  | 'setIdleEnabled'
  | 'snapshot'
  | 'retirement'
  | 'acknowledgeRetirement'
  | 'reconcileIdle'
  | 'reconcileDemandHold'
>
const active: HostRuntimeDemand[] = []
afterEach(() => {
  for (const demand of active.splice(0)) demand.stop()
})
class Clock implements DemandClock {
  time = 0
  readonly timers = new Set<{ callback(): void; at: number }>()
  now() {
    return this.time
  }
  schedule(callback: () => void, delayMs: number) {
    const value = { callback, at: this.time + delayMs }
    this.timers.add(value)
    return {
      cancel: () => {
        this.timers.delete(value)
      },
    }
  }
  advance(ms: number) {
    this.time += ms
    for (const timer of [...this.timers])
      if (timer.at <= this.time) {
        this.timers.delete(timer)
        timer.callback()
      }
  }
}
async function pump() {
  for (let i = 0; i < 64; i++) await Promise.resolve()
}
function fixture() {
  const clock = new Clock(),
    receipts = new Map<string, ReturnType<Manager['retirement']>>()
  const descriptor: RuntimeUnitDescriptor = {
    id: 'plugin',
    kind: 'plugin',
    isolation: 'process',
    required: true,
    reloadable: true,
    contractFingerprint: 'a'.repeat(64),
    storageSchema: STORAGE_SCHEMA_VERSION,
    dependencies: [],
  }
  let generation = 1,
    starts = 0,
    holds = 0,
    attempt = 0,
    acknowledgements = 0
  let current: RuntimeOwner | null = { unitId: 'plugin', generation, incarnation: 'owner-1' }
  const manager: Manager = {
    holdDemand() {
      const dispatched = current === null
      if (!current) {
        generation++
        starts++
        current = { unitId: 'plugin', generation, incarnation: 'owner-' + generation }
      }
      const owner = current,
        attemptId = 'attempt-' + ++attempt
      holds++
      let released = false
      return {
        attemptId,
        ready: Promise.resolve([owner]),
        settlement: () => ({
          attemptId,
          status: 'settled',
          units: [{ unitId: 'plugin', owner, dispatch: dispatched ? 'started' : 'not-started' }],
        }),
        release() {
          if (!released) {
            released = true
            holds--
          }
        },
      }
    },
    retireIdle(_unitId, owner) {
      if (holds || receipts.size >= 1 || current?.incarnation !== owner.incarnation) return Promise.resolve('busy')
      receipts.set(owner.incarnation, {
        status: 'retired',
        owner,
        retiredAt: clock.now(),
        ownerCleanupCompleted: true,
        physical: {
          owner,
          childPid: 1,
          exitCode: 0,
          nativeJoined: true,
          onExitCompleted: true,
          forced: false,
          cleanDisposeAck: true,
        },
      })
      current = null
      return Promise.resolve('sleeping')
    },
    retirement(owner) {
      return receipts.get(owner.incarnation) ?? { status: 'unverified', owner }
    },
    acknowledgeRetirement(owner) {
      const removed = receipts.delete(owner.incarnation)
      if (removed) acknowledgements++
      return removed
    },
    reconcileIdle: () => Promise.resolve('unknown'),
    reconcileDemandHold() {
      throw new Error('No failed hold belongs to this fixture')
    },
    setIdleEnabled() {
      /* Policy is represented by the actual Host coordinator clock. */
    },
    snapshot: () =>
      runtimeSnapshotSchema.parse({
        revision: generation,
        instanceId: 'capacity-fixture',
        ready: true,
        preparedArtifactSets: [],
        units: [
          {
            descriptor,
            queuedArtifactId: null,
            generations: current
              ? [
                  {
                    ...current,
                    artifactId: 'a'.repeat(64),
                    role: 'default',
                    phase: 'serving',
                    pid: 1,
                    references: { runs: 0, resources: 0, requests: 0 },
                    lastHeartbeatAt: null,
                    failures: 0,
                    nextAttemptAt: null,
                    reasonCode: null,
                  },
                ]
              : [],
          },
        ],
      }),
  }
  const demand = new HostRuntimeDemand({ manager, units: [descriptor], clock, idleTimeoutMs: 10 })
  active.push(demand)
  return {
    demand,
    manager,
    clock,
    receipts,
    get holds() {
      return holds
    },
    get starts() {
      return starts
    },
    get acknowledgements() {
      return acknowledgements
    },
  }
}

test('30 outer and 30 nested admissions share one owner; 129th rejects without leaking', async () => {
  const h = fixture(),
    signal = new AbortController().signal
  await h.demand.adoptServing(signal)
  const outer = await Promise.all(Array.from({ length: 30 }, () => h.demand.acquire(['plugin'], signal)))
  const nested = await Promise.all(Array.from({ length: 30 }, () => h.demand.acquire(['plugin'], signal)))
  const remaining = await Promise.all(Array.from({ length: 68 }, () => h.demand.acquire(['plugin'], signal)))
  const all = [...outer, ...nested, ...remaining]
  try {
    expect(h.holds).toBe(128)
    expect(h.demand.snapshot().units[0]?.pins).toBe(128)
    expect(new Set(all.flatMap((hold) => hold.owners.map((owner) => owner.incarnation))).size).toBe(1)
    expect(h.starts).toBe(0)
    await expect(h.demand.acquire(['plugin'], signal)).rejects.toHaveProperty('code', 'RUNTIME_DEMAND_CAPACITY')
    expect(h.holds).toBe(128)
  } finally {
    for (const hold of all) {
      hold.release()
      hold.release()
    }
  }
  expect(h.holds).toBe(0)
  expect(h.demand.snapshot().pendingAdmissions).toBe(0)
  expect(h.demand.snapshot().units[0]?.pins).toBe(0)
})

test('normal TTL keeps old receipt while sleeping and ACKs only after replacement adoption for 1025 cycles', async () => {
  const h = fixture(),
    signal = new AbortController().signal
  await h.demand.adoptServing(signal)
  for (let cycle = 0; cycle < 1025; cycle++) {
    h.clock.advance(10)
    await pump()
    expect(h.demand.snapshot().units[0]?.phase).toBe('sleeping')
    expect(h.receipts.size).toBe(1)
    expect(h.acknowledgements).toBe(cycle)
    // Repeated metadata inspection must retain sleeping proof and never wake.
    h.demand.snapshot()
    h.demand.snapshot()
    expect(h.starts).toBe(cycle)
    const hold = await h.demand.acquire(['plugin'], signal)
    try {
      expect(h.receipts.size).toBe(0)
      expect(h.acknowledgements).toBe(cycle + 1)
      expect(h.starts).toBe(cycle + 1)
    } finally {
      hold.release()
    }
  }
  expect(h.holds).toBe(0)
})

test('cancelling a shared startup waiter releases its admission but not the pending physical startup hold', async () => {
  const h = fixture(),
    abort = new AbortController()
  await h.demand.adoptServing(new AbortController().signal)
  h.clock.advance(10)
  await pump()
  expect(h.demand.snapshot().units[0]?.phase).toBe('sleeping')
  const original = h.manager.holdDemand.bind(h.manager)
  let finish: (() => void) | undefined, entered: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  h.manager.holdDemand = (ids) => {
    const hold = original(ids)
    entered?.()
    return { ...hold, ready: gate.then(() => hold.ready) }
  }
  const acquisition = h.demand.acquire(['plugin'], abort.signal)
  const outcome = acquisition.catch((error: unknown) => error)
  try {
    await started
    expect(h.holds).toBe(1)
    abort.abort()
    await expect(outcome).resolves.toHaveProperty('code', 'ABORTED')
    expect(h.demand.snapshot().pendingAdmissions).toBe(0)
    expect(h.demand.snapshot().units[0]?.waiters).toBe(0)
    expect(h.holds).toBe(1)
    expect(h.demand.snapshot().units[0]?.phase).toBe('starting')
    finish?.()
    await pump()
    expect(h.holds).toBe(0)
    expect(h.starts).toBe(1)
    expect(h.demand.snapshot().units[0]?.pins).toBe(0)
  } finally {
    finish?.()
    await pump()
  }
})

test('failed outer readiness quarantines its exact attempt until matching nonpending release proof', async () => {
  const h = fixture(),
    signal = new AbortController().signal
  await h.demand.adoptServing(signal)
  const original = h.manager.holdDemand.bind(h.manager)
  let held: ReturnType<Manager['holdDemand']> | undefined
  const readHeld = (): ReturnType<Manager['holdDemand']> | undefined => held
  const failure = new Error('SYNTHETIC_READINESS_UNKNOWN')
  h.manager.holdDemand = (ids) => {
    const hold = original(ids)
    held = hold
    return { ...hold, ready: Promise.reject(failure) }
  }
  let proofMode: 'pending' | 'wrong' | 'exact' = 'pending'
  h.manager.reconcileDemandHold = (attemptId) => {
    if (!held || attemptId !== held.attemptId) throw new Error('Unexpected reconciliation attempt')
    const settlement = held.settlement()
    return Promise.resolve({
      attemptId: proofMode === 'wrong' ? 'another-attempt' : attemptId,
      canRelease: proofMode !== 'pending',
      settlement: { ...settlement, status: proofMode === 'pending' ? 'pending' : 'settled' },
    })
  }
  await expect(h.demand.acquire(['plugin'], signal)).rejects.toBe(failure)
  const failedHold = readHeld()
  if (!failedHold) throw new Error('Missing failed Manager admission')
  expect(h.demand.pendingSettlements()).toEqual([
    { kind: 'admission', attemptId: failedHold.attemptId, unitId: null, coreAttempt: null },
  ])
  expect(h.demand.snapshot().unresolvedAdmissions).toBe(1)
  expect(h.holds).toBe(1)
  expect(() => h.demand.beginReload(['plugin'])).toThrow()
  await h.demand.reconcileRetirements()
  expect(h.holds).toBe(1)
  proofMode = 'wrong'
  await h.demand.reconcileRetirements()
  expect(h.holds).toBe(1)
  expect(h.demand.snapshot().unresolvedAdmissions).toBe(1)
  proofMode = 'exact'
  await h.demand.reconcileRetirements()
  expect(h.holds).toBe(0)
  expect(h.demand.snapshot().unresolvedAdmissions).toBe(0)
  expect(h.demand.pendingSettlements()).toEqual([])
  expect(h.starts).toBe(0)
  // Releasing this abandoned admission does not certify the existing owner's exit.
  await expect(h.demand.acquire(['plugin'], signal)).rejects.toHaveProperty('code', 'BLOCKED')
})

test('reload reservation abort is reversible; committed barrier and metadata reconciliation never start a process', async () => {
  const h = fixture(),
    signal = new AbortController().signal
  await h.demand.adoptServing(signal)
  const reserve = h.demand.beginReload(['plugin'])
  await expect(h.demand.acquire(['plugin'], signal)).rejects.toHaveProperty('code', 'RUNTIME_RECOVERING')
  expect(h.holds).toBe(0)
  reserve.abortBeforeDispatch()
  const usable = await h.demand.acquire(['plugin'], signal)
  usable.release()
  const committed = h.demand.beginReload(['plugin'])
  committed.commit('exact-reload-operation')
  expect(() => committed.abortBeforeDispatch()).toThrow()
  const snapshot = h.demand.snapshot()
  expect(snapshot.units[0]?.phase).toBe('blocked')
  for (let i = 0; i < 3; i++) {
    h.demand.snapshot()
    h.demand.pendingSettlements()
    await h.demand.reconcileRetirements()
  }
  expect(h.demand.snapshot()).toEqual(snapshot)
  expect(h.starts).toBe(0)
  expect(h.holds).toBe(0)
  await expect(h.demand.acquire(['plugin'], signal)).rejects.toHaveProperty('code', 'RUNTIME_RECOVERING')
})

test('unknown startup keeps its exact failed start pin until independent owner retirement and attempt proof agree', async () => {
  const h = fixture(),
    signal = new AbortController().signal
  await h.demand.adoptServing(signal)
  h.clock.advance(10)
  await pump()
  const original = h.manager.holdDemand.bind(h.manager)
  let held: ReturnType<Manager['holdDemand']> | undefined
  const readHeld = (): ReturnType<Manager['holdDemand']> | undefined => held
  h.manager.holdDemand = (ids) => {
    const hold = original(ids)
    held = hold
    return { ...hold, ready: Promise.reject(new Error('SYNTHETIC_PARTIAL_START_UNKNOWN')) }
  }
  let confirmed = false
  h.manager.reconcileDemandHold = (attemptId) => {
    if (!held || attemptId !== held.attemptId) throw new Error('Unexpected startup attempt')
    return Promise.resolve({ attemptId, canRelease: confirmed, settlement: held.settlement() })
  }
  await expect(h.demand.acquire(['plugin'], signal)).rejects.toHaveProperty('code', 'BLOCKED')
  const failedHold = readHeld()
  if (!failedHold) throw new Error('Missing exact failed startup hold')
  const actual = failedHold.settlement(),
    started = actual.units[0]
  if (!started?.owner) throw new Error('Missing startup owner')
  expect(started.dispatch).toBe('started')
  expect(h.demand.pendingSettlements()).toEqual([
    { kind: 'start', attemptId: failedHold.attemptId, unitId: 'plugin', coreAttempt: 2 },
  ])
  expect(h.demand.snapshot().unresolvedStarts).toBe(1)
  expect(h.holds).toBe(1)
  await h.demand.reconcileRetirements()
  expect(h.holds).toBe(1)
  // Explicit fake-ledger retirement is fixture evidence only, never native proof.
  h.receipts.set(started.owner.incarnation, {
    status: 'retired',
    owner: started.owner,
    retiredAt: h.clock.now(),
    ownerCleanupCompleted: true,
    physical: {
      owner: started.owner,
      childPid: 2,
      exitCode: 0,
      nativeJoined: true,
      onExitCompleted: true,
      forced: false,
      cleanDisposeAck: true,
    },
  })
  confirmed = true
  await h.demand.reconcileRetirements()
  expect(h.holds).toBe(0)
  expect(h.demand.snapshot().unresolvedStarts).toBe(0)
  expect(h.demand.snapshot().units[0]?.phase).toBe('sleeping')
  expect(h.starts).toBe(1)
  expect(h.demand.pendingSettlements()).toEqual([])
})
