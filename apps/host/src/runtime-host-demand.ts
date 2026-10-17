import { HbarError } from '@hbar/contracts'
import { runtimeUnitDescriptorSchema, type RuntimeOwner, type RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import {
  RuntimeDemandLifecycle,
  type DemandClock,
  type DemandLease,
  type DemandOwner,
  type DemandSnapshot,
  type RuntimeManager,
} from '@hbar/runtime'

export interface HostRuntimeDemandHold {
  readonly owners: readonly RuntimeOwner[]
  release(): void
}

export interface HostRuntimeDemandPort {
  acquire(unitIds: readonly string[], signal: AbortSignal): Promise<HostRuntimeDemandHold>
}

type ManagerHold = ReturnType<RuntimeManager['holdDemand']>
type DemandManager = Pick<
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

/** Explicit trusted bootstrap selection, never inferred from a missing default. */
export interface HostRuntimeDeferredDriver {
  readonly unitId: string
  readonly selectedArtifactId: string
}

export interface HostRuntimeDemandOptions {
  readonly manager: DemandManager
  readonly units: readonly RuntimeUnitDescriptor[]
  readonly idleTimeoutMs?: number
  readonly maximumOperations?: number
  readonly clock?: DemandClock
}

interface FailedStart {
  readonly attempt: number
  readonly attemptId: string
  readonly hold: ManagerHold
  readonly owner: RuntimeOwner | null
}

interface PendingAdmission {
  readonly leases: DemandLease[]
  manager: ManagerHold | undefined
  readySucceeded: boolean
}

function sameOwner(left: DemandOwner, right: RuntimeOwner): boolean {
  return left.unitId === right.unitId && left.generation === right.generation && left.incarnation === right.incarnation
}

/** Stable Host composition. Business demand, not status polling, owns the idle clock.
 * Descriptor dependencies are activation/capability dependencies. They are held for the
 * whole use case; loading a Kernel alone does not permanently pin its Driver or database.
 * Exact Run/resource/physical IPC authority remains checked by Manager and each process.
 */
export class HostRuntimeDemand implements HostRuntimeDemandPort {
  private readonly descriptors = new Map<string, RuntimeUnitDescriptor>()
  private readonly lifecycle: RuntimeDemandLifecycle
  private readonly failedStarts = new Map<string, FailedStart>()
  private readonly releasedStarts = new Map<string, { readonly attempt: number; readonly owner: RuntimeOwner | null }>()
  private readonly pending = new Map<symbol, PendingAdmission>()
  private readonly quarantined = new Map<symbol, PendingAdmission>()
  private readonly maximumOperations: number
  private adoption: Promise<void> | undefined
  private adoptionSelection: string | undefined
  private readonly deferredDrivers = new Map<string, string>()
  private readonly barriers = new Map<string, symbol>()
  private readonly acknowledgements = new Map<string, RuntimeOwner>()
  private reconciliation: Promise<void> | undefined
  private adopted = false
  private stopped = false

  constructor(private readonly options: HostRuntimeDemandOptions) {
    if (options.units.length === 0 || options.units.length > 32)
      throw new RangeError('Host demand needs between one and 32 runtime units')
    const maximumOperations = options.maximumOperations ?? 128
    if (!Number.isSafeInteger(maximumOperations) || maximumOperations < 1 || maximumOperations > 128)
      throw new RangeError('Invalid Host demand operation capacity')
    this.maximumOperations = maximumOperations
    for (const descriptor of options.units) {
      if (this.descriptors.has(descriptor.id)) throw new RangeError('Duplicate Host demand unit')
      this.descriptors.set(descriptor.id, descriptor)
    }
    // Validate the entire graph before any process admission or idle policy is installed.
    this.closure([...this.descriptors.keys()])
    this.lifecycle = new RuntimeDemandLifecycle(
      {
        start: async (input, signal) => {
          if (signal.aborted || this.stopped) return { kind: 'not-started' }
          // The caller obtains all capability dependencies in topological order first.
          // This lower atomic hold also prevents a reload between readiness and use.
          const selectedArtifactId = this.deferredDrivers.get(input.unitId)
          if (selectedArtifactId) {
            try {
              this.assertDeferredDriver({ unitId: input.unitId, selectedArtifactId })
            } catch {
              // An externally changed selection is not an authorized retry or owner adoption.
              this.barriers.set(input.unitId, Symbol())
              return { kind: 'unknown', owner: null }
            }
          }
          const hold = options.manager.holdDemand([input.unitId])
          try {
            const owners = await hold.ready
            const owner = owners.find((value) => value.unitId === input.unitId)
            if (!owner) {
              this.failedStarts.set(input.unitId, {
                attempt: input.attempt,
                attemptId: hold.attemptId,
                hold,
                owner: null,
              })
              return { kind: 'unknown', owner: null }
            }
            if (selectedArtifactId) {
              const unit = options.manager.snapshot().units.find((value) => value.descriptor.id === input.unitId)
              const current = unit?.generations.find((value) => value.role === 'default')
              if (
                !current ||
                current.phase !== 'serving' ||
                !sameOwner(owner, current) ||
                current.artifactId !== selectedArtifactId ||
                unit?.idle?.phase !== 'active'
              )
                throw new HbarError(
                  'RUNTIME_DEMAND_OWNER_CHANGED',
                  'First Driver owner differs from bootstrap selection',
                )
              // The original lower hold still pins this owner while protocol support is checked.
              options.manager.setIdleEnabled(input.unitId, true)
              this.deferredDrivers.delete(input.unitId)
            }
            hold.release()
            return { kind: 'started', owner }
          } catch {
            const settlement = hold.settlement()
            const owner =
              settlement.attemptId === hold.attemptId
                ? (settlement.units.find((unit) => unit.unitId === input.unitId)?.owner ?? null)
                : null
            const proof = await options.manager.reconcileDemandHold(hold.attemptId).catch(() => undefined)
            if (
              proof?.canRelease &&
              proof.attemptId === hold.attemptId &&
              proof.settlement.attemptId === hold.attemptId &&
              proof.settlement.status !== 'pending' &&
              proof.settlement.units.every((unit) => unit.dispatch === 'not-started')
            ) {
              // No core owner was granted by this start. Existing serving dependencies
              // are not retired: retry can adopt them through normal admission.
              hold.release()
              return { kind: 'not-started' }
            }
            // A readiness error cannot prove that a child was never dispatched. Keep the
            // exact lower admission pin and the attempt until explicit reconciliation.
            this.failedStarts.set(input.unitId, { attempt: input.attempt, attemptId: hold.attemptId, hold, owner })
            return { kind: 'unknown', owner }
          }
        },
        retire: async (input) => {
          const released = this.releasedStarts.get(input.unitId)
          if (released?.attempt === input.attempt && !input.owner && !released.owner) {
            // Exact attempt proof establishes no surviving process owned by THIS start,
            // not absence/retirement of unrelated already-serving owners.
            this.releasedStarts.delete(input.unitId)
            return { kind: 'confirmed-physical-exit' }
          }
          if (!input.owner) return { kind: 'unknown' }
          if (this.proven(input.owner)) {
            this.releasedStarts.delete(input.unitId)
            this.acknowledgements.set(input.unitId, input.owner)
            return { kind: 'confirmed-physical-exit' }
          }
          if (this.failedStarts.has(input.unitId)) return { kind: 'unknown' }
          const outcome = await options.manager.retireIdle(input.unitId, input.owner)
          if (outcome === 'sleeping' || outcome === 'retired') {
            if (!this.proven(input.owner)) return { kind: 'unknown' }
            this.acknowledgements.set(input.unitId, input.owner)
            return { kind: 'confirmed-physical-exit' }
          }
          return { kind: outcome }
        },
      },
      options.clock,
      {
        maxUnits: 32,
        maxOutstanding: Math.min(65_536, maximumOperations * options.units.length + options.units.length),
        maxOutstandingPerUnit: maximumOperations + 1,
        maxConcurrentStarts: 2,
        maxStartWaiters: 32,
      },
    )
    for (const descriptor of options.units) {
      this.lifecycle.register({
        unitId: descriptor.id,
        ...(options.idleTimeoutMs === undefined ? {} : { idleTimeoutMs: options.idleTimeoutMs }),
      })
    }
  }

  /** Adopt existing serving children once. Metadata reads never call this method.
   * Must finish after startup recovery and before the Kernel/Goal scheduling gates open.
   * Only an explicit exact dormant Driver selection may remain unstarted; other missing owners fail.
   */
  adoptServing(signal: AbortSignal, deferredDriver?: HostRuntimeDeferredDriver): Promise<void> {
    const selection = deferredDriver ? { ...deferredDriver } : undefined
    const selectionKey = JSON.stringify(selection ? [selection.unitId, selection.selectedArtifactId] : null)
    if (this.adoption) {
      if (this.adoptionSelection !== selectionKey)
        return Promise.reject(
          new HbarError('RUNTIME_INITIALIZING', 'Bootstrap selection cannot change during adoption'),
        )
      return this.adoption
    }
    this.adoptionSelection = selectionKey
    const adoption = Promise.resolve().then(async () => {
      this.assertOpen(signal)
      const units = this.options.manager.snapshot().units
      if (selection) this.assertDeferredDriver(selection)
      const ids = [...this.descriptors.keys()].filter((id) => id !== selection?.unitId)
      if (selection && ids.length && this.closure(ids).includes(selection.unitId))
        throw new HbarError('RUNTIME_INITIALIZING', 'Serving bootstrap depends on the deferred Driver')
      if (selection) this.assertDeferredServingDescriptors(ids)
      for (const id of ids) {
        const unit = units.find((value) => value.descriptor.id === id)
        if (!unit?.generations.some((value) => value.role === 'default' && value.phase === 'serving'))
          throw new HbarError('RUNTIME_INITIALIZING', 'Serving bootstrap ownership is incomplete')
      }
      const hold = ids.length ? await this.acquireInternal(ids, signal) : undefined
      try {
        this.assertOpen(signal)
        if (selection) {
          this.assertDeferredDriver(selection)
          this.assertDeferredServingDescriptors(ids)
        }
        for (const id of ids) this.options.manager.setIdleEnabled(id, true)
        if (selection) this.deferredDrivers.set(selection.unitId, selection.selectedArtifactId)
        this.adopted = true
      } finally {
        hold?.release()
      }
    })
    this.adoption = adoption
    return adoption
  }

  private assertDeferredServingDescriptors(ids: readonly string[]): void {
    const units = this.options.manager.snapshot().units
    for (const id of ids) {
      const descriptor = this.descriptors.get(id)
      const unit = units.find((value) => value.descriptor.id === id)
      if (
        !descriptor ||
        !unit ||
        JSON.stringify(runtimeUnitDescriptorSchema.parse(descriptor)) !== JSON.stringify(unit.descriptor)
      )
        throw new HbarError('RUNTIME_INITIALIZING', 'Deferred bootstrap serving descriptor differs from Manager')
    }
  }
  private assertDeferredDriver(selection: HostRuntimeDeferredDriver): void {
    const descriptor = this.descriptors.get(selection.unitId)
    const unit = this.options.manager.snapshot().units.find((value) => value.descriptor.id === selection.unitId)
    if (
      !descriptor ||
      descriptor.kind !== 'driver' ||
      descriptor.dependencies.length !== 0 ||
      !unit ||
      JSON.stringify(runtimeUnitDescriptorSchema.parse(descriptor)) !== JSON.stringify(unit.descriptor) ||
      unit.generations.length !== 0 ||
      unit.queuedArtifactId !== null ||
      unit.idle?.phase !== 'dormant' ||
      unit.idle.selectedArtifactId !== selection.selectedArtifactId ||
      !selection.selectedArtifactId ||
      unit.idle.demandHolds !== 0 ||
      unit.idle.checkpointPending ||
      unit.idle.enabled
    )
      throw new HbarError('RUNTIME_INITIALIZING', 'Explicit deferred Driver is not an exact unowned selection')
    // dormant can only be produced by Manager.stageInitialDriver, whose gate also
    // proves nextGeneration=0 and no current/candidate/queued/processing authority.
    // Never reinterpret a missing generation, sleeping owner, or UNKNOWN as this state.
  }

  acquire(unitIds: readonly string[], signal: AbortSignal): Promise<HostRuntimeDemandHold> {
    if (!this.adopted)
      return Promise.reject(new HbarError('RUNTIME_INITIALIZING', 'Runtime demand bootstrap is incomplete'))
    return this.acquireInternal(unitIds, signal)
  }

  /** Composition-root startup only. It adopts already serving dependencies; it
   * cannot start a missing process, retry a fault or bypass an UNKNOWN fence.
   */
  async acquireBootstrap(unitIds: readonly string[], signal: AbortSignal): Promise<HostRuntimeDemandHold> {
    this.assertOpen(signal)
    if (this.adopted) return this.acquire(unitIds, signal)
    if (this.adoption) {
      await this.adoption
      this.assertOpen(signal)
      return this.acquire(unitIds, signal)
    }
    const ids = this.closure(unitIds)
    const units = this.options.manager.snapshot().units
    const owners = ids.map((id) => {
      const generation = units
        .find((unit) => unit.descriptor.id === id)
        ?.generations.find((value) => value.role === 'default' && value.phase === 'serving')
      if (!generation)
        throw new HbarError('RUNTIME_INITIALIZING', 'Bootstrap demand requires an existing serving owner')
      return { unitId: id, generation: generation.generation, incarnation: generation.incarnation }
    })
    return this.acquireInternal(unitIds, signal, owners)
  }

  async withUnits<Result>(
    unitIds: readonly string[],
    signal: AbortSignal,
    operation: (owners: readonly RuntimeOwner[]) => Promise<Result>,
  ): Promise<Result> {
    const hold = await this.acquire(unitIds, signal)
    try {
      this.assertOpen(signal)
      return await operation(hold.owners)
    } finally {
      // This releases admission, not proof of physical completion. Manager/process
      // probes and exact Run/resource records must still prevent unsafe retirement.
      hold.release()
    }
  }

  /** Pure admission projection; recovery fences cannot be hidden by a ready successor. */
  admissionReady(): boolean {
    return (
      this.adopted &&
      !this.stopped &&
      this.barriers.size === 0 &&
      this.quarantined.size === 0 &&
      this.failedStarts.size === 0
    )
  }

  /** Pure bounded projection; health/metrics polling must use this path. */
  snapshot(): DemandSnapshot & {
    readonly pendingAdmissions: number
    readonly unresolvedAdmissions: number
    readonly unresolvedStarts: number
  } {
    return {
      ...this.lifecycle.snapshot(),
      pendingAdmissions: this.pending.size,
      unresolvedAdmissions: this.quarantined.size,
      unresolvedStarts: this.failedStarts.size,
    }
  }

  /** Fault invalidation is exact. It never silently adopts a recovered incarnation. */
  fence(owner: RuntimeOwner): void {
    this.barriers.set(owner.unitId, Symbol())
    this.lifecycle.fenceOwner(owner)
  }

  /** Pure bounded diagnostic facts, never reconciles or wakes a unit. */
  pendingSettlements(): readonly {
    readonly kind: 'start' | 'admission'
    readonly attemptId: string
    readonly unitId: string | null
    readonly coreAttempt: number | null
  }[] {
    return [
      ...[...this.failedStarts].map(([unitId, value]) => ({
        kind: 'start' as const,
        attemptId: value.attemptId,
        unitId,
        coreAttempt: value.attempt,
      })),
      ...[...this.quarantined.values()].flatMap((value) =>
        value.manager
          ? [{ kind: 'admission' as const, attemptId: value.manager.attemptId, unitId: null, coreAttempt: null }]
          : [],
      ),
    ]
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.lifecycle.stop()
    // Neither cancellation nor stop releases unknown physical work. Manager.close
    // and its native receipts remain responsible for terminal owner retirement.
  }

  /** Call synchronously immediately before Manager.reload; never await between them. */
  beginReload(unitIds: readonly string[]): { commit(operationId: string): void; abortBeforeDispatch(): void } {
    if (this.stopped) throw new HbarError('RUNTIME_STOPPING', 'Runtime demand admission is closed')
    const ids = this.closure(unitIds)
    this.assertUnbarred(ids)
    const states = this.lifecycle.snapshot().units
    if (
      ids.some((id) =>
        states.some(
          (state) =>
            state.unitId === id &&
            (state.pins || state.waiters || state.phase === 'starting' || state.phase === 'quiescing'),
        ),
      ) ||
      this.pending.size ||
      this.quarantined.size ||
      this.failedStarts.size
    )
      throw new HbarError('RUNTIME_IDLE_BUSY', 'Demand must settle before default replacement')
    const key = Symbol()
    for (const id of ids) this.barriers.set(id, key)
    let committed = false,
      ended = false
    return {
      commit: (operationId) => {
        if (ended || committed || !operationId || operationId.length > 160)
          throw new HbarError('INVALID_INPUT', 'Reload transition token is invalid')
        committed = true
        for (const state of states)
          if (ids.includes(state.unitId) && state.owner) this.lifecycle.fenceOwner(state.owner)
      },
      abortBeforeDispatch: () => {
        if (committed || ended) throw new HbarError('INVALID_INPUT', 'Dispatched reload cannot be aborted locally')
        ended = true
        for (const id of ids) if (this.barriers.get(id) === key) this.barriers.delete(id)
      },
    }
  }

  /** Bounded metadata maintenance, once per second by Host. Never adopts/wakes business. */
  reconcileRetirements(): Promise<void> {
    if (this.reconciliation) return this.reconciliation
    this.reconciliation = Promise.resolve()
      .then(async () => {
        for (const [key, pending] of this.quarantined) {
          const hold = pending.manager
          if (!hold) continue
          const proof = await this.options.manager.reconcileDemandHold(hold.attemptId)
          if (
            !proof.canRelease ||
            proof.attemptId !== hold.attemptId ||
            proof.settlement.attemptId !== hold.attemptId ||
            proof.settlement.status === 'pending'
          )
            continue
          // This settles only an abandoned admission's startup attempt. Existing core
          // owners remain fenced until their independent exact retirement receipt.
          hold.release()
          this.releaseLeases(pending.leases)
          this.quarantined.delete(key)
        }
        for (const [id, failed] of this.failedStarts) {
          const proof = await this.options.manager.reconcileDemandHold(failed.attemptId)
          if (
            !proof.canRelease ||
            proof.attemptId !== failed.attemptId ||
            failed.hold.attemptId !== failed.attemptId ||
            proof.settlement.attemptId !== failed.attemptId ||
            proof.settlement.status === 'pending'
          )
            continue
          failed.hold.release()
          this.failedStarts.delete(id)
          this.releasedStarts.set(id, { attempt: failed.attempt, owner: failed.owner })
          this.barriers.set(id, this.barriers.get(id) ?? Symbol())
        }
        for (const state of this.lifecycle.snapshot().units) {
          if (
            this.quarantined.size ||
            !this.barriers.has(state.unitId) ||
            state.pins ||
            state.waiters ||
            state.phase === 'starting' ||
            state.phase === 'quiescing'
          )
            continue
          if (state.owner && this.proven(state.owner)) {
            const retired = await this.lifecycle.retire(state.unitId)
            if (retired.kind === 'confirmed-physical-exit') this.acknowledgements.set(state.unitId, state.owner)
          } else if (!state.owner && this.releasedStarts.has(state.unitId)) {
            await this.lifecycle.retire(state.unitId)
          }
          const current = this.lifecycle.snapshot().units.find((value) => value.unitId === state.unitId)
          const selected = this.options.manager.snapshot().units.find((value) => value.descriptor.id === state.unitId)
          if (
            current?.phase === 'sleeping' &&
            !this.failedStarts.has(state.unitId) &&
            !selected?.queuedArtifactId &&
            !selected?.generations.some((value) => value.role === 'candidate') &&
            (selected?.idle?.phase === 'sleeping' ||
              selected?.generations.some((value) => value.role === 'default' && value.phase === 'serving'))
          )
            this.barriers.delete(state.unitId)
        }
      })
      .finally(() => {
        this.reconciliation = undefined
      })
    return this.reconciliation
  }

  private proven(owner: RuntimeOwner): boolean {
    const receipt = this.options.manager.retirement(owner)
    return (
      receipt.status === 'retired' &&
      sameOwner(owner, receipt.owner) &&
      sameOwner(owner, receipt.physical.owner) &&
      receipt.ownerCleanupCompleted &&
      receipt.physical.nativeJoined &&
      receipt.physical.onExitCompleted
    )
  }

  private assertUnbarred(ids: readonly string[]): void {
    if (ids.some((id) => this.barriers.has(id)))
      throw new HbarError('RUNTIME_RECOVERING', 'Runtime default transition requires retry after retirement')
  }

  private async acquireInternal(
    unitIds: readonly string[],
    signal: AbortSignal,
    bootstrapOwners?: readonly RuntimeOwner[],
  ): Promise<HostRuntimeDemandHold> {
    this.assertOpen(signal)
    if (this.pending.size + this.quarantined.size >= this.maximumOperations)
      throw new HbarError('RUNTIME_DEMAND_CAPACITY', 'Runtime demand admission capacity is exhausted')
    const ids = this.closure(unitIds)
    this.assertUnbarred(ids)
    const key = Symbol()
    const pending: PendingAdmission = { leases: [], manager: undefined, readySucceeded: false }
    this.pending.set(key, pending)
    try {
      if (!bootstrapOwners) {
        for (const id of ids) {
          this.assertOpen(signal)
          const lease = await this.lifecycle.acquire(id, signal)
          pending.leases.push(lease)
        }
      }
      this.assertOpen(signal)
      // Check the complete acquired set again after the last await. A reload/fault
      // can invalidate an earlier grant while a later module is still starting.
      const states = this.lifecycle.snapshot().units
      for (const lease of pending.leases) {
        const state = states.find((value) => value.unitId === lease.owner.unitId)
        if (state?.phase !== 'awake' || !state.owner || !sameOwner(lease.owner, state.owner))
          throw new HbarError('RUNTIME_DEMAND_OWNER_CHANGED', 'Captured demand ownership was invalidated')
      }
      const manager = this.options.manager.holdDemand(ids)
      pending.manager = manager
      const owners = await manager.ready
      pending.readySucceeded = true
      for (const expected of bootstrapOwners ?? []) {
        const owner = owners.find((value) => value.unitId === expected.unitId)
        if (!owner || !sameOwner(expected, owner))
          throw new HbarError('RUNTIME_DEMAND_OWNER_CHANGED', 'Bootstrap ownership changed during admission')
      }
      this.assertUnbarred(ids)
      const afterReadiness = this.lifecycle.snapshot().units
      for (const lease of pending.leases) {
        const owner = owners.find((value) => value.unitId === lease.owner.unitId)
        const state = afterReadiness.find((value) => value.unitId === lease.owner.unitId)
        if (
          state?.phase !== 'awake' ||
          !state.owner ||
          !sameOwner(lease.owner, state.owner) ||
          !owner ||
          !sameOwner(lease.owner, owner)
        ) {
          this.lifecycle.fenceOwner(lease.owner)
          throw new HbarError('RUNTIME_DEMAND_OWNER_CHANGED', 'Default ownership changed during admission')
        }
      }
      this.assertOpen(signal)
      for (const lease of pending.leases) {
        const previous = this.acknowledgements.get(lease.owner.unitId)
        if (previous && !sameOwner(previous, lease.owner)) {
          this.options.manager.acknowledgeRetirement(previous)
          this.acknowledgements.delete(lease.owner.unitId)
        }
      }
      const captured = owners.map((owner) => Object.freeze({ ...owner }))
      let released = false
      return {
        owners: captured,
        release: () => {
          if (released) return
          released = true
          manager.release()
          this.releaseLeases(pending.leases)
          this.pending.delete(key)
        },
      }
    } catch (error) {
      this.pending.delete(key)
      if (pending.manager && !pending.readySucceeded) {
        // ready may have started part of a closure before it failed. The caller has
        // no token; keep its exact holds, expose this state and deny replacement.
        this.quarantined.set(key, pending)
        for (const lease of pending.leases) this.lifecycle.fenceOwner(lease.owner)
      } else {
        // A shared startup owns its own lower physical pin. This caller's cancelled
        // dependency grants do not stand in for that startup's outcome.
        pending.manager?.release()
        this.releaseLeases(pending.leases)
      }
      throw error
    }
  }

  private closure(unitIds: readonly string[]): string[] {
    if (unitIds.length === 0 || unitIds.length > 32 || new Set(unitIds).size !== unitIds.length)
      throw new HbarError('INVALID_INPUT', 'Demand needs unique registered units')
    const ordered: string[] = []
    const visiting = new Set<string>()
    const visited = new Set<string>()
    const visit = (id: string): void => {
      if (visited.has(id)) return
      if (visiting.has(id)) throw new HbarError('RUNTIME_DEPENDENCY_CYCLE', 'Runtime dependency graph contains a cycle')
      const descriptor = this.descriptors.get(id)
      if (!descriptor) throw new HbarError('RUNTIME_UNIT_NOT_FOUND', 'Runtime dependency is not registered')
      visiting.add(id)
      for (const dependency of descriptor.dependencies) visit(dependency)
      visiting.delete(id)
      visited.add(id)
      ordered.push(id)
    }
    for (const id of unitIds) visit(id)
    return ordered
  }

  private releaseLeases(leases: DemandLease[]): void {
    for (const lease of leases.splice(0).reverse()) lease.release()
  }

  private assertOpen(signal: AbortSignal): void {
    if (this.stopped) throw new HbarError('RUNTIME_STOPPING', 'Runtime demand admission is closed')
    signal.throwIfAborted()
  }
}
