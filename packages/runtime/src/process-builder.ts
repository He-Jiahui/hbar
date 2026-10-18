import { HbarError } from '@hbar/contracts/errors'
import { RUNTIME_LIMITS, type RuntimeProcessTree, type RuntimeProcessTreePort } from '@hbar/contracts/runtime'
import { RuntimeArtifactStore, type RuntimeArtifact, type RuntimeBuildUnit } from './artifacts'
import { runtimeDomainError } from './errors'
import {
  BUILD_REQUEST_MAX_BYTES,
  BUILD_RESULT_MAX_BYTES,
  BUILD_ERROR_MAX_BYTES,
  buildProcessRequestSchema,
  buildProcessResultSchema,
  readBuildProcessText,
} from './build-process-protocol'

export interface RuntimeBuildProcessOptions {
  readonly processTree: RuntimeProcessTreePort
  /** Composition supplies the complete source, emitted JS or compiled command. No flags are added. */
  readonly command: readonly [string, ...string[]]
}
function spawnCompiler(
  command: readonly [string, ...string[]],
  cwd: string,
  environment: Readonly<Record<string, string>>,
) {
  return Bun.spawn([...command], {
    cwd,
    env: { ...process.env, ...environment },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true,
  })
}
type Compiler = ReturnType<typeof spawnCompiler>
type Phase = 'starting' | 'building' | 'cleaning' | 'unknown'
export interface RuntimeBuildProcessReceipt {
  readonly jobId: string
  readonly unitId: string
  readonly childPid: number
  readonly exitCode: number
  readonly nativeJoined: true
  readonly activeProcesses: 0
  readonly nativeClosed: true
}
export interface RuntimeBuildProcessSnapshot {
  readonly closed: boolean
  readonly jobs: readonly {
    readonly jobId: string
    readonly unitId: string
    readonly childPid: number
    readonly phase: Phase
    readonly exitCode: number | null
    readonly attachSettled: boolean
    readonly nativeJoined: boolean
    readonly activeProcesses: number | null
    readonly nativeClosed: boolean
  }[]
  readonly receipts: readonly RuntimeBuildProcessReceipt[]
}
interface Job {
  readonly id: string
  readonly unitId: string
  readonly child: Compiler
  readonly lifetime: AbortController
  readonly stdout: Promise<string>
  readonly stderr: Promise<string>
  attach: Promise<void>
  attachSettled: boolean
  tree?: RuntimeProcessTree
  active?: () => number
  join?: Promise<void>
  phase: Phase
  exitCode: number | null
  joined: boolean
  count: number | null
  closed: boolean
  drained: boolean
  stopRequested: boolean
  stopFailure?: { error: unknown }
  cleanup?: Promise<readonly unknown[]>
}
function exitUnknown(message: string, cause?: unknown): HbarError {
  return cause === undefined
    ? new HbarError('RUNTIME_BUILD_EXIT_TIMEOUT', message)
    : new HbarError('RUNTIME_BUILD_EXIT_TIMEOUT', message, { cause })
}
async function before<T>(promise: Promise<T>, end: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(exitUnknown('Builder physical completion is unconfirmed')),
          Math.max(0, end - Date.now()),
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Composition retains this bounded owner through logical failure and shutdown until physical settlement. */
export class RuntimeBuildProcessOwner {
  private readonly jobs = new Map<string, Job>()
  private readonly completed: RuntimeBuildProcessReceipt[] = []
  private readonly command: readonly [string, ...string[]]
  private readonly environment: Readonly<Record<string, string>>
  private closed = false

  constructor(private readonly options: RuntimeBuildProcessOptions) {
    this.command = [options.command[0], ...options.command.slice(1)]
    this.environment = { ...options.processTree.environment }
  }
  /** Pure detached diagnostics. Missing native capability remains null; reading never starts work. */
  snapshot(): RuntimeBuildProcessSnapshot {
    return {
      closed: this.closed,
      jobs: [...this.jobs.values()].map((job) => ({
        jobId: job.id,
        unitId: job.unitId,
        childPid: job.child.pid,
        phase: job.phase,
        exitCode: job.exitCode,
        attachSettled: job.attachSettled,
        nativeJoined: job.joined,
        activeProcesses: job.count,
        nativeClosed: job.closed,
      })),
      receipts: this.completed.map((receipt) => ({ ...receipt })),
    }
  }
  private release(job: Job): void {
    if (
      this.jobs.get(job.id) !== job ||
      job.exitCode === null ||
      !job.joined ||
      job.count !== 0 ||
      !job.closed ||
      !job.drained
    )
      return
    this.jobs.delete(job.id)
    this.completed.push({
      jobId: job.id,
      unitId: job.unitId,
      childPid: job.child.pid,
      exitCode: job.exitCode,
      nativeJoined: true,
      activeProcesses: 0,
      nativeClosed: true,
    })
    if (this.completed.length > 32) this.completed.shift()
  }
  private stop(job: Job): void {
    try {
      if (job.tree && !job.closed) job.tree.terminate()
    } catch (error) {
      job.stopFailure ??= { error }
    }
    try {
      if (job.child.exitCode === null) job.child.kill()
    } catch (error) {
      job.stopFailure ??= { error }
    }
  }
  private async join(job: Job, end: number): Promise<void> {
    if (job.joined) return
    const tree = job.tree
    if (!tree) throw exitUnknown('Builder native attachment is unconfirmed')
    // A timed-out join retains its promise and exact handle; cleanup cannot race a second join.
    if (!job.join) {
      const pending = tree.join(Math.max(0, end - Date.now())).then(() => {
        job.joined = true
      })
      job.join = pending
      void pending.then(
        () => {
          if (job.join === pending) delete job.join
        },
        () => {
          if (job.join === pending) delete job.join
        },
      )
    }
    await before(job.join, end)
  }
  private clean(job: Job, end: number, stop: boolean): Promise<readonly unknown[]> {
    job.stopRequested ||= stop
    if (job.cleanup) {
      if (stop) this.stop(job)
      return job.cleanup
    }
    const run = async (): Promise<readonly unknown[]> => {
      job.phase = 'cleaning'
      const errors: unknown[] = []
      if (job.stopRequested) this.stop(job)
      const attempt = async (operation: () => void | Promise<void>): Promise<void> => {
        try {
          await operation()
        } catch (error) {
          errors.push(error)
        }
      }
      await Promise.all([
        attempt(async () => {
          job.exitCode = await before(job.child.exited, end)
        }),
        attempt(async () => {
          await before(job.attach, end)
        }),
        attempt(async () => {
          await before(Promise.allSettled([job.stdout, job.stderr]), end)
          job.drained = true
        }),
      ])
      if (job.stopRequested) this.stop(job)
      await attempt(async () => {
        if (!job.closed) await this.join(job, end)
      })
      await attempt(() => {
        if (job.closed) return
        const active = job.active
        if (!job.joined || !active) throw exitUnknown('Builder active-count capability is unavailable')
        const count = active()
        if (!Number.isSafeInteger(count) || count < 0) throw exitUnknown('Builder active count is invalid')
        job.count = count
        if (count !== 0) {
          job.joined = false
          throw exitUnknown('Builder descendants remain unconfirmed')
        }
      })
      await attempt(() => {
        if (job.closed) return
        if (!job.tree || job.exitCode === null || !job.joined || job.count !== 0)
          throw exitUnknown('Builder native close is unconfirmed')
        job.tree.close()
        job.closed = true
      })
      if (job.stopFailure) {
        errors.push(job.stopFailure.error)
        delete job.stopFailure
      }
      this.release(job)
      if (this.jobs.has(job.id)) job.phase = 'unknown'
      return errors
    }
    const pending = run()
    job.cleanup = pending
    void pending.then(
      () => {
        if (job.cleanup === pending) delete job.cleanup
      },
      () => {
        if (job.cleanup === pending) delete job.cleanup
      },
    )
    return pending
  }
  private lateAttach(job: Job): void {
    if (!job.stopRequested) return
    // An attach that ignored cancellation still belongs to this job. Clean only that exact handle.
    void Promise.resolve(job.cleanup)
      .then(async () => {
        if (this.jobs.get(job.id) === job) await this.clean(job, Date.now() + RUNTIME_LIMITS.shutdownMs, true)
      })
      .catch(() => {
        job.phase = 'unknown'
      })
  }
  private start(store: RuntimeArtifactStore, unit: RuntimeBuildUnit): Job {
    const child = spawnCompiler(this.command, store.sourceRoot, this.environment)
    const job: Job = {
      id: crypto.randomUUID(),
      unitId: unit.descriptor.id,
      child,
      lifetime: new AbortController(),
      stdout: readBuildProcessText(child.stdout, BUILD_RESULT_MAX_BYTES),
      stderr: readBuildProcessText(child.stderr, BUILD_ERROR_MAX_BYTES),
      attach: Promise.resolve(),
      attachSettled: false,
      phase: 'starting',
      exitCode: null,
      joined: false,
      count: null,
      closed: false,
      drained: false,
      stopRequested: false,
    }
    this.jobs.set(job.id, job)
    void job.stdout.catch(() => undefined)
    void job.stderr.catch(() => undefined)
    void child.exited.then(
      (code) => {
        job.exitCode = code
      },
      () => {
        job.phase = 'unknown'
      },
    )
    job.attach = Promise.resolve()
      .then(() => this.options.processTree.attach(child.pid, job.lifetime.signal))
      .then(
        (tree) => {
          job.tree = tree
          const active = tree.active
          if (active) job.active = active.bind(tree)
          job.attachSettled = true
          this.lateAttach(job)
        },
        (error: unknown) => {
          job.attachSettled = true
          throw error
        },
      )
    void job.attach.catch(() => undefined)
    return job
  }
  private async candidate(job: Job, bytes: Uint8Array, interrupted: Promise<never>): Promise<RuntimeArtifact> {
    const wait = async <T>(value: Promise<T>): Promise<T> => await Promise.race([value, interrupted])
    await wait(job.attach)
    job.lifetime.signal.throwIfAborted()
    job.phase = 'building'
    if (job.child.stdin.write(bytes) !== bytes.byteLength)
      throw new HbarError('RUNTIME_BUILD_FAILED', 'Local build request was not fully dispatched')
    await wait(Promise.resolve(job.child.stdin.flush()))
    await wait(Promise.resolve(job.child.stdin.end()))
    const [exitCode, output, errors] = await wait(Promise.all([job.child.exited, job.stdout, job.stderr]))
    job.exitCode = exitCode
    let raw: unknown
    try {
      raw = JSON.parse(output)
    } catch {
      throw new HbarError(
        exitCode === 0 ? 'RUNTIME_BUILD_INVALID' : 'RUNTIME_BUILD_FAILED',
        'Local builder returned an invalid result',
      )
    }
    const result = buildProcessResultSchema.safeParse(raw)
    if (!result.success) throw new HbarError('RUNTIME_BUILD_INVALID', 'Local builder returned an invalid descriptor')
    if (!result.data.ok) throw new HbarError(result.data.reasonCode, 'Local candidate build failed')
    if (exitCode !== 0 || errors !== '')
      throw new HbarError('RUNTIME_BUILD_FAILED', 'Local builder exited with an error')
    return result.data.artifact
  }
  async build(store: RuntimeArtifactStore, unit: RuntimeBuildUnit, signal: AbortSignal): Promise<RuntimeArtifact> {
    signal.throwIfAborted()
    if (this.closed) throw new HbarError('RUNTIME_CANCELLED', 'Runtime compiler owner is closed')
    if (this.jobs.size >= 2)
      throw new HbarError('RUNTIME_BUILD_LIMIT', 'Runtime compiler ownership capacity is exhausted')
    const parsed = buildProcessRequestSchema.safeParse({ root: store.root, sourceRoot: store.sourceRoot, unit })
    if (!parsed.success) throw new HbarError('RUNTIME_BUILD_INVALID', 'Local build request is invalid')
    const bytes = new TextEncoder().encode(JSON.stringify(parsed.data))
    if (bytes.byteLength > BUILD_REQUEST_MAX_BYTES)
      throw new HbarError('RUNTIME_BUILD_INVALID', 'Local build request exceeded transport capacity')
    const job = this.start(store, unit)
    const interrupted = Promise.withResolvers<never>()
    const interrupt = (): void => {
      interrupted.reject(job.lifetime.signal.reason)
    }
    const aborted = (): void => {
      job.lifetime.abort(new HbarError('RUNTIME_CANCELLED', 'Runtime build was cancelled'))
    }
    void interrupted.promise.catch(() => undefined)
    job.lifetime.signal.addEventListener('abort', interrupt, { once: true })
    signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) aborted()
    const timer = setTimeout(
      () => job.lifetime.abort(new HbarError('RUNTIME_BUILD_TIMEOUT', 'Runtime build exceeded its deadline')),
      RUNTIME_LIMITS.startupMs,
    )
    try {
      let artifact: RuntimeArtifact | undefined
      let primary: { error: unknown } | undefined
      try {
        artifact = await this.candidate(job, bytes, interrupted.promise)
      } catch (error) {
        primary = { error }
      }
      clearTimeout(timer)
      const errors = await this.clean(
        job,
        Date.now() + RUNTIME_LIMITS.shutdownMs,
        primary !== undefined || job.lifetime.signal.aborted,
      )
      if (primary || errors.length || this.jobs.has(job.id)) {
        const domain = runtimeDomainError(primary?.error)
        throw new HbarError(
          domain?.code ?? 'RUNTIME_BUILD_EXIT_TIMEOUT',
          domain?.message ?? 'Builder physical completion is unconfirmed',
          {
            cause: new AggregateError(primary ? [primary.error, ...errors] : errors, 'Local build or cleanup failed'),
          },
        )
      }
      signal.throwIfAborted()
      job.lifetime.signal.throwIfAborted()
      if (this.closed || !artifact) throw new HbarError('RUNTIME_CANCELLED', 'Runtime build was cancelled')
      return await store.acceptBuild(artifact)
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', aborted)
      job.lifetime.signal.removeEventListener('abort', interrupt)
    }
  }
  /** Cancels and cleans existing identities only; compilation and acceptance are never replayed. */
  async reconcile(): Promise<RuntimeBuildProcessSnapshot> {
    const end = Date.now() + RUNTIME_LIMITS.shutdownMs
    const pending = [...this.jobs.values()]
    for (const job of pending)
      job.lifetime.abort(new HbarError('RUNTIME_CANCELLED', 'Runtime compiler cleanup was requested'))
    const errors = (await Promise.all(pending.map((job) => this.clean(job, end, true)))).flat()
    if (this.jobs.size) throw exitUnknown('Runtime compiler ownership remains unresolved', new AggregateError(errors))
    return this.snapshot()
  }
  async close(): Promise<RuntimeBuildProcessSnapshot> {
    this.closed = true
    return await this.reconcile()
  }
}
