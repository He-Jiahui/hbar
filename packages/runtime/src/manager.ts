import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import {
  RUNTIME_LIMITS,
  runtimeDeltaSchema,
  runtimeReloadSchema,
  runtimeSnapshotSchema,
  runtimeUnitDescriptorSchema,
  type RuntimeDelta,
  type RuntimeOwner,
  type RuntimeReload,
  type RuntimeSnapshot,
  type RuntimeUnitDescriptor,
  type RuntimeVersion,
} from '@hbar/contracts/runtime'
import type { RuntimeArtifact, RuntimeArtifactSet } from './artifacts'
import type { ManagedProcess, RuntimePhysicalRetirementReceipt } from './process'
import type { IpcCallOptions } from './ipc'
import { runtimeIdleIpcIsEmpty } from './lifecycle'

export type ManagedGenerationPort = Pick<
  ManagedProcess,
  'owner' | 'snapshot' | 'references' | 'prepare' | 'activate' | 'drain' | 'call' | 'dispose'
> &
  Partial<Pick<ManagedProcess, 'idleSnapshot' | 'retireIdle' | 'retirementReceipt' | 'acknowledgeRetirement'>>
export interface RuntimeIdleCheckpoint {
  readonly status: 'noop' | 'prepared' | 'busy' | 'unknown'
  readonly owner: RuntimeOwner
}
export interface RuntimeManagerRetirement {
  readonly status: 'retired'
  readonly owner: RuntimeOwner
  readonly physical: RuntimePhysicalRetirementReceipt
  readonly ownerCleanupCompleted: true
  readonly retiredAt: number
}
export type RuntimeManagerRetirementState =
  RuntimeManagerRetirement | { readonly status: 'unverified'; readonly owner: RuntimeOwner }
export type RuntimeManagerIdleResult = 'busy' | 'sleeping' | 'retired' | 'unknown'
export interface RuntimeArtifactRegistry {
  artifactSet(id: string): RuntimeArtifactSet
  preparedSets(): string[]
}
export interface RuntimeManagerOptions {
  readonly instanceId: string
  readonly artifacts: RuntimeArtifactRegistry
  readonly create: (
    artifact: RuntimeArtifact,
    generation: number,
    changed: () => void,
    purpose?: 'idle-wake',
  ) => ManagedGenerationPort
  readonly references: (owner: RuntimeOwner) => { runs: number; resources: number; tools: number }
  /** Cancellable readiness checks alone. Production authority and writer retirement belong to activate(). */
  readonly beforeActivate?: (owner: RuntimeOwner, artifact: RuntimeArtifact, signal: AbortSignal) => Promise<void>
  readonly activationPreparationMs?: number
  /** Trusted composition guard: every external exact-owner proof consumer has settled/copied its evidence. */
  readonly canConsumeRetirement?: (owner: RuntimeOwner) => boolean
  readonly afterDispose?: (owner: RuntimeOwner) => void | Promise<void>
  /** Runs inside the per-unit admission boundary, before the final physical idle probe. */
  readonly beforeIdle?: (
    owner: RuntimeOwner,
    generation: ManagedGenerationPort,
    signal: AbortSignal,
  ) => Promise<RuntimeIdleCheckpoint>
  readonly idleCheckpointMs?: number
  /** Confirmed completion must finish Stable writer and owner cleanup before routing changes. */
  readonly afterIdle?: (owner: RuntimeOwner, status: 'confirmed-physical-exit' | 'unknown') => void | Promise<void>
  readonly sweepMs?: number
}
interface Candidate {
  readonly demandFact?: DemandUnitFact
  readonly purpose?: 'idle-wake'
  readonly artifact: RuntimeArtifact
  readonly operationId: string
  readonly controller: AbortController
  generation: ManagedGenerationPort | null
  ready: boolean
  cancelled: boolean
  committing: boolean
  reasonCode: string | null
}
export interface RuntimeDemandHold {
  readonly attemptId: string
  settlement(): RuntimeDemandSettlement
  /** A failed ready does NOT release this hold: UNKNOWN callers must retain it. */
  readonly ready: Promise<readonly RuntimeOwner[]>
  release(): void
}
export interface RuntimeDemandUnitSettlement {
  readonly unitId: string
  readonly owner: RuntimeOwner | null
  readonly dispatch: 'not-started' | 'started' | 'unknown'
}
export interface RuntimeDemandSettlement {
  readonly attemptId: string
  readonly status: 'pending' | 'settled' | 'unknown'
  readonly units: readonly RuntimeDemandUnitSettlement[]
}
export interface RuntimeDemandReleaseProof {
  readonly attemptId: string
  readonly canRelease: boolean
  readonly settlement: RuntimeDemandSettlement
}
interface DemandUnitFact {
  readonly unitId: string
  owner: RuntimeOwner | null
  dispatch: 'not-started' | 'started' | 'unknown'
  readonly owners: RuntimeOwner[]
}
interface DemandAttempt {
  readonly attemptId: string
  status: 'pending' | 'settled' | 'unknown'
  finished: boolean
  readonly facts: DemandUnitFact[]
  readonly cleaned: Set<string>
}
type IdlePhase = 'active' | 'sleeping' | 'retiring' | 'waking' | 'unknown'
interface Unit {
  serial: Promise<void>
  serialPending: number
  idleEnabled: boolean
  idlePhase: IdlePhase
  demandHolds: number
  checkpointPending: boolean
  readonly descriptor: RuntimeUnitDescriptor
  readonly generations: Map<number, ManagedGenerationPort>
  nextGeneration: number
  current: ManagedGenerationPort | null
  currentArtifact: RuntimeArtifact | null
  candidate: Candidate | null
  queued: Candidate | null
  processing: Promise<void> | null
}

class PreparationCapacity {
  private active = 0
  private readonly waiting: Array<{
    resolve(release: () => void): void
    reject(error: Error): void
    signal: AbortSignal
    abort(): void
  }> = []
  acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(new HbarError('RUNTIME_CANCELLED', 'Runtime preparation was cancelled'))
    if (this.active < RUNTIME_LIMITS.preparing) {
      this.active++
      return Promise.resolve(() => this.release())
    }
    if (this.waiting.length >= 512)
      return Promise.reject(new HbarError('RUNTIME_PREPARATION_CAPACITY', 'Runtime preparation queue is exhausted'))
    return new Promise((resolve, reject) => {
      const item = {
        resolve,
        reject,
        signal,
        abort: () => {
          const index = this.waiting.indexOf(item)
          if (index >= 0) this.waiting.splice(index, 1)
          signal.removeEventListener('abort', item.abort)
          reject(new HbarError('RUNTIME_CANCELLED', 'Runtime preparation was cancelled'))
        },
      }
      this.waiting.push(item)
      signal.addEventListener('abort', item.abort, { once: true })
    })
  }
  private release(): void {
    const next = this.waiting.shift()
    if (next) {
      next.signal.removeEventListener('abort', next.abort)
      next.resolve(() => this.release())
    } else this.active--
  }
}

function finished(operation: RuntimeReload): boolean {
  return ['completed', 'failed', 'cancelled', 'restart_required'].includes(operation.phase)
}
function nativeFingerprint(artifact: RuntimeArtifact): string {
  const native = /\.(?:node|dll|so|dylib|exe|pyd|wasm)$/i
  return JSON.stringify(
    [
      ...artifact.files.filter((file) => native.test(file.name)).map((file) => [file.name, file.sha256] as const),
      ...artifact.resourceFiles
        .filter((file) => native.test(file.sourcePath))
        .map((file) => [file.sourcePath, file.sha256] as const),
    ].sort((left, right) => left[0].localeCompare(right[0])),
  )
}

/** Stable default routing and at most two serving generations plus one read-only candidate per unit. */
export class RuntimeManager {
  private readonly units = new Map<string, Unit>()
  private readonly operations = new Map<string, RuntimeReload>()
  private readonly retirementReceiptSources = new Map<
    string,
    { readonly generation: ManagedGenerationPort; acknowledged: boolean; readonly requiresDemandAcknowledgement?: true }
  >()
  private readonly retirements = new Map<string, RuntimeManagerRetirement>()
  private readonly retirementReservations = new Set<string>()
  private readonly demandAttempts = new Map<string, DemandAttempt>()
  private readonly capacity = new PreparationCapacity()
  private readonly listeners = new Set<(delta: RuntimeDelta) => void>()
  private readonly changedUnits = new Set<string>()
  private readonly changedOperations = new Set<string>()
  private readonly sweep: ReturnType<typeof setInterval>
  private flushing = false
  private revision = 0
  private stopped = false
  private closing: Promise<void> | undefined

  constructor(private readonly options: RuntimeManagerOptions) {
    const activationPreparationMs = options.activationPreparationMs ?? RUNTIME_LIMITS.startupMs
    if (
      !Number.isSafeInteger(activationPreparationMs) ||
      activationPreparationMs < 1 ||
      activationPreparationMs > RUNTIME_LIMITS.startupMs
    )
      throw new RangeError('Invalid activation preparation deadline')
    const checkpointMs = options.idleCheckpointMs ?? RUNTIME_LIMITS.shutdownMs
    if (!Number.isSafeInteger(checkpointMs) || checkpointMs < 1 || checkpointMs > RUNTIME_LIMITS.startupMs)
      throw new RangeError('Invalid idle checkpoint deadline')
    const sweepMs = options.sweepMs ?? 1_000
    if (!Number.isSafeInteger(sweepMs) || sweepMs < 1) throw new RangeError('Invalid runtime sweep duration')
    this.sweep = setInterval(() => {
      for (const unit of this.units.values()) this.start(unit)
    }, sweepMs)
    this.sweep.unref()
  }

  register(descriptor: RuntimeUnitDescriptor): void {
    const parsed = runtimeUnitDescriptorSchema.parse(descriptor)
    if (this.units.has(parsed.id)) throw new HbarError('RUNTIME_UNIT_EXISTS', 'Runtime unit is already registered')
    if (this.units.size >= 512) throw new HbarError('RUNTIME_UNIT_CAPACITY', 'Runtime unit registration is exhausted')
    this.units.set(parsed.id, {
      descriptor: parsed,
      generations: new Map(),
      nextGeneration: 0,
      serial: Promise.resolve(),
      serialPending: 0,
      idleEnabled: false,
      idlePhase: 'active',
      demandHolds: 0,
      checkpointPending: false,
      current: null,
      currentArtifact: null,
      candidate: null,
      queued: null,
      processing: null,
    })
    this.changed(parsed.id)
  }

  snapshot(): RuntimeSnapshot {
    return runtimeSnapshotSchema.parse({
      revision: this.revision,
      instanceId: this.options.instanceId,
      ready: [...this.units.values()].every(
        (unit) =>
          !unit.descriptor.required ||
          (unit.idlePhase === 'active' && unit.current?.snapshot().phase === 'serving') ||
          (unit.idlePhase === 'sleeping' && unit.currentArtifact !== null),
      ),
      units: [...this.units.values()].map((unit) => this.unitSnapshot(unit)),
      preparedArtifactSets: this.options.artifacts.preparedSets(),
    })
  }
  artifactReferences(): { artifactIds: string[]; setIds: string[] } {
    return {
      artifactIds: [
        ...new Set(
          [...this.units.values()].flatMap((unit) => [
            ...[...unit.generations.values()].map((generation) => generation.snapshot().artifactId),
            ...[unit.currentArtifact, unit.candidate?.artifact, unit.queued?.artifact].flatMap((artifact) =>
              artifact ? [artifact.id] : [],
            ),
          ]),
        ),
      ],
      setIds: [
        ...new Set(
          [...this.operations.values()]
            .filter((operation) => !finished(operation))
            .map((operation) => operation.artifactSetId),
        ),
      ],
    }
  }
  subscribe(listener: (delta: RuntimeDelta) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getReload(operationId: string): RuntimeReload {
    const operation = this.operations.get(operationId)
    if (!operation) throw new HbarError('RUNTIME_OPERATION_NOT_FOUND', 'Runtime reload operation was not found')
    return runtimeReloadSchema.parse(operation)
  }

  reload(artifactSetId: string, unitIds: readonly string[], initial = false): { operationId: string } {
    if (this.stopped) throw new HbarError('RUNTIME_STOPPING', 'Runtime manager is stopping')
    if (!unitIds.length || unitIds.length > 512 || new Set(unitIds).size !== unitIds.length)
      throw new HbarError('INVALID_INPUT', 'Runtime reload needs unique registered units')
    const set = this.options.artifacts.artifactSet(artifactSetId)
    const targets = unitIds.map((id) => {
      const unit = this.units.get(id)
      const artifact = set.artifacts.find((artifact) => artifact.unitId === id)
      if (!unit || !artifact)
        throw new HbarError('RUNTIME_UNIT_NOT_FOUND', 'Runtime reload target or artifact is not registered')
      if (unit.idlePhase === 'unknown')
        throw new HbarError('RUNTIME_EXIT_UNKNOWN', 'Unresolved idle owner blocks replacement')
      if (unit.demandHolds) throw new HbarError('RUNTIME_IDLE_BUSY', 'Demand admission pins the current runtime owner')
      return { unit, artifact }
    })
    if (this.operations.size >= 256) {
      const expired = [...this.operations.values()].find(finished)
      if (!expired) throw new HbarError('RUNTIME_OPERATION_CAPACITY', 'Runtime reload operation capacity is exhausted')
      this.operations.delete(expired.operationId)
    }
    const operationId = crypto.randomUUID()
    const now = Date.now()
    const operation = runtimeReloadSchema.parse({
      operationId,
      artifactSetId,
      phase: 'queued',
      createdAt: now,
      updatedAt: now,
      switchedAt: null,
      cancellable: true,
      units: targets.map(({ unit, artifact }) => ({
        unitId: unit.descriptor.id,
        artifactId: artifact.id,
        generation: null,
        phase: 'queued',
        reasonCode: null,
      })),
    })
    this.operations.set(operationId, operation)
    for (const { unit, artifact } of targets) {
      if (
        (!initial && !unit.descriptor.reloadable) ||
        artifact.descriptor.contractFingerprint !== unit.descriptor.contractFingerprint ||
        artifact.descriptor.storageSchema !== unit.descriptor.storageSchema ||
        artifact.descriptor.kind !== unit.descriptor.kind ||
        artifact.descriptor.isolation !== unit.descriptor.isolation
      ) {
        this.update(operationId, unit.descriptor.id, 'restart_required', 'RUNTIME_RESTART_REQUIRED')
        continue
      }
      if (unit.currentArtifact && nativeFingerprint(unit.currentArtifact) !== nativeFingerprint(artifact)) {
        this.update(operationId, unit.descriptor.id, 'restart_required', 'RUNTIME_NATIVE_RESTART_REQUIRED')
        continue
      }
      if (unit.current?.snapshot().artifactId === artifact.id) {
        this.update(operationId, unit.descriptor.id, 'completed', null, unit.current.snapshot().generation)
        continue
      }
      if (unit.queued) this.cancelCandidate(unit, unit.queued, 'RUNTIME_CANDIDATE_SUPERSEDED')
      if (unit.candidate) this.cancelCandidate(unit, unit.candidate, 'RUNTIME_CANDIDATE_SUPERSEDED')
      unit.queued = {
        artifact,
        operationId,
        controller: new AbortController(),
        generation: null,
        ready: false,
        cancelled: false,
        committing: false,
        reasonCode: null,
      }
      this.changed(unit.descriptor.id, operationId)
      this.start(unit)
    }
    this.changed(undefined, operationId)
    return { operationId }
  }

  cancelReload(operationId: string): RuntimeReload {
    const operation = this.operations.get(operationId)
    if (!operation) throw new HbarError('RUNTIME_OPERATION_NOT_FOUND', 'Runtime reload operation was not found')
    if (finished(operation)) return this.getReload(operationId)
    for (const unit of this.units.values()) {
      if (unit.queued?.operationId === operationId) this.cancelCandidate(unit, unit.queued, 'USER_CANCELLED')
      if (unit.candidate?.operationId === operationId) this.cancelCandidate(unit, unit.candidate, 'USER_CANCELLED')
      this.start(unit)
    }
    return this.getReload(operationId)
  }

  /** Explicit opt-in. Existing serving defaults are adopted; no unit starts or stops here. */
  setIdleEnabled(unitId: string, enabled: boolean): void {
    if (this.stopped) throw new HbarError('RUNTIME_STOPPING', 'Runtime manager is stopping')
    const unit = this.units.get(unitId)
    if (!unit) throw new HbarError('RUNTIME_UNIT_NOT_FOUND', 'Idle target is not registered')
    if (enabled && (!unit.current?.idleSnapshot || !unit.current.retireIdle || !unit.current.retirementReceipt))
      throw new HbarError('RUNTIME_IDLE_UNSUPPORTED', 'Idle protocol is not available on this serving default')
    if (!enabled && unit.idlePhase !== 'active')
      throw new HbarError('RUNTIME_IDLE_BUSY', 'Wake and settle the idle target before disabling policy')
    unit.idleEnabled = enabled
    this.changed(unitId)
  }

  /** Synchronously pins exact dependency closure before any asynchronous wake/claim admission. */
  holdDemand(unitIds: readonly string[]): RuntimeDemandHold {
    if (this.stopped) throw new HbarError('RUNTIME_STOPPING', 'Runtime manager is stopping')
    if (this.demandAttempts.size >= 256)
      throw new HbarError('RUNTIME_DEMAND_CAPACITY', 'Demand attempt registry is exhausted')
    if (!unitIds.length || unitIds.length > 512 || new Set(unitIds).size !== unitIds.length)
      throw new HbarError('INVALID_INPUT', 'Demand targets must be unique registered units')
    const closure: Unit[] = []
    const visiting = new Set<string>()
    const visited = new Set<string>()
    const visit = (id: string): void => {
      if (visited.has(id)) return
      if (visiting.has(id))
        throw new HbarError('RUNTIME_DEPENDENCY_CYCLE', 'Demand dependency closure contains a cycle')
      const unit = this.units.get(id)
      if (!unit) throw new HbarError('RUNTIME_UNIT_NOT_FOUND', 'Demand dependency is not registered')
      if (unit.demandHolds >= 256 || unit.serialPending >= 256)
        throw new HbarError('RUNTIME_DEMAND_CAPACITY', 'Demand hold capacity is exhausted')
      visiting.add(id)
      for (const dependency of unit.descriptor.dependencies) visit(dependency)
      visiting.delete(id)
      visited.add(id)
      closure.push(unit)
    }
    for (const id of unitIds) visit(id)
    const attempt: DemandAttempt = {
      attemptId: crypto.randomUUID(),
      status: 'pending',
      finished: false,
      facts: closure.map((unit) => ({ unitId: unit.descriptor.id, owner: null, dispatch: 'not-started', owners: [] })),
      cleaned: new Set(),
    }
    this.demandAttempts.set(attempt.attemptId, attempt)
    for (const unit of closure) {
      unit.demandHolds++
      this.changed(unit.descriptor.id)
    }
    let released = false
    const ready = (async (): Promise<readonly RuntimeOwner[]> => {
      const owners: RuntimeOwner[] = []
      for (const unit of closure) {
        const fact = attempt.facts.find((value) => value.unitId === unit.descriptor.id)
        if (!fact) throw new HbarError('RUNTIME_DEMAND_FACT_MISSING', 'Demand closure fact is unavailable')
        const owner = await this.serialize(unit, async () => {
          if (this.stopped || released) throw new HbarError('RUNTIME_STOPPING', 'Demand admission was closed')
          if (unit.idlePhase === 'unknown')
            throw new HbarError('RUNTIME_EXIT_UNKNOWN', 'Previous idle retirement is unresolved')
          if (unit.candidate || unit.queued) throw new HbarError('RUNTIME_IDLE_BUSY', 'Reload owns the selected target')
          if (unit.current?.snapshot().phase === 'serving') {
            // Adoption dispatches no startup at all. Capture exact selected owner without
            // treating a pre-existing serving process as this attempt's physical child.
            fact.owner = structuredClone(unit.current.owner())
            return unit.current.owner()
          }
          if (unit.idlePhase !== 'sleeping' || !unit.currentArtifact || unit.current)
            throw new HbarError('RUNTIME_RECOVERING', 'Demand target is not safely sleeping')
          const selected = unit.currentArtifact
          unit.idlePhase = 'waking'
          this.changed(unit.descriptor.id)
          // Feed selected immutable bytes through the same preparation/activation authority path.
          unit.queued = {
            demandFact: fact,
            purpose: 'idle-wake',
            artifact: selected,
            operationId: crypto.randomUUID(),
            controller: new AbortController(),
            generation: null,
            ready: false,
            cancelled: false,
            committing: false,
            reasonCode: null,
          }
          try {
            await this.process(unit)
          } catch (error) {
            if (!this.stopped) this.markIdleUnknown(unit)
            throw error
          }
          if (this.stopped || released) throw new HbarError('RUNTIME_STOPPING', 'Demand admission closed during wake')
          const awakened = this.servingGeneration(unit)
          if (!awakened) {
            this.markIdleUnknown(unit)
            throw new HbarError('RUNTIME_EXIT_UNKNOWN', 'Wake did not establish a serving owner')
          }
          unit.idlePhase = 'active'
          this.changed(unit.descriptor.id)
          return awakened.owner()
        })
        owners.push(owner)
      }
      return owners
    })()
    // Attach a handler now; ownership remains held until caller explicitly releases it.
    void ready.then(
      () => {
        attempt.status = 'settled'
        attempt.finished = true
      },
      () => {
        attempt.status = 'unknown'
        attempt.finished = true
      },
    )
    return {
      attemptId: attempt.attemptId,
      settlement: () => this.demandSettlement(attempt),
      ready,
      release: () => {
        if (released) return
        released = true
        for (const unit of closure) {
          unit.demandHolds--
          this.changed(unit.descriptor.id)
        }
        if (attempt.finished) this.demandAttempts.delete(attempt.attemptId)
        else
          void ready.then(
            () => {
              this.demandAttempts.delete(attempt.attemptId)
            },
            () => {
              this.demandAttempts.delete(attempt.attemptId)
            },
          )
      },
    }
  }

  async reconcileDemandHold(attemptId: string): Promise<RuntimeDemandReleaseProof> {
    const attempt = this.demandAttempts.get(attemptId)
    if (!attempt) throw new HbarError('RUNTIME_DEMAND_ATTEMPT_NOT_FOUND', 'Demand attempt is not retained')
    if (attempt.finished)
      for (const fact of attempt.facts) {
        if (fact.dispatch !== 'started') continue
        const unit = this.units.get(fact.unitId)
        if (!unit) continue
        await this.serialize(unit, async () => {
          if (unit.checkpointPending || unit.candidate || unit.queued) return
          for (const owner of fact.owners) {
            if (attempt.cleaned.has(this.ownerKey(owner)) || this.retirement(owner).status === 'retired') continue
            const generation = unit.generations.get(owner.generation)
            if (!generation || !this.sameOwner(generation.owner(), owner) || !this.zeroReferences(generation, owner))
              continue
            const physical = this.physicalReceipt(generation, owner)
            if (!physical || (generation === unit.current && !this.cleanIdleReceipt(physical))) continue
            // This only accepts already-physical proof; it does not retire or replace a live owner.
            // Demand holds stay pinned until the returned proof is explicitly consumed by release().
            try {
              const current = generation === unit.current
              await this.finishRetirement(unit, generation, physical, current)
              unit.generations.delete(owner.generation)
              if (current) {
                unit.current = null
                unit.idlePhase = 'sleeping'
              }
              this.changed(unit.descriptor.id)
            } catch {
              /* No proof: retain hold and owner. */
            }
          }
        })
      }
    const canRelease =
      attempt.finished &&
      attempt.facts.every(
        (fact) =>
          fact.dispatch === 'not-started' ||
          (fact.dispatch === 'started' &&
            fact.owners.length > 0 &&
            fact.owners.every(
              (owner) => attempt.cleaned.has(this.ownerKey(owner)) || this.retirement(owner).status === 'retired',
            )),
      )
    return { attemptId, canRelease, settlement: this.demandSettlement(attempt) }
  }
  private demandSettlement(attempt: DemandAttempt): RuntimeDemandSettlement {
    return {
      attemptId: attempt.attemptId,
      status: attempt.status,
      units: attempt.facts.map((fact) => ({
        unitId: fact.unitId,
        owner: fact.owner ? structuredClone(fact.owner) : null,
        dispatch: fact.dispatch,
      })),
    }
  }
  private captureDemand(fact: DemandUnitFact, generation: ManagedGenerationPort): void {
    const owner = generation.owner()
    if (fact.owners.length >= 16 && !fact.owners.some((value) => this.sameOwner(value, owner))) {
      fact.dispatch = 'unknown'
      fact.owner = null
      throw new HbarError('RUNTIME_DEMAND_OWNER_CAPACITY', 'Demand attempt owner history is exhausted')
    }
    fact.owner = structuredClone(owner)
    if (!fact.owners.some((value) => this.sameOwner(value, owner))) fact.owners.push(structuredClone(owner))
    if (fact.dispatch !== 'unknown') fact.dispatch = 'started'
  }
  private captureCleanedDemand(generation: ManagedGenerationPort, owner: RuntimeOwner): void {
    const physical = this.physicalReceipt(generation, owner)
    if (!physical) return
    for (const attempt of this.demandAttempts.values()) {
      if (attempt.facts.some((fact) => fact.owners.some((value) => this.sameOwner(value, owner))))
        attempt.cleaned.add(this.ownerKey(owner))
    }
  }

  /** No inference from missing current: only a retained exact-owner receipt proves retirement. */
  retirement(owner: RuntimeOwner): RuntimeManagerRetirementState {
    const receipt = this.retirements.get(this.ownerKey(owner))
    return receipt ? structuredClone(receipt) : { status: 'unverified', owner: structuredClone(owner) }
  }
  /** Caller acknowledges only after its core owner reconciliation/adoption is committed. */
  acknowledgeRetirement(owner: RuntimeOwner): boolean {
    const key = this.ownerKey(owner)
    if (!this.retirements.has(key)) return false
    const source = this.retirementReceiptSources.get(key)
    if (source?.generation.retirementReceipt?.(owner)) {
      // Consumer acknowledgement must not discard Manager's only copy while Process consumption is pending.
      if (source.acknowledged) return false
      source.acknowledged = true
      return true
    }
    this.retirementReceiptSources.delete(key)
    return this.retirements.delete(key)
  }

  /** Explicit old-incarnation receipt consumption. No shutdown, replay, default replacement or UNKNOWN clearing. */
  consumeRetirementReceipt(generation: ManagedGenerationPort, expectedOwner: RuntimeOwner): Promise<boolean> {
    const unit = this.units.get(expectedOwner.unitId)
    if (!unit || !generation.acknowledgeRetirement || !this.options.canConsumeRetirement) return Promise.resolve(false)
    return this.serialize(unit, async () => {
      const allowed = (): boolean => this.options.canConsumeRetirement?.(expectedOwner) === true
      const oldReferencesClear = (): boolean => {
        // Process snapshot requests belong to the successor; exact native exit proves the old transport is gone.
        const refs = this.options.references(expectedOwner)
        return refs.runs === 0 && refs.resources === 0 && refs.tools === 0
      }
      const physical = this.physicalReceipt(generation, expectedOwner)
      if (!physical || !allowed()) return false
      // Clean idle has already returned through Process.retireIdle, afterIdle, and Manager's own copy.
      if (this.retirement(expectedOwner).status === 'retired') {
        const key = this.ownerKey(expectedOwner),
          source = this.retirementReceiptSources.get(key)
        if (!source || source.generation !== generation) return false
        if (source.requiresDemandAcknowledgement && !source.acknowledged) return false
        const consumed = generation.acknowledgeRetirement?.(expectedOwner) ?? false
        if (consumed) {
          this.retirementReceiptSources.delete(key)
          if (source?.acknowledged) this.retirements.delete(key)
        }
        return consumed
      }
      // Ordinary automatic recovery reuses the same generation object. Only an exact OLD incarnation can use this branch.
      const successor = generation.owner()
      if (
        this.sameOwner(successor, expectedOwner) ||
        successor.unitId !== expectedOwner.unitId ||
        successor.generation !== expectedOwner.generation ||
        unit.generations.get(expectedOwner.generation) !== generation ||
        unit.checkpointPending ||
        !oldReferencesClear()
      )
        return false
      const recoveryKey = this.ownerKey(expectedOwner)
      if (
        this.retirementReservations.has(recoveryKey) ||
        this.retirements.size + this.retirementReservations.size >= 1024
      )
        return false
      this.retirementReservations.add(recoveryKey)
      try {
        await this.options.afterDispose?.(expectedOwner)
        if (!allowed() || !this.sameOwner(generation.owner(), successor) || !oldReferencesClear()) return false
        // Preserve the old exact native+cleanup proof before consuming Process's copy.
        // Successor authority and the current generation remain unchanged.
        this.retirements.set(recoveryKey, {
          status: 'retired',
          owner: structuredClone(expectedOwner),
          physical: structuredClone(physical),
          ownerCleanupCompleted: true,
          retiredAt: Date.now(),
        })
        this.retirementReceiptSources.set(recoveryKey, {
          generation,
          acknowledged: false,
          requiresDemandAcknowledgement: true,
        })
        this.captureCleanedDemand(generation, expectedOwner)
        return false // HostDemand must consume the retained proof before Process ACK.
      } finally {
        this.retirementReservations.delete(recoveryKey)
      }
    })
  }
  retireIdle(unitId: string, expectedOwner: RuntimeOwner): Promise<RuntimeManagerIdleResult> {
    if (unitId !== expectedOwner.unitId)
      return Promise.reject(new HbarError('RUNTIME_OWNER_MISMATCH', 'Idle target owner does not match unit'))
    const unit = this.units.get(unitId)
    if (!unit) return Promise.reject(new HbarError('RUNTIME_UNIT_NOT_FOUND', 'Idle target is not registered'))
    return this.serialize(unit, async () => {
      if (this.retirement(expectedOwner).status === 'retired') return 'retired'
      if (
        this.stopped ||
        !unit.idleEnabled ||
        unit.idlePhase !== 'active' ||
        unit.candidate ||
        unit.queued ||
        unit.demandHolds ||
        unit.checkpointPending
      )
        return 'busy'
      // Receipt capacity may delay this optional retirement, never ordinary old-generation disposal.
      if (this.retirements.size + this.retirementReservations.size >= 1024) return 'busy'
      const generation = unit.current
      if (
        !generation?.idleSnapshot ||
        !generation.retireIdle ||
        !generation.retirementReceipt ||
        !this.sameOwner(generation.owner(), expectedOwner)
      )
        return 'busy'
      if (!this.zeroReferences(generation, expectedOwner)) return 'busy'
      // Include preflight IPC counts in ManagedProcess; DB resources are NOT erased here.
      const preflight = await generation.idleSnapshot()
      if (
        this.stopped ||
        unit.candidate ||
        unit.queued ||
        unit.demandHolds ||
        !this.zeroReferences(generation, expectedOwner) ||
        unit.current !== generation ||
        !this.sameOwner(generation.owner(), expectedOwner) ||
        !this.sameOwner(preflight.owner, expectedOwner) ||
        preflight.phase !== 'serving' ||
        preflight.runs !== 0 ||
        !preflight.parent ||
        !runtimeIdleIpcIsEmpty(preflight.parent) ||
        !preflight.child ||
        preflight.child.requests !== 0 ||
        preflight.child.runs !== 0 ||
        !runtimeIdleIpcIsEmpty(preflight.child.ipc)
      )
        return 'busy'
      unit.idlePhase = 'retiring'
      this.changed(unitId)
      try {
        const beforeIdle = this.options.beforeIdle
        const checkpoint: RuntimeIdleCheckpoint = beforeIdle
          ? await this.idleHook(unit, (signal) => beforeIdle(expectedOwner, generation, signal))
          : { status: 'noop', owner: expectedOwner }
        if (!this.sameOwner(checkpoint.owner, expectedOwner) || checkpoint.status === 'unknown')
          return this.idleUnknown(unit, expectedOwner)
        if (checkpoint.status === 'busy') {
          unit.idlePhase = 'active'
          this.changed(unitId)
          return 'busy'
        }
        const prepared = checkpoint.status === 'prepared'
        if (
          this.stopped ||
          unit.candidate ||
          unit.queued ||
          unit.demandHolds ||
          !this.zeroReferences(generation, expectedOwner) ||
          unit.current !== generation ||
          !this.sameOwner(generation.owner(), expectedOwner)
        ) {
          if (prepared) return this.idleUnknown(unit, expectedOwner)
          unit.idlePhase = 'active'
          this.changed(unitId)
          return 'busy'
        }
        const idle = await generation.idleSnapshot()
        if (
          !idle.eligible ||
          !this.sameOwner(idle.owner, expectedOwner) ||
          !this.sameOwner(generation.owner(), expectedOwner) ||
          unit.current !== generation ||
          this.stopped ||
          unit.candidate ||
          unit.queued ||
          unit.demandHolds ||
          !this.zeroReferences(generation, expectedOwner)
        ) {
          if (prepared) return this.idleUnknown(unit, expectedOwner)
          unit.idlePhase = 'active'
          this.changed(unitId)
          return 'busy'
        }
        const result = await generation.retireIdle(expectedOwner)
        if (result.status === 'busy' && !prepared) {
          unit.idlePhase = 'active'
          this.changed(unitId)
          return 'busy'
        }
        if (
          result.status !== 'confirmed-physical-exit' ||
          !this.sameOwner(result.owner, expectedOwner) ||
          result.exitCode !== 0 ||
          !result.disposalAcknowledged ||
          !result.nativeJoined
        )
          return this.idleUnknown(unit, expectedOwner)
        const physical = this.physicalReceipt(generation, expectedOwner)
        if (!physical || !this.cleanIdleReceipt(physical)) return this.idleUnknown(unit, expectedOwner)
        await this.finishRetirement(unit, generation, physical, true)
        if (unit.current !== generation)
          throw new HbarError('RUNTIME_OWNER_MISMATCH', 'Idle default changed during retirement')
        unit.current = null
        unit.generations.delete(expectedOwner.generation)
        unit.idlePhase = 'sleeping'
        this.changed(unitId)
        return 'sleeping'
      } catch {
        return this.idleUnknown(unit, expectedOwner)
      }
    })
  }

  /** Explicit same-owner reconciliation; never kills, restarts, clears business fences, or guesses exit. */
  reconcileIdle(expectedOwner: RuntimeOwner): Promise<RuntimeManagerIdleResult> {
    const unit = this.units.get(expectedOwner.unitId)
    if (!unit) return Promise.reject(new HbarError('RUNTIME_UNIT_NOT_FOUND', 'Reconciliation target is not registered'))
    return this.serialize(unit, async () => {
      if (this.retirement(expectedOwner).status === 'retired') return 'retired'
      if (this.stopped || unit.checkpointPending || unit.demandHolds || unit.candidate || unit.queued) return 'unknown'
      const generation = unit.generations.get(expectedOwner.generation)
      if (
        !generation ||
        !this.sameOwner(generation.owner(), expectedOwner) ||
        !this.zeroReferences(generation, expectedOwner)
      )
        return 'unknown'
      const current = unit.current === generation
      if (current && unit.idlePhase !== 'unknown') return 'busy'
      const physical = this.physicalReceipt(generation, expectedOwner)
      // An unclean current exit never authorizes a replacement merely because it is physical.
      if (!physical || (current && !this.cleanIdleReceipt(physical))) return 'unknown'
      try {
        await this.finishRetirement(unit, generation, physical, current)
        unit.generations.delete(expectedOwner.generation)
        if (current) {
          unit.current = null
          unit.idlePhase = 'sleeping'
        }
        this.changed(unit.descriptor.id)
        return current ? 'sleeping' : 'retired'
      } catch {
        return this.idleUnknown(unit, expectedOwner)
      }
    })
  }

  private ownerKey(owner: RuntimeOwner): string {
    return JSON.stringify([owner.unitId, owner.generation, owner.incarnation])
  }
  private zeroReferences(generation: ManagedGenerationPort, owner: RuntimeOwner): boolean {
    const refs = this.options.references(owner)
    return (
      refs.runs === 0 && refs.resources === 0 && refs.tools === 0 && generation.snapshot().references.requests === 0
    )
  }
  private physicalReceipt(
    generation: ManagedGenerationPort,
    owner: RuntimeOwner,
  ): RuntimePhysicalRetirementReceipt | null {
    const receipt = generation.retirementReceipt?.(owner)
    return receipt && this.sameOwner(receipt.owner, owner) && receipt.nativeJoined && receipt.onExitCompleted
      ? structuredClone(receipt)
      : null
  }
  private cleanIdleReceipt(receipt: RuntimePhysicalRetirementReceipt): boolean {
    return receipt.exitCode === 0 && !receipt.forced && receipt.cleanDisposeAck
  }
  private async finishRetirement(
    unit: Unit,
    generation: ManagedGenerationPort,
    physical: RuntimePhysicalRetirementReceipt,
    idle: boolean,
  ): Promise<void> {
    const key = this.ownerKey(physical.owner)
    if (this.retirements.has(key)) return
    if (this.retirementReservations.has(key) || this.retirements.size + this.retirementReservations.size >= 1024)
      throw new HbarError('RUNTIME_RETIREMENT_CAPACITY', 'Unacknowledged retirement receipt capacity is exhausted')
    this.retirementReservations.add(key)
    try {
      await this.options.afterDispose?.(physical.owner)
      if (idle && this.options.afterIdle)
        await this.idleHook(unit, async () => {
          await this.options.afterIdle?.(physical.owner, 'confirmed-physical-exit')
        })
      if (!this.sameOwner(generation.owner(), physical.owner))
        throw new HbarError('RUNTIME_OWNER_MISMATCH', 'Retired generation changed owner')
      this.retirements.set(key, {
        status: 'retired',
        owner: structuredClone(physical.owner),
        physical: structuredClone(physical),
        ownerCleanupCompleted: true,
        retiredAt: Date.now(),
      })
      if (generation.acknowledgeRetirement) this.retirementReceiptSources.set(key, { generation, acknowledged: false })
      this.captureCleanedDemand(generation, physical.owner)
      // All Process/Manager idle reads and Host afterIdle copies have now completed.
      if (
        this.options.canConsumeRetirement?.(physical.owner) === true &&
        generation.acknowledgeRetirement?.(physical.owner)
      )
        this.retirementReceiptSources.delete(key)
    } finally {
      this.retirementReservations.delete(key)
    }
  }
  private async idleUnknown(unit: Unit, owner: RuntimeOwner): Promise<'unknown'> {
    this.markIdleUnknown(unit)
    if (!unit.checkpointPending && this.options.afterIdle) {
      try {
        await this.idleHook(unit, async () => {
          await this.options.afterIdle?.(owner, 'unknown')
        })
      } catch {
        /* Retain sealed UNKNOWN; notification cannot release it. */
      }
    }
    return 'unknown'
  }
  private async idleHook<T>(unit: Unit, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (unit.checkpointPending)
      throw new HbarError('RUNTIME_IDLE_CHECKPOINT_PENDING', 'Previous checkpoint has not settled')
    const controller = new AbortController()
    unit.checkpointPending = true
    const work = Promise.resolve().then(() => action(controller.signal))
    void work.then(
      () => {
        unit.checkpointPending = false
      },
      () => {
        unit.checkpointPending = false
      },
    )
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const error = new HbarError(
              'RUNTIME_IDLE_CHECKPOINT_TIMEOUT',
              'Idle checkpoint exceeded its bounded deadline',
            )
            controller.abort(error)
            reject(error)
          }, this.options.idleCheckpointMs ?? RUNTIME_LIMITS.shutdownMs)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  private sameOwner(left: RuntimeOwner, right: RuntimeOwner): boolean {
    return (
      left.unitId === right.unitId && left.generation === right.generation && left.incarnation === right.incarnation
    )
  }
  private servingGeneration(unit: Unit): ManagedGenerationPort | null {
    return unit.current?.snapshot().phase === 'serving' ? unit.current : null
  }
  private markIdleUnknown(unit: Unit): void {
    unit.idlePhase = 'unknown'
    // A queued reload has not created a child. Fail its operation without replaying it later.
    if (unit.queued) {
      unit.queued.controller.abort()
      this.update(unit.queued.operationId, unit.descriptor.id, 'failed', 'RUNTIME_EXIT_UNKNOWN')
      unit.queued = null
    }
    this.changed(unit.descriptor.id)
  }
  private serialize<T>(unit: Unit, action: () => Promise<T>): Promise<T> {
    // close owns one final queue entry even when admission has exhausted the bounded queue.
    if (!this.stopped && unit.serialPending >= 256)
      return Promise.reject(new HbarError('RUNTIME_LIFECYCLE_CAPACITY', 'Runtime lifecycle queue is exhausted'))
    unit.serialPending++
    const result = unit.serial.then(action)
    unit.serial = result.then(
      () => {
        unit.serialPending--
      },
      () => {
        unit.serialPending--
      },
    )
    return result
  }
  currentVersion(unitId: string): RuntimeVersion {
    const unit = this.units.get(unitId)
    const current = !this.stopped && unit?.idlePhase === 'active' ? unit.current?.snapshot() : undefined
    if (!current || (current.phase !== 'serving' && current.phase !== 'draining'))
      throw new HbarError('RUNTIME_RECOVERING', 'Runtime default version is unavailable')
    return { unitId, generation: current.generation, artifactId: current.artifactId }
  }
  defaultOwner(unitId: string): RuntimeOwner {
    const unit = this.units.get(unitId)
    const current =
      !this.stopped && unit && (unit.idlePhase === 'active' || unit.idlePhase === 'waking') ? unit.current : null
    if (!current) throw new HbarError('RUNTIME_RECOVERING', 'Runtime default is unavailable')
    return current.owner()
  }
  call<Output>(
    unitId: string,
    method: string,
    input: unknown,
    output: z.ZodType<Output>,
    options: IpcCallOptions = {},
    version?: RuntimeVersion,
  ): Promise<Output> {
    const unit = this.units.get(unitId)
    const generation = version ? unit?.generations.get(version.generation) : unit?.current
    if (
      this.stopped ||
      !unit ||
      unit.idlePhase !== 'active' ||
      !generation ||
      (version && (version.unitId !== unitId || generation.snapshot().artifactId !== version.artifactId))
    )
      return Promise.reject(
        new HbarError('RUNTIME_VERSION_UNAVAILABLE', 'The requested runtime version is unavailable'),
      )
    return generation.call(method, input, output, options)
  }
  async reconcile(): Promise<void> {
    for (const unit of this.units.values()) this.start(unit)
    await Promise.all([...this.units.values()].flatMap((unit) => (unit.processing ? [unit.processing] : [])))
  }
  close(): Promise<void> {
    this.stopped = true
    this.closing ??= this.closeUnits()
    return this.closing
  }

  private unitSnapshot(unit: Unit) {
    return {
      descriptor: unit.descriptor,
      idle: {
        checkpointPending: unit.checkpointPending,
        enabled: unit.idleEnabled,
        phase: unit.idlePhase,
        demandHolds: unit.demandHolds,
        selectedArtifactId: unit.currentArtifact?.id ?? null,
      },
      generations: [...unit.generations.values()].map((generation) => {
        const snapshot = generation.snapshot()
        const references = this.options.references(generation.owner())
        return {
          ...snapshot,
          references: {
            ...snapshot.references,
            runs: references.runs,
            resources: references.resources + references.tools,
          },
        }
      }),
      queuedArtifactId: unit.queued?.artifact.id ?? null,
    }
  }
  private start(unit: Unit): void {
    if (this.stopped || unit.processing) return
    unit.processing = this.serialize(unit, () => this.process(unit))
      .catch((error: unknown) => {
        const candidate = unit.candidate
        if (candidate) this.update(candidate.operationId, unit.descriptor.id, 'failed', 'RUNTIME_MANAGEMENT_FAILED')
        else {
          // Collection can fail after switching: retain the old owner and expose the unresolved retirement.
          const reason = error instanceof HbarError ? error.code : 'RUNTIME_MANAGEMENT_FAILED'
          for (const operation of this.operations.values()) {
            const target = operation.units.find((value) => value.unitId === unit.descriptor.id)
            if (target?.phase === 'draining') this.update(operation.operationId, unit.descriptor.id, 'draining', reason)
          }
        }
      })
      .finally(() => {
        unit.processing = null
      })
  }

  private async process(unit: Unit): Promise<void> {
    if (unit.idlePhase === 'unknown') return
    await this.collect(unit)
    while (!this.stopped) {
      let candidate = unit.candidate
      if (candidate?.cancelled) {
        if (candidate.generation) {
          const owner = candidate.generation.owner()
          await candidate.generation.dispose()
          await this.options.afterDispose?.(owner)
          this.captureCleanedDemand(candidate.generation, owner)
          unit.generations.delete(owner.generation)
        }
        unit.candidate = null
        this.changed(unit.descriptor.id)
        candidate = null
      }
      if (!candidate) {
        const queued = unit.queued
        if (!queued) return
        unit.queued = null
        if (queued.cancelled) continue
        unit.candidate = queued
        if (unit.idlePhase === 'sleeping') unit.idlePhase = 'waking'
        candidate = queued
        this.update(candidate.operationId, unit.descriptor.id, 'preparing')
        const release = await this.capacity.acquire(candidate.controller.signal).catch(() => null)
        if (!release) continue
        try {
          if (candidate.cancelled || this.stopped) continue
          if (candidate.demandFact) candidate.demandFact.dispatch = 'unknown'
          const demandFact = candidate.demandFact
          const createdCandidate = candidate
          const generation = this.options.create(
            candidate.artifact,
            ++unit.nextGeneration,
            () => {
              if (demandFact && createdCandidate.generation) this.captureDemand(demandFact, createdCandidate.generation)
              this.changed(unit.descriptor.id)
            },
            candidate.purpose,
          )
          candidate.generation = generation
          if (candidate.demandFact) {
            candidate.demandFact.dispatch = 'started'
            this.captureDemand(candidate.demandFact, generation)
          }
          unit.generations.set(unit.nextGeneration, generation)
          try {
            await generation.prepare()
          } finally {
            if (candidate.demandFact) this.captureDemand(candidate.demandFact, generation)
          }
          candidate.ready = true
          this.update(candidate.operationId, unit.descriptor.id, 'ready', null, unit.nextGeneration)
        } catch (error) {
          if (!candidate.cancelled) {
            candidate.cancelled = true
            candidate.reasonCode = error instanceof HbarError ? error.code : 'RUNTIME_PREPARE_FAILED'
            this.update(
              candidate.operationId,
              unit.descriptor.id,
              candidate.reasonCode === 'RUNTIME_RESTART_REQUIRED' ? 'restart_required' : 'failed',
              candidate.reasonCode,
            )
          }
          continue
        } finally {
          release()
        }
      }
      if (candidate.cancelled) continue
      if (!candidate.ready || !candidate.generation) return
      const group = this.operations.get(candidate.operationId)
      if (
        group?.units.some(
          (target) => target.phase === 'failed' || target.phase === 'restart_required' || target.phase === 'cancelled',
        )
      ) {
        this.cancelCandidate(unit, candidate, 'RUNTIME_GROUP_PREPARATION_FAILED')
        continue
      }
      if (group?.units.some((target) => target.phase === 'queued' || target.phase === 'preparing')) return
      const serving = [...unit.generations.values()].filter(
        (generation) => generation.snapshot().role !== 'candidate' && generation.snapshot().phase !== 'disposed',
      )
      if (serving.length >= RUNTIME_LIMITS.servingGenerations) {
        this.update(candidate.operationId, unit.descriptor.id, 'waiting_capacity')
        this.changed(unit.descriptor.id)
        return
      }
      const generation = candidate.generation
      const previous = unit.current
      this.update(candidate.operationId, unit.descriptor.id, 'activating')
      try {
        try {
          await this.beforeActivation(candidate, generation.owner())
        } finally {
          if (candidate.demandFact) this.captureDemand(candidate.demandFact, generation)
        }
      } catch (error) {
        if (!candidate.cancelled) {
          candidate.cancelled = true
          this.update(
            candidate.operationId,
            unit.descriptor.id,
            'failed',
            error instanceof HbarError ? error.code : 'RUNTIME_ACTIVATION_PREPARATION_FAILED',
          )
        }
        continue
      }
      if (candidate.cancelled || this.stopped) continue
      candidate.committing = true
      unit.current = generation
      unit.currentArtifact = candidate.artifact
      unit.candidate = null
      const operation = this.operations.get(candidate.operationId)
      if (operation) {
        operation.switchedAt ??= Date.now()
        operation.cancellable = false
      }
      this.update(candidate.operationId, unit.descriptor.id, 'switched', null, generation.snapshot().generation)
      let activated = true
      try {
        try {
          await generation.activate()
        } finally {
          if (candidate.demandFact) this.captureDemand(candidate.demandFact, generation)
        }
      } catch (error) {
        activated = false
        // Activation was authorized: this version remains the recovery target, without automatic rollback.
        this.update(
          candidate.operationId,
          unit.descriptor.id,
          'failed',
          error instanceof HbarError ? error.code : 'RUNTIME_ACTIVATION_FAILED',
        )
      }
      if (previous)
        await previous.drain().catch(() => {
          /* The previous owner retains only its existing bindings. */
        })
      if (activated && previous && unit.generations.has(previous.snapshot().generation))
        this.update(candidate.operationId, unit.descriptor.id, 'draining')
      else if (activated) this.update(candidate.operationId, unit.descriptor.id, 'completed')
      this.changed(unit.descriptor.id)
      await this.collect(unit)
      if (
        !unit.candidate &&
        !unit.queued &&
        unit.idlePhase === 'waking' &&
        unit.current?.snapshot().phase === 'serving'
      )
        unit.idlePhase = 'active'
    }
  }

  private async beforeActivation(candidate: Candidate, owner: RuntimeOwner): Promise<void> {
    if (!this.options.beforeActivate) return
    const controller = new AbortController()
    const cancel = () => controller.abort(new HbarError('RUNTIME_CANCELLED', 'Runtime readiness wait was cancelled'))
    const timer = setTimeout(
      () =>
        controller.abort(
          new HbarError(
            'RUNTIME_ACTIVATION_PREPARATION_TIMEOUT',
            'Runtime readiness did not finish before its deadline',
          ),
        ),
      this.options.activationPreparationMs ?? RUNTIME_LIMITS.startupMs,
    )
    candidate.controller.signal.addEventListener('abort', cancel, { once: true })
    if (candidate.controller.signal.aborted) cancel()
    let aborted: (() => void) | undefined
    try {
      await Promise.race([
        Promise.resolve().then(() => {
          controller.signal.throwIfAborted()
          return this.options.beforeActivate?.(owner, candidate.artifact, controller.signal)
        }),
        new Promise<never>((_, reject) => {
          aborted = () =>
            reject(
              controller.signal.reason instanceof HbarError
                ? controller.signal.reason
                : new HbarError('RUNTIME_CANCELLED', 'Readiness was cancelled'),
            )
          controller.signal.addEventListener('abort', aborted, { once: true })
          if (controller.signal.aborted) aborted()
        }),
      ])
    } finally {
      clearTimeout(timer)
      candidate.controller.signal.removeEventListener('abort', cancel)
      if (aborted) controller.signal.removeEventListener('abort', aborted)
      controller.abort()
    }
  }

  private async collect(unit: Unit): Promise<void> {
    for (const generation of [...unit.generations.values()]) {
      if (generation === unit.current || generation === unit.candidate?.generation) continue
      const refs = this.options.references(generation.owner())
      generation.references(refs.runs, refs.resources)
      if (refs.runs || refs.resources || refs.tools || generation.snapshot().references.requests) continue
      const active = await generation.drain().catch(() => null)
      if (active && (active.runs || active.resources || active.requests)) continue
      const owner = generation.owner()
      await generation.dispose()
      if (generation.retirementReceipt && generation.snapshot().role !== 'candidate') {
        const physical = this.physicalReceipt(generation, owner)
        if (!physical)
          throw new HbarError('RUNTIME_EXIT_UNKNOWN', 'Disposed owner has no exact physical retirement receipt')
        // Dispose has already run: capacity exhaustion retains this disposed record, not a live worker.
        await this.finishRetirement(unit, generation, physical, false)
      } else await this.options.afterDispose?.(owner)
      unit.generations.delete(owner.generation)
      this.changed(unit.descriptor.id)
    }
    if ([...unit.generations.values()].filter((generation) => generation.snapshot().role !== 'candidate').length <= 1) {
      for (const operation of this.operations.values()) {
        const state = operation.units.find((target) => target.unitId === unit.descriptor.id)
        if (state?.phase === 'draining') this.update(operation.operationId, unit.descriptor.id, 'completed')
      }
    }
  }

  private cancelCandidate(unit: Unit, candidate: Candidate, reason: string): void {
    if (candidate.cancelled) return
    if (candidate.committing) return
    candidate.cancelled = true
    candidate.reasonCode = reason
    candidate.controller.abort()
    this.update(candidate.operationId, unit.descriptor.id, 'cancelled', reason)
    // Abort readiness now; generation disposal belongs to the per-unit serialized owner.
    // closeUnits disposes it after the in-progress bounded prepare/activate settles.
  }

  private update(
    operationId: string,
    unitId: string,
    phase: RuntimeReload['units'][number]['phase'],
    reasonCode: string | null = null,
    generation?: number,
  ): void {
    const operation = this.operations.get(operationId)
    const target = operation?.units.find((unit) => unit.unitId === unitId)
    if (!operation || !target) return
    target.phase = phase
    target.reasonCode = reasonCode
    if (generation !== undefined) target.generation = generation
    operation.updatedAt = Date.now()
    const phases = operation.units.map((unit) => unit.phase)
    if (phases.every((phase) => phase === 'completed')) operation.phase = 'completed'
    else if (phases.some((phase) => phase === 'failed')) operation.phase = 'failed'
    else if (phases.some((phase) => phase === 'restart_required')) operation.phase = 'restart_required'
    else if (phases.every((phase) => phase === 'cancelled' || phase === 'completed')) operation.phase = 'cancelled'
    else if (phases.some((phase) => phase === 'waiting_capacity')) operation.phase = 'waiting_capacity'
    else if (phases.some((phase) => phase === 'draining' || phase === 'switched')) operation.phase = 'draining'
    else if (phases.some((phase) => phase === 'activating')) operation.phase = 'activating'
    else operation.phase = 'preparing'
    operation.cancellable = phases.some((phase) =>
      ['queued', 'preparing', 'ready', 'waiting_capacity', 'activating'].includes(phase),
    )
    this.changed(undefined, operationId)
  }

  private changed(unitId?: string, operationId?: string): void {
    if (unitId) this.changedUnits.add(unitId)
    if (operationId) this.changedOperations.add(operationId)
    if (this.flushing) return
    this.flushing = true
    queueMicrotask(() => this.flush())
  }
  private flush(): void {
    if (this.stopped) {
      this.flushing = false
      this.changedUnits.clear()
      this.changedOperations.clear()
      return
    }
    if (this.changedUnits.size || this.changedOperations.size) {
      const unitIds = [...this.changedUnits].slice(0, 32)
      const operationIds = [...this.changedOperations].slice(0, 16)
      for (const id of unitIds) this.changedUnits.delete(id)
      for (const id of operationIds) this.changedOperations.delete(id)
      const delta = runtimeDeltaSchema.parse({
        revision: ++this.revision,
        units: unitIds.flatMap((id) => {
          const unit = this.units.get(id)
          return unit ? [this.unitSnapshot(unit)] : []
        }),
        operations: operationIds.flatMap((id) => {
          const operation = this.operations.get(id)
          return operation ? [operation] : []
        }),
      })
      for (const listener of [...this.listeners]) {
        try {
          listener(runtimeDeltaSchema.parse(delta))
        } catch {
          console.error('[hbar runtime] status observer failed')
        }
      }
    }
    // Reentrant observers may produce more changes. Yield between bounded batches so heartbeats and requests can run.
    if (this.changedUnits.size || this.changedOperations.size) setTimeout(() => this.flush(), 0)
    else this.flushing = false
  }

  private async closeUnits(): Promise<void> {
    this.stopped = true
    clearInterval(this.sweep)
    for (const unit of this.units.values()) {
      if (unit.candidate) this.cancelCandidate(unit, unit.candidate, 'RUNTIME_STOPPING')
      if (unit.queued) this.cancelCandidate(unit, unit.queued, 'RUNTIME_STOPPING')
    }
    const disposing = [...this.units.values()].flatMap((unit) => [
      this.serialize(unit, async () => {
        if (unit.checkpointPending)
          throw new HbarError('RUNTIME_EXIT_UNKNOWN', 'Idle checkpoint is physically unsettled during close')
        const failures: unknown[] = []
        for (const generation of unit.generations.values()) {
          try {
            await generation.dispose()
          } catch (error) {
            failures.push(error)
          }
        }
        if (failures.length)
          throw new AggregateError(failures, 'Runtime owners did not all confirm disposal', { cause: failures[0] })
      }),
    ])
    const outcomes = await Promise.allSettled(disposing)
    await Promise.allSettled([...this.units.values()].flatMap((unit) => (unit.processing ? [unit.processing] : [])))
    this.listeners.clear()
    if (outcomes.some((outcome) => outcome.status === 'rejected'))
      throw new HbarError('RUNTIME_EXIT_UNKNOWN', 'Some runtime resource owners did not confirm exit')
  }
}
