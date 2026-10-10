import { HbarError } from '@hbar/contracts'
import {
  executionOwnershipSchema,
  RUNTIME_LIMITS,
  runtimeOwnerSchema,
  runtimeVersionSchema,
  runtimeUnitDescriptorSchema,
  runtimeVersionSetSchema,
  type ExecutionOwnership,
  type RuntimeOwner,
  type RuntimeUnitDescriptor,
  type RuntimeVersion,
  type RuntimeVersionSet,
} from '@hbar/contracts/runtime'

export interface CoordinationPersistence {
  /** Atomically claim the queued Run and its Session, or return null when another Run owns it. */
  claim(draft: ExecutionOwnership): Promise<ExecutionOwnership | null>
  release(lease: ExecutionOwnership): Promise<void>
  /** Invalidate durable write authority without declaring the interrupted Run successful. */
  revoke(owner: RuntimeOwner, runIds: readonly string[]): Promise<void>
}

interface OwnerRecord {
  readonly owner: Readonly<RuntimeOwner>
  readonly version: Readonly<RuntimeVersion>
  readonly descriptor: RuntimeUnitDescriptor
  role: 'candidate' | 'default' | 'draining' | 'fenced'
  exited: boolean
}
export interface RuntimeToolPermit {
  readonly id: string
  readonly leaseId: string
  readonly callId: string
  readonly owner: Readonly<RuntimeOwner>
}
export interface RuntimeResourceLease {
  readonly id: string
  readonly key: string
  readonly owner: Readonly<RuntimeOwner>
  readonly executionLeaseId: string | null
}

function sameOwner(left: RuntimeOwner, right: RuntimeOwner): boolean {
  return left.incarnation === right.incarnation && left.unitId === right.unitId && left.generation === right.generation
}
function versions(set: RuntimeVersionSet): RuntimeVersion[] {
  return [set.kernel, set.driver, ...set.plugins, ...set.hooks]
}

/** Stable execution authority. Runtime processes use its port rather than owning independent locks. */
export class RuntimeCoordinator {
  private readonly owners = new Map<string, OwnerRecord>()
  private readonly defaults = new Map<string, string>()
  private readonly sessions = new Map<string, ExecutionOwnership>()
  private readonly runs = new Map<string, ExecutionOwnership>()
  private readonly claiming = new Set<string>()
  private readonly blocked = new Set<string>()
  private readonly revoking = new Set<string>()
  private readonly interruptions = new Map<string, Set<string>>()
  private readonly stoppedRuns = new Set<string>()
  private readonly tools = new Map<string, RuntimeToolPermit>()
  private readonly toolKeys = new Map<string, string>()
  private readonly resources = new Map<string, RuntimeResourceLease>()
  private readonly pendingReleases = new Map<string, { lease: ExecutionOwnership; released: () => void | Promise<void>; failed: () => void }>()
  private readonly resourceKeys = new Map<string, string>()
  private fence = 0

  constructor(private readonly persistence: CoordinationPersistence) {}

  register(owner: RuntimeOwner, version: RuntimeVersion, descriptor: RuntimeUnitDescriptor): void {
    const parsed = runtimeOwnerSchema.parse(owner)
    const artifact = runtimeVersionSchema.parse(version)
    const manifest = runtimeUnitDescriptorSchema.parse(descriptor)
    if (this.owners.size >= 1_536)
      throw new HbarError('RUNTIME_OWNER_CAPACITY', 'Registered runtime owner capacity is exhausted')
    if (parsed.unitId !== descriptor.id || parsed.unitId !== version.unitId || parsed.generation !== version.generation)
      throw new HbarError('RUNTIME_OWNER_MISMATCH', 'Runtime owner does not match its registered version')
    if (this.owners.has(parsed.incarnation))
      throw new HbarError('RUNTIME_OWNER_EXISTS', 'Runtime incarnation is already registered')
    this.owners.set(parsed.incarnation, {
      owner: Object.freeze(parsed),
      version: Object.freeze(artifact),
      descriptor: manifest,
      role: 'candidate',
      exited: false,
    })
  }

  activate(owner: RuntimeOwner): void {
    const record = this.record(owner)
    if (record.role !== 'candidate')
      throw new HbarError('RUNTIME_LIFECYCLE', 'Only a prepared candidate can become default')
    const previous = this.defaults.get(owner.unitId)
    if (previous) {
      const old = this.owners.get(previous)
      if (old && old.role === 'default') old.role = 'draining'
    }
    record.role = 'default'
    this.defaults.set(owner.unitId, owner.incarnation)
  }

  role(owner: RuntimeOwner): OwnerRecord['role'] {
    return this.record(owner).role
  }

  assertCanWrite(owner: RuntimeOwner, lease?: ExecutionOwnership): void {
    const record = this.record(owner)
    if (record.role === 'candidate')
      throw new HbarError('RUNTIME_PREPARING', 'Prepared candidates cannot write production state')
    if (record.role === 'fenced' || record.exited)
      throw new HbarError('EXECUTION_OWNER_REVOKED', 'Runtime write authority has been revoked')
    if (lease) {
      this.assertExecution(lease)
      if (this.pendingReleases.has(lease.runId))
        throw new HbarError('EXECUTION_FINISHED', 'The logical Run has finished; its retained physical capacity cannot commit')
      if (
        !versions(lease.versions).some(
          (version) =>
            version.unitId === owner.unitId &&
            version.generation === owner.generation &&
            version.artifactId === record.version.artifactId,
        )
      )
        throw new HbarError('RUNTIME_VERSION_MISMATCH', 'The submitting capability is not bound to this Run')
    }
  }

  async claim(
    owner: RuntimeOwner,
    sessionId: string,
    runId: string,
    bindings: RuntimeVersionSet,
  ): Promise<ExecutionOwnership | null> {
    const record = this.record(owner)
    if (
      record.descriptor.kind !== 'kernel' ||
      record.role !== 'default' ||
      this.defaults.get(owner.unitId) !== owner.incarnation
    )
      throw new HbarError('RUNTIME_NOT_DEFAULT', 'Only the current Kernel may claim new execution')
    if (!sessionId || !runId || sessionId.length > 160 || runId.length > 160)
      throw new HbarError('INVALID_INPUT', 'Execution identifiers are invalid')
    if (this.blocked.has(sessionId))
      throw new HbarError(
        'EXECUTION_RECONCILIATION_REQUIRED',
        'Session authority must be reconciled before another claim',
      )
    const existing = this.sessions.get(sessionId)
    if (existing) {
      if (existing.runId === runId && sameOwner(existing.owner, owner)) return executionOwnershipSchema.parse(existing)
      return null
    }
    if (this.claiming.has(sessionId)) return null
    if (this.sessions.size >= 4_096 || this.claiming.size >= 512)
      throw new HbarError('EXECUTION_CAPACITY', 'Host execution coordination capacity is exhausted')
    const parsed = runtimeVersionSetSchema.parse(bindings)
    if (
      parsed.kernel.unitId !== owner.unitId ||
      parsed.kernel.generation !== owner.generation ||
      parsed.kernel.artifactId !== record.version.artifactId
    )
      throw new HbarError('RUNTIME_VERSION_MISMATCH', 'The Run must bind its actual Kernel version')
    for (const version of versions(parsed)) {
      if (
        ![...this.owners.values()].some(
          (candidate) =>
            candidate.role === 'default' &&
            !candidate.exited &&
            candidate.version.unitId === version.unitId &&
            candidate.version.generation === version.generation &&
            candidate.version.artifactId === version.artifactId,
        )
      )
        throw new HbarError('RUNTIME_DEPENDENCY_UNAVAILABLE', 'A bound default capability is not ready')
    }
    this.claiming.add(sessionId)
    const draft = executionOwnershipSchema.parse({
      leaseId: crypto.randomUUID(),
      sessionId,
      runId,
      owner: record.owner,
      fence: ++this.fence,
      acquiredAt: Date.now(),
      versions: parsed,
    })
    try {
      const persisted = await this.persistence.claim(draft)
      if (!persisted) return null
      const lease = executionOwnershipSchema.parse(persisted)
      if (
        lease.leaseId !== draft.leaseId ||
        lease.sessionId !== sessionId ||
        lease.runId !== runId ||
        !sameOwner(lease.owner, owner) ||
        JSON.stringify(lease.versions) !== JSON.stringify(draft.versions)
      )
        throw new HbarError('EXECUTION_PROJECTION_INVALID', 'Persisted ownership does not match its claim')
      this.fence = Math.max(this.fence, lease.fence)
      if (record.role !== 'default' || record.exited || this.defaults.get(owner.unitId) !== owner.incarnation) {
        await this.persistence.revoke(record.owner, [runId])
        throw new HbarError('EXECUTION_OWNER_REVOKED', 'Execution owner changed while its claim was persisted')
      }
      this.sessions.set(sessionId, lease)
      this.runs.set(runId, lease)
      return executionOwnershipSchema.parse(lease)
    } catch (error) {
      // A claim write may have succeeded before its receipt was lost. Do not try a new claim here.
      this.blocked.add(sessionId)
      throw error
    } finally {
      this.claiming.delete(sessionId)
    }
  }

  assertExecution(lease: ExecutionOwnership): void {
    const parsed = executionOwnershipSchema.parse(lease)
    const owner = this.record(parsed.owner)
    const active = this.runs.get(parsed.runId)
    if (
      owner.exited ||
      owner.role === 'fenced' ||
      !active ||
      active.leaseId !== parsed.leaseId ||
      active.fence !== parsed.fence ||
      active.sessionId !== parsed.sessionId ||
      !sameOwner(active.owner, parsed.owner) ||
      JSON.stringify(active.versions) !== JSON.stringify(parsed.versions) ||
      this.revoking.has(parsed.owner.incarnation) ||
      this.blocked.has(parsed.sessionId)
    )
      throw new HbarError('EXECUTION_OWNER_REVOKED', 'Execution submission is from an invalid or revoked owner')
  }

  execution(runId: string): ExecutionOwnership | null {
    const lease = this.runs.get(runId)
    return lease ? executionOwnershipSchema.parse(lease) : null
  }
  canIdle(owner: RuntimeOwner, sessionId: string): boolean {
    const record = this.record(owner)
    return record.descriptor.kind === 'kernel' && record.role === 'default' && !record.exited &&
      !this.sessions.has(sessionId) && !this.claiming.has(sessionId) && !this.blocked.has(sessionId)
  }

  async releaseExecution(lease: ExecutionOwnership): Promise<void> {
    this.assertExecution(lease)
    if (
      [...this.tools.values()].some((permit) => permit.leaseId === lease.leaseId) ||
      [...this.resources.values()].some((resource) => resource.executionLeaseId === lease.leaseId)
    )
      throw new HbarError('EXECUTION_RESOURCES_ACTIVE', 'Physical execution resources have not been released')
    this.blocked.add(lease.sessionId)
    await this.persistence.release(lease)
    if (this.runs.get(lease.runId)?.leaseId === lease.leaseId) {
      this.runs.delete(lease.runId)
      this.sessions.delete(lease.sessionId)
    }
    this.blocked.delete(lease.sessionId)
  }

  /** A logical terminal may precede physical tool completion. Acknowledge the request without occupying an IPC slot. */
  async requestRelease(lease: ExecutionOwnership, released: () => void | Promise<void>, failed: () => void = () => {}): Promise<void> {
    this.assertExecution(lease)
    if (this.pendingReleases.has(lease.runId)) return
    if (this.physicalReferences(lease.leaseId)) {
      this.pendingReleases.set(lease.runId, { lease: executionOwnershipSchema.parse(lease), released, failed })
      return
    }
    await this.releaseExecution(lease)
    await this.notifyReleased(released)
  }
  private async notifyReleased(released: () => void | Promise<void>): Promise<void> {
    try { await released() } catch { console.error('[hbar runtime] execution handoff observer failed') }
  }
  private physicalReferences(leaseId: string): boolean {
    return [...this.tools.values()].some(permit => permit.leaseId === leaseId) ||
      [...this.resources.values()].some(resource => resource.executionLeaseId === leaseId)
  }
  private releaseSettled(): void {
    for (const [runId, pending] of this.pendingReleases) {
      if (this.physicalReferences(pending.lease.leaseId)) continue
      this.pendingReleases.delete(runId)
      void this.releaseExecution(pending.lease).then(() => this.notifyReleased(pending.released)).catch(() => {
        try { pending.failed() } catch { console.error('[hbar runtime] release failure observer failed') }
        // A missing durable receipt keeps the Session reconciliation gate closed; it is never retried blindly.
        console.error('[hbar runtime] deferred execution release requires reconciliation')
      })
    }
  }

  async revoke(owner: RuntimeOwner): Promise<ExecutionOwnership[]> {
    const record = this.record(owner)
    record.role = 'fenced'
    this.revoking.add(owner.incarnation)
    const affected = [...this.runs.values()].filter(
      (lease) =>
        record.descriptor.kind === 'storage' || sameOwner(lease.owner, owner) ||
        versions(lease.versions).some(
          (version) =>
            version.unitId === owner.unitId &&
            version.generation === owner.generation &&
            version.artifactId === record.version.artifactId,
        ),
    )
    for (const lease of affected) {
      this.pendingReleases.delete(lease.runId)
      this.blocked.add(lease.sessionId)
      const interrupted = this.interruptions.get(lease.runId) ?? new Set<string>()
      interrupted.add(owner.incarnation)
      this.interruptions.set(lease.runId, interrupted)
    }
    await this.persistence.revoke(
      record.owner,
      affected.map((lease) => lease.runId),
    )
    return affected.map((lease) => executionOwnershipSchema.parse(lease))
  }

  /** Only call after the supervisor has observed this exact process exiting. */
  ownerExited(owner: RuntimeOwner): { tools: RuntimeToolPermit[]; resources: RuntimeResourceLease[] } {
    const record = this.record(owner)
    record.exited = true
    record.role = 'fenced'
    const tools = [...this.tools.values()].filter((permit) => sameOwner(permit.owner, owner))
    const resources = [...this.resources.values()].filter((resource) => sameOwner(resource.owner, owner))
    for (const permit of tools) this.releaseTool(permit.owner, permit.id)
    for (const resource of resources) this.releaseResource(resource.owner, resource.id)
    return { tools, resources }
  }

  /** Recovery has reconciled the durable claim and any uncertain effects. Queued input can now proceed. */
  acknowledgeRunStopped(owner: RuntimeOwner, runId: string): void {
    const lease = this.runs.get(runId)
    if (!lease || !sameOwner(lease.owner, owner) || !this.interruptions.has(runId))
      throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Only the Run owner can confirm its interrupted executor stopped')
    this.stoppedRuns.add(runId)
  }

  reconciled(sessionId: string): void {
    const lease = this.sessions.get(sessionId)
    if (lease) {
      const owner = this.record(lease.owner)
      if (!owner.exited && !this.stoppedRuns.has(lease.runId))
        throw new HbarError('EXECUTION_OWNER_ALIVE', 'An interrupted owner must actually exit before handoff')
      for (const incarnation of this.interruptions.get(lease.runId) ?? [])
        if (!this.owners.get(incarnation)?.exited)
          throw new HbarError('EXECUTION_OWNER_ALIVE', 'A failed dependency has not actually exited')
      if (
        [...this.tools.values()].some((permit) => permit.leaseId === lease.leaseId) ||
        [...this.resources.values()].some((resource) => resource.executionLeaseId === lease.leaseId)
      )
        throw new HbarError('EXECUTION_RESOURCES_ACTIVE', 'Interrupted physical resources still hold this Session')
      this.runs.delete(lease.runId)
      this.sessions.delete(sessionId)
      this.interruptions.delete(lease.runId)
      this.stoppedRuns.delete(lease.runId)
    }
    if (this.claiming.has(sessionId))
      throw new HbarError('EXECUTION_CLAIM_PENDING', 'A physical ownership claim is still pending')
    this.blocked.delete(sessionId)
  }

  reserveTool(lease: ExecutionOwnership, callId: string, physicalOwner: RuntimeOwner): RuntimeToolPermit {
    this.assertExecution(lease)
    if (this.pendingReleases.has(lease.runId))
      throw new HbarError('EXECUTION_FINISHED', 'A finished Run cannot start another tool')
    const owner = this.record(physicalOwner)
    if (
      owner.role === 'candidate' ||
      owner.role === 'fenced' ||
      owner.exited ||
      !versions(lease.versions).some(
        (version) =>
          version.unitId === physicalOwner.unitId &&
          version.generation === physicalOwner.generation &&
          version.artifactId === owner.version.artifactId,
      )
    )
      throw new HbarError('RUNTIME_VERSION_MISMATCH', 'The tool must execute in its bound runtime version')
    if (!callId || callId.length > 160) throw new HbarError('INVALID_INPUT', 'Tool call identifier is invalid')
    const key = `${lease.leaseId}:${callId}`
    const existing = this.toolKeys.get(key)
    if (existing) {
      const permit = this.tools.get(existing)
      if (permit && sameOwner(permit.owner, physicalOwner)) return permit
      throw new HbarError('RUNTIME_TOOL_OWNER_CHANGED', 'A physical tool call already belongs to another owner')
    }
    if (this.tools.size >= RUNTIME_LIMITS.tools)
      throw new HbarError('TOOL_CAPACITY', 'Host physical tool capacity is exhausted')
    const permit = Object.freeze({ id: crypto.randomUUID(), leaseId: lease.leaseId, callId, owner: owner.owner })
    this.tools.set(permit.id, permit)
    this.toolKeys.set(key, permit.id)
    return permit
  }

  releaseTool(owner: RuntimeOwner, permitId: string): void {
    const permit = this.tools.get(permitId)
    if (!permit) return
    if (!sameOwner(permit.owner, owner))
      throw new HbarError('RUNTIME_TOOL_OWNER_MISMATCH', 'Only the physical tool owner may release its capacity')
    this.tools.delete(permitId)
    this.toolKeys.delete(`${permit.leaseId}:${permit.callId}`)
    this.releaseSettled()
  }

  acquireResource(owner: RuntimeOwner, key: string, execution?: ExecutionOwnership): RuntimeResourceLease | null {
    this.assertCanWrite(owner, execution)
    if (!key || key.length > 4_000) throw new HbarError('INVALID_INPUT', 'Runtime resource key is invalid')
    if (this.resourceKeys.has(key)) return null
    if (this.resources.size >= 4_096)
      throw new HbarError('RUNTIME_RESOURCE_CAPACITY', 'Host resource capacity is exhausted')
    const resource = Object.freeze({
      id: crypto.randomUUID(),
      key,
      owner: this.record(owner).owner,
      executionLeaseId: execution?.leaseId ?? null,
    })
    this.resources.set(resource.id, resource)
    this.resourceKeys.set(key, resource.id)
    return resource
  }

  releaseResource(owner: RuntimeOwner, resourceId: string): void {
    const resource = this.resources.get(resourceId)
    if (!resource) return
    if (!sameOwner(resource.owner, owner))
      throw new HbarError('RUNTIME_RESOURCE_OWNER_MISMATCH', 'Only the resource owner may release its lease')
    this.resources.delete(resourceId)
    this.resourceKeys.delete(resource.key)
    this.releaseSettled()
  }

  references(owner: RuntimeOwner): { runs: number; resources: number; tools: number } {
    return {
      runs: [...this.runs.values()].filter((lease) =>
        versions(lease.versions).some(
          (version) =>
            version.unitId === owner.unitId &&
            version.generation === owner.generation &&
            version.artifactId === this.record(owner).version.artifactId,
        ),
      ).length,
      resources: [...this.resources.values()].filter((resource) => sameOwner(resource.owner, owner)).length,
      tools: [...this.tools.values()].filter((permit) => sameOwner(permit.owner, owner)).length,
    }
  }

  snapshot() {
    return {
      sessions: this.sessions.size,
      claims: this.claiming.size,
      blockedSessions: [...this.blocked].slice(0, 512),
      physicalTools: this.tools.size,
      resources: this.resources.size,
    }
  }

  disposeOwner(owner: RuntimeOwner): void {
    const record = this.record(owner)
    const references = this.references(owner)
    if (!record.exited || references.runs || references.resources || references.tools)
      throw new HbarError('RUNTIME_OWNER_REFERENCED', 'A live or referenced runtime owner cannot be forgotten')
    this.owners.delete(owner.incarnation)
    this.revoking.delete(owner.incarnation)
    if (this.defaults.get(owner.unitId) === owner.incarnation) this.defaults.delete(owner.unitId)
  }

  private record(owner: RuntimeOwner): OwnerRecord {
    const record = this.owners.get(owner.incarnation)
    if (!record || !sameOwner(record.owner, owner))
      throw new HbarError('RUNTIME_OWNER_UNKNOWN', 'Runtime incarnation is not registered')
    return record
  }
}
