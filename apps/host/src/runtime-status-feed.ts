import { runtimeDeltaSchema, runtimeSnapshotSchema, runtimeWatchResultSchema,
  type RuntimeDelta, type RuntimeSnapshot, type RuntimeWatchResult } from '@hbar/contracts/runtime'

/** One stable cursor covers unit deltas and admission/source status. History and every publication are bounded. */
export class RuntimeStatusFeed {
  private revision = 0
  private readonly history: RuntimeDelta[] = []
  private readonly listeners = new Set<(delta: RuntimeDelta) => unknown>()
  private previous = ''
  private closed = false
  constructor(private readonly read: () => RuntimeSnapshot) {}
  snapshot(): RuntimeSnapshot { this.refresh(); return runtimeSnapshotSchema.parse({ ...this.read(), revision: this.revision }) }
  subscribe(listener: (delta: RuntimeDelta) => unknown): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  accept(delta: RuntimeDelta): void {
    if (this.closed) return
    const status = this.status()
    this.previous = JSON.stringify(status)
    this.publish({ ...delta, ...status, revision: ++this.revision })
  }
  refresh(): void {
    if (this.closed) return
    const status = this.status(), signature = JSON.stringify(status)
    if (this.previous === signature) return
    this.previous = signature
    this.publish({ ...status, revision: ++this.revision, units: [], operations: [] })
  }
  watch(cursor?: number): RuntimeWatchResult {
    const snapshot = this.snapshot(), oldest = this.history[0]?.revision ?? this.revision + 1
    if (cursor === undefined || cursor > this.revision || cursor < oldest - 1)
      return runtimeWatchResultSchema.parse({ revision: this.revision, snapshot, events: [], reset: true })
    return runtimeWatchResultSchema.parse({ revision: this.revision, snapshot: null, events: this.history.filter(event => event.revision > cursor), reset: false })
  }
  close(): void { this.closed = true; this.listeners.clear(); this.history.length = 0 }
  private status(): Pick<RuntimeSnapshot, 'instanceId' | 'ready' | 'sourceReload' | 'admission' | 'preparedArtifactSets'> {
    const value = this.read()
    return { instanceId: value.instanceId, ready: value.ready, preparedArtifactSets: value.preparedArtifactSets,
      ...(value.sourceReload ? { sourceReload: value.sourceReload } : {}), ...(value.admission ? { admission: value.admission } : {}) }
  }
  private publish(raw: RuntimeDelta): void {
    const delta = runtimeDeltaSchema.parse(raw)
    this.history.push(delta)
    if (this.history.length > 64) this.history.shift()
    for (const listener of [...this.listeners]) {
      try { void Promise.resolve(listener(runtimeDeltaSchema.parse(delta))).catch(() => { console.error('[hbar runtime] status subscription observer failed') }) }
      catch { console.error('[hbar runtime] status subscription observer failed') }
    }
  }
}
