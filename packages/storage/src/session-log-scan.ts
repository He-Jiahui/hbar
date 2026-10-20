import { Worker } from 'node:worker_threads'
import { statSync } from 'node:fs'
import { relative } from 'node:path'
import {
  DEFAULT_MAX_SESSION_LOG_RECORD_BYTES,
  SessionLogRecoveryError,
  listSessionLogFiles,
  type SessionLogVisitOptions,
  type SessionLogVisitResult,
} from './session-log-recovery'
import { replySchema, type MetadataRow } from './session-log-scan-protocol'

export interface ParallelScanOptions extends SessionLogVisitOptions {
  readonly signal?: AbortSignal
  readonly onWorkersClosed?: (stats: Readonly<ParallelScanStats>) => void
}
export interface ParallelScanStats {
  workers: number
  maxBatchRows: number
  batches: number
  records: number
  maxPendingRowsBound: number
  naturalWorkerExitCodes: number[]
  forcedWorkerTerminations: number
  allWorkersJoined: boolean
}
interface Owned {
  worker: Worker
  shared: Int32Array
  currentPath: string | undefined
  exited: boolean
  exit: Promise<number>
}
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('SCAN_WORKER_CLOSE_DEADLINE')), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
export async function parallelVisitSessionLogs(
  root: string,
  excluded: ReadonlySet<string>,
  onRows: (rows: readonly MetadataRow[]) => void,
  options: ParallelScanOptions = {},
): Promise<SessionLogVisitResult & { parallel: ParallelScanStats }> {
  const limit = options.maxRecordBytes ?? DEFAULT_MAX_SESSION_LOG_RECORD_BYTES
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > DEFAULT_MAX_SESSION_LOG_RECORD_BYTES)
    throw new RangeError('Invalid original record byte cap')
  const canonicalPaths = listSessionLogFiles(root, excluded).sort()
  const queue = canonicalPaths
    .map((path) => ({ path, size: statSync(path).size }))
    .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
  const stats: ParallelScanStats = {
    workers: Math.min(4, queue.length),
    maxBatchRows: 128,
    batches: 0,
    records: 0,
    maxPendingRowsBound: Math.min(4, queue.length) * 128,
    naturalWorkerExitCodes: [],
    forcedWorkerTerminations: 0,
    allWorkersJoined: false,
  }
  if (options.signal?.aborted) throw new Error('SCAN_CANCELLED')
  if (queue.length === 0) return { files: [], truncated: [], parallel: { ...stats, allWorkersJoined: true } }
  const owned: Owned[] = []
  const files = new Map<string, SessionLogVisitResult['files'][number]>()
  const tails = new Map<string, SessionLogVisitResult['truncated'][number]>()
  let failed: Error | undefined
  let closing = false
  let completed = 0
  let resolveDone: () => void = () => undefined
  let rejectDone: (error: Error) => void = () => undefined
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })
  const fail = (value: unknown) => {
    if (failed) return
    failed = value instanceof Error ? value : new Error('Owned scan failed')
    for (const item of owned) {
      Atomics.store(item.shared, 1, 1)
      Atomics.notify(item.shared, 0)
    }
    rejectDone(failed)
  }
  const onAbort = () => fail(new Error('SCAN_CANCELLED'))
  const timeout = setTimeout(() => fail(new Error('SCAN_DEADLINE')), 100_000)
  options.signal?.addEventListener('abort', onAbort, { once: true })
  const dispatch = (item: Owned) => {
    const next = queue.shift()
    item.currentPath = next?.path
    if (next) item.worker.postMessage({ type: 'file', path: next.path })
  }
  try {
    for (let index = 0; index < stats.workers; index++) {
      const buffer = new SharedArrayBuffer(8)
      const workerPath = import.meta.url.endsWith('.ts')
        ? new URL('./session-log-scan-worker.ts', import.meta.url)
        : new URL('./session-log-scan-worker.js', import.meta.url)
      const worker = new Worker(
        Bun.isStandaloneExecutable ? './packages/storage/src/session-log-scan-worker.ts' : workerPath,
        {
          workerData: {
            root,
            excluded: [...excluded],
            shared: buffer,
            deadline: Date.now() + 100_000,
            maxRecordBytes: limit,
          },
        },
      )
      const item: Owned = {
        worker,
        shared: new Int32Array(buffer),
        currentPath: undefined,
        exited: false,
        exit: Promise.resolve(0),
      }
      item.exit = new Promise<number>((resolve) =>
        worker.once('exit', (code: number) => {
          item.exited = true
          resolve(code)
          if (!closing) fail(new Error('SCAN_WORKER_UNEXPECTED_EXIT'))
          else if (code !== 0) fail(new Error('SCAN_WORKER_NONZERO_EXIT'))
        }),
      )
      owned.push(item)
      worker.on('error', fail)
      worker.on('message', (raw: unknown) => {
        if (failed) return
        try {
          const reply = replySchema.parse(raw)
          if (reply.type === 'error') {
            if (
              reply.code === 'SESSION_LOG_CORRUPTED' ||
              reply.code === 'SESSION_LOG_CHANGED_DURING_RECOVERY' ||
              reply.code === 'SESSION_LOG_RECORD_TOO_LARGE'
            )
              throw new SessionLogRecoveryError(reply.code, reply.message)
            throw new Error(reply.code + ': ' + reply.message)
          }
          if (!item.currentPath || reply.path !== item.currentPath) throw new Error('SCAN_FILE_OWNER_MISMATCH')
          const rel = relative(root, item.currentPath).replaceAll('\\', '/')
          if (reply.type === 'batch') {
            if (
              reply.sequence !== Atomics.load(item.shared, 0) + 1 ||
              reply.rows.some((row) => row.relativePath !== rel)
            )
              throw new Error('SCAN_BATCH_OWNER_MISMATCH')
            onRows(reply.rows)
            stats.batches++
            stats.records += reply.rows.length
            Atomics.store(item.shared, 0, reply.sequence)
            Atomics.notify(item.shared, 0)
          } else {
            const snapshot = reply.files[0]
            if (!snapshot || snapshot.path !== rel || files.has(rel)) throw new Error('SCAN_FILE_SET_MISMATCH')
            files.set(rel, snapshot)
            options.onFile?.(snapshot)
            for (const tail of reply.truncated) {
              if (tail.path !== item.currentPath || tail.relativePath !== rel)
                throw new Error('SCAN_TAIL_OWNER_MISMATCH')
              tails.set(rel, tail)
            }
            completed++
            dispatch(item)
            if (completed === canonicalPaths.length) resolveDone()
          }
        } catch (error) {
          fail(error)
        }
      })
      dispatch(item)
    }
    await done
    closing = true
    for (const item of owned) item.worker.postMessage({ type: 'close' })
    stats.naturalWorkerExitCodes = await withTimeout(Promise.all(owned.map((item) => item.exit)), 2000)
    if (failed) throw failed
    if (stats.naturalWorkerExitCodes.some((code) => code !== 0)) throw new Error('SCAN_WORKER_NONZERO_EXIT')
    stats.allWorkersJoined = true
    const relativePaths = canonicalPaths.map((path) => relative(root, path).replaceAll('\\', '/'))
    return {
      files: relativePaths.map((path) => {
        const file = files.get(path)
        if (!file) throw new Error('SCAN_FILE_MISSING')
        return file
      }),
      truncated: relativePaths.flatMap((path) => {
        const tail = tails.get(path)
        return tail ? [tail] : []
      }),
      parallel: stats,
    }
  } catch (error) {
    fail(error)
    await done.catch(() => undefined)
    throw failed
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', onAbort)
    closing = true
    for (const item of owned) {
      Atomics.store(item.shared, 1, 1)
      Atomics.notify(item.shared, 0)
    }
    await Promise.all(
      owned
        .filter((item) => !item.exited)
        .map(async (item) => {
          stats.forcedWorkerTerminations++
          await item.worker.terminate()
          await item.exit
        }),
    )
    stats.allWorkersJoined = owned.every((item) => item.exited)
    try {
      options.onWorkersClosed?.(stats)
    } catch {
      // Lifecycle telemetry cannot replace the scanner's result or original failure.
    }
  }
}
