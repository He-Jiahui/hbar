import { describe, expect, test } from 'bun:test'
import {
  RuntimeDemandLifecycle,
  type DemandClock,
  type DemandPorts,
  type RetireResult,
  type StartResult,
} from '@hbar/runtime'

function deferred<T>() {
  let complete: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    complete = resolve
  })
  return {
    promise,
    resolve(value: T) {
      if (!complete) throw new Error('Deferred not initialized')
      complete(value)
    },
  }
}
class Clock implements DemandClock {
  private time = 0
  private sequence = 0
  private readonly timers = new Map<number, { at: number; callback(): void }>()
  now() {
    return this.time
  }
  schedule(callback: () => void, delayMs: number) {
    const id = ++this.sequence
    this.timers.set(id, { at: this.time + delayMs, callback })
    return {
      cancel: () => {
        this.timers.delete(id)
      },
    }
  }
  advance(ms: number) {
    this.time += ms
    for (const [id, timer] of [...this.timers])
      if (timer.at <= this.time) {
        this.timers.delete(id)
        timer.callback()
      }
  }
  pending() {
    return this.timers.size
  }
}
async function pump() {
  for (let i = 0; i < 24; i++) await Promise.resolve()
}
function row(lifecycle: RuntimeDemandLifecycle, id = 'a') {
  const value = lifecycle.snapshot().units.find((unit) => unit.unitId === id)
  if (!value) throw new Error('Missing unit')
  return value
}
function harness() {
  const clock = new Clock()
  const starts: Parameters<DemandPorts['start']>[0][] = []
  const retirements: Parameters<DemandPorts['retire']>[0][] = []
  const generations = new Map<string, number>()
  let starting: DemandPorts['start'] | undefined
  let retiring: DemandPorts['retire'] | undefined
  const ports: DemandPorts = {
    start(input, signal) {
      starts.push(input)
      if (starting) return starting(input, signal)
      const generation = (generations.get(input.unitId) ?? 0) + 1
      generations.set(input.unitId, generation)
      return Promise.resolve({
        kind: 'started',
        owner: { unitId: input.unitId, generation, incarnation: 'inc-' + input.unitId + '-' + generation },
      })
    },
    retire(input) {
      retirements.push(input)
      return retiring ? retiring(input) : Promise.resolve({ kind: 'confirmed-physical-exit' })
    },
  }
  return {
    clock,
    starts,
    retirements,
    ports,
    setStart(value: DemandPorts['start']) {
      starting = value
    },
    setRetire(value: DemandPorts['retire']) {
      retiring = value
    },
  }
}
describe('RuntimeDemandLifecycle actual coordinator behavior', () => {
  test('TTL starts only after release; pure snapshots do not extend it', async () => {
    const h = harness(),
      lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'a' })
    const lease = await lifecycle.acquire('a')
    h.clock.advance(120000)
    await pump()
    expect(h.retirements).toHaveLength(0)
    lease.release()
    h.clock.advance(59999)
    for (let i = 0; i < 100; i++) lifecycle.snapshot()
    expect(h.retirements).toHaveLength(0)
    h.clock.advance(1)
    await pump()
    expect(h.retirements).toHaveLength(1)
    expect(row(lifecycle).phase).toBe('sleeping')
    expect(row(lifecycle).owner).toBeNull()
    lifecycle.stop()
  })
  test('32 concurrent requests share one actual start and hold 32 pins', async () => {
    const h = harness(),
      gate = deferred<StartResult>()
    h.setStart(() => gate.promise)
    const lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'a' })
    const requests = Array.from({ length: 32 }, () => lifecycle.acquire('a'))
    await pump()
    expect(h.starts).toHaveLength(1)
    gate.resolve({ kind: 'started', owner: { unitId: 'a', generation: 7, incarnation: 'exact-owner' } })
    const leases = await Promise.all(requests)
    expect(row(lifecycle).pins).toBe(32)
    expect(new Set(leases.map((lease) => lease.owner.incarnation))).toEqual(new Set(['exact-owner']))
    for (const lease of leases) lease.release()
    lifecycle.stop()
  })
  test('cancel one waiter does not cancel shared start; capacity recovers', async () => {
    const h = harness(),
      gate = deferred<StartResult>(),
      abort = new AbortController()
    h.setStart((_input, signal) => {
      expect(signal.aborted).toBe(false)
      return gate.promise
    })
    const lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock, { maxOutstandingPerUnit: 2 })
    lifecycle.register({ unitId: 'a' })
    const first = lifecycle.acquire('a', abort.signal)
    const firstOutcome = first.catch((error: unknown) => error)
    const second = lifecycle.acquire('a')
    const secondOutcome = second.catch((error: unknown) => error)
    let third: ReturnType<RuntimeDemandLifecycle['acquire']> | undefined
    let thirdOutcome: Promise<unknown> | undefined
    try {
      const capacityOutcome = lifecycle.acquire('a').catch((error: unknown) => error)
      expect(await capacityOutcome).toHaveProperty('code', 'CAPACITY')
      abort.abort()
      expect(await firstOutcome).toHaveProperty('code', 'ABORTED')
      third = lifecycle.acquire('a')
      thirdOutcome = third.catch((error: unknown) => error)
      await pump()
      expect(h.starts).toHaveLength(1)
      gate.resolve({ kind: 'started', owner: { unitId: 'a', generation: 1, incarnation: 'one' } })
      const leases = await Promise.all([second, third])
      expect(row(lifecycle).pins).toBe(2)
      leases.forEach((lease) => lease.release())
    } finally {
      abort.abort()
      gate.resolve({ kind: 'started', owner: { unitId: 'a', generation: 1, incarnation: 'one' } })
      lifecycle.stop()
      await Promise.all([firstOutcome, secondOutcome, thirdOutcome])
      const settled = await Promise.allSettled([first, second, third])
      for (const outcome of settled)
        if (outcome.status === 'fulfilled' && outcome.value !== undefined) outcome.value.release()
    }
  })
  test('request during quiescing waits for physical exit and a new owner', async () => {
    const h = harness(),
      retirement = deferred<RetireResult>()
    h.setRetire(() => retirement.promise)
    const lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'a', idleTimeoutMs: 10 })
    const old = await lifecycle.acquire('a')
    old.release()
    h.clock.advance(10)
    await pump()
    expect(row(lifecycle).phase).toBe('quiescing')
    let granted = false
    const next = lifecycle.acquire('a').then((lease) => {
      granted = true
      return lease
    })
    await pump()
    expect(granted).toBe(false)
    expect(h.starts).toHaveLength(1)
    retirement.resolve({ kind: 'confirmed-physical-exit' })
    const fresh = await next
    expect(fresh.owner.generation).toBe(2)
    expect(fresh.owner.incarnation).not.toBe(old.owner.incarnation)
    old.release()
    expect(row(lifecycle).pins).toBe(1)
    fresh.release()
    lifecycle.stop()
  })
  test('unknown retirement retains owner and rejects substitutes until explicit reconcile', async () => {
    const h = harness()
    h.setRetire(() => Promise.resolve({ kind: 'unknown' }))
    const lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'a' })
    const lease = await lifecycle.acquire('a')
    lease.release()
    expect(await lifecycle.retire('a')).toEqual({ kind: 'unknown' })
    expect(row(lifecycle).owner).toEqual(lease.owner)
    await expect(lifecycle.acquire('a')).rejects.toHaveProperty('code', 'BLOCKED')
    h.clock.advance(1000000)
    await pump()
    expect(h.starts).toHaveLength(1)
    h.setRetire(() => Promise.resolve({ kind: 'confirmed-physical-exit' }))
    await lifecycle.retire('a')
    const fresh = await lifecycle.acquire('a')
    expect(fresh.owner.generation).toBe(2)
    fresh.release()
    lifecycle.stop()
  })
  test('busy retirement keeps usable old owner, not fake sleeping', async () => {
    const h = harness()
    h.setRetire(() => Promise.resolve({ kind: 'busy' }))
    const lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'a' })
    const first = await lifecycle.acquire('a')
    first.release()
    expect(await lifecycle.retire('a')).toEqual({ kind: 'busy' })
    expect(row(lifecycle).phase).toBe('awake')
    const second = await lifecycle.acquire('a')
    expect(second.owner).toEqual(first.owner)
    expect(h.starts).toHaveLength(1)
    second.release()
    lifecycle.stop()
  })
  test('dependency pin lasts until dependent owner physically retires', async () => {
    const h = harness(),
      lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'dep', idleTimeoutMs: 10 })
    lifecycle.register({ unitId: 'a', dependencies: ['dep'], idleTimeoutMs: 100 })
    const lease = await lifecycle.acquire('a')
    expect(h.starts.map((input) => input.unitId)).toEqual(['dep', 'a'])
    expect(row(lifecycle, 'dep').pins).toBe(1)
    lease.release()
    h.clock.advance(10)
    await pump()
    expect(h.retirements).toHaveLength(0)
    h.clock.advance(90)
    await pump()
    expect(h.retirements.map((input) => input.unitId)).toEqual(['a'])
    expect(row(lifecycle, 'dep').pins).toBe(0)
    h.clock.advance(10)
    await pump()
    expect(h.retirements.map((input) => input.unitId)).toEqual(['a', 'dep'])
    lifecycle.stop()
  })
  test('cycles are rejected and diamond dependencies share a wake', async () => {
    const h = harness(),
      lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'cycle-a', dependencies: ['cycle-b'] })
    expect(() => lifecycle.register({ unitId: 'cycle-b', dependencies: ['cycle-a'] })).toThrow('CYCLE')
    lifecycle.register({ unitId: 'd' })
    lifecycle.register({ unitId: 'b', dependencies: ['d'] })
    lifecycle.register({ unitId: 'c', dependencies: ['d'] })
    lifecycle.register({ unitId: 'a', dependencies: ['b', 'c'] })
    const lease = await lifecycle.acquire('a')
    expect(h.starts.filter((input) => input.unitId === 'd')).toHaveLength(1)
    expect(row(lifecycle, 'd').pins).toBe(2)
    lease.release()
    lifecycle.stop()
  })
  test('reload/fault fence never rebinds old lease to replacement', async () => {
    const h = harness(),
      lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'a' })
    const old = await lifecycle.acquire('a')
    lifecycle.fenceOwner(old.owner)
    await expect(lifecycle.acquire('a')).rejects.toHaveProperty('code', 'BLOCKED')
    expect(await lifecycle.retire('a')).toEqual({ kind: 'busy' })
    old.release()
    await lifecycle.retire('a')
    const next = await lifecycle.acquire('a')
    const before = row(lifecycle).pins
    old.release()
    lifecycle.fenceOwner(old.owner)
    expect(row(lifecycle).pins).toBe(before)
    expect(row(lifecycle).phase).toBe('awake')
    next.release()
    lifecycle.stop()
  })
  test('unproven start throw blocks; explicit not-started permits later fresh acquire', async () => {
    const h = harness(),
      lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'a' })
    h.setStart(() => Promise.reject(new Error('private-start-error')))
    await expect(lifecycle.acquire('a')).rejects.toHaveProperty('code', 'BLOCKED')
    await expect(lifecycle.acquire('a')).rejects.toHaveProperty('code', 'BLOCKED')
    expect(h.starts).toHaveLength(1)
    lifecycle.stop()
    const h2 = harness(),
      second = new RuntimeDemandLifecycle(h2.ports, h2.clock)
    second.register({ unitId: 'a' })
    h2.setStart(() => Promise.resolve({ kind: 'not-started' }))
    await expect(second.acquire('a')).rejects.toHaveProperty('code', 'START_NOT_DISPATCHED')
    expect(row(second).phase).toBe('sleeping')
    second.stop()
  })
  test('stop clears waiters/timers but a late started owner is retained, not claimed exited', async () => {
    const h = harness(),
      gate = deferred<StartResult>()
    h.setStart(() => gate.promise)
    const lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'a' })
    const pending = lifecycle.acquire('a')
    const rejection = pending.catch((error: unknown) => error)
    await pump()
    lifecycle.stop()
    expect(await rejection).toHaveProperty('code', 'STOPPED')
    gate.resolve({ kind: 'started', owner: { unitId: 'a', generation: 9, incarnation: 'late-owner' } })
    await pump()
    expect(lifecycle.snapshot().stopped).toBe(true)
    expect(row(lifecycle).phase).toBe('blocked')
    expect(row(lifecycle).owner?.incarnation).toBe('late-owner')
    expect(h.retirements).toHaveLength(0)
    expect(h.clock.pending()).toBe(0)
    await expect(lifecycle.acquire('a')).rejects.toHaveProperty('code', 'STOPPED')
    await lifecycle.retire('a')
    expect(row(lifecycle).owner).toBeNull()
  })
  test('global startup concurrency and waiting capacity are bounded', async () => {
    const h = harness(),
      gates = new Map<string, ReturnType<typeof deferred<StartResult>>>()
    h.setStart((input) => {
      const gate = deferred<StartResult>()
      gates.set(input.unitId, gate)
      return gate.promise
    })
    const lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock, { maxConcurrentStarts: 1, maxStartWaiters: 1 })
    for (const id of ['a', 'b', 'c']) lifecycle.register({ unitId: id })
    const a = lifecycle.acquire('a'),
      b = lifecycle.acquire('b'),
      c = lifecycle.acquire('c')
    const rejected = c.catch((error: unknown) => error)
    await pump()
    expect(await rejected).toHaveProperty('code', 'START_NOT_DISPATCHED')
    expect(h.starts.map((input) => input.unitId)).toEqual(['a'])
    const first = gates.get('a')
    if (!first) throw new Error('Missing actual started gate')
    first.resolve({ kind: 'started', owner: { unitId: 'a', generation: 1, incarnation: 'one' } })
    const leaseA = await a
    await pump()
    expect(h.starts.map((input) => input.unitId)).toEqual(['a', 'b'])
    const second = gates.get('b')
    if (!second) throw new Error('Missing actual next started gate')
    second.resolve({ kind: 'started', owner: { unitId: 'b', generation: 1, incarnation: 'two' } })
    const leaseB = await b
    leaseA.release()
    leaseB.release()
    lifecycle.stop()
  })
  test('logical abort after grant does not release a physical-usecase pin', async () => {
    const h = harness(),
      controller = new AbortController()
    const lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'a', idleTimeoutMs: 1 })
    const lease = await lifecycle.acquire('a', controller.signal)
    controller.abort()
    h.clock.advance(100)
    await pump()
    expect(row(lifecycle).pins).toBe(1)
    expect(await lifecycle.retire('a')).toEqual({ kind: 'busy' })
    expect(h.retirements).toHaveLength(0)
    lease.release()
    h.clock.advance(1)
    await pump()
    expect(h.retirements).toHaveLength(1)
    lifecycle.stop()
  })
  test('unknown dispatched start retains its dependency owner until confirmed retirement', async () => {
    const h = harness()
    h.setStart((input) =>
      input.unitId === 'a'
        ? Promise.reject(new Error('unknown after native dispatch'))
        : Promise.resolve({ kind: 'started', owner: { unitId: input.unitId, generation: 1, incarnation: 'dep' } }),
    )
    const lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'dep' })
    lifecycle.register({ unitId: 'a', dependencies: ['dep'] })
    await expect(lifecycle.acquire('a')).rejects.toHaveProperty('code', 'BLOCKED')
    expect(row(lifecycle, 'dep').pins).toBe(1)
    expect(row(lifecycle).dependenciesHeld).toBe(1)
    await lifecycle.retire('a')
    expect(row(lifecycle, 'dep').pins).toBe(0)
    lifecycle.stop()
  })
  test('registration and total outstanding capacity reject without spawning extra owners', async () => {
    const h = harness(),
      lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock, { maxUnits: 1, maxOutstanding: 1 })
    lifecycle.register({ unitId: 'a' })
    expect(() => lifecycle.register({ unitId: 'b' })).toThrow('CAPACITY')
    const lease = await lifecycle.acquire('a')
    await expect(lifecycle.acquire('a')).rejects.toHaveProperty('code', 'CAPACITY')
    lease.release()
    const again = await lifecycle.acquire('a')
    expect(h.starts).toHaveLength(1)
    again.release()
    lifecycle.stop()
  })
  test('dependency owner fencing blocks dependent admission without dropping its physical dependency pin', async () => {
    const h = harness(),
      lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'dep' })
    lifecycle.register({ unitId: 'a', dependencies: ['dep'] })
    const lease = await lifecycle.acquire('a')
    const dependency = row(lifecycle, 'dep').owner
    if (!dependency) throw new Error('Missing dependency owner')
    lifecycle.fenceOwner(dependency)
    expect(row(lifecycle).phase).toBe('blocked')
    expect(row(lifecycle, 'dep').pins).toBe(1)
    await expect(lifecycle.acquire('a')).rejects.toHaveProperty('code', 'BLOCKED')
    expect(await lifecycle.retire('dep')).toEqual({ kind: 'busy' })
    lease.release()
    await lifecycle.retire('a')
    expect(row(lifecycle, 'dep').pins).toBe(0)
    await lifecycle.retire('dep')
    const next = await lifecycle.acquire('a')
    expect(next.owner.incarnation).not.toBe(lease.owner.incarnation)
    next.release()
    lifecycle.stop()
  })
  test('dependency fenced while dependent waits for a start permit never dispatches the dependent', async () => {
    const h = harness(),
      blocker = deferred<StartResult>()
    h.setStart((input) =>
      input.unitId === 'blocker'
        ? blocker.promise
        : Promise.resolve({
            kind: 'started',
            owner: { unitId: input.unitId, generation: 1, incarnation: 'owner-' + input.unitId },
          }),
    )
    const lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock, { maxConcurrentStarts: 1 })
    lifecycle.register({ unitId: 'dep' })
    lifecycle.register({ unitId: 'blocker' })
    lifecycle.register({ unitId: 'b', dependencies: ['dep'] })
    const dependency = await lifecycle.acquire('dep')
    const dependencyOwner = dependency.owner
    dependency.release()
    const occupying = lifecycle.acquire('blocker')
    await pump()
    const pending = lifecycle.acquire('b')
    const rejection = pending.catch((error: unknown) => error)
    await pump()
    expect(row(lifecycle, 'b').dependenciesHeld).toBe(1)
    expect(h.starts.map((input) => input.unitId)).toEqual(['dep', 'blocker'])
    lifecycle.fenceOwner(dependencyOwner)
    expect(await rejection).toHaveProperty('code', 'BLOCKED')
    await pump()
    expect(row(lifecycle, 'dep').pins).toBe(0)
    blocker.resolve({ kind: 'started', owner: { unitId: 'blocker', generation: 1, incarnation: 'blocker-owner' } })
    const lease = await occupying
    await pump()
    expect(h.starts.some((input) => input.unitId === 'b')).toBe(false)
    lease.release()
    lifecycle.stop()
  })
  test('public scoped unit IDs support at, colon and slash without treating them as filesystem paths', async () => {
    const h = harness(),
      lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    const id = 'plugin.@hbar/tools:local/sub'
    lifecycle.register({ unitId: id })
    const lease = await lifecycle.acquire(id)
    expect(lease.owner.unitId).toBe(id)
    expect(() => lifecycle.register({ unitId: 'invalid whitespace' })).toThrow('Invalid or duplicate unit')
    lease.release()
    lifecycle.stop()
  })
})

describe('rev3 retirement publication and unknown containment', () => {
  test('synchronous port reentry and explicit retirement join the published operation', async () => {
    const h = harness(),
      gate = deferred<RetireResult>()
    const lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'a' })
    const lease = await lifecycle.acquire('a')
    lease.release()
    let nested: Promise<RetireResult> | undefined
    let entered = false
    h.setRetire(() => {
      if (!entered) {
        entered = true
        nested = lifecycle.retire('a')
      }
      return gate.promise
    })
    const first = lifecycle.retire('a')
    const second = lifecycle.retire('a')
    await pump()
    expect(h.retirements).toHaveLength(1)
    expect(second).toBe(first)
    expect(nested).toBe(first)
    h.clock.advance(120000)
    await pump()
    expect(h.retirements).toHaveLength(1)
    gate.resolve({ kind: 'confirmed-physical-exit' })
    await first
    expect(row(lifecycle).phase).toBe('sleeping')
    lifecycle.stop()
  })
  test('unknown retirement followed by busy never readmits old owner or releases its dependency', async () => {
    const h = harness(),
      lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'dep' })
    lifecycle.register({ unitId: 'a', dependencies: ['dep'] })
    const lease = await lifecycle.acquire('a')
    const oldOwner = lease.owner
    lease.release()
    h.setRetire(() => Promise.resolve({ kind: 'unknown' }))
    await lifecycle.retire('a')
    h.setRetire(() => Promise.resolve({ kind: 'busy' }))
    await lifecycle.retire('a')
    expect(row(lifecycle).phase).toBe('blocked')
    expect(row(lifecycle).owner).toEqual(oldOwner)
    expect(row(lifecycle, 'dep').pins).toBe(1)
    await expect(lifecycle.acquire('a')).rejects.toHaveProperty('code', 'BLOCKED')
    expect(h.starts).toHaveLength(2)
    h.setRetire(() => Promise.resolve({ kind: 'confirmed-physical-exit' }))
    await lifecycle.retire('a')
    expect(row(lifecycle, 'dep').pins).toBe(0)
    const fresh = await lifecycle.acquire('a')
    expect(fresh.owner.incarnation).not.toBe(oldOwner.incarnation)
    fresh.release()
    lifecycle.stop()
  })
  test('unknown start with an observed owner cannot be repaired by busy', async () => {
    const h = harness(),
      lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'a' })
    h.setStart(() =>
      Promise.resolve({ kind: 'unknown', owner: { unitId: 'a', generation: 1, incarnation: 'uncertain' } }),
    )
    await expect(lifecycle.acquire('a')).rejects.toHaveProperty('code', 'BLOCKED')
    h.setRetire(() => Promise.resolve({ kind: 'busy' }))
    await lifecycle.retire('a')
    expect(row(lifecycle).phase).toBe('blocked')
    await expect(lifecycle.acquire('a')).rejects.toHaveProperty('code', 'BLOCKED')
    expect(h.starts).toHaveLength(1)
    lifecycle.stop()
  })
  test('stop while retirement is pending rejects new admission but retains dependency until confirmed exit', async () => {
    const h = harness(),
      gate = deferred<RetireResult>()
    const lifecycle = new RuntimeDemandLifecycle(h.ports, h.clock)
    lifecycle.register({ unitId: 'dep' })
    lifecycle.register({ unitId: 'a', dependencies: ['dep'] })
    const lease = await lifecycle.acquire('a')
    lease.release()
    h.setRetire(() => gate.promise)
    const retirement = lifecycle.retire('a')
    const pending = lifecycle.acquire('a')
    const rejected = pending.catch((error: unknown) => error)
    await pump()
    lifecycle.stop()
    expect(await rejected).toHaveProperty('code', 'STOPPED')
    expect(row(lifecycle, 'dep').pins).toBe(1)
    expect(row(lifecycle).phase).toBe('quiescing')
    gate.resolve({ kind: 'confirmed-physical-exit' })
    await retirement
    expect(row(lifecycle, 'dep').pins).toBe(0)
    expect(row(lifecycle).phase).toBe('sleeping')
    expect(h.clock.pending()).toBe(0)
    expect(h.starts).toHaveLength(2)
    await expect(lifecycle.acquire('a')).rejects.toHaveProperty('code', 'STOPPED')
  })
})
