export interface DemandOwner {
  readonly unitId: string
  readonly generation: number
  readonly incarnation: string
}
export interface DemandLease {
  readonly owner: DemandOwner
  release(): void
}
export interface DemandTimer {
  cancel(): void
}
export interface DemandClock {
  now(): number
  schedule(callback: () => void, delayMs: number): DemandTimer
}
export type StartResult =
  | { readonly kind: 'started'; readonly owner: DemandOwner }
  | { readonly kind: 'not-started' }
  | { readonly kind: 'unknown'; readonly owner: DemandOwner | null }
export type RetireResult =
  { readonly kind: 'confirmed-physical-exit' } | { readonly kind: 'busy' } | { readonly kind: 'unknown' }
export interface DemandAttempt {
  readonly unitId: string
  readonly attempt: number
  readonly owner: DemandOwner | null
}
export interface DemandPorts {
  start(
    input: { readonly unitId: string; readonly attempt: number; readonly dependencies: readonly DemandOwner[] },
    signal: AbortSignal,
  ): Promise<StartResult>
  /** busy MUST preserve the same owner's usable admission; otherwise return unknown. */
  retire(input: DemandAttempt): Promise<RetireResult>
}
export interface DemandUnit {
  readonly unitId: string
  readonly dependencies?: readonly string[]
  readonly idleTimeoutMs?: number
}
export interface DemandLimits {
  readonly maxUnits?: number
  readonly maxOutstanding?: number
  readonly maxOutstandingPerUnit?: number
  readonly maxConcurrentStarts?: number
  readonly maxStartWaiters?: number
}
export type DemandPhase = 'sleeping' | 'starting' | 'awake' | 'quiescing' | 'blocked'
export interface DemandSnapshot {
  readonly stopped: boolean
  readonly units: readonly {
    readonly unitId: string
    readonly phase: DemandPhase
    readonly owner: DemandOwner | null
    readonly pins: number
    readonly waiters: number
    readonly idleSince: number | null
    readonly dependenciesHeld: number
  }[]
}
type Code =
  'STOPPED' | 'ABORTED' | 'CAPACITY' | 'UNKNOWN_UNIT' | 'CYCLE' | 'BLOCKED' | 'START_NOT_DISPATCHED' | 'INVALID_OWNER'
export class DemandLifecycleError extends Error {
  constructor(readonly code: Code) {
    super(code)
    this.name = 'DemandLifecycleError'
  }
}
interface Waiter {
  resolve(lease: DemandLease): void
  reject(error: DemandLifecycleError): void
  readonly signal: AbortSignal | undefined
  abort(): void
}
interface PermitWaiter {
  resolve(release: () => void): void
  reject(error: DemandLifecycleError): void
  readonly signal: AbortSignal
  abort(): void
}
interface Unit {
  readonly id: string
  readonly dependencies: readonly string[]
  readonly idleTimeoutMs: number
  phase: DemandPhase
  owner: DemandOwner | null
  lastOwner: DemandOwner | null
  readonly leases: Map<symbol, DemandOwner>
  readonly waiters: Map<symbol, Waiter>
  dependenciesHeld: DemandLease[]
  idleSince: number | null
  timer: DemandTimer | undefined
  timerEpoch: number
  attempt: number
  startController: AbortController | undefined
  retiring: Promise<RetireResult> | undefined
  fenced: boolean
}
const defaultClock: DemandClock = {
  now: () => performance.now(),
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs)
    return { cancel: () => clearTimeout(timer) }
  },
}
function bounded(value: number | undefined, fallback: number, maximum: number): number {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum)
    throw new RangeError('Invalid demand lifecycle bound')
  return result
}
function sameOwner(left: DemandOwner, right: DemandOwner): boolean {
  return left.unitId === right.unitId && left.generation === right.generation && left.incarnation === right.incarnation
}
function ownerCopy(owner: DemandOwner): DemandOwner {
  return Object.freeze({ unitId: owner.unitId, generation: owner.generation, incarnation: owner.incarnation })
}
/** Pure coordinator. Ports own checkpoint, fencing, native join and bounded process deadlines. */
export class RuntimeDemandLifecycle {
  private readonly units = new Map<string, Unit>()
  private readonly permits: PermitWaiter[] = []
  private readonly maximumUnits: number
  private readonly maximumOutstanding: number
  private readonly maximumPerUnit: number
  private readonly maximumStarts: number
  private readonly maximumStartWaiters: number
  private outstanding = 0
  private starting = 0
  private stopped = false

  constructor(
    private readonly ports: DemandPorts,
    private readonly clock: DemandClock = defaultClock,
    limits: DemandLimits = {},
  ) {
    this.maximumUnits = bounded(limits.maxUnits, 128, 512)
    this.maximumOutstanding = bounded(limits.maxOutstanding, 512, 65536)
    this.maximumPerUnit = bounded(limits.maxOutstandingPerUnit, 128, 4096)
    this.maximumStarts = bounded(limits.maxConcurrentStarts, 2, 32)
    this.maximumStartWaiters = bounded(limits.maxStartWaiters, 128, 512)
  }
  register(input: DemandUnit): void {
    if (this.stopped) throw new DemandLifecycleError('STOPPED')
    if (!/^[a-zA-Z0-9@._:/-]{1,160}$/.test(input.unitId) || this.units.has(input.unitId))
      throw new RangeError('Invalid or duplicate unit')
    if (this.units.size >= this.maximumUnits) throw new DemandLifecycleError('CAPACITY')
    const dependencies = [...(input.dependencies ?? [])]
    if (dependencies.length > 32 || new Set(dependencies).size !== dependencies.length)
      throw new RangeError('Invalid dependencies')
    const unit: Unit = {
      id: input.unitId,
      dependencies,
      idleTimeoutMs: bounded(input.idleTimeoutMs, 60000, 86400000),
      phase: 'sleeping',
      owner: null,
      lastOwner: null,
      leases: new Map(),
      waiters: new Map(),
      dependenciesHeld: [],
      idleSince: null,
      timer: undefined,
      timerEpoch: 0,
      attempt: 0,
      startController: undefined,
      retiring: undefined,
      fenced: false,
    }
    this.units.set(unit.id, unit)
    try {
      this.graph(unit.id, new Set(), new Set(), false)
    } catch (error) {
      this.units.delete(unit.id)
      throw error
    }
  }
  acquire(unitId: string, signal?: AbortSignal): Promise<DemandLease> {
    if (this.stopped) return Promise.reject(new DemandLifecycleError('STOPPED'))
    if (signal?.aborted) return Promise.reject(new DemandLifecycleError('ABORTED'))
    const unit = this.units.get(unitId)
    if (!unit) return Promise.reject(new DemandLifecycleError('UNKNOWN_UNIT'))
    try {
      this.graph(unitId, new Set(), new Set(), true)
    } catch (error) {
      return Promise.reject(error)
    }
    if (unit.phase === 'blocked') return Promise.reject(new DemandLifecycleError('BLOCKED'))
    if (this.outstanding >= this.maximumOutstanding || unit.leases.size + unit.waiters.size >= this.maximumPerUnit)
      return Promise.reject(new DemandLifecycleError('CAPACITY'))
    this.cancelIdle(unit)
    this.outstanding++
    return new Promise((resolve, reject) => {
      const key = Symbol()
      const waiter: Waiter = {
        resolve,
        reject,
        signal,
        abort: () => {
          if (!unit.waiters.delete(key)) return
          signal?.removeEventListener('abort', waiter.abort)
          this.outstanding--
          reject(new DemandLifecycleError('ABORTED'))
          this.idle(unit)
        },
      }
      unit.waiters.set(key, waiter)
      signal?.addEventListener('abort', waiter.abort, { once: true })
      if (signal?.aborted) waiter.abort()
      this.deliver(unit)
      this.kick(unit)
    })
  }
  snapshot(): DemandSnapshot {
    return {
      stopped: this.stopped,
      units: [...this.units.values()].map((unit) => ({
        unitId: unit.id,
        phase: unit.phase,
        owner: unit.owner ? ownerCopy(unit.owner) : null,
        pins: unit.leases.size,
        waiters: unit.waiters.size,
        idleSince: unit.idleSince,
        dependenciesHeld: unit.dependenciesHeld.length,
      })),
    }
  }
  /** External fault/reload invalidation never silently rebinds existing leases. */
  fenceOwner(owner: DemandOwner): void {
    const unit = this.units.get(owner.unitId)
    if (!unit?.owner || !sameOwner(unit.owner, owner)) return
    const queue: DemandOwner[] = [owner]
    const visited = new Set<string>()
    while (queue.length) {
      const current = queue.shift()
      if (!current || visited.has(current.unitId)) continue
      visited.add(current.unitId)
      for (const target of this.units.values()) {
        const isOwner = target.owner !== null && sameOwner(target.owner, current)
        if (!isOwner && !target.dependenciesHeld.some((lease) => sameOwner(lease.owner, current))) continue
        this.cancelIdle(target)
        target.fenced = true
        target.startController?.abort()
        target.phase = 'blocked'
        this.rejectWaiters(target, 'BLOCKED')
        if (target.owner) queue.push(target.owner)
      }
    }
  }
  /** Explicit reconciliation is allowed after stop; success is only a port-confirmed physical exit. */
  retire(unitId: string): Promise<RetireResult> {
    const unit = this.units.get(unitId)
    if (!unit) return Promise.reject(new DemandLifecycleError('UNKNOWN_UNIT'))
    if (unit.retiring) return unit.retiring
    if (unit.phase === 'sleeping') return Promise.resolve({ kind: 'confirmed-physical-exit' })
    if (unit.startController || unit.phase === 'starting' || unit.leases.size) return Promise.resolve({ kind: 'busy' })
    const idleSince = unit.idleSince
    this.cancelIdle(unit)
    // A technical checkpoint attempt is not new business activity. Keep the
    // original idle deadline unless acquire() admits a real waiter meanwhile.
    unit.idleSince = idleSince
    unit.phase = 'quiescing'
    // Publish the singleflight promise before invoking any reentrant external port.
    unit.retiring = Promise.resolve()
      .then(() => this.performRetirement(unit))
      .finally(() => {
        unit.retiring = undefined
      })
    return unit.retiring
  }
  stop(): void {
    if (this.stopped) return
    this.stopped = true
    for (const unit of this.units.values()) {
      this.cancelIdle(unit)
      this.rejectWaiters(unit, 'STOPPED')
      unit.startController?.abort()
    }
    for (const waiter of [...this.permits]) waiter.abort()
    // Existing owner/dependency pins remain until actual retirement, not logical stop.
  }
  private graph(id: string, visiting: Set<string>, visited: Set<string>, requireKnown: boolean): void {
    if (visiting.has(id)) throw new DemandLifecycleError('CYCLE')
    if (visited.has(id)) return
    const unit = this.units.get(id)
    if (!unit) {
      if (requireKnown) throw new DemandLifecycleError('UNKNOWN_UNIT')
      return
    }
    visiting.add(id)
    for (const dependency of unit.dependencies) this.graph(dependency, visiting, visited, requireKnown)
    visiting.delete(id)
    visited.add(id)
  }
  private cancelIdle(unit: Unit): void {
    unit.timerEpoch++
    unit.timer?.cancel()
    unit.timer = undefined
    unit.idleSince = null
  }
  private idle(unit: Unit): void {
    if (this.stopped || unit.phase !== 'awake' || unit.leases.size || unit.waiters.size || unit.timer) return
    const now = this.clock.now()
    unit.idleSince ??= now
    const remaining = unit.idleSince + unit.idleTimeoutMs - now
    // Retry a known-open busy owner at most once per second after its TTL.
    // UNKNOWN remains blocked; this never grants retirement without port proof.
    const delayMs = remaining > 0 ? remaining : Math.min(unit.idleTimeoutMs, 1000)
    const epoch = ++unit.timerEpoch
    unit.timer = this.clock.schedule(() => {
      if (epoch !== unit.timerEpoch || this.stopped) return
      unit.timer = undefined
      if (unit.phase !== 'awake' || unit.leases.size || unit.waiters.size) return
      void this.retire(unit.id).catch(() => {
        unit.fenced = true
        unit.phase = 'blocked'
        this.rejectWaiters(unit, 'BLOCKED')
      })
    }, delayMs)
  }
  private deliver(unit: Unit): void {
    if (this.stopped || unit.phase !== 'awake' || !unit.owner) return
    for (const [key, waiter] of unit.waiters) {
      if (waiter.signal?.aborted) {
        waiter.abort()
        continue
      }
      unit.waiters.delete(key)
      waiter.signal?.removeEventListener('abort', waiter.abort)
      const token = Symbol()
      const owner = ownerCopy(unit.owner)
      unit.leases.set(token, owner)
      let released = false
      waiter.resolve(
        Object.freeze({
          owner,
          release: () => {
            if (released) return
            released = true
            const held = unit.leases.get(token)
            if (!held || !sameOwner(held, owner)) return
            unit.leases.delete(token)
            this.outstanding--
            this.idle(unit)
          },
        }),
      )
    }
    this.idle(unit)
  }
  private rejectWaiters(unit: Unit, code: Code): void {
    for (const waiter of unit.waiters.values()) {
      waiter.signal?.removeEventListener('abort', waiter.abort)
      this.outstanding--
      waiter.reject(new DemandLifecycleError(code))
    }
    unit.waiters.clear()
  }
  private kick(unit: Unit): void {
    if (this.stopped || unit.phase !== 'sleeping' || !unit.waiters.size) return
    unit.phase = 'starting'
    unit.fenced = false
    const controller = new AbortController()
    unit.startController = controller
    void this.wake(unit, controller).catch(() => {
      unit.fenced = true
      unit.phase = 'blocked'
      this.rejectWaiters(unit, this.stopped ? 'STOPPED' : 'BLOCKED')
    })
  }
  private async wake(unit: Unit, controller: AbortController): Promise<void> {
    const dependencies: DemandLease[] = []
    // Publish partial dependency ownership before any permit wait, so a dependency
    // fence can invalidate this starting dependent and abort its queued permit.
    unit.dependenciesHeld = dependencies
    let release: (() => void) | undefined
    let dispatched = false
    try {
      for (const id of unit.dependencies) {
        dependencies.push(await this.acquire(id, controller.signal))
        this.verifyDependencies(dependencies)
      }
      release = await this.permit(controller.signal)
      if (controller.signal.aborted || this.stopped) throw new DemandLifecycleError('STOPPED')
      if (unit.attempt >= Number.MAX_SAFE_INTEGER) throw new DemandLifecycleError('CAPACITY')
      // Covers fencing after dependency grant but before this continuation saw
      // that lease, and rechecks exact ownership immediately before dispatch.
      this.verifyDependencies(dependencies)
      dispatched = true
      unit.attempt++
      const result = await this.ports.start(
        {
          unitId: unit.id,
          attempt: unit.attempt,
          dependencies: dependencies.map((lease) => lease.owner),
        },
        controller.signal,
      )
      if (result.kind === 'not-started') {
        this.releaseDependencies(unit)
        unit.phase = 'sleeping'
        this.rejectWaiters(unit, this.stopped ? 'STOPPED' : 'START_NOT_DISPATCHED')
        return
      }
      const owner = result.owner
      if (owner) {
        if (
          owner.unitId !== unit.id ||
          !Number.isSafeInteger(owner.generation) ||
          owner.generation < 1 ||
          !owner.incarnation ||
          owner.incarnation.length > 160 ||
          owner.incarnation === unit.lastOwner?.incarnation
        )
          throw new DemandLifecycleError('INVALID_OWNER')
        unit.owner = ownerCopy(owner)
        unit.lastOwner = unit.owner
      }
      if (result.kind === 'unknown' || this.stopped || unit.fenced) {
        unit.fenced = true
        unit.phase = 'blocked'
        this.rejectWaiters(unit, this.stopped ? 'STOPPED' : 'BLOCKED')
        return
      }
      unit.phase = 'awake'
      this.deliver(unit)
    } catch (error) {
      if (!dispatched) {
        this.releaseDependencies(unit)
        unit.phase = 'sleeping'
        this.rejectWaiters(unit, this.stopped ? 'STOPPED' : 'START_NOT_DISPATCHED')
      } else {
        unit.fenced = true
        unit.phase = 'blocked'
        this.rejectWaiters(unit, this.stopped ? 'STOPPED' : 'BLOCKED')
      }
      // Never infer not-dispatched from a thrown start error.
      if (!(error instanceof DemandLifecycleError)) return
    } finally {
      release?.()
      if (unit.startController === controller) unit.startController = undefined
    }
  }
  private releaseDependencies(unit: Unit): void {
    for (const lease of unit.dependenciesHeld.reverse()) lease.release()
    unit.dependenciesHeld = []
  }
  private verifyDependencies(dependencies: readonly DemandLease[]): void {
    for (const lease of dependencies) {
      const dependency = this.units.get(lease.owner.unitId)
      if (
        !dependency ||
        dependency.phase !== 'awake' ||
        dependency.fenced ||
        !dependency.owner ||
        !sameOwner(dependency.owner, lease.owner)
      )
        throw new DemandLifecycleError('BLOCKED')
    }
  }
  private async performRetirement(unit: Unit): Promise<RetireResult> {
    let result: RetireResult
    try {
      result = await this.ports.retire({ unitId: unit.id, owner: unit.owner, attempt: unit.attempt })
    } catch {
      result = { kind: 'unknown' }
    }
    if (result.kind === 'confirmed-physical-exit') {
      unit.owner = null
      unit.idleSince = null
      this.releaseDependencies(unit)
      unit.phase = 'sleeping'
      this.kick(unit)
    } else if (result.kind === 'busy' && unit.owner && !unit.fenced) {
      unit.phase = 'awake'
      this.deliver(unit)
    } else {
      unit.fenced = true
      unit.phase = 'blocked'
      this.rejectWaiters(unit, 'BLOCKED')
    }
    return result
  }
  private permit(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted || this.stopped) return Promise.reject(new DemandLifecycleError('STOPPED'))
    if (this.starting < this.maximumStarts) {
      this.starting++
      return Promise.resolve(this.releasePermit())
    }
    if (this.permits.length >= this.maximumStartWaiters) return Promise.reject(new DemandLifecycleError('CAPACITY'))
    return new Promise((resolve, reject) => {
      const waiter: PermitWaiter = {
        resolve,
        reject,
        signal,
        abort: () => {
          const index = this.permits.indexOf(waiter)
          if (index < 0) return
          this.permits.splice(index, 1)
          signal.removeEventListener('abort', waiter.abort)
          reject(new DemandLifecycleError('STOPPED'))
        },
      }
      this.permits.push(waiter)
      signal.addEventListener('abort', waiter.abort, { once: true })
      if (signal.aborted) waiter.abort()
    })
  }
  private releasePermit(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      this.starting--
      const waiter = this.permits.shift()
      if (!waiter) return
      waiter.signal.removeEventListener('abort', waiter.abort)
      this.starting++
      waiter.resolve(this.releasePermit())
    }
  }
}
