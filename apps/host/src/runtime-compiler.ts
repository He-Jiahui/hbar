import { HbarError } from '@hbar/contracts/errors'
import {
  RuntimeBuildProcessOwner,
  buildRuntimeArtifact,
  type RuntimeArtifact,
  type RuntimeArtifactStore,
  type RuntimeBuildUnit,
  type RuntimeBuildProcessOptions,
  type RuntimeBuildProcessSnapshot,
} from '@hbar/runtime'

/** Trusted composition selects a backend before startup; failures never switch backends. */
export type HostRuntimeCompilerOptions =
  { readonly mode: 'worker' } | ({ readonly mode: 'process' } & RuntimeBuildProcessOptions)

export class HostRuntimeCompiler {
  private readonly owner: RuntimeBuildProcessOwner | undefined
  private closed = false

  constructor(options: HostRuntimeCompilerOptions) {
    this.owner = options.mode === 'process' ? new RuntimeBuildProcessOwner(options) : undefined
  }
  snapshot(): RuntimeBuildProcessSnapshot | undefined {
    return this.owner?.snapshot()
  }
  /** Called between complete build batches; cleanup never compiles or accepts a candidate. */
  async prepare(): Promise<void> {
    if (this.closed) throw new HbarError('RUNTIME_CANCELLED', 'Host compiler is closed')
    const jobs = this.owner?.snapshot().jobs ?? []
    if (jobs.some((job) => job.phase !== 'unknown'))
      throw new HbarError('RUNTIME_BUILD_LIMIT', 'Host compilation is already in progress')
    if (jobs.length) await this.owner?.reconcile()
  }
  async build(store: RuntimeArtifactStore, unit: RuntimeBuildUnit, signal: AbortSignal): Promise<RuntimeArtifact> {
    signal.throwIfAborted()
    if (this.closed) throw new HbarError('RUNTIME_CANCELLED', 'Host compiler is closed')
    if (this.owner?.snapshot().jobs.some((job) => job.phase === 'unknown'))
      throw new HbarError('RUNTIME_BUILD_EXIT_TIMEOUT', 'Previous Host compiler ownership is unresolved')
    return this.owner ? await this.owner.build(store, unit, signal) : await buildRuntimeArtifact(store, unit, signal)
  }
  /** Explicit cleanup after a logical failure; never starts another build. */
  async reconcile(): Promise<RuntimeBuildProcessSnapshot | undefined> {
    return await this.owner?.reconcile()
  }
  async close(): Promise<void> {
    this.closed = true
    await this.owner?.close()
  }
}
