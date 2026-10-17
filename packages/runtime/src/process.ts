import { HeartbeatEvidence, writeHeartbeatEvidence } from './heartbeat-diagnostics'
import { z } from 'zod'
import { fileURLToPath } from 'node:url'
import { HbarError } from '@hbar/contracts'
import {
  RUNTIME_LIMITS,
  runtimeGenerationSchema,
  type RuntimeGeneration,
  type RuntimeOwner,
  type RuntimeProcessTree,
  type RuntimeProcessTreePort,
  type RuntimeUnitDescriptor,
} from '@hbar/contracts/runtime'
import { IpcPeer, type IpcCallOptions, type IpcCallTimeout } from './ipc'
import {
  RUNTIME_CONTROL_METHODS,
  runtimeDrainSchema,
  runtimeReadySchema,
  runtimeIdleProbeSchema,
  runtimeIdleIpcSchema,
  runtimeIdleIpcIsEmpty,
  runtimeIdleProbeIsEmpty,
  type RuntimeDrain,
  type RuntimeIdleProbe,
  type RuntimeIdleIpc,
} from './lifecycle'

export interface ManagedIdleSnapshot {
  readonly owner: RuntimeOwner
  readonly phase: RuntimeGeneration['phase']
  readonly runs: number
  readonly resources: number
  readonly parent: RuntimeIdleIpc | null
  readonly child: RuntimeIdleProbe | null
  readonly eligible: boolean
}
export type RuntimeIdleRetirement =
  | {
      readonly status: 'busy'
      readonly owner: RuntimeOwner
      readonly reasonCode: 'RUNTIME_IDLE_BUSY' | 'RUNTIME_IDLE_UNSUPPORTED'
    }
  | {
      readonly status: 'unknown'
      readonly owner: RuntimeOwner
      readonly reasonCode: 'RUNTIME_IDLE_OWNER_CHANGED' | 'RUNTIME_IDLE_BOUNDARY_UNKNOWN'
    }
  | {
      readonly status: 'confirmed-physical-exit'
      readonly owner: RuntimeOwner
      readonly childPid: number
      readonly exitCode: number
      readonly disposalAcknowledged: true
      readonly nativeJoined: true
    }

/** Physical absence only; Manager afterDispose is a separate ownership checkpoint. */
export interface RuntimePhysicalRetirementReceipt {
  readonly owner: RuntimeOwner
  readonly childPid: number
  readonly exitCode: number
  readonly nativeJoined: true
  readonly onExitCompleted: true
  readonly forced: boolean
  readonly cleanDisposeAck: boolean
}

export interface ManagedProcessOptions {
  readonly descriptor: RuntimeUnitDescriptor
  readonly artifactId: string
  readonly modulePath: string
  readonly generation: number
  /** A retry before any generation has served is still a cold startup. */
  readonly purpose?: 'startup' | 'candidate' | 'idle-wake'
  readonly parent: RuntimeOwner
  readonly configuration?: Readonly<Record<string, unknown>>
  /** Verify registered bytes again before every candidate import and recovery incarnation. */
  readonly verifyModule?: (signal: AbortSignal) => Promise<void>
  readonly command?: readonly [string, ...string[]]
  /** Local native lifetime port; descendants must exit before execution ownership is released. */
  readonly processTree?: RuntimeProcessTreePort
  readonly heartbeatMs?: number
  readonly startupMs?: number
  readonly shutdownMs?: number
  readonly onPeer?: (peer: IpcPeer, owner: RuntimeOwner) => void
  /** Called only after activation has been authorized, for each actual process incarnation. */
  readonly onActivating?: (
    owner: RuntimeOwner,
    role: 'default' | 'draining',
    signal: AbortSignal,
  ) => void | Promise<void>
  /** Publish owner-local descriptions after activation acknowledgement, before serving routes become visible. */
  readonly onActivated?: (owner: RuntimeOwner, role: 'default' | 'draining', signal: AbortSignal) => Promise<void>
  readonly onState?: (snapshot: RuntimeGeneration) => void
  readonly onFault?: (owner: RuntimeOwner, reasonCode: string, childPid: number) => Promise<void>
  readonly onCallTimeout?: (owner: RuntimeOwner, childPid: number, event: IpcCallTimeout) => void
  readonly onExit?: (owner: RuntimeOwner, exit: RuntimeProcessExit) => Promise<void>
  /** Observation only, after native join + successful ownership onExit; not a write receipt. */
  readonly onPhysicalRetirement?: (receipt: RuntimePhysicalRetirementReceipt) => void
  readonly retryDelaysMs?: readonly [number, number, number]
  readonly retrySlowMs?: number
  readonly healthyResetMs?: number
  readonly jitter?: number
  readonly controlMethods?: readonly string[]
}

export interface RuntimeProcessExit {
  readonly childPid: number
  readonly exitCode: number
  readonly reasonCode: string | null
  readonly deliberate: boolean
  readonly restartExpected: boolean
}

interface Retirement {
  readonly owner: RuntimeOwner
  readonly exit: RuntimeProcessExit
  readonly tree: Promise<RuntimeProcessTree | undefined>
  readonly deliberate: boolean
  fence: Promise<void> | undefined
  release: Promise<void> | undefined
  joined: boolean
  forced: boolean
}

function duration(value: number | undefined, fallback: number): number {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < 1 || result > 2_147_483_647)
    throw new RangeError('Invalid runtime lifecycle duration')
  return result
}

export class ManagedProcess {
  private heartbeatEvidence: HeartbeatEvidence | undefined
  private readonly heartbeatMs: number
  private readonly startupMs: number
  private readonly shutdownMs: number
  private readonly retrySlowMs: number
  private readonly healthyResetMs: number
  private readonly jitter: number
  private child: Bun.Subprocess | undefined
  private peer: IpcPeer | undefined
  private monitor: ReturnType<typeof setInterval> | undefined
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined
  private stopped = false
  private activated = false
  private healthySince: number | null = null
  private recovering: Promise<void> | undefined
  private disposal: Promise<void> | undefined
  private idleAdmission: 'open' | 'checking' | 'draining' | 'unknown' | 'retired' = 'open'
  private idleProbe: { readonly owner: RuntimeOwner; readonly promise: Promise<ManagedIdleSnapshot> } | undefined
  private idleControlLease:
    | {
        readonly owner: RuntimeOwner
        readonly peer: IpcPeer
        readonly token: symbol
        readonly deadline: number
      }
    | undefined
  private idleRetirement: { readonly owner: RuntimeOwner; readonly promise: Promise<RuntimeIdleRetirement> } | undefined
  private idleDisposalAcknowledged = false
  private idleForcedTermination = false
  private readonly physicalRetirements = new Map<string, RuntimePhysicalRetirementReceipt>()
  private readonly forcedChildPids = new Set<number>()
  private disposalAcknowledgedChildPid: number | undefined
  private launching: Promise<void> | undefined
  private exitHandling: Promise<void> = Promise.resolve()
  private fencing: Promise<void> | undefined
  private tree: RuntimeProcessTree | undefined
  private retirement: Retirement | undefined
  private retiring: Promise<void> | undefined
  private activation: AbortController | undefined
  private readonly stopController = new AbortController()
  private state: RuntimeGeneration

  constructor(private readonly options: ManagedProcessOptions) {
    this.heartbeatMs = duration(options.heartbeatMs, RUNTIME_LIMITS.heartbeatMs)
    this.startupMs = duration(options.startupMs, RUNTIME_LIMITS.startupMs)
    this.shutdownMs = duration(options.shutdownMs, RUNTIME_LIMITS.shutdownMs)
    this.retrySlowMs = duration(options.retrySlowMs, 30_000)
    this.healthyResetMs = duration(options.healthyResetMs, 60_000)
    this.jitter = options.jitter ?? 0.2
    if (!Number.isFinite(this.jitter) || this.jitter < 0 || this.jitter > 0.5)
      throw new RangeError('Invalid runtime recovery jitter')
    for (const delay of options.retryDelaysMs ?? [250, 1_000, 4_000]) duration(delay, 250)
    this.state = runtimeGenerationSchema.parse({
      unitId: options.descriptor.id,
      generation: options.generation,
      incarnation: crypto.randomUUID(),
      artifactId: options.artifactId,
      role: 'candidate',
      phase: 'preparing',
      pid: null,
      references: { runs: 0, resources: 0, requests: 0 },
      lastHeartbeatAt: null,
      failures: 0,
      nextAttemptAt: null,
      reasonCode: null,
    })
  }

  /** Does not query a process, wake a generation, or release Manager ownership. */
  retirementReceipt(expectedOwner: RuntimeOwner): RuntimePhysicalRetirementReceipt | null {
    const receipt = this.physicalRetirements.get(
      JSON.stringify([expectedOwner.unitId, expectedOwner.generation, expectedOwner.incarnation]),
    )
    return receipt ? { ...receipt, owner: { ...receipt.owner } } : null
  }

  /** Explicit consumption only; never evict an unacknowledged old-owner receipt. */
  acknowledgeRetirement(expectedOwner: RuntimeOwner): boolean {
    return this.physicalRetirements.delete(
      JSON.stringify([expectedOwner.unitId, expectedOwner.generation, expectedOwner.incarnation]),
    )
  }

  owner(): RuntimeOwner {
    return { unitId: this.state.unitId, generation: this.state.generation, incarnation: this.state.incarnation }
  }
  snapshot(): RuntimeGeneration {
    return runtimeGenerationSchema.parse({
      ...this.state,
      references: { ...this.state.references, requests: this.peer?.snapshot().inFlight ?? 0 },
    })
  }
  references(runs: number, resources: number): void {
    this.state.references = runtimeGenerationSchema.shape.references.parse({
      runs,
      resources,
      requests: this.peer?.snapshot().inFlight ?? 0,
    })
    this.publish()
  }
  prepare(): Promise<void> {
    if (this.physicalRetirements.size >= 16)
      return Promise.reject(new HbarError('RUNTIME_RETIREMENT_CAPACITY', 'Retirement reconciliation is required'))
    if (this.idleAdmission !== 'open')
      return Promise.reject(new HbarError('RUNTIME_IDLE_FENCED', 'Runtime idle retirement requires reconciliation'))
    if (this.launching) return this.launching
    if (this.child) {
      if (this.state.phase === 'ready' || this.state.phase === 'serving' || this.state.phase === 'draining')
        return Promise.resolve()
      return Promise.reject(new HbarError('RUNTIME_OWNER_ACTIVE', 'The previous runtime process has not exited'))
    }
    this.launching = this.launch().finally(() => {
      this.launching = undefined
    })
    return this.launching
  }
  async activate(role: 'default' | 'draining' = 'default'): Promise<void> {
    if (this.idleAdmission !== 'open')
      throw new HbarError('RUNTIME_IDLE_FENCED', 'Runtime idle retirement requires reconciliation')
    if (this.stopped || this.state.phase !== 'ready' || !this.peer)
      throw new HbarError('RUNTIME_NOT_READY', 'Runtime candidate is not ready')
    // Recovery targets this artifact from the point activation is authorized, even if its receipt is lost.
    this.activated = true
    this.state.role = role
    const owner = this.owner()
    const deadline = Date.now() + this.startupMs
    const activation = new AbortController()
    this.activation = activation
    const signal = AbortSignal.any([activation.signal, AbortSignal.timeout(this.startupMs)])
    const aborted = () => {
      activation.abort()
    }
    try {
      if (this.options.onActivating)
        await new Promise<void>((resolve, reject) => {
          const cancel = () =>
            reject(new HbarError('RUNTIME_ACTIVATION_EXPIRED', 'Runtime activation authority expired'))
          signal.addEventListener('abort', cancel, { once: true })
          Promise.resolve()
            .then(() => {
              signal.throwIfAborted()
              return this.options.onActivating?.(owner, role, signal)
            })
            .then(resolve, reject)
            .finally(() => signal.removeEventListener('abort', cancel))
        })
      if (
        signal.aborted ||
        this.stopped ||
        this.state.phase !== 'ready' ||
        !this.peer ||
        this.owner().incarnation !== owner.incarnation
      )
        throw new HbarError('RUNTIME_OWNER_REVOKED', 'Runtime activation authority expired before production started')
      await this.peer.call('runtime.activate', { role }, z.undefined(), {
        timeoutMs: Math.max(1, deadline - Date.now()),
      })
      if (this.options.onActivated)
        await new Promise<void>((resolve, reject) => {
          const cancel = () =>
            reject(new HbarError('RUNTIME_ACTIVATION_EXPIRED', 'Runtime description readiness expired'))
          signal.addEventListener('abort', cancel, { once: true })
          Promise.resolve()
            .then(() => {
              signal.throwIfAborted()
              return this.options.onActivated?.(owner, role, signal)
            })
            .then(resolve, reject)
            .finally(() => signal.removeEventListener('abort', cancel))
        })
      signal.throwIfAborted()
      this.state.phase = role === 'draining' ? 'draining' : 'serving'
      this.state.lastHeartbeatAt = Date.now()
      this.heartbeatEvidence?.received(this.state.lastHeartbeatAt, performance.now())
      this.healthySince = Date.now()
      this.publish()
    } catch (error) {
      this.fault(error instanceof HbarError ? error.code : 'RUNTIME_ACTIVATION_FAILED')
      throw error
    } finally {
      aborted()
      if (this.activation === activation) this.activation = undefined
    }
  }
  async drain(): Promise<RuntimeDrain> {
    if (this.idleAdmission !== 'open')
      throw new HbarError('RUNTIME_IDLE_FENCED', 'Runtime idle retirement owns admission')
    if (!this.activated || this.stopped) throw new HbarError('RUNTIME_LIFECYCLE', 'Runtime generation cannot drain')
    this.state.role = 'draining'
    if (!this.peer || this.state.phase === 'recovering') {
      this.publish()
      return { requests: 0, runs: this.state.references.runs, resources: this.state.references.resources }
    }
    this.state.phase = 'draining'
    this.publish()
    return this.peer.call('runtime.drain', undefined, runtimeDrainSchema, { timeoutMs: this.shutdownMs })
  }
  call<Output>(
    method: string,
    input: unknown,
    schema: z.ZodType<Output>,
    options: IpcCallOptions = {},
  ): Promise<Output> {
    // Before entering IpcPeer there can be no dispatch. Report that fact at the source,
    // not by having an adapter guess from a later rejection/error code.
    const notDispatched = (): void => {
      try {
        options.onDispatchSettled?.('not-dispatched')
      } catch {
        console.error('[hbar runtime] dispatch settlement observer failed')
      }
    }
    if (this.idleAdmission !== 'open') {
      notDispatched()
      return Promise.reject(new HbarError('RUNTIME_IDLE_FENCED', 'Runtime idle retirement owns admission'))
    }
    if (!this.peer || (this.state.phase !== 'serving' && this.state.phase !== 'draining')) {
      notDispatched()
      return Promise.reject(
        new HbarError('RUNTIME_RECOVERING', 'Runtime unit is recovering; reconcile existing requests'),
      )
    }
    return this.peer.call(method, input, schema, options)
  }
  dispose(): Promise<void> {
    this.disposal ??= this.disposeProcess()
    return this.disposal
  }

  /** Snapshot only. It never closes admission, changes phase, drains or refreshes business idle. */
  idleSnapshot(): Promise<ManagedIdleSnapshot> {
    const owner = this.owner()
    if (this.idleAdmission !== 'open') {
      return Promise.resolve({
        owner,
        phase: this.state.phase,
        runs: this.state.references.runs,
        resources: this.state.references.resources,
        parent: this.peer ? runtimeIdleIpcSchema.parse(this.peer.snapshot()) : null,
        child: null,
        eligible: false,
      })
    }
    const pending = this.idleProbe
    if (pending && this.sameOwner(pending.owner)) return pending.promise
    const promise = this.readIdleSnapshot().then((probe) => ({
      ...probe,
      eligible: probe.eligible && this.idleAdmission === 'open' && this.sameOwner(owner),
    }))
    this.idleProbe = { owner, promise }
    const release = (): void => {
      // A late old-owner completion must never clear a newer owner's physical probe.
      if (this.idleProbe?.promise === promise && this.idleProbe.owner === owner) this.idleProbe = undefined
    }
    void promise.then(release, release)
    return promise
  }

  /** Retirement owns admission before using this fresh, unshared physical probe. */
  private async readIdleSnapshot(): Promise<ManagedIdleSnapshot> {
    const owner = this.owner()
    const peer = this.peer
    const phase = this.state.phase
    const tree = this.tree
    const readNativeActive = (): number | undefined => {
      try {
        const count = tree?.active?.()
        return count !== undefined && Number.isSafeInteger(count) && count >= 0 ? count : undefined
      } catch {
        return undefined
      }
    }
    const nativeBefore = readNativeActive()
    const supported =
      this.activated && !this.stopped && peer !== undefined && (phase === 'serving' || phase === 'draining')
    const child = supported
      ? await peer.call(
          'runtime.idle',
          nativeBefore === undefined ? undefined : { owner, nativeActive: nativeBefore },
          runtimeIdleProbeSchema,
          { timeoutMs: this.shutdownMs },
        )
      : null
    const parent = peer ? runtimeIdleIpcSchema.parse(peer.snapshot()) : null
    const sameOwner = this.sameOwner(owner) && peer === this.peer && this.state.phase === phase && tree === this.tree
    const nativeAfter = readNativeActive()
    const runs = this.state.references.runs
    const resources = this.state.references.resources
    return {
      owner,
      phase,
      runs,
      resources,
      parent,
      child,
      eligible:
        supported &&
        sameOwner &&
        !this.stopped &&
        runs === 0 &&
        resources === 0 &&
        (nativeBefore === undefined || (nativeBefore === 1 && nativeAfter === 1)) &&
        parent !== null &&
        runtimeIdleIpcIsEmpty(parent) &&
        // Parent has no current inbound probe to subtract: every raw inbound byte counts.
        parent.incomingBytes === 0 &&
        child !== null &&
        runtimeIdleProbeIsEmpty(child),
    }
  }

  /** A successful return does not remove a manager generation or release its ownership record. */
  retireIdle(expectedOwner: RuntimeOwner): Promise<RuntimeIdleRetirement> {
    const captured = { ...expectedOwner }
    if (!this.sameOwner(captured))
      return Promise.resolve({ status: 'unknown', owner: captured, reasonCode: 'RUNTIME_IDLE_OWNER_CHANGED' })
    const previous = this.idleRetirement
    if (previous) {
      if (
        previous.owner.unitId !== captured.unitId ||
        previous.owner.generation !== captured.generation ||
        previous.owner.incarnation !== captured.incarnation
      )
        return Promise.resolve({ status: 'unknown', owner: captured, reasonCode: 'RUNTIME_IDLE_OWNER_CHANGED' })
      return previous.promise
    }
    // Seal synchronously before creating the async probe. No new call can slip through this gate.
    if (
      this.stopped ||
      this.idleAdmission !== 'open' ||
      this.disposal ||
      this.launching ||
      this.recovering ||
      this.recoveryTimer ||
      this.activation
    )
      return Promise.resolve({ status: 'unknown', owner: captured, reasonCode: 'RUNTIME_IDLE_BOUNDARY_UNKNOWN' })
    this.idleAdmission = 'checking'
    const promise = Promise.resolve().then(() => this.retireIdleProcess(captured))
    const entry = { owner: captured, promise }
    this.idleRetirement = entry
    void promise.then((result) => {
      // Only a read-only busy probe can be retried. Unknown/confirmed outcomes remain single-use.
      if (result.status === 'busy' && this.idleRetirement === entry) this.idleRetirement = undefined
    })
    return promise
  }

  private sameOwner(expected: RuntimeOwner): boolean {
    const current = this.owner()
    return (
      current.unitId === expected.unitId &&
      current.generation === expected.generation &&
      current.incarnation === expected.incarnation
    )
  }

  private idleConfigurationIdentity(): string {
    const value = JSON.stringify({
      descriptor: this.options.descriptor,
      artifactId: this.options.artifactId,
      modulePath: this.options.modulePath,
      parent: this.options.parent,
      configuration: this.options.configuration,
    })
    if (value.length > 1_048_576)
      throw new HbarError('RUNTIME_IDLE_BOUNDARY_UNKNOWN', 'Idle configuration identity is unavailable')
    return value
  }

  private async idleControl<T>(owner: RuntimeOwner, peer: IpcPeer, action: () => Promise<T>): Promise<T> {
    if (this.idleAdmission !== 'draining' || !this.sameOwner(owner) || this.peer !== peer || this.idleControlLease)
      throw new HbarError('RUNTIME_IDLE_BOUNDARY_UNKNOWN', 'Idle control admission is unavailable')
    const lease = {
      owner: { ...owner },
      peer,
      token: Symbol('idle-control'),
      deadline: performance.now() + this.shutdownMs,
    }
    this.idleControlLease = lease
    try {
      return await action()
    } finally {
      if (this.idleControlLease?.token === lease.token) this.idleControlLease = undefined
    }
  }

  private async retireIdleProcess(owner: RuntimeOwner): Promise<RuntimeIdleRetirement> {
    let stage:
      | 'INITIAL_PROBE'
      | 'DRAIN'
      | 'FINAL_PROBE'
      | 'FINAL_IDENTITY'
      | 'FINAL_REFERENCES'
      | 'FINAL_PARENT_IPC'
      | 'FINAL_CHILD_PROBE'
      | 'FINAL_BOUNDARY'
      | 'DISPOSE_ACK'
      | 'PHYSICAL_RECEIPT' = 'INITIAL_PROBE'
    const unknown = (): RuntimeIdleRetirement => {
      this.idleAdmission = 'unknown'
      this.state.reasonCode = `RUNTIME_IDLE_${stage}_UNKNOWN`
      this.publish()
      return { status: 'unknown', owner, reasonCode: 'RUNTIME_IDLE_BOUNDARY_UNKNOWN' }
    }
    try {
      const peer = this.peer
      const child = this.child
      const tree = this.tree
      const originalPhase = this.state.phase
      const configuration = this.idleConfigurationIdentity()
      const unchanged = (): boolean =>
        this.sameOwner(owner) &&
        this.peer === peer &&
        this.child === child &&
        this.tree === tree &&
        !this.stopped &&
        this.disposal === undefined &&
        this.idleConfigurationIdentity() === configuration
      const pending = this.idleProbe
      // Keep the already dispatched probe's original RPC deadline and physical counters.
      if (pending && this.sameOwner(pending.owner)) await pending.promise
      if (!unchanged() || this.state.phase !== originalPhase) return unknown()
      const probe = await this.readIdleSnapshot()
      if (!unchanged() || this.state.phase !== originalPhase) return unknown()
      if (!probe.eligible || !peer || !child || !this.options.processTree || !this.tree) {
        // No lifecycle side effects have happened. Reopen only this same healthy owner/configuration.
        this.idleAdmission = 'open'
        return { status: 'busy', owner, reasonCode: 'RUNTIME_IDLE_BUSY' }
      }
      // Once real drain begins, no busy/reopen/recovery branch is allowed, even if drain fails.
      this.idleAdmission = 'draining'
      this.state.role = 'draining'
      this.state.phase = 'draining'
      this.publish()
      stage = 'DRAIN'
      const drained = await this.idleControl(owner, peer, () =>
        peer.call('runtime.drain', { mode: 'idle-retirement' }, runtimeDrainSchema, { timeoutMs: this.shutdownMs }),
      )
      if (!unchanged() || drained.requests !== 0 || drained.runs !== 0 || drained.resources !== 0) return unknown()
      stage = 'FINAL_PROBE'
      const finalProbe = await this.idleControl(owner, peer, () => this.readIdleSnapshot())
      const finalIdentityUnchanged = unchanged()
      if (!finalIdentityUnchanged || !finalProbe.eligible) {
        // Fixed metadata only: preserve the original UNKNOWN fence and all physical counters.
        if (!finalIdentityUnchanged) stage = 'FINAL_IDENTITY'
        else if (finalProbe.runs !== 0 || finalProbe.resources !== 0) stage = 'FINAL_REFERENCES'
        else if (
          !finalProbe.parent ||
          !runtimeIdleIpcIsEmpty(finalProbe.parent) ||
          finalProbe.parent.incomingBytes !== 0
        )
          stage = 'FINAL_PARENT_IPC'
        else if (!finalProbe.child || !runtimeIdleProbeIsEmpty(finalProbe.child)) stage = 'FINAL_CHILD_PROBE'
        else stage = 'FINAL_BOUNDARY'
        try {
          console.error(
            JSON.stringify({
              type: 'runtime-idle-final-probe-unknown',
              stage,
              owner: { unitId: owner.unitId, generation: owner.generation, incarnation: owner.incarnation },
              parent: finalProbe.parent,
              child: finalProbe.child,
              references: { runs: finalProbe.runs, resources: finalProbe.resources },
            }),
          )
        } catch {
          // Observational evidence must never change UNKNOWN fencing or cleanup.
        }
        return unknown()
      }
      // Unlike normal shutdown, a lost/failed service.dispose receipt is NOT considered clean.
      stage = 'DISPOSE_ACK'
      await this.idleControl(owner, peer, () =>
        peer.call('runtime.dispose', undefined, z.undefined(), { timeoutMs: this.shutdownMs }),
      )
      if (!unchanged() || this.state.references.runs !== 0 || this.state.references.resources !== 0) return unknown()
      this.idleDisposalAcknowledged = true
      this.disposalAcknowledgedChildPid = child.pid
      stage = 'PHYSICAL_RECEIPT'
      await this.dispose()
      const receipt = this.retirementReceipt(owner)
      // dispose includes native join and onExit reconciliation; failed join/callback rejects.
      if (
        !this.sameOwner(owner) ||
        this.idleConfigurationIdentity() !== configuration ||
        this.child ||
        this.retirement ||
        this.snapshot().phase !== 'disposed' ||
        child.exitCode !== 0 ||
        this.state.references.runs !== 0 ||
        this.state.references.resources !== 0 ||
        this.idleForcedTermination ||
        !receipt ||
        receipt.forced ||
        !receipt.cleanDisposeAck ||
        receipt.exitCode !== 0
      )
        return unknown()
      this.idleAdmission = 'retired'
      return {
        status: 'confirmed-physical-exit',
        owner,
        childPid: child.pid,
        exitCode: child.exitCode,
        disposalAcknowledged: true,
        nativeJoined: true,
      }
    } catch {
      // Do not expose arbitrary error text/configuration. No new incarnation is permitted.
      return unknown()
    }
  }

  private publish(): void {
    try {
      this.options.onState?.(this.snapshot())
    } catch {
      console.error('[hbar runtime] generation observer failed')
    }
  }

  private async launch(): Promise<void> {
    if (this.stopped) throw new HbarError('RUNTIME_DISPOSED', 'Runtime generation is disposed')
    await this.retire()
    if (this.stopped) throw new HbarError('RUNTIME_DISPOSED', 'Runtime generation is disposed')
    this.heartbeatEvidence = new HeartbeatEvidence(this.heartbeatMs, Date.now(), performance.now())
    this.state.incarnation = crypto.randomUUID()
    this.state.phase = 'preparing'
    this.state.nextAttemptAt = null
    this.state.lastHeartbeatAt = Date.now()
    this.heartbeatEvidence?.received(this.state.lastHeartbeatAt, performance.now())
    this.state.reasonCode = null
    this.fencing = undefined
    this.publish()
    const owner = this.owner()
    const deadline = Date.now() + this.startupMs
    if (this.options.verifyModule) {
      const signal = AbortSignal.any([this.stopController.signal, AbortSignal.timeout(this.startupMs)])
      try {
        await new Promise<void>((resolve, reject) => {
          const cancel = () =>
            reject(new HbarError('RUNTIME_VERIFICATION_EXPIRED', 'Runtime module verification expired'))
          signal.addEventListener('abort', cancel, { once: true })
          Promise.resolve()
            .then(() => {
              signal.throwIfAborted()
              return this.options.verifyModule?.(signal)
            })
            .then(resolve, reject)
            .finally(() => signal.removeEventListener('abort', cancel))
        })
        signal.throwIfAborted()
      } catch (error) {
        if (!this.stopped) {
          this.state.phase = this.activated ? 'recovering' : 'failed'
          this.state.reasonCode = error instanceof HbarError ? error.code : 'RUNTIME_VERIFICATION_FAILED'
          this.publish()
        }
        throw error
      }
    }
    if (this.stopped) throw new HbarError('RUNTIME_DISPOSED', 'Runtime process stopped before module loading')
    const child = Bun.spawn(
      this.options.command
        ? [...this.options.command]
        : [process.execPath, '--smol', fileURLToPath(new URL('./process-entry.ts', import.meta.url))],
      {
        stdin: 'ignore',
        stdout: 'inherit',
        stderr: 'inherit',
        windowsHide: true,
        serialization: 'json',
        env: {
          ...process.env,
          ...this.options.processTree?.environment,
          HBAR_RUNTIME_SELF: JSON.stringify(owner),
          HBAR_RUNTIME_PARENT: JSON.stringify(this.options.parent),
          HBAR_RUNTIME_MODULE: this.options.modulePath,
          HBAR_RUNTIME_PREPARATION: this.activated
            ? 'recovery'
            : (this.options.purpose ?? (this.options.generation === 1 ? 'startup' : 'candidate')),
          HBAR_RUNTIME_HEARTBEAT_MS: String(this.heartbeatMs),
          HBAR_RUNTIME_CONTROL_METHODS: JSON.stringify([
            ...RUNTIME_CONTROL_METHODS,
            ...(this.options.controlMethods ?? []),
          ]),
        },
        ipc: (message: unknown) => {
          if (this.child === child) this.peer?.receive(message)
        },
      },
    )
    this.child = child
    this.state.pid = child.pid
    const peer = new IpcPeer({
      owner: this.options.parent,
      remote: owner,
      controlMethods: [...RUNTIME_CONTROL_METHODS, ...(this.options.controlMethods ?? [])],
      transport: { send: (frame) => child.send(frame) },
      onFailure: () => this.fault('RUNTIME_IPC_FAILED'),
      onTimeout: () => this.fault('RUNTIME_CALL_TIMEOUT'),
      onCallTimeout: (event) => this.options.onCallTimeout?.(owner, child.pid, event),
    })
    this.peer = peer
    const attachment = this.options.processTree
      ? this.options.processTree.attach(
          child.pid,
          AbortSignal.any([this.stopController.signal, AbortSignal.timeout(Math.max(1, deadline - Date.now()))]),
        )
      : Promise.resolve(undefined)
    void attachment.catch(() => {})
    peer.onEvent('runtime.heartbeat', z.strictObject({ time: z.number().int().nonnegative() }), () => {
      this.state.lastHeartbeatAt = Date.now()
      this.heartbeatEvidence?.received(this.state.lastHeartbeatAt, performance.now())
    })
    void child.exited
      .then((exitCode) => {
        this.exitHandling = this.exited(child, peer, owner, attachment, exitCode)
        return this.exitHandling
      })
      .catch(() => {
        this.state.reasonCode = 'RUNTIME_EXIT_RECONCILIATION_FAILED'
        this.publish()
      })
    try {
      this.options.onPeer?.(peer, owner)
      const tree = await attachment
      if (this.child !== child || this.stopped) {
        tree?.terminate()
        throw new HbarError(
          'RUNTIME_OWNER_REVOKED',
          'Runtime owner exited before native process ownership was established',
        )
      }
      this.tree = tree
      this.monitor = setInterval(
        () => {
          const evidence = this.heartbeatEvidence?.monitor(
            Date.now(),
            performance.now(),
            Math.min(this.heartbeatMs, 500),
          )
          if (
            this.stopped ||
            this.child !== child ||
            this.state.phase === 'preparing' ||
            this.state.phase === 'recovering' ||
            this.state.phase === 'failed'
          )
            return
          const idleControl = this.idleControlLease
          if (
            idleControl &&
            this.idleAdmission === 'draining' &&
            idleControl.peer === peer &&
            this.peer === peer &&
            this.sameOwner(idleControl.owner)
          ) {
            if (performance.now() < idleControl.deadline) return
            this.fault('RUNTIME_CALL_TIMEOUT')
            return
          }
          if (Date.now() - (this.state.lastHeartbeatAt ?? 0) >= this.heartbeatMs * RUNTIME_LIMITS.missedHeartbeats) {
            const counts = peer.snapshot()
            if (this.heartbeatEvidence?.shouldReport(performance.now(), true))
              writeHeartbeatEvidence(owner, 'parent_timeout', {
                ...evidence,
                pending: counts.inFlight + counts.queued,
                recordsIn: counts.incoming + counts.incomingQueued,
                bytesIn: counts.bufferedBytes,
              })
            this.fault('RUNTIME_HEARTBEAT_TIMEOUT')
          }
        },
        Math.min(this.heartbeatMs, 500),
      )
      const ready = await peer.call(
        'runtime.prepare',
        { descriptor: this.options.descriptor, configuration: this.options.configuration ?? {} },
        runtimeReadySchema,
        { timeoutMs: Math.max(1, deadline - Date.now()) },
      )
      if (
        ready.contractFingerprint !== this.options.descriptor.contractFingerprint ||
        ready.storageSchema !== this.options.descriptor.storageSchema
      )
        throw new HbarError(
          'RUNTIME_RESTART_REQUIRED',
          'Runtime candidate is incompatible with the stable ports or storage schema',
        )
      if (this.child !== child || this.stopped)
        throw new HbarError('RUNTIME_OWNER_REVOKED', 'Runtime owner exited during preparation')
      this.state.phase = 'ready'
      this.state.lastHeartbeatAt = Date.now()
      this.heartbeatEvidence?.received(this.state.lastHeartbeatAt, performance.now())
      this.publish()
    } catch (error) {
      this.state.reasonCode = error instanceof HbarError ? error.code : 'RUNTIME_PREPARE_FAILED'
      try {
        child.kill('SIGKILL')
      } catch {
        /* Exit is observed independently. */
      }
      await child.exited
      await this.exitHandling
      throw error
    }
  }

  private fault(reason: string): void {
    if (this.stopped || !this.child || this.state.phase === 'recovering' || this.state.phase === 'failed') return
    this.state.reasonCode = reason
    this.state.phase = this.activated ? 'recovering' : 'failed'
    try {
      this.fencing = this.options.onFault?.(this.owner(), reason, this.child.pid)
    } catch (error) {
      this.fencing = Promise.reject(error)
    }
    void this.fencing?.catch(() => {
      this.state.reasonCode = 'RUNTIME_FENCE_FAILED'
      this.publish()
    })
    this.publish()
    this.terminate(this.child)
  }

  private terminate(child: Bun.Subprocess): void {
    this.forcedChildPids.add(child.pid)
    if (this.idleAdmission === 'draining' || this.idleDisposalAcknowledged) this.idleForcedTermination = true
    try {
      this.tree?.terminate()
    } catch {
      console.error('[hbar runtime] descendant termination needs reconciliation')
    }
    try {
      if (child.exitCode === null) child.kill('SIGKILL')
    } catch {
      console.error('[hbar runtime] owner termination failed')
    }
  }

  private async exited(
    child: Bun.Subprocess,
    peer: IpcPeer,
    owner: RuntimeOwner,
    tree: Promise<RuntimeProcessTree | undefined>,
    exitCode: number,
  ): Promise<void> {
    if (this.child !== child) return
    clearInterval(this.monitor)
    const deliberate = this.stopped
    if (!deliberate) this.state.reasonCode ??= 'RUNTIME_PROCESS_EXITED'
    this.state.phase = deliberate ? 'disposing' : this.activated ? 'recovering' : 'failed'
    const reason = this.state.reasonCode
    if (!deliberate && !this.fencing) {
      try {
        this.fencing = this.options.onFault?.(owner, reason ?? 'RUNTIME_PROCESS_EXITED', child.pid)
      } catch (error) {
        this.fencing = Promise.reject(error)
      }
      void this.fencing?.catch(() => {})
    }
    this.child = undefined
    this.tree = undefined
    this.peer = undefined
    this.state.pid = null
    peer.close()
    this.publish()
    const exit: RuntimeProcessExit = {
      childPid: child.pid,
      exitCode,
      reasonCode: reason,
      deliberate,
      restartExpected: !deliberate && this.activated,
    }
    this.retirement = {
      owner,
      exit,
      tree,
      deliberate,
      fence: this.fencing,
      release: undefined,
      joined: false,
      forced: this.forcedChildPids.has(exit.childPid),
    }
    try {
      await this.retire()
    } catch (error) {
      this.state.reasonCode = error instanceof HbarError ? error.code : 'RUNTIME_EXIT_RECONCILIATION_FAILED'
      this.publish()
    } finally {
      if (!deliberate && this.activated) this.scheduleRecovery()
    }
  }

  private retire(): Promise<void> {
    if (!this.retirement) return Promise.resolve()
    this.retiring ??= this.reconcileRetirement(this.retirement).finally(() => {
      this.retiring = undefined
    })
    return this.retiring
  }

  private async bounded<Value>(pending: Promise<Value>, deadline: number): Promise<Value> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        pending,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new HbarError('RUNTIME_EXIT_RECONCILIATION_FAILED', 'Execution ownership retirement has not completed'),
              ),
            Math.max(1, deadline - Date.now()),
          )
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  private async reconcileRetirement(retirement: Retirement): Promise<void> {
    const deadline = Date.now() + this.shutdownMs
    // The module is never imported before attachment succeeds; a failed attachment has no owned descendants.
    const tree = await this.bounded(
      retirement.tree.catch(() => undefined),
      deadline,
    )
    if (!retirement.joined) {
      // Clean idle must join naturally. A timeout leaves the owner unknown; never kill descendants
      // and then label the forced boundary a clean idle retirement. Normal shutdown is unchanged.
      if (!(retirement.deliberate && this.idleDisposalAcknowledged) && tree) {
        retirement.forced = true
        tree.terminate()
      }
      await tree?.join(Math.max(1, deadline - Date.now()))
      tree?.close()
      retirement.joined = true
    }
    if (!retirement.deliberate) {
      retirement.fence ??= Promise.resolve().then(() =>
        this.options.onFault?.(
          retirement.owner,
          this.state.reasonCode ?? 'RUNTIME_PROCESS_EXITED',
          retirement.exit.childPid,
        ),
      )
      try {
        await this.bounded(retirement.fence, deadline)
      } catch (error) {
        // Keep a still-pending fence, but allow a rejected durable write to retry on the next backoff.
        void retirement.fence.catch(() => {
          retirement.fence = undefined
        })
        throw error
      }
    }
    retirement.release ??= Promise.resolve().then(() => this.options.onExit?.(retirement.owner, retirement.exit))
    try {
      await this.bounded(retirement.release, deadline)
    } catch (error) {
      void retirement.release.catch(() => {
        retirement.release = undefined
      })
      throw error
    }
    // No tree or no ownership callback means the complete boundary is not observable.
    if (tree && retirement.joined && this.options.onExit) {
      const key = JSON.stringify([retirement.owner.unitId, retirement.owner.generation, retirement.owner.incarnation])
      if (!this.physicalRetirements.has(key) && this.physicalRetirements.size >= 16)
        throw new HbarError('RUNTIME_RETIREMENT_CAPACITY', 'Retirement reconciliation is required')
      this.physicalRetirements.set(key, {
        owner: { ...retirement.owner },
        childPid: retirement.exit.childPid,
        exitCode: retirement.exit.exitCode,
        nativeJoined: true,
        onExitCompleted: true,
        forced: retirement.forced || this.forcedChildPids.has(retirement.exit.childPid),
        cleanDisposeAck: this.disposalAcknowledgedChildPid === retirement.exit.childPid,
      })
      const receipt = this.retirementReceipt(retirement.owner)
      if (receipt) {
        try {
          this.options.onPhysicalRetirement?.(receipt)
        } catch {
          console.error('[hbar runtime] physical retirement observer failed')
        }
      }
    }
    this.forcedChildPids.delete(retirement.exit.childPid)
    if (this.retirement === retirement) this.retirement = undefined
  }

  private scheduleRecovery(): void {
    if (this.stopped || this.recoveryTimer || this.idleAdmission !== 'open') return
    if (this.healthySince !== null && Date.now() - this.healthySince >= this.healthyResetMs) this.state.failures = 0
    this.healthySince = null
    const base = (this.options.retryDelaysMs ?? [250, 1_000, 4_000])[this.state.failures] ?? this.retrySlowMs
    this.state.failures++
    const delay = Math.max(1, Math.round(base * (1 + (Math.random() * 2 - 1) * this.jitter)))
    this.state.nextAttemptAt = Date.now() + delay
    this.publish()
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = undefined
      this.recovering = this.recover()
        .catch(() => {
          if (!this.stopped && !this.child) this.scheduleRecovery()
        })
        .finally(() => {
          this.recovering = undefined
        })
    }, delay)
  }

  private async recover(): Promise<void> {
    await this.prepare()
    if (this.stopped) return
    const role = this.state.role
    await this.activate(role === 'draining' ? 'draining' : 'default')
  }

  private async waitForExit(child: Bun.Subprocess, timeoutMs: number): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        child.exited.then(() => true),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  private async disposeProcess(): Promise<void> {
    const end = Date.now() + this.shutdownMs
    this.stopped = true
    this.stopController.abort()
    this.activation?.abort()
    clearTimeout(this.recoveryTimer)
    clearInterval(this.monitor)
    this.state.phase = 'disposing'
    this.publish()
    const child = this.child
    const peer = this.peer
    if (child) {
      const deadline = setTimeout(() => {
        this.terminate(child)
      }, this.shutdownMs)
      try {
        if (!this.idleDisposalAcknowledged) {
          await peer?.call('runtime.dispose', undefined, z.undefined(), { timeoutMs: Math.max(1, end - Date.now()) })
          if (peer) this.disposalAcknowledgedChildPid = child.pid
        }
        await peer?.call('runtime.exit', undefined, z.undefined(), { timeoutMs: Math.max(1, end - Date.now()) })
      } catch {
        /* The deadline is enforced by termination of the owning process. */
      }
      if (!(await this.waitForExit(child, Math.max(1, end - Date.now())))) {
        this.terminate(child)
      }
      if (!(await this.waitForExit(child, this.shutdownMs)))
        throw new HbarError('RUNTIME_EXIT_UNKNOWN', 'Runtime process exit could not be confirmed')
      await this.exitHandling
      clearTimeout(deadline)
    }
    await this.launching?.catch(() => {})
    await this.recovering?.catch(() => {})
    await this.retire()
    this.state.phase = 'disposed'
    this.state.nextAttemptAt = null
    this.state.pid = null
    this.publish()
  }
}
