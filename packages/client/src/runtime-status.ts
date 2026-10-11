import { HbarError } from '@hbar/contracts'
import { runtimeDeltaSchema, runtimeSnapshotSchema, runtimeWatchResultSchema,
  type RuntimeDelta, type RuntimeSnapshot, type RuntimeReload, type RuntimeWatchResult } from '@hbar/contracts/runtime'

export interface RuntimeStatusState {
  readonly snapshot: RuntimeSnapshot | null
  readonly operations: readonly RuntimeReload[]
  readonly syncing: boolean
  readonly errorCode: string | null
}
export interface RuntimeStatusTransport {
  watch(cursor?: number): Promise<RuntimeWatchResult>
  unwatch(): Promise<unknown>
}

/** On-demand subscription with a continuous applied cursor, bounded replay and connection epoch checks. */
export class RuntimeStatusClient {
  private readonly listeners = new Set<(state: RuntimeStatusState) => void>()
  private readonly operations = new Map<string, RuntimeReload>()
  private snapshot: RuntimeSnapshot | null = null
  private cursor: number | undefined
  private identity: string | null = null
  private available = false
  private epoch = 0
  private task: Promise<void> | null = null
  private pending: RuntimeDelta[] = []
  private forceSnapshot = false
  private repairAttempts = 0
  private unsupported = false
  private errorCode: string | null = null
  private retry: ReturnType<typeof setTimeout> | undefined
  constructor(private readonly transport: RuntimeStatusTransport) {}
  state(): RuntimeStatusState { return { snapshot: this.snapshot, operations: [...this.operations.values()], syncing: this.task !== null, errorCode: this.errorCode } }
  subscribe(listener: (state: RuntimeStatusState) => void): () => void {
    this.listeners.add(listener)
    try { listener(this.state()) } catch { this.errorCode = 'RUNTIME_STATUS_LISTENER_FAILED' }
    if (this.available && !this.unsupported) void this.refresh()
    return () => {
      this.listeners.delete(listener)
      if (!this.listeners.size) {
        clearTimeout(this.retry); this.retry = undefined; this.epoch++; this.task = null; this.pending.length = 0
        if (this.available) void this.transport.unwatch().catch(() => {})
      }
    }
  }
  connection(instanceId: string | null): void {
    this.epoch++; this.task = null; this.pending.length = 0
    clearTimeout(this.retry); this.retry = undefined
    this.available = instanceId !== null
    if (instanceId !== null && this.identity !== instanceId) {
      this.identity = instanceId; this.snapshot = null; this.cursor = undefined; this.operations.clear(); this.unsupported = false
    }
    this.repairAttempts = 0
    this.publish()
    if (this.available && this.listeners.size && !this.unsupported) void this.refresh()
  }
  receive(raw: unknown): void {
    if (!this.available || !this.listeners.size) return
    try {
      const delta = runtimeDeltaSchema.parse(raw)
      if (delta.instanceId !== this.identity) return
      if (this.task) { this.buffer(delta); return }
      if (!this.apply(delta)) { this.buffer(delta); this.repair() }
    } catch { this.errorCode = 'INVALID_RUNTIME_STATUS'; this.forceSnapshot = true; this.repair() }
  }
  refresh(): Promise<void> {
    if (this.task) return this.task
    if (!this.available || !this.listeners.size || this.unsupported) return Promise.resolve()
    clearTimeout(this.retry); this.retry = undefined
    const epoch = this.epoch, cursor = this.forceSnapshot ? undefined : this.cursor
    this.forceSnapshot = false
    const task = Promise.resolve().then(() => this.transport.watch(cursor)).then(raw => {
      if (epoch !== this.epoch || !this.available || !this.listeners.size) return
      const result = runtimeWatchResultSchema.parse(raw)
      if (result.reset) {
        if (!result.snapshot || result.snapshot.instanceId !== this.identity || result.snapshot.revision !== result.revision)
          throw new HbarError('INVALID_RUNTIME_STATUS', 'Runtime snapshot does not match its identity and cursor')
        this.snapshot = runtimeSnapshotSchema.parse(result.snapshot); this.operations.clear()
        if (!this.publish()) throw new HbarError('RUNTIME_STATUS_LISTENER_FAILED', 'Runtime observer did not apply its snapshot')
        this.cursor = result.revision
      } else {
        if (result.snapshot) throw new HbarError('INVALID_RUNTIME_STATUS', 'Incremental recovery cannot replace its snapshot')
        for (const delta of result.events) if (!this.apply(delta)) throw new HbarError('RUNTIME_STATUS_GAP', 'Runtime replay has an unapplied revision')
        if (this.cursor !== result.revision) throw new HbarError('RUNTIME_STATUS_GAP', 'Runtime replay did not reach its declared revision')
      }
      this.errorCode = null
    }).catch((error: unknown) => {
      if (epoch !== this.epoch) return
      this.errorCode = error instanceof HbarError ? error.code : 'RUNTIME_STATUS_UNAVAILABLE'
      this.unsupported = ['METHOD_NOT_FOUND', 'RUNTIME_RESTART_REQUIRED'].includes(this.errorCode)
      this.forceSnapshot = true
    }).finally(() => {
      if (epoch !== this.epoch) return
      this.task = null
      const pending = this.pending.splice(0).sort((left, right) => left.revision - right.revision)
      for (const delta of pending) {
        try { if (!this.apply(delta)) { this.buffer(delta); this.forceSnapshot = true } }
        catch { this.errorCode = 'INVALID_RUNTIME_STATUS'; this.forceSnapshot = true; break }
      }
      this.publish()
      if (this.forceSnapshot && !this.unsupported) this.repair()
      else this.repairAttempts = 0
    })
    this.task = task
    this.publish()
    return task
  }
  private apply(delta: RuntimeDelta): boolean {
    if (delta.instanceId !== this.identity) return false
    if (this.cursor !== undefined && delta.revision <= this.cursor) return true
    if (!this.snapshot || this.cursor === undefined || delta.revision !== this.cursor + 1) return false
    const units = new Map(this.snapshot.units.map(unit => [unit.descriptor.id, unit]))
    for (const unit of delta.units) units.set(unit.descriptor.id, unit)
    for (const operation of delta.operations) {
      this.operations.delete(operation.operationId); this.operations.set(operation.operationId, operation)
      if (this.operations.size > 64) this.operations.delete(this.operations.keys().next().value ?? '')
    }
    this.snapshot = runtimeSnapshotSchema.parse({ ...this.snapshot, revision: delta.revision, units: [...units.values()],
      ...(delta.ready !== undefined ? { ready: delta.ready } : {}), ...(delta.sourceReload ? { sourceReload: delta.sourceReload } : {}),
      ...(delta.admission ? { admission: delta.admission } : {}), ...(delta.preparedArtifactSets ? { preparedArtifactSets: delta.preparedArtifactSets } : {}) })
    if (!this.publish()) { this.errorCode = 'RUNTIME_STATUS_LISTENER_FAILED'; return false }
    this.cursor = delta.revision
    return true
  }
  private buffer(delta: RuntimeDelta): void {
    if (this.pending.some(value => value.revision === delta.revision && value.instanceId === delta.instanceId)) return
    if (this.pending.length >= 64) { this.pending.length = 0; this.forceSnapshot = true }
    this.pending.push(delta)
  }
  private repair(): void {
    if (this.task || this.retry || !this.available || !this.listeners.size || this.unsupported || this.repairAttempts >= 2) return
    this.repairAttempts++
    this.retry = setTimeout(() => { this.retry = undefined; void this.refresh() }, 100)
  }
  private publish(): boolean {
    let applied = true
    const state = this.state()
    for (const listener of [...this.listeners]) {
      try { listener(state) } catch { applied = false }
    }
    return applied
  }
}
