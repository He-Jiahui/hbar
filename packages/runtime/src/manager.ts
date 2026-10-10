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
import type { ManagedProcess } from './process'
import type { IpcCallOptions } from './ipc'

export type ManagedGenerationPort = Pick<
  ManagedProcess,
  'owner' | 'snapshot' | 'references' | 'prepare' | 'activate' | 'drain' | 'call' | 'dispose'
>
export interface RuntimeArtifactRegistry {
  artifactSet(id: string): RuntimeArtifactSet
  preparedSets(): string[]
}
export interface RuntimeManagerOptions {
  readonly instanceId: string
  readonly artifacts: RuntimeArtifactRegistry
  readonly create: (artifact: RuntimeArtifact, generation: number, changed: () => void) => ManagedGenerationPort
  readonly references: (owner: RuntimeOwner) => { runs: number; resources: number; tools: number }
  readonly beforeActivate?: (owner: RuntimeOwner, artifact: RuntimeArtifact) => Promise<void>
  readonly afterDispose?: (owner: RuntimeOwner) => void
  readonly sweepMs?: number
}
interface Candidate {
  readonly artifact: RuntimeArtifact
  readonly operationId: string
  readonly controller: AbortController
  generation: ManagedGenerationPort | null
  ready: boolean
  cancelled: boolean
  committing: boolean
  reasonCode: string | null
}
interface Unit {
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
  return JSON.stringify([
    ...artifact.files.filter(file => native.test(file.name)).map(file => [file.name, file.sha256] as const),
    ...artifact.resourceFiles.filter(file => native.test(file.sourcePath)).map(file => [file.sourcePath, file.sha256] as const),
  ].sort((left, right) => left[0].localeCompare(right[0])))
}

/** Stable default routing and at most two serving generations plus one read-only candidate per unit. */
export class RuntimeManager {
  private readonly units = new Map<string, Unit>()
  private readonly operations = new Map<string, RuntimeReload>()
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
        (unit) => !unit.descriptor.required || unit.current?.snapshot().phase === 'serving',
      ),
      units: [...this.units.values()].map((unit) => this.unitSnapshot(unit)),
      preparedArtifactSets: this.options.artifacts.preparedSets(),
    })
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

  currentVersion(unitId: string): RuntimeVersion {
    const current = this.units.get(unitId)?.current?.snapshot()
    if (!current || (current.phase !== 'serving' && current.phase !== 'draining'))
      throw new HbarError('RUNTIME_RECOVERING', 'Runtime default version is unavailable')
    return { unitId, generation: current.generation, artifactId: current.artifactId }
  }
  defaultOwner(unitId: string): RuntimeOwner {
    const current = this.units.get(unitId)?.current
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
    this.closing ??= this.closeUnits()
    return this.closing
  }

  private unitSnapshot(unit: Unit) {
    return {
      descriptor: unit.descriptor,
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
    unit.processing = this.process(unit)
      .catch(() => {
        const candidate = unit.candidate
        if (candidate) this.update(candidate.operationId, unit.descriptor.id, 'failed', 'RUNTIME_MANAGEMENT_FAILED')
      })
      .finally(() => {
        unit.processing = null
      })
  }

  private async process(unit: Unit): Promise<void> {
    await this.collect(unit)
    while (!this.stopped) {
      let candidate = unit.candidate
      if (candidate?.cancelled) {
        if (candidate.generation) {
          const owner = candidate.generation.owner()
          await candidate.generation.dispose()
          unit.generations.delete(owner.generation)
          this.options.afterDispose?.(owner)
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
        candidate = queued
        this.update(candidate.operationId, unit.descriptor.id, 'preparing')
        const release = await this.capacity.acquire(candidate.controller.signal).catch(() => null)
        if (!release) continue
        try {
          if (candidate.cancelled || this.stopped) continue
          const generation = this.options.create(candidate.artifact, ++unit.nextGeneration, () =>
            this.changed(unit.descriptor.id),
          )
          candidate.generation = generation
          unit.generations.set(unit.nextGeneration, generation)
          await generation.prepare()
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
      candidate.committing = true
      this.update(candidate.operationId, unit.descriptor.id, 'activating')
      try {
        await this.options.beforeActivate?.(generation.owner(), candidate.artifact)
      } catch (error) {
        candidate.committing = false
        candidate.cancelled = true
        this.update(
          candidate.operationId,
          unit.descriptor.id,
          'failed',
          error instanceof HbarError ? error.code : 'RUNTIME_ACTIVATION_PREPARATION_FAILED',
        )
        continue
      }
      if (candidate.cancelled || this.stopped) continue
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
        await generation.activate()
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
      unit.generations.delete(owner.generation)
      this.options.afterDispose?.(owner)
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
    // Do not wait for a stuck candidate to finish preparation before honouring cancellation.
    if (candidate.generation)
      void candidate.generation.dispose().catch(() => {
        this.update(candidate.operationId, unit.descriptor.id, 'failed', 'RUNTIME_EXIT_UNKNOWN')
      })
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
    operation.cancellable = phases.some((phase) => ['queued', 'preparing', 'ready', 'waiting_capacity'].includes(phase))
    this.changed(undefined, operationId)
  }

  private changed(unitId?: string, operationId?: string): void {
    if (unitId) this.changedUnits.add(unitId)
    if (operationId) this.changedOperations.add(operationId)
    if (this.flushing) return
    this.flushing = true
    queueMicrotask(() => {
      this.flushing = false
      while (this.changedUnits.size || this.changedOperations.size) {
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
    })
  }

  private async closeUnits(): Promise<void> {
    this.stopped = true
    clearInterval(this.sweep)
    for (const unit of this.units.values()) {
      if (unit.candidate) this.cancelCandidate(unit, unit.candidate, 'RUNTIME_STOPPING')
      if (unit.queued) this.cancelCandidate(unit, unit.queued, 'RUNTIME_STOPPING')
    }
    const disposing = [...this.units.values()].flatMap((unit) =>
      [...unit.generations.values()].map((generation) => generation.dispose()),
    )
    const outcomes = await Promise.allSettled(disposing)
    await Promise.allSettled([...this.units.values()].flatMap((unit) => (unit.processing ? [unit.processing] : [])))
    this.listeners.clear()
    if (outcomes.some((outcome) => outcome.status === 'rejected'))
      throw new HbarError('RUNTIME_EXIT_UNKNOWN', 'Some runtime resource owners did not confirm exit')
  }
}
