import { relative } from 'node:path'
import { HbarError } from '@hbar/contracts'
import type {
  ParsedWorkspaceFindInput,
  ParsedWorkspaceSearchInput,
  WorkspaceFindResult,
  WorkspaceReadResult,
  WorkspaceSearchResult,
} from '@hbar/contracts/workspace-query'
import type { WorkspaceQueryProvider } from '@hbar/plugin-sdk'
import { NativeWorkspaceQuery } from './native-query'
import type {
  NativeCacheStats,
  NativeCommonRequest,
  NativeFindResponse,
  NativeReadRequest,
  NativeReadResponse,
  NativeSearchRequest,
  NativeSearchResponse,
} from './native-query'

const QUERY_TIMEOUT_MS = 30_000
const MAX_RUNNING_QUERIES = 2
const MAX_QUEUED_QUERIES = 32

interface RunnableJob {
  readonly id: string
  start(): Promise<void>
  failBeforeStart(error: Error): void
  cancel(): void
}

class BoundedQueryQueue {
  readonly #waiting: RunnableJob[] = []
  readonly #running = new Set<RunnableJob>()
  #disposed = false

  constructor(
    private readonly maxRunning: number,
    private readonly maxQueued: number,
  ) {}

  enqueue(job: RunnableJob): void {
    if (this.#disposed) throw new HbarError('QUERY_UNAVAILABLE', 'Workspace query service is closed')
    if (this.#running.size < this.maxRunning) {
      this.#launch(job)
      return
    }
    if (this.#waiting.length >= this.maxQueued) throw new HbarError('QUERY_BUSY', 'Workspace query queue is full')
    this.#waiting.push(job)
  }

  remove(job: RunnableJob): boolean {
    const index = this.#waiting.indexOf(job)
    if (index < 0) return false
    this.#waiting.splice(index, 1)
    return true
  }

  dispose(): void {
    this.#disposed = true
    for (const job of this.#waiting.splice(0)) {
      job.failBeforeStart(new HbarError('CANCELLED', 'Workspace query service closed'))
    }
    for (const job of this.#running) job.cancel()
  }

  #launch(job: RunnableJob): void {
    this.#running.add(job)
    job.start().then(
      () => this.#release(job),
      () => this.#release(job),
    )
  }

  #release(job: RunnableJob): void {
    this.#running.delete(job)
    const next = this.#waiting.shift()
    if (next) this.#launch(next)
  }
}

class SharedQuery<Result> implements RunnableJob {
  readonly id = crypto.randomUUID()
  readonly promise: Promise<Result>
  readonly #timeout: ReturnType<typeof setTimeout>
  #resolve!: (value: Result) => void
  #reject!: (error: unknown) => void
  #state: 'queued' | 'running' | 'settled' = 'queued'
  #subscribers = 0
  #timedOut = false

  constructor(
    private readonly queue: BoundedQueryQueue,
    private readonly operation: (id: string) => Promise<Result>,
    private readonly cancelNative: (id: string) => void,
    timeoutMs: number,
    onSettled: () => void,
  ) {
    this.promise = new Promise<Result>((resolve, reject) => {
      this.#resolve = resolve
      this.#reject = reject
    })
    this.promise.then(onSettled, onSettled)
    this.#timeout = setTimeout(() => {
      const error = new HbarError('TIMEOUT', 'Workspace query exceeded 30 seconds')
      if (this.#state === 'queued') {
        this.queue.remove(this)
        this.failBeforeStart(error)
      } else if (this.#state === 'running') {
        this.#timedOut = true
        this.cancelNative(this.id)
      }
    }, timeoutMs)
  }

  subscribe(signal: AbortSignal): Promise<Result> {
    signal.throwIfAborted()
    this.#subscribers += 1
    return new Promise<Result>((resolve, reject) => {
      let settled = false
      const finish = () => {
        if (settled) return false
        settled = true
        signal.removeEventListener('abort', onAbort)
        this.#subscribers -= 1
        return true
      }
      const onAbort = () => {
        if (!finish()) return
        reject(new HbarError('CANCELLED', 'Workspace query was cancelled'))
        if (this.#subscribers === 0) this.#cancelUnobserved()
      }
      signal.addEventListener('abort', onAbort, { once: true })
      this.promise.then(
        (value) => {
          if (finish()) resolve(value)
        },
        (error: unknown) => {
          if (finish()) reject(error)
        },
      )
    })
  }

  async start(): Promise<void> {
    if (this.#state !== 'queued') return
    this.#state = 'running'
    try {
      this.#resolve(await this.operation(this.id))
    } catch (error) {
      this.#reject(this.#timedOut ? new HbarError('TIMEOUT', 'Workspace query exceeded 30 seconds') : queryError(error))
    } finally {
      this.#settle()
    }
  }

  failBeforeStart(error: Error): void {
    if (this.#state !== 'queued') return
    this.#reject(error)
    this.#settle()
  }

  cancel(): void {
    if (this.#state === 'queued') this.failBeforeStart(new HbarError('CANCELLED', 'Workspace query was cancelled'))
    else if (this.#state === 'running') this.cancelNative(this.id)
  }

  #cancelUnobserved(): void {
    if (this.#state === 'queued' && this.queue.remove(this))
      this.failBeforeStart(new HbarError('CANCELLED', 'Workspace query was cancelled'))
    else if (this.#state === 'running') this.cancelNative(this.id)
  }

  #settle(): void {
    if (this.#state === 'settled') return
    this.#state = 'settled'
    clearTimeout(this.#timeout)
  }
}

function queryError(error: unknown): HbarError {
  if (error instanceof HbarError) return error
  const message = error instanceof Error ? error.message : String(error)
  if (/cancelled/i.test(message)) return new HbarError('CANCELLED', 'Workspace query was cancelled')
  if (/outside the workspace|runtime data is protected|accessible workspace/i.test(message))
    return new HbarError('PATH_DENIED', message)
  if (/invalid|must |limited to|at most|requires /i.test(message)) return new HbarError('INVALID_INPUT', message)
  return new HbarError('QUERY_FAILED', message)
}

type ResolveWorkspacePath = (workspace: string, path: string) => Promise<string>
type ResolveBlockedPaths = (canonicalWorkspace: string) => Promise<string[]>

export interface NativeWorkspaceQueryAdapter {
  search(request: NativeSearchRequest, cancelId: string): Promise<NativeSearchResponse>
  find(request: NativeCommonRequest, cancelId: string): Promise<NativeFindResponse>
  read(request: NativeReadRequest, cancelId: string): Promise<NativeReadResponse>
  cancel(cancelId: string): boolean
  invalidate(absolutePath: string): void
  clear(): void
  cacheStats(): NativeCacheStats
}

export interface WorkspaceQueryRuntimeOptions {
  maxCacheBytes?: number
  timeoutMs?: number
  maxRunning?: number
  maxQueued?: number
  native?: NativeWorkspaceQueryAdapter
}

export class WorkspaceQueryRuntime implements WorkspaceQueryProvider {
  readonly #native: NativeWorkspaceQueryAdapter
  readonly #queue: BoundedQueryQueue
  readonly #timeoutMs: number
  readonly #searches = new Map<string, SharedQuery<WorkspaceSearchResult>>()
  readonly #finds = new Map<string, SharedQuery<WorkspaceFindResult>>()
  readonly #reads = new Map<string, SharedQuery<WorkspaceReadResult>>()

  constructor(
    blocked: string[],
    private readonly resolvePath: ResolveWorkspacePath,
    options: WorkspaceQueryRuntimeOptions = {},
    private readonly resolveBlockedPaths: ResolveBlockedPaths = async () => blocked,
    private readonly resolveInvalidationPath: ResolveWorkspacePath = resolvePath,
  ) {
    this.#native = options.native ?? new NativeWorkspaceQuery(options.maxCacheBytes ?? 64 * 1024 * 1024)
    this.#queue = new BoundedQueryQueue(
      options.maxRunning ?? MAX_RUNNING_QUERIES,
      options.maxQueued ?? MAX_QUEUED_QUERIES,
    )
    this.#timeoutMs = options.timeoutMs ?? QUERY_TIMEOUT_MS
  }

  async search(
    workspace: string,
    input: ParsedWorkspaceSearchInput,
    signal: AbortSignal,
  ): Promise<WorkspaceSearchResult> {
    const { root, path } = await this.#scope(workspace, input.path)
    const request = { ...input, workspace: root, path, blocked: await this.resolveBlockedPaths(root) }
    const key = JSON.stringify(request)
    return this.#shared(this.#searches, key, signal, (id) => this.#native.search(request, id))
  }

  async find(workspace: string, input: ParsedWorkspaceFindInput, signal: AbortSignal): Promise<WorkspaceFindResult> {
    const { root, path } = await this.#scope(workspace, input.path)
    const request = { ...input, workspace: root, path, blocked: await this.resolveBlockedPaths(root) }
    const key = JSON.stringify(request)
    return this.#shared(this.#finds, key, signal, (id) => this.#native.find(request, id))
  }

  async readRange(
    workspace: string,
    path: string,
    startLine: number,
    lineCount: number,
    signal: AbortSignal,
  ): Promise<WorkspaceReadResult> {
    const scope = await this.#scope(workspace, path)
    const request = {
      workspace: scope.root,
      path: scope.path,
      blocked: await this.resolveBlockedPaths(scope.root),
      startLine,
      lineCount,
    }
    const key = JSON.stringify(request)
    return this.#shared(this.#reads, key, signal, (id) => this.#native.read(request, id))
  }

  async invalidate(workspace: string, path: string): Promise<void> {
    this.#native.invalidate(await this.resolveInvalidationPath(workspace, path))
  }

  dispose(): void {
    this.#queue.dispose()
    this.#native.clear()
    this.#searches.clear()
    this.#finds.clear()
    this.#reads.clear()
  }

  cacheStats(): NativeCacheStats {
    return this.#native.cacheStats()
  }

  async #scope(workspace: string, requested: string): Promise<{ root: string; path: string }> {
    const [root, target] = await Promise.all([this.resolvePath(workspace, '.'), this.resolvePath(workspace, requested)])
    return { root, path: relative(root, target) || '.' }
  }

  #shared<Result>(
    jobs: Map<string, SharedQuery<Result>>,
    key: string,
    signal: AbortSignal,
    operation: (id: string) => Promise<Result>,
  ): Promise<Result> {
    let job = jobs.get(key)
    if (!job) {
      job = new SharedQuery(
        this.#queue,
        operation,
        (id) => {
          this.#native.cancel(id)
        },
        this.#timeoutMs,
        () => {
          if (jobs.get(key) === job) jobs.delete(key)
        },
      )
      jobs.set(key, job)
      try {
        this.#queue.enqueue(job)
      } catch (error) {
        jobs.delete(key)
        job.failBeforeStart(queryError(error))
      }
    }
    return job.subscribe(signal)
  }
}
