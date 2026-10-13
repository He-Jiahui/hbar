import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { diagnosticEventSchema, sessionEventSchema, type DiagnosticEvent, type SessionEvent } from '@hbar/contracts'
import {
  StableStoragePort,
  Storage,
  type ManagedStorageWriter,
  type StorageMethods,
  type StoragePort,
} from '@hbar/storage'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import { z } from 'zod'

const fixturePrefix = 'hbar-sqlite-lock-contention-'
const lockMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('lock-acquired'), atUtc: z.iso.datetime() }),
  z.strictObject({ type: z.literal('lock-released'), atUtc: z.iso.datetime() }),
  z.strictObject({ type: z.literal('lock-failed'), code: z.string().min(1).max(64) }),
])
type LockMessage = z.infer<typeof lockMessageSchema>
type SuccessfulLockMessage = Extract<LockMessage, { type: 'lock-acquired' | 'lock-released' }>

interface LockWorker {
  readonly worker: Worker
  readonly acquiredAtUtc: string
  releasedAtUtc: string | undefined
  release(): Promise<void>
  close(): Promise<void>
}

interface ClosableResource {
  close(): Promise<void>
}

class FixtureResources {
  private readonly resources: Array<{ readonly label: string; readonly resource: ClosableResource }> = []
  private readonly closed = new WeakSet<object>()

  track<T extends ClosableResource>(label: string, resource: T): T {
    this.resources.push({ label, resource })
    return resource
  }

  async close(resource: ClosableResource): Promise<void> {
    if (this.closed.has(resource)) return
    await resource.close()
    this.closed.add(resource)
  }

  async closeAll(): Promise<Array<{ readonly label: string; readonly errorCode: string }>> {
    const failures: Array<{ label: string; errorCode: string }> = []
    for (const { label, resource } of [...this.resources].reverse()) {
      try {
        await this.close(resource)
      } catch (error: unknown) {
        failures.push({ label, errorCode: errorCode(error) })
      }
    }
    return failures
  }
}

interface OperationResult {
  readonly kind: 'write' | 'snapshot' | 'events'
  readonly requestId?: string
  readonly outcome: 'success' | 'failure'
  readonly elapsedMs: number
  readonly runId?: string
  readonly errorCode?: string
}

interface PhaseReport {
  readonly backend: 'storage' | 'stable-port'
  readonly holdMs: number
  readonly lockAcquiredAtUtc: string
  readonly lockReleasedAtUtc: string | undefined
  readonly busyTimeoutMs: 5_000
  readonly requestTimeoutMs: number
  readonly writeCount: number
  readonly mixedReadCount: number
  readonly operationResults: OperationResult[]
  readonly diagnostics: DiagnosticEvent[]
  readonly pendingPeak: number
  readonly stablePortPeaks: {
    readonly inFlight: number
    readonly queued: number
    readonly bufferedBytes: number
  } | null
  readonly approximateQueueWaitMs: number[]
  readonly workerExecutionMs: number[]
  readonly roundTripMs: number[]
  readonly lockHeldApproxMs: number
  readonly latencySummary: {
    readonly writes: ReturnType<typeof summarize>
    readonly mixedReads: ReturnType<typeof summarize>
    readonly dispatchToWorkerStart: ReturnType<typeof summarize>
    readonly workerExecution: ReturnType<typeof summarize>
    readonly storageRoundTrip: ReturnType<typeof summarize>
  }
  readonly walBytesBeforeClose: number
  readonly rssBytesBefore: number
  readonly rssBytesAfter: number
  readonly recoveryMs: number
  readonly persistedRuns: Array<{ requestId: string; runId: string | null; queuedEventCount: number }>
  readonly retryResults: Array<{ requestId: string; runId: string; queuedEventCount: number }>
  readonly quickCheck: string
  readonly foreignKeyViolations: number
  readonly pragmas: {
    journalMode: string | null
    synchronous: number | null
    busyTimeoutMs: number | null
    foreignKeys: number | null
  }
  readonly codeCounts: Record<string, number>
}

function errorCode(value: unknown): string {
  if (value && typeof value === 'object' && 'code' in value && typeof value.code === 'string') {
    const code = value.code
      .toUpperCase()
      .replace(/[^A-Z0-9_.-]/g, '_')
      .slice(0, 64)
    if (/^[A-Z][A-Z0-9_.-]*$/.test(code)) return code
  }
  return 'UNCLASSIFIED_ERROR'
}

async function makeOwnedRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), fixturePrefix))
  const resolved = await realpath(root)
  const parent = await realpath(dirname(resolved))
  const expectedParent = await realpath(tmpdir())
  if (parent !== expectedParent || !resolved.startsWith(`${join(expectedParent, fixturePrefix)}`))
    throw new Error('Lock fixture temp root failed its ownership fence')
  return resolved
}

async function removeOwnedRoot(root: string): Promise<void> {
  const resolved = await realpath(root)
  const parent = await realpath(dirname(resolved))
  const expectedParent = await realpath(tmpdir())
  if (parent !== expectedParent || !resolved.startsWith(`${join(expectedParent, fixturePrefix)}`))
    throw new Error('Refusing to remove a non-owned SQLite lock fixture root')
  await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

async function cleanupOwnedRootOrRecord(root: string, reportRoot: string, label: string): Promise<void> {
  try {
    await removeOwnedRoot(root)
  } catch (error: unknown) {
    const failurePath = join(reportRoot, `cleanup-failed-${label}-${randomUUID()}.json`)
    await writeFile(
      failurePath,
      `${JSON.stringify({ root, errorCode: errorCode(error), cleanup: 'owned-temp-root-removal-failed' }, null, 2)}\n`,
      { flag: 'wx' },
    )
    throw error
  }
}

function waitForLockMessage(
  worker: Worker,
  expected: SuccessfulLockMessage['type'],
  timeoutMs = 3_000,
): Promise<SuccessfulLockMessage> {
  return new Promise<SuccessfulLockMessage>((resolveMessage, rejectMessage) => {
    const timer = setTimeout(() => finish(new Error('SQLite lock fixture message deadline')), timeoutMs)
    const finish = (error?: Error, message?: SuccessfulLockMessage) => {
      clearTimeout(timer)
      worker.off('message', onMessage)
      worker.off('error', onError)
      worker.off('exit', onExit)
      if (error) rejectMessage(error)
      else if (message) resolveMessage(message)
      else rejectMessage(new Error('SQLite lock fixture returned no message'))
    }
    const onMessage = (raw: unknown) => {
      const parsed = lockMessageSchema.safeParse(raw)
      if (!parsed.success) return finish(new Error('SQLite lock fixture message was invalid'))
      if (parsed.data.type === 'lock-failed')
        return finish(new Error(`SQLite lock fixture failed: ${parsed.data.code}`))
      if (parsed.data.type === expected) return finish(undefined, parsed.data)
    }
    const onError = () => finish(new Error('SQLite lock fixture Worker errored'))
    const onExit = (code: number) => {
      finish(new Error(`SQLite lock fixture Worker exited ${code} before ${expected}`))
    }
    worker.on('message', onMessage)
    worker.once('error', onError)
    worker.once('exit', onExit)
  })
}

async function startLock(path: string): Promise<LockWorker> {
  const worker = new Worker(new URL('./fixtures/sqlite-write-lock-worker.ts', import.meta.url), {
    workerData: { path },
  })
  let workerError: Error | undefined
  worker.on('error', (error: Error) => {
    workerError = error
  })
  const exitPromise = new Promise<number>((resolveExit) => worker.once('exit', resolveExit))
  let acquired: LockMessage
  try {
    acquired = await waitForLockMessage(worker, 'lock-acquired')
  } catch (primaryError: unknown) {
    let cleanupErrorCode: string | undefined
    try {
      await Promise.race([
        worker.terminate(),
        Bun.sleep(3_000).then(() => {
          throw new Error('SQLite lock fixture termination deadline')
        }),
      ])
      await Promise.race([
        exitPromise,
        Bun.sleep(3_000).then(() => {
          throw new Error('SQLite lock fixture exit deadline after terminate')
        }),
      ])
    } catch (error: unknown) {
      cleanupErrorCode = errorCode(error)
    }
    if (cleanupErrorCode)
      throw new AggregateError([primaryError, new Error(cleanupErrorCode)], 'Lock fixture start and cleanup failed', {
        cause: primaryError,
      })
    throw primaryError
  }
  let released = false
  let releasedAtUtc: string | undefined
  const release = async () => {
    if (released) return
    released = true
    const acknowledgement = waitForLockMessage(worker, 'lock-released')
    worker.postMessage({ type: 'release' })
    const result = await acknowledgement
    releasedAtUtc = result.atUtc
  }
  const close = async () => {
    if (!released) await release()
    const code = await Promise.race([
      exitPromise,
      Bun.sleep(3_000).then(() => {
        throw new Error('SQLite lock Worker exit deadline')
      }),
    ])
    if (workerError) throw workerError
    if (code !== 0) throw new Error(`SQLite lock Worker exited ${code}`)
  }
  const lock: LockWorker = {
    worker,
    acquiredAtUtc: acquired.atUtc,
    get releasedAtUtc() {
      return releasedAtUtc
    },
    release,
    close,
  }
  return lock
}

function makeStorage(database: string, events: DiagnosticEvent[], requestTimeoutMs = 15_000): Storage {
  return new Storage(database, undefined, {
    requestTimeoutMs,
    closeTimeoutMs: 5_000,
    diagnostics: { emit: (event) => events.push(diagnosticEventSchema.parse(event)) },
    diagnosticsEnabled: true,
    diagnosticsFullCoverage: true,
    instanceId: `lock-${randomUUID()}`,
  })
}

function makeStablePort(storage: Storage): StableStoragePort {
  const writer: ManagedStorageWriter = {
    owner: { unitId: 'storage.lock-contention.fixture', generation: 1, incarnation: randomUUID() },
    call<K extends keyof StorageMethods>(
      method: K,
      args: Parameters<StorageMethods[K]>,
      authority?: ExecutionOwnership,
    ): Promise<ReturnType<StorageMethods[K]>> {
      return authority === undefined ? storage.call(method, ...args) : storage.callOwned(authority, method, ...args)
    },
    retire: () => storage.close(),
  }
  const stable = new StableStoragePort(15_000)
  stable.install(writer)
  return stable
}

function percentile(values: readonly number[], ratio: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(ratio * sorted.length) - 1)] ?? 0
}

function summarize(values: readonly number[]) {
  return {
    count: values.length,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    maxMs: values.length ? Math.max(...values) : 0,
  }
}

async function runLockPhase(
  backend: 'storage' | 'stable-port',
  holdMs: number,
  reportRoot: string,
): Promise<PhaseReport> {
  const root = await makeOwnedRoot()
  const database = join(root, 'state.sqlite')
  const events: DiagnosticEvent[] = []
  const resources = new FixtureResources()
  let primaryError: unknown
  let storage = resources.track('storage-initial', makeStorage(database, events))
  let frontend: StoragePort = storage
  let stablePort: StableStoragePort | undefined
  const stablePeaks = { inFlight: 0, queued: 0, bufferedBytes: 0 }
  const sampleStable = () => {
    if (!stablePort) return
    const state = stablePort.snapshot()
    stablePeaks.inFlight = Math.max(stablePeaks.inFlight, state.inFlight)
    stablePeaks.queued = Math.max(stablePeaks.queued, state.queued)
    stablePeaks.bufferedBytes = Math.max(stablePeaks.bufferedBytes, state.bufferedBytes)
  }
  let lock: LockWorker | undefined
  let shouldKeepRoot: boolean
  let cleanupFailures: Array<{ readonly label: string; readonly errorCode: string }>
  let result: PhaseReport | undefined
  const rssBytesBefore = process.memoryUsage.rss()
  try {
    await storage.call('ready')
    const workspace = await storage.call(
      'createWorkspace',
      join(root, 'workspace'),
      `Lock fixture ${backend} ${holdMs}`,
    )
    const session = await storage.call('createSession', workspace.id)
    const configured = events.find((event) => event.event === 'sqlite.configured')
    if (
      !configured ||
      configured.journalMode !== 'wal' ||
      configured.synchronous !== 2 ||
      configured.busyTimeoutMs !== 5_000 ||
      configured.foreignKeys !== true
    )
      throw new Error('Storage Worker durability PRAGMAs did not match the fixed baseline')
    events.splice(0, events.length)
    if (backend === 'stable-port') {
      stablePort = makeStablePort(storage)
      frontend = stablePort
    }
    lock = resources.track('write-lock', await startLock(database))
    const lockAcquiredAtUtc = lock.acquiredAtUtc
    const lockStartedAt = performance.now()
    const writes = 30
    const readTargets = 10
    const operations: Promise<OperationResult>[] = []
    const requestIds = Array.from({ length: writes }, (_, index) => `${backend}-${holdMs}-${index}-${randomUUID()}`)
    for (let index = 0; index < writes; index++) {
      const requestId = requestIds[index]
      if (!requestId) throw new Error('Missing generated request ID')
      const startedAt = performance.now()
      const write = frontend.call(
        'enqueue',
        session.id,
        requestId,
        { text: `synthetic lock workload ${index}`, images: [] },
        'fixture/model',
      )
      sampleStable()
      operations.push(
        write
          .then((run) => ({
            kind: 'write' as const,
            requestId,
            outcome: 'success' as const,
            elapsedMs: performance.now() - startedAt,
            runId: run.id,
          }))
          .catch((error: unknown) => ({
            kind: 'write' as const,
            requestId,
            outcome: 'failure' as const,
            elapsedMs: performance.now() - startedAt,
            errorCode: errorCode(error),
          })),
      )
      if (index < readTargets) {
        const readStartedAt = performance.now()
        const read =
          index % 2 === 0
            ? frontend.call('snapshot', session.id, undefined, 20).then((page) => page.messages.length)
            : frontend.call('events', session.id, 0, 50).then((page) => page.length)
        sampleStable()
        operations.push(
          read
            .then(() => ({
              kind: index % 2 === 0 ? ('snapshot' as const) : ('events' as const),
              outcome: 'success' as const,
              elapsedMs: performance.now() - readStartedAt,
            }))
            .catch((error: unknown) => ({
              kind: index % 2 === 0 ? ('snapshot' as const) : ('events' as const),
              outcome: 'failure' as const,
              elapsedMs: performance.now() - readStartedAt,
              errorCode: errorCode(error),
            })),
        )
      }
    }
    let lockReleasedElapsedMs: number | undefined
    const releaseTimer = Bun.sleep(holdMs).then(async () => {
      await lock?.release()
      lockReleasedElapsedMs = performance.now() - lockStartedAt
    })
    const operationResults = await Promise.race([
      Promise.all(operations),
      Bun.sleep(25_000).then(() => {
        throw new Error(`Lock phase exceeded its 25s owned deadline (${backend}/${holdMs})`)
      }),
    ])
    sampleStable()
    await releaseTimer
    const lockReleasedAtUtc = lock.releasedAtUtc
    await lock.close()
    lock = undefined
    const lockElapsedMs = lockReleasedElapsedMs ?? performance.now() - lockStartedAt
    const maxPendingEvents = events.filter((event) => event.event === 'storage.request_dispatched')
    const pendingPeak = maxPendingEvents.reduce((maximum, event) => Math.max(maximum, event.pending ?? 0), 0)
    const dispatch = new Map<number, number>()
    const started = new Map<number, number>()
    const execution: number[] = []
    const roundTrip: number[] = []
    const codes: Record<string, number> = {}
    for (const event of events) {
      const id = event.storageRequestId
      if (id === undefined) continue
      if (event.event === 'storage.request_dispatched' && event.monotonicMs !== undefined)
        dispatch.set(id, event.monotonicMs)
      if (event.event === 'sqlite.request_started' && event.monotonicMs !== undefined)
        started.set(id, event.monotonicMs)
      if (event.event === 'sqlite.request_completed' || event.event === 'sqlite.request_failed') {
        if (event.executionMs !== undefined) execution.push(event.executionMs)
        if (event.errorCode) codes[event.errorCode] = (codes[event.errorCode] ?? 0) + 1
      }
      if (event.event === 'storage.request_completed' || event.event === 'storage.request_failed') {
        if (event.durationMs !== undefined) roundTrip.push(event.durationMs)
        if (event.errorCode) codes[event.errorCode] = (codes[event.errorCode] ?? 0) + 1
      }
    }
    const queueWait = [...dispatch].flatMap(([id, time]) => {
      const begin = started.get(id)
      return begin === undefined ? [] : [Math.max(0, begin - time)]
    })
    const walBytesBeforeClose = await stat(`${database}-wal`)
      .then((item) => item.size)
      .catch(() => 0)
    const persistedRuns: PhaseReport['persistedRuns'] = []
    const requestedRunIdByRequest = new Map(
      operationResults.flatMap((result) =>
        result.kind === 'write' && result.runId ? [[result.requestId, result.runId] as const] : [],
      ),
    )
    await resources.close(storage)
    storage = resources.track('storage-recovery', makeStorage(database, events))
    const recoveryStartedAt = performance.now()
    await storage.call('ready')
    const recoveryMs = performance.now() - recoveryStartedAt
    const recoveredEvents = await storage.call('events', session.id, 0, 10_000)
    for (const requestId of requestIds) {
      const lookup = await storage.call('runByRequest', session.id, requestId)
      const runId = lookup?.run.id ?? null
      const queuedEventCount = runId
        ? recoveredEvents.filter((event) => event.type === 'run.queued' && event.runId === runId).length
        : 0
      if (runId && queuedEventCount !== 1)
        throw new Error('Recovered enqueue must have exactly one canonical queue event')
      persistedRuns.push({ requestId, runId, queuedEventCount })
      const acceptedId = requestedRunIdByRequest.get(requestId)
      if (acceptedId && acceptedId !== runId) throw new Error('Accepted enqueue readback did not match its receipt ID')
    }
    const failures = operationResults.filter((result) => result.outcome === 'failure')
    const retryResults: PhaseReport['retryResults'] = []
    for (const failure of failures) {
      if (failure.kind !== 'write' || !failure.requestId) continue
      const existing = await storage.call('runByRequest', session.id, failure.requestId)
      if (!existing) {
        const retried = await storage.call(
          'enqueue',
          session.id,
          failure.requestId,
          { text: 'explicit reconciled retry', images: [] },
          'fixture/model',
        )
        retryResults.push({ requestId: failure.requestId, runId: retried.id, queuedEventCount: 1 })
      } else {
        const count = (await storage.call('events', session.id, 0, 10_000)).filter(
          (event) => event.type === 'run.queued' && event.runId === existing.run.id,
        ).length
        if (count !== 1) throw new Error('Reconciled idempotency lookup found duplicate canonical queue events')
        retryResults.push({ requestId: failure.requestId, runId: existing.run.id, queuedEventCount: count })
      }
    }
    const finalEvents = await storage.call('events', session.id, 0, 10_000)
    for (const requestId of requestIds) {
      const run = await storage.call('runByRequest', session.id, requestId)
      if (!run) throw new Error('Explicit reconciliation did not produce a run for each original operation ID')
      const matching = finalEvents.filter((event) => event.type === 'run.queued' && event.runId === run.run.id)
      if (matching.length !== 1) throw new Error('Operation ID did not resolve to exactly one canonical queue event')
    }
    await resources.close(storage)
    storage = resources.track('storage-reopen-check', makeStorage(database, []))
    await storage.call('ready')
    await resources.close(storage)
    const databaseCheck = new Database(database, { readonly: true, strict: true })
    let quickCheck: string
    let foreignKeyViolations: number
    try {
      quickCheck = z
        .strictObject({ quick_check: z.literal('ok') })
        .parse(databaseCheck.query('PRAGMA quick_check(1)').get()).quick_check
      foreignKeyViolations = databaseCheck.query('PRAGMA foreign_key_check').all().length
    } finally {
      databaseCheck.close()
    }
    const pragmas: PhaseReport['pragmas'] = {
      journalMode: configured.journalMode ?? null,
      synchronous: configured.synchronous ?? null,
      busyTimeoutMs: configured.busyTimeoutMs ?? null,
      foreignKeys: configured.foreignKeys === true ? 1 : 0,
    }
    databaseCheck.close()
    const report: PhaseReport = {
      backend,
      holdMs,
      lockAcquiredAtUtc,
      lockReleasedAtUtc,
      busyTimeoutMs: 5_000,
      requestTimeoutMs: 15_000,
      writeCount: writes,
      mixedReadCount: readTargets,
      operationResults,
      diagnostics: events,
      pendingPeak,
      stablePortPeaks: stablePort ? stablePeaks : null,
      approximateQueueWaitMs: queueWait,
      workerExecutionMs: execution,
      roundTripMs: roundTrip,
      latencySummary: {
        writes: summarize(
          operationResults.filter((result) => result.kind === 'write').map((result) => result.elapsedMs),
        ),
        mixedReads: summarize(
          operationResults.filter((result) => result.kind !== 'write').map((result) => result.elapsedMs),
        ),
        dispatchToWorkerStart: summarize(queueWait),
        workerExecution: summarize(execution),
        storageRoundTrip: summarize(roundTrip),
      },
      lockHeldApproxMs: lockElapsedMs,
      walBytesBeforeClose,
      rssBytesBefore,
      rssBytesAfter: process.memoryUsage.rss(),
      recoveryMs,
      persistedRuns,
      retryResults,
      quickCheck,
      foreignKeyViolations,
      pragmas,
      codeCounts: codes,
    }
    const reportPath = join(reportRoot, `${backend}-${holdMs}-${randomUUID()}.json`)
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
    shouldKeepRoot = false
    result = report
  } catch (error) {
    primaryError = error
    shouldKeepRoot = true
    const failureReport = {
      backend,
      holdMs,
      root,
      errorCode: errorCode(error),
      events: events.map((event) => ({
        event: event.event,
        phase: event.phase,
        method: event.method,
        requestId: event.requestId,
        storageRequestId: event.storageRequestId,
        durationMs: event.durationMs,
        executionMs: event.executionMs,
        pending: event.pending,
        errorCode: event.errorCode,
        outcome: event.outcome,
      })),
    }
    const failurePath = join(reportRoot, `failed-${backend}-${holdMs}-${randomUUID()}.json`)
    await writeFile(failurePath, `${JSON.stringify(failureReport, null, 2)}\n`, { flag: 'wx' })
  } finally {
    cleanupFailures = await resources.closeAll()
    if (cleanupFailures.length) {
      shouldKeepRoot = true
      const cleanupPath = join(reportRoot, `cleanup-errors-${backend}-${holdMs}-${randomUUID()}.json`)
      await writeFile(
        cleanupPath,
        `${JSON.stringify({ root, cleanupFailures, cleanup: 'owned-resource-close-failed' }, null, 2)}\n`,
        { flag: 'wx' },
      )
    }
  }
  if (primaryError !== undefined && cleanupFailures.length)
    throw new AggregateError(
      [primaryError, ...cleanupFailures.map(({ label, errorCode: code }) => new Error(`${label}:${code}`))],
      'Lock phase and cleanup failed',
      { cause: primaryError },
    )
  if (primaryError !== undefined) throw primaryError
  if (cleanupFailures.length)
    throw new AggregateError(
      cleanupFailures.map(({ label, errorCode: code }) => new Error(`${label}:${code}`)),
      'Lock phase cleanup failed',
    )
  if (!shouldKeepRoot)
    await cleanupOwnedRootOrRecord(
      root,
      join(process.cwd(), 'artifacts', 'sqlite-lock-contention'),
      `${backend}-${holdMs}`,
    )
  if (!result) throw new Error('Lock phase finished without a result')
  return result
}

async function readCanonicalSessionEvents(root: string, sessionId: string): Promise<SessionEvent[]> {
  const matching: string[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && entry.name === `${sessionId}.jsonl`) matching.push(path)
    }
  }
  await visit(join(root, 'sessions'))
  const contents = await Promise.all(matching.map((path) => readFile(path, 'utf8')))
  return contents.flatMap((text) =>
    text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => sessionEventSchema.parse(JSON.parse(line))),
  )
}

test.serial(
  '30 concurrent writer calls and mixed reads remain bounded under independent SQLite write locks',
  async () => {
    const reportRoot = join(process.cwd(), 'artifacts', 'sqlite-lock-contention')
    await mkdir(reportRoot, { recursive: true })
    const reports: PhaseReport[] = []
    for (const backend of ['storage', 'stable-port'] as const) {
      for (const holdMs of [100, 1_000, 5_200] as const) {
        const report = await runLockPhase(backend, holdMs, reportRoot)
        reports.push(report)
        expect(report.writeCount).toBe(30)
        expect(report.mixedReadCount).toBe(10)
        expect(report.quickCheck).toBe('ok')
        expect(report.foreignKeyViolations).toBe(0)
        expect(report.pragmas).toMatchObject({ journalMode: 'wal', synchronous: 2, busyTimeoutMs: 5_000 })
        expect(report.persistedRuns).toHaveLength(30)
        expect(
          report.persistedRuns.every((item) =>
            item.runId === null ? item.queuedEventCount === 0 : item.queuedEventCount === 1,
          ),
        ).toBe(true)
        expect(report.pendingPeak).toBeLessThanOrEqual(40)
        expect(report.approximateQueueWaitMs.length).toBeGreaterThan(0)
        expect(report.operationResults.filter((result) => result.kind === 'write')).toHaveLength(30)
        expect(report.operationResults.filter((result) => result.kind !== 'write')).toHaveLength(10)
        expect(
          report.operationResults
            .filter((result) => result.kind !== 'write')
            .every((result) => result.outcome === 'success'),
        ).toBe(true)
        expect(
          report.operationResults
            .filter((result) => result.kind === 'write')
            .every((result) => result.outcome === 'success' || result.errorCode === 'STORAGE_ERROR'),
        ).toBe(true)
        if (report.operationResults.some((result) => result.kind === 'write' && result.outcome === 'failure'))
          expect(report.codeCounts.SQLITE_BUSY ?? 0).toBeGreaterThan(0)
        if (holdMs === 5_200) {
          expect(report.operationResults.some((result) => result.outcome === 'failure')).toBe(true)
          expect(report.codeCounts.SQLITE_BUSY ?? report.codeCounts.SQLITE_LOCKED ?? 0).toBeGreaterThan(0)
          expect(report.retryResults.length).toBeGreaterThan(0)
        }
      }
    }
    expect(reports).toHaveLength(6)
  },
  60_000,
)

test.serial(
  '30 append and commit calls wait for short locks without replay across Storage and StableStoragePort',
  async () => {
    const reportRoot = join(process.cwd(), 'artifacts', 'sqlite-lock-contention')
    await mkdir(reportRoot, { recursive: true })
    for (const backend of ['storage', 'stable-port'] as const) {
      for (const holdMs of [100, 1_000] as const) {
        const root = await makeOwnedRoot()
        const database = join(root, 'short-lock.sqlite')
        const diagnostics: DiagnosticEvent[] = []
        const resources = new FixtureResources()
        let primaryError: unknown
        const storage = resources.track('storage-primary', makeStorage(database, diagnostics))
        let port: StoragePort = storage
        let stablePort: StableStoragePort | undefined
        const stablePeaks = { inFlight: 0, queued: 0, bufferedBytes: 0 }
        const sampleStable = () => {
          if (!stablePort) return
          const state = stablePort.snapshot()
          stablePeaks.inFlight = Math.max(stablePeaks.inFlight, state.inFlight)
          stablePeaks.queued = Math.max(stablePeaks.queued, state.queued)
          stablePeaks.bufferedBytes = Math.max(stablePeaks.bufferedBytes, state.bufferedBytes)
        }
        let lock: LockWorker | undefined
        let preserveRoot = false
        let cleanupFailures: Array<{ readonly label: string; readonly errorCode: string }>
        try {
          await storage.call('ready')
          const workspace = await storage.call(
            'createWorkspace',
            join(root, 'workspace'),
            `Short lock ${backend} ${holdMs}`,
          )
          const session = await storage.call('createSession', workspace.id)
          diagnostics.splice(0, diagnostics.length)
          if (backend === 'stable-port') {
            stablePort = makeStablePort(storage)
            port = stablePort
          }
          lock = resources.track('write-lock', await startLock(database))
          const lockAcquiredAtUtc = lock.acquiredAtUtc
          const lockStartedAt = performance.now()
          let lockReleasedElapsedMs: number | undefined
          const release = Bun.sleep(holdMs).then(async () => {
            await lock?.release()
            lockReleasedElapsedMs = performance.now() - lockStartedAt
          })
          const operations = Array.from({ length: 30 }, (_, index) => {
            const marker = `${backend}-${holdMs}-operation-${index}-${randomUUID()}`
            const startedAt = performance.now()
            const operation =
              index % 2 === 0
                ? port
                    .call('append', session.id, 'run.shortLockAppendFixture', { marker })
                    .then((event) => ({ eventId: event.eventId, seq: event.seq }))
                : port
                    .call('commit', session.id, `synthetic-${marker}`, 'user', [{ type: 'text', text: marker }])
                    .then((result) => ({ eventId: result.event.eventId, seq: result.event.seq }))
            sampleStable()
            return operation.then(
              (result) => ({
                marker,
                kind: index % 2 === 0 ? ('append' as const) : ('commit' as const),
                outcome: 'success' as const,
                eventId: result.eventId,
                seq: result.seq,
                elapsedMs: performance.now() - startedAt,
              }),
              (error: unknown) => ({
                marker,
                kind: index % 2 === 0 ? ('append' as const) : ('commit' as const),
                outcome: 'failure' as const,
                errorCode: errorCode(error),
                elapsedMs: performance.now() - startedAt,
              }),
            )
          })
          const results = await Promise.race([
            Promise.all(operations),
            Bun.sleep(20_000).then(() => {
              throw new Error(`Short lock writer batch exceeded its deadline (${backend}/${holdMs})`)
            }),
          ])
          sampleStable()
          await release
          const lockReleasedAtUtc = lock.releasedAtUtc
          await lock.close()
          lock = undefined
          const pendingPeak = diagnostics
            .filter((event) => event.event === 'storage.request_dispatched')
            .reduce((peak, event) => Math.max(peak, event.pending ?? 0), 0)
          const walBytesBeforeClose = await stat(`${database}-wal`)
            .then((item) => item.size)
            .catch(() => 0)
          const logEvents = await readCanonicalSessionEvents(root, session.id)
          const projectionEvents = await storage.call('events', session.id, 0, 10_000)
          const snapshot = await storage.call('snapshot', session.id, undefined, 100)
          const failedMarkers = results.filter((result) => result.outcome === 'failure').map((result) => result.marker)
          const matchingLogEvents = logEvents.filter((event) =>
            failedMarkers.some((marker) => JSON.stringify(event.data).includes(marker)),
          )
          await resources.close(storage)
          const reopenedDiagnostics: DiagnosticEvent[] = []
          const reopened = resources.track('storage-reopened', makeStorage(database, reopenedDiagnostics))
          const recoveryStartedAt = performance.now()
          await reopened.call('ready')
          const recoveryMs = performance.now() - recoveryStartedAt
          const reopenedEvents = await reopened.call('events', session.id, 0, 10_000)
          const reopenedSnapshot = await reopened.call('snapshot', session.id, undefined, 100)
          await resources.close(reopened)
          const canonicalEventsAfterReopen = await readCanonicalSessionEvents(root, session.id)
          const integrityDb = new Database(database, { readonly: true, strict: true })
          let quickCheck: string
          let foreignKeyViolations: number
          try {
            quickCheck = z
              .strictObject({ quick_check: z.literal('ok') })
              .parse(integrityDb.query('PRAGMA quick_check(1)').get()).quick_check
            foreignKeyViolations = integrityDb.query('PRAGMA foreign_key_check').all().length
          } finally {
            integrityDb.close()
          }
          const codeCounts: Record<string, number> = {}
          for (const event of diagnostics)
            if (event.errorCode) codeCounts[event.errorCode] = (codeCounts[event.errorCode] ?? 0) + 1
          const report = {
            backend,
            holdMs,
            lockAcquiredAtUtc,
            lockReleasedAtUtc,
            lockHeldApproxMs: lockReleasedElapsedMs ?? null,
            writerCount: results.length,
            outcomes: results,
            latency: summarize(results.map((result) => result.elapsedMs)),
            pendingPeak,
            stablePortPeaks: stablePort ? stablePeaks : null,
            walBytesBeforeClose,
            workerExecution: summarize(
              diagnostics.flatMap((event) =>
                event.event === 'sqlite.request_completed' && event.executionMs !== undefined
                  ? [event.executionMs]
                  : [],
              ),
            ),
            storageRoundTrip: summarize(
              diagnostics.flatMap((event) =>
                event.event === 'storage.request_completed' && event.durationMs !== undefined ? [event.durationMs] : [],
              ),
            ),
            codeCounts,
            liveCanonicalEventCount: logEvents.length,
            liveProjectionEventCount: projectionEvents.length,
            liveMessageCount: snapshot.messages.length,
            failedMarkerLogLeakCount: matchingLogEvents.length,
            recoveryMs,
            reopenedCanonicalEventCount: canonicalEventsAfterReopen.length,
            reopenedProjectionEventCount: reopenedEvents.length,
            reopenedMessageCount: reopenedSnapshot.messages.length,
            uniqueCanonicalSequences:
              new Set(canonicalEventsAfterReopen.map((event) => event.seq)).size === canonicalEventsAfterReopen.length,
            quickCheck,
            foreignKeyViolations,
            rssBytes: process.memoryUsage.rss(),
          }
          await writeFile(
            join(reportRoot, `short-event-writers-${backend}-${holdMs}-${randomUUID()}.json`),
            `${JSON.stringify(report, null, 2)}\n`,
            { flag: 'wx' },
          )
          expect(results).toHaveLength(30)
          expect(results.filter((result) => result.kind === 'append')).toHaveLength(15)
          expect(results.filter((result) => result.kind === 'commit')).toHaveLength(15)
          expect(results.every((result) => result.outcome === 'success')).toBe(true)
          const successfulResults = results.filter(
            (result): result is Extract<(typeof results)[number], { outcome: 'success' }> =>
              result.outcome === 'success',
          )
          expect(new Set(successfulResults.map((result) => result.eventId)).size).toBe(30)
          expect(new Set(successfulResults.map((result) => result.seq)).size).toBe(30)
          expect(pendingPeak).toBeLessThanOrEqual(30)
          if (stablePort) {
            expect(stablePeaks.inFlight).toBeLessThanOrEqual(30)
            expect(stablePeaks.queued).toBe(0)
          }
          expect(matchingLogEvents).toHaveLength(0)
          expect(logEvents).toHaveLength(31)
          expect(projectionEvents).toHaveLength(31)
          expect(snapshot.messages).toHaveLength(15)
          expect(reopenedEvents).toHaveLength(31)
          expect(reopenedSnapshot.messages).toHaveLength(15)
          expect(report.uniqueCanonicalSequences).toBe(true)
          expect(quickCheck).toBe('ok')
          expect(foreignKeyViolations).toBe(0)
        } catch (error) {
          primaryError = error
          preserveRoot = true
          const failurePath = join(reportRoot, `failed-short-event-writers-${backend}-${holdMs}-${randomUUID()}.json`)
          await writeFile(
            failurePath,
            `${JSON.stringify({ backend, holdMs, root, events: diagnostics.map(({ event, phase, method, storageRequestId, errorCode: code, outcome, pending }) => ({ event, phase, method, storageRequestId, errorCode: code, outcome, pending })) }, null, 2)}\n`,
            { flag: 'wx' },
          )
        } finally {
          cleanupFailures = await resources.closeAll()
          if (cleanupFailures.length) {
            preserveRoot = true
            const cleanupPath = join(reportRoot, `cleanup-errors-short-${backend}-${holdMs}-${randomUUID()}.json`)
            await writeFile(
              cleanupPath,
              `${JSON.stringify({ root, cleanupFailures, cleanup: 'owned-resource-close-failed' }, null, 2)}\n`,
              { flag: 'wx' },
            )
          }
        }
        if (primaryError !== undefined && cleanupFailures.length)
          throw new AggregateError(
            [primaryError, ...cleanupFailures.map(({ label, errorCode: code }) => new Error(`${label}:${code}`))],
            'Short lock phase and cleanup failed',
            { cause: primaryError },
          )
        if (primaryError !== undefined) throw primaryError
        if (cleanupFailures.length)
          throw new AggregateError(
            cleanupFailures.map(({ label, errorCode: code }) => new Error(`${label}:${code}`)),
            'Short lock phase cleanup failed',
          )
        if (!preserveRoot) await cleanupOwnedRootOrRecord(root, reportRoot, `short-${backend}-${holdMs}`)
      }
    }
  },
  45_000,
)

test.serial(
  'a busy Storage write is reconciled by the same request ID after the lock releases',
  async () => {
    const reportRoot = join(process.cwd(), 'artifacts', 'sqlite-lock-contention')
    await mkdir(reportRoot, { recursive: true })
    const root = await makeOwnedRoot()
    const database = join(root, 'timeout.sqlite')
    const events: DiagnosticEvent[] = []
    const resources = new FixtureResources()
    let primaryError: unknown
    const storage = resources.track('storage-primary', makeStorage(database, events, 400))
    let lock: LockWorker | undefined
    let preserveRoot = false
    let cleanupFailures: Array<{ readonly label: string; readonly errorCode: string }>
    try {
      await storage.call('ready')
      const workspace = await storage.call('createWorkspace', join(root, 'workspace'), 'Timeout lock fixture')
      const session = await storage.call('createSession', workspace.id)
      events.splice(0, events.length)
      lock = resources.track('write-lock', await startLock(database))
      const lockAcquiredAtUtc = lock.acquiredAtUtc
      const requestIds = Array.from({ length: 30 }, (_, index) => `timeout-${index}-${randomUUID()}`)
      const outcomes = requestIds.map((requestId, index) =>
        storage
          .call('enqueue', session.id, requestId, { text: `timeout fixture ${index}`, images: [] }, 'fixture/model')
          .then((run) => ({ requestId, outcome: 'success' as const, runId: run.id }))
          .catch((error: unknown) => ({ requestId, outcome: 'failure' as const, errorCode: errorCode(error) })),
      )
      const settled = await Promise.race([
        Promise.all(outcomes),
        Bun.sleep(5_000).then(() => {
          throw new Error('Timed lock contention did not settle inside 5 seconds')
        }),
      ])
      expect(settled.every((item) => item.outcome === 'failure' && item.errorCode === 'STORAGE_ERROR')).toBe(true)
      expect(
        events.filter((event) => event.event === 'sqlite.request_failed' && event.errorCode === 'SQLITE_BUSY'),
      ).toHaveLength(30)
      expect(events.some((event) => event.event === 'storage.timeout' && event.outcome === 'unknown')).toBe(false)
      await Bun.sleep(1_500)
      const dispatchedBeforeRecovery = events.filter((event) => event.event === 'storage.request_dispatched').length
      expect(dispatchedBeforeRecovery).toBe(30)
      const heldLock = lock
      await heldLock.release()
      const lockReleasedAtUtc = heldLock.releasedAtUtc
      await resources.close(heldLock)
      lock = undefined
      await resources.close(storage)
      const reopenEvents: DiagnosticEvent[] = []
      const reopenedStorage = resources.track('storage-reopened', makeStorage(database, reopenEvents))
      const recoveryStartedAt = performance.now()
      await reopenedStorage.call('ready')
      const recoveryMs = performance.now() - recoveryStartedAt
      const runsBeforeRetry = await Promise.all(
        requestIds.map((requestId) => reopenedStorage.call('runByRequest', session.id, requestId)),
      )
      const persistedEventsBeforeRetry = await reopenedStorage.call('events', session.id, 0, 10_000)
      const preRetry = requestIds.map((requestId, index) => {
        const run = runsBeforeRetry[index]?.run ?? null
        const eventCount = run
          ? persistedEventsBeforeRetry.filter((event) => event.type === 'run.queued' && event.runId === run.id).length
          : 0
        return { requestId, runId: run?.id ?? null, queuedEventCount: eventCount }
      })
      expect(preRetry.every((item) => item.queuedEventCount <= 1)).toBe(true)
      const retried = await Promise.all(
        requestIds.map(async (requestId, index) => {
          const existing = runsBeforeRetry[index]
          if (existing) return existing.run
          return reopenedStorage.call(
            'enqueue',
            session.id,
            requestId,
            { text: 'same-id explicit reconcile retry', images: [] },
            'fixture/model',
          )
        }),
      )
      const finalEvents = await reopenedStorage.call('events', session.id, 0, 10_000)
      for (let index = 0; index < requestIds.length; index++) {
        const requestId = requestIds[index]
        const run = retried[index]
        if (!requestId || !run) throw new Error('Timed write reconciliation omitted a run')
        const lookup = await reopenedStorage.call('runByRequest', session.id, requestId)
        expect(lookup?.run.id).toBe(run.id)
        expect(finalEvents.filter((event) => event.type === 'run.queued' && event.runId === run.id)).toHaveLength(1)
      }
      const reportPath = join(reportRoot, `busy-reconcile-storage-${randomUUID()}.json`)
      await writeFile(
        reportPath,
        `${JSON.stringify(
          {
            backend: 'storage',
            holdMs: 1_500,
            requestTimeoutMs: 400,
            writes: 30,
            lockAcquiredAtUtc,
            lockReleasedAtUtc,
            results: settled,
            busyFailureCount: settled.filter((item) => item.outcome === 'failure').length,
            dispatchedBeforeExplicitReconcile: dispatchedBeforeRecovery,
            preRetryReadback: preRetry,
            recoveryMs,
            finalExactlyOneQueuedEventPerRequest: true,
            quickCheck: (() => {
              const checkDb = new Database(database, { readonly: true, strict: true })
              try {
                return z
                  .strictObject({ quick_check: z.literal('ok') })
                  .parse(checkDb.query('PRAGMA quick_check(1)').get()).quick_check
              } finally {
                checkDb.close()
              }
            })(),
            rssBytes: process.memoryUsage.rss(),
          },
          null,
          2,
        )}\n`,
        { flag: 'wx' },
      )
      await resources.close(reopenedStorage)
    } catch (error) {
      primaryError = error
      preserveRoot = true
      const failurePath = join(reportRoot, `failed-timeout-storage-${randomUUID()}.json`)
      await writeFile(
        failurePath,
        `${JSON.stringify({ root, code: errorCode(error), events: events.map((event) => ({ event: event.event, phase: event.phase, method: event.method, storageRequestId: event.storageRequestId, errorCode: event.errorCode, pending: event.pending, outcome: event.outcome })) }, null, 2)}\n`,
        { flag: 'wx' },
      )
    } finally {
      cleanupFailures = await resources.closeAll()
      if (cleanupFailures.length) {
        preserveRoot = true
        const cleanupPath = join(reportRoot, `cleanup-errors-busy-reconcile-${randomUUID()}.json`)
        await writeFile(
          cleanupPath,
          `${JSON.stringify({ root, cleanupFailures, cleanup: 'owned-resource-close-failed' }, null, 2)}\n`,
          { flag: 'wx' },
        )
      }
    }
    if (primaryError !== undefined && cleanupFailures.length)
      throw new AggregateError(
        [primaryError, ...cleanupFailures.map(({ label, errorCode: code }) => new Error(`${label}:${code}`))],
        'Busy reconciliation and cleanup failed',
        { cause: primaryError },
      )
    if (primaryError !== undefined) throw primaryError
    if (cleanupFailures.length)
      throw new AggregateError(
        cleanupFailures.map(({ label, errorCode: code }) => new Error(`${label}:${code}`)),
        'Busy reconciliation cleanup failed',
      )
    if (!preserveRoot) await cleanupOwnedRootOrRecord(root, reportRoot, 'busy-reconcile')
  },
  30_000,
)

test.serial(
  'a durable append under a lock longer than busy_timeout preserves recoverable sequence state',
  async () => {
    const reportRoot = join(process.cwd(), 'artifacts', 'sqlite-lock-contention')
    await mkdir(reportRoot, { recursive: true })
    const root = await makeOwnedRoot()
    const database = join(root, 'append.sqlite')
    const events: DiagnosticEvent[] = []
    const resources = new FixtureResources()
    let primaryError: unknown
    const storage = resources.track('storage-primary', makeStorage(database, events, 15_000))
    let lock: LockWorker | undefined
    let preserveRoot: boolean
    let cleanupFailures: Array<{ readonly label: string; readonly errorCode: string }>
    let workspaceId: string | undefined
    let sessionId: string | undefined
    let appendResult:
      { outcome: 'success'; eventId: string; seq: number } | { outcome: 'failure'; errorCode: string } | undefined
    try {
      await storage.call('ready')
      const workspace = await storage.call('createWorkspace', join(root, 'workspace'), 'Durable append lock fixture')
      const session = await storage.call('createSession', workspace.id)
      workspaceId = workspace.id
      sessionId = session.id
      events.splice(0, events.length)
      lock = resources.track('append-lock', await startLock(database))
      const lockAcquiredAtUtc = lock.acquiredAtUtc
      const releasedAt = Bun.sleep(11_000).then(() => lock?.release())
      const marker = `append-lock-${randomUUID()}`
      const startedAt = performance.now()
      try {
        const event = await Promise.race([
          storage.call('append', session.id, 'run.lockContentionFixture', { marker }),
          Bun.sleep(17_000).then(() => {
            throw new Error('Durable append did not settle within its owned deadline')
          }),
        ])
        appendResult = { outcome: 'success', eventId: event.eventId, seq: event.seq }
      } catch (error: unknown) {
        appendResult = { outcome: 'failure', errorCode: errorCode(error) }
      }
      const appendElapsedMs = performance.now() - startedAt
      await releasedAt
      const lockReleasedAtUtc = lock.releasedAtUtc
      await resources.close(lock)
      lock = undefined
      const liveEvents = await storage.call('events', session.id, 0, 10_000)
      await resources.close(storage)

      const readCanonicalLog = async () => {
        const matchingLogFiles: string[] = []
        const visit = async (directory: string): Promise<void> => {
          for (const entry of await readdir(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name)
            if (entry.isDirectory()) await visit(path)
            else if (entry.isFile() && entry.name === `${session.id}.jsonl`) matchingLogFiles.push(path)
          }
        }
        await visit(join(root, 'sessions'))
        return Promise.all(
          matchingLogFiles.map(async (path) => ({
            path,
            events: (await readFile(path, 'utf8'))
              .split(/\r?\n/)
              .filter(Boolean)
              .map((line) => sessionEventSchema.parse(JSON.parse(line))),
          })),
        )
      }
      const lines = await readCanonicalLog()
      const logEvents = lines
        .flatMap((file) => file.events)
        .filter(
          (event) =>
            event.data && typeof event.data === 'object' && 'marker' in event.data && event.data.marker === marker,
        )
      const reopenedEvents: DiagnosticEvent[] = []
      const reopenedStorage = resources.track('storage-reopened', makeStorage(database, reopenedEvents, 15_000))
      let recoveryErrorCode: string | undefined
      let recoveredSessionEvents: SessionEvent[] | undefined
      try {
        await reopenedStorage.call('ready')
        recoveredSessionEvents = await reopenedStorage.call('events', session.id, 0, 10_000)
      } catch (error: unknown) {
        recoveryErrorCode = errorCode(error)
      }
      let nextAppend: { eventId: string; seq: number } | undefined
      if (recoveredSessionEvents) {
        const next = await reopenedStorage.call('append', session.id, 'run.lockContentionFixture.recovered', {
          marker: `${marker}-after-recovery`,
        })
        nextAppend = { eventId: next.eventId, seq: next.seq }
        recoveredSessionEvents = await reopenedStorage.call('events', session.id, 0, 10_000)
      }
      const commitMarker = `${marker}-commit`
      const ownedCommitLock = resources.track('commit-lock', await startLock(database))
      const commitLockAcquiredAtUtc = ownedCommitLock.acquiredAtUtc
      const releaseCommitLock = Bun.sleep(11_000).then(() => ownedCommitLock.release())
      const commitStartedAt = performance.now()
      let commitResult: { outcome: 'success'; eventId: string; seq: number } | { outcome: 'failure'; errorCode: string }
      try {
        const result = await Promise.race([
          reopenedStorage.call('commit', session.id, `${marker}-run`, 'user', [{ type: 'text', text: commitMarker }]),
          Bun.sleep(17_000).then(() => {
            throw new Error('Commit did not settle within its owned deadline')
          }),
        ])
        commitResult = { outcome: 'success', eventId: result.event.eventId, seq: result.event.seq }
      } catch (error: unknown) {
        commitResult = { outcome: 'failure', errorCode: errorCode(error) }
      }
      const commitElapsedMs = performance.now() - commitStartedAt
      await releaseCommitLock
      const commitLockReleasedAtUtc = ownedCommitLock.releasedAtUtc
      await resources.close(ownedCommitLock)
      const afterCommitLockEvents = await reopenedStorage.call('events', session.id, 0, 10_000)
      const afterCommitLockSnapshot = await reopenedStorage.call('snapshot', session.id, undefined, 20)
      const commitLogEvents = (await readCanonicalLog())
        .flatMap((file) => file.events)
        .filter((event) => event.type === 'message.committed' && JSON.stringify(event.data).includes(commitMarker))
      const commitProjectionEvents = afterCommitLockEvents.filter(
        (event) => event.type === 'message.committed' && JSON.stringify(event.data).includes(commitMarker),
      )
      const successfulCommit = await reopenedStorage.call('commit', session.id, `${marker}-run-after-lock`, 'user', [
        { type: 'text', text: `${commitMarker}-after-release` },
      ])
      await resources.close(reopenedStorage)
      const finalStorageResource = resources.track('storage-final-reopen', makeStorage(database, []))
      await finalStorageResource.call('ready')
      const finalSnapshot = await finalStorageResource.call('snapshot', session.id, undefined, 20)
      const finalEvents = await finalStorageResource.call('events', session.id, 0, 10_000)
      await resources.close(finalStorageResource)
      const finalLogLines = await readCanonicalLog()
      const integrityDb = new Database(database, { readonly: true, strict: true })
      let quickCheck: string
      let foreignKeyViolations: number
      try {
        quickCheck = z
          .strictObject({ quick_check: z.literal('ok') })
          .parse(integrityDb.query('PRAGMA quick_check(1)').get()).quick_check
        foreignKeyViolations = integrityDb.query('PRAGMA foreign_key_check').all().length
      } finally {
        integrityDb.close()
      }
      const logSeqs = finalLogLines.flatMap((file) => file.events.map((event) => event.seq))
      const report = {
        backend: 'storage-append',
        heldLockMs: 11_000,
        fixedBusyTimeoutMs: 5_000,
        storageRequestTimeoutMs: 15_000,
        appendElapsedMs,
        appendResult,
        appendErrorCode: appendResult?.outcome === 'failure' ? appendResult.errorCode : undefined,
        heldLockReleased: true,
        lockAcquiredAtUtc,
        lockReleasedAtUtc,
        liveProjectionContainsRejectedAppend: liveEvents.some(
          (event) =>
            event.data && typeof event.data === 'object' && 'marker' in event.data && event.data.marker === marker,
        ),
        commitLockAcquiredAtUtc,
        commitLockReleasedAtUtc,
        commitElapsedMs,
        commitResult,
        commitLogEventCount: commitLogEvents.length,
        commitProjectionEventCount: commitProjectionEvents.length,
        messagesAfterRejectedCommit: afterCommitLockSnapshot.messages.length,
        commitAfterLock: { eventId: successfulCommit.event.eventId, seq: successfulCommit.event.seq },
        finalSnapshotMessageCount: finalSnapshot.messages.length,
        finalSessionEventSequences: finalEvents.map((event) => event.seq),
        reopenedStorageDiagnostics: reopenedEvents.map(
          ({ event, phase, method, storageRequestId, errorCode: code, outcome, workerState }) => ({
            event,
            phase,
            method,
            storageRequestId,
            errorCode: code,
            outcome,
            workerState,
          }),
        ),
        lockLogMatches: logEvents.length,
        logEventSummary: logEvents.map(({ eventId, sessionId: loggedSessionId, seq, type }) => ({
          eventId,
          sessionId: loggedSessionId,
          seq,
          type,
        })),
        workerDiagnostics: events.map(
          ({ event, phase, method, storageRequestId, errorCode: code, outcome, workerState }) => ({
            event,
            phase,
            method,
            storageRequestId,
            errorCode: code,
            outcome,
            workerState,
          }),
        ),
        recoveryErrorCode,
        recoveredEventSummary: (recoveredSessionEvents ?? [])
          .filter((event) => event.type.startsWith('run.lockContentionFixture'))
          .map(({ eventId, seq, type }) => ({ eventId, seq, type })),
        nextAppend,
        uniqueRecoveredSeqs: recoveredSessionEvents
          ? new Set(recoveredSessionEvents.map((event) => event.seq)).size === recoveredSessionEvents.length
          : false,
        duplicateLogSeqCount: logSeqs.length - new Set(logSeqs).size,
        quickCheck,
        foreignKeyViolations,
        root,
        workspaceId,
        sessionId,
        rssBytes: process.memoryUsage.rss(),
      }
      const reportPath = join(reportRoot, `append-over-busy-timeout-${randomUUID()}.json`)
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
      expect(quickCheck).toBe('ok')
      expect(foreignKeyViolations).toBe(0)
      expect(report.duplicateLogSeqCount).toBe(0)
      preserveRoot = false
      expect(appendResult?.outcome).toBe('failure')
      expect(appendResult?.outcome === 'failure' ? appendResult.errorCode : null).toBe('STORAGE_ERROR')
      expect(logEvents).toHaveLength(0)
      expect(events.some((event) => event.event === 'sqlite.request_reply_built' && event.method === 'append')).toBe(
        true,
      )
      expect(events.some((event) => event.event === 'storage.worker_error')).toBe(false)
      expect(
        liveEvents.some(
          (event) =>
            event.data && typeof event.data === 'object' && 'marker' in event.data && event.data.marker === marker,
        ),
      ).toBe(false)
      expect(recoveryErrorCode).toBeUndefined()
      expect(
        recoveredSessionEvents?.filter(
          (event) =>
            event.data && typeof event.data === 'object' && 'marker' in event.data && event.data.marker === marker,
        ),
      ).toHaveLength(0)
      expect(nextAppend).toBeDefined()
      expect(nextAppend?.seq).toBe(2)
      expect(report.uniqueRecoveredSeqs).toBe(true)
      expect(commitResult.outcome).toBe('failure')
      expect(commitResult.outcome === 'failure' ? commitResult.errorCode : null).toBe('STORAGE_ERROR')
      expect(commitLogEvents).toHaveLength(0)
      expect(commitProjectionEvents).toHaveLength(0)
      expect(
        afterCommitLockSnapshot.messages.some((message) =>
          message.content.some((block) => block.type === 'text' && block.text === commitMarker),
        ),
      ).toBe(false)
      expect(
        reopenedEvents.some((event) => event.event === 'sqlite.request_reply_built' && event.method === 'commit'),
      ).toBe(true)
      expect(reopenedEvents.some((event) => event.event === 'storage.worker_error')).toBe(false)
      expect(successfulCommit.event.seq).toBe(3)
      expect(finalSnapshot.messages).toHaveLength(1)
      expect(finalEvents.filter((event) => event.type === 'message.committed')).toHaveLength(1)
      expect(new Set(finalEvents.map((event) => event.seq)).size).toBe(finalEvents.length)
      expect(report.duplicateLogSeqCount).toBe(0)
    } catch (error) {
      primaryError = error
      preserveRoot = true
      const failurePath = join(reportRoot, `failed-append-over-busy-timeout-${randomUUID()}.json`)
      await writeFile(
        failurePath,
        `${JSON.stringify({ root, workspaceId, sessionId, appendResult, events: events.map(({ event, phase, method, storageRequestId, errorCode: code, outcome, workerState }) => ({ event, phase, method, storageRequestId, errorCode: code, outcome, workerState })) }, null, 2)}\n`,
        { flag: 'wx' },
      )
    } finally {
      cleanupFailures = await resources.closeAll()
      if (cleanupFailures.length) {
        preserveRoot = true
        const cleanupPath = join(reportRoot, `cleanup-errors-append-lock-${randomUUID()}.json`)
        await writeFile(
          cleanupPath,
          `${JSON.stringify({ root, cleanupFailures, cleanup: 'owned-resource-close-failed' }, null, 2)}\n`,
          { flag: 'wx' },
        )
      }
    }
    if (primaryError !== undefined && cleanupFailures.length)
      throw new AggregateError(
        [primaryError, ...cleanupFailures.map(({ label, errorCode: code }) => new Error(`${label}:${code}`))],
        'Long lock scenario and cleanup failed',
        { cause: primaryError },
      )
    if (primaryError !== undefined) throw primaryError
    if (cleanupFailures.length)
      throw new AggregateError(
        cleanupFailures.map(({ label, errorCode: code }) => new Error(`${label}:${code}`)),
        'Long lock scenario cleanup failed',
      )
    if (!preserveRoot) await cleanupOwnedRootOrRecord(root, reportRoot, 'append-lock')
  },
  30_000,
)
