import { Worker } from 'node:worker_threads'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type { StoragePort } from './index'
import type { PathLayout } from './path-layout'
import {
  chatDatabaseVacuumRecordSchema,
  createChatDatabaseVacuumRecords,
  type ChatDatabaseVacuumRecord,
} from './chat-database-vacuum-record'

const replySchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), record: chatDatabaseVacuumRecordSchema }),
  z.strictObject({ ok: z.literal(false), code: z.string(), error: z.string() }),
])
export interface ChatDatabaseMaintenanceWorkerPort {
  run(operationId: string, signal: AbortSignal): Promise<ChatDatabaseVacuumRecord>
  progress(operationId: string): ChatDatabaseVacuumRecord | null
  isRunning(operationId: string): boolean
  cancel(operationId: string, identity: { actorId: string; idempotencyKey: string }): void
  close(): Promise<void>
}
export interface ChatDatabaseWriterHandover {
  begin(operationId: string): Promise<void | { verificationOnly: boolean }>
  /** The maintenance Worker has exited; the receipt confirms the file is safe to reopen. */
  end(operationId: string, receipt: ChatDatabaseVacuumRecord): Promise<void>
}
export function createChatDatabaseMaintenanceWorker(
  storage: StoragePort,
  layout: PathLayout,
  timeoutMs = 120_000,
  handover?: ChatDatabaseWriterHandover,
): ChatDatabaseMaintenanceWorkerPort {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000)
    throw new HbarError('INVALID_INPUT', 'Maintenance worker timeout is invalid')
  const records = createChatDatabaseVacuumRecords(layout.sessions)
  let active: { id: string; flags: Int32Array; task: Promise<ChatDatabaseVacuumRecord> } | null = null
  let closed = false
  function progress(id: string): ChatDatabaseVacuumRecord | null {
    const record = records.read(id)
    if (!record && active?.id === id)
      return {
        schemaVersion: 1,
        operationId: id,
        status: 'running',
        stage: 'pending',
        beforeBytes: 0,
        afterBytes: null,
        reclaimedBytes: 0,
        schemaRevision: 0,
        didVacuum: false,
        integrityVerified: false,
        cancellationRequested: Atomics.load(active.flags, 0) === 1 || records.cancelled(id),
        updatedAt: Date.now(),
        error: null,
      }
    return record ? { ...record, cancellationRequested: record.cancellationRequested || records.cancelled(id) } : null
  }
  async function execute(
    id: string,
    flags: Int32Array,
    mode: 'run' | 'verify',
  ): Promise<ChatDatabaseVacuumRecord | null> {
    const options = {
      workerData: { path: layout.database, sessionsRoot: layout.sessions, operationId: id, mode, flags: flags.buffer },
    }
    const worker = process.env.HBAR_MAINTENANCE_WORKER
      ? new Worker(process.env.HBAR_MAINTENANCE_WORKER, options)
      : Bun.isStandaloneExecutable
        ? new Worker('./packages/storage/src/maintenance-worker.ts', options)
        : new Worker(new URL('./maintenance-worker.ts', import.meta.url), options)
    let record: ChatDatabaseVacuumRecord | null = null
    let failure: Error | null = null
    let termination: Promise<number> | null = null
    const exit = new Promise<void>((resolve) => {
      worker.on('message', (message: unknown) => {
        const parsed = replySchema.safeParse(message)
        if (!parsed.success) {
          failure = new HbarError('INVALID_OUTPUT', 'Maintenance worker reply is invalid')
          return
        }
        if (parsed.data.ok) record = parsed.data.record
        else failure = new HbarError(parsed.data.code, parsed.data.error)
      })
      worker.once('error', (reason: Error) => {
        failure = reason
      })
      worker.once('exit', (code: number) => {
        if (code && !failure)
          failure = new HbarError('DATABASE_WORKER_EXITED', 'Database maintenance worker exited before acknowledgement')
        resolve()
      })
    })
    const timer = setTimeout(
      () => {
        Atomics.store(flags, 0, 1)
        try {
          records.cancel(id)
        } catch (reason) {
          failure =
            reason instanceof Error
              ? reason
              : new HbarError('STORAGE_ERROR', 'Maintenance cancellation could not be persisted')
        }
        termination = worker.terminate()
        void termination.catch((reason: unknown) => console.error('Database maintenance termination failed', reason))
      },
      mode === 'verify' ? Math.max(timeoutMs, 5000) : timeoutMs,
    )
    try {
      await exit
      if (termination) await termination
    } finally {
      clearTimeout(timer)
    }
    if (!record && failure && mode === 'verify') throw failure
    return record
  }
  return {
    progress,
    isRunning: (id) => active?.id === id,
    cancel(id, identity) {
      records.cancel(id, identity)
      if (active?.id === id) Atomics.store(active.flags, 0, 1)
    },
    run(id, signal) {
      if (closed) return Promise.reject(new HbarError('DISPOSED', 'Database maintenance worker is closed'))
      if (active)
        return active.id === id
          ? active.task
          : Promise.reject(new HbarError('BUSY', 'Database maintenance worker is occupied'))
      const flags = new Int32Array(new SharedArrayBuffer(8))
      const cancel = () => {
        Atomics.store(flags, 0, 1)
        try {
          records.cancel(id)
        } catch (reason) {
          console.error('Database maintenance cancellation persistence failed', reason)
        }
      }
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel()
      const task = (async () => {
        const prior = progress(id)
        if (prior?.integrityVerified && ['completed', 'cancelled'].includes(prior.status)) return prior
        const ownership = handover ? await handover.begin(id) : await storage.call('chatDatabaseMaintenanceBegin', id)
        let verified = false
        let receipt: ChatDatabaseVacuumRecord | null = null
        try {
          // Any durable receipt means execution may already have happened. Only verify its outcome.
          let result = await execute(id, flags, prior || ownership?.verificationOnly ? 'verify' : 'run')
          result ??= await execute(id, flags, 'verify')
          if (!result || !result.integrityVerified)
            throw new HbarError('DATABASE_INTEGRITY', 'Database maintenance result needs offline recovery')
          verified = true
          receipt = result
          return {
            ...result,
            cancellationRequested:
              result.cancellationRequested || records.cancelled(id) || Atomics.load(flags, 0) === 1,
          }
        } finally {
          if (verified && receipt) {
            if (handover) await handover.end(id, receipt)
            else await storage.call('chatDatabaseMaintenanceEnd', id)
          }
        }
      })().finally(() => {
        signal.removeEventListener('abort', cancel)
        if (active?.id === id) active = null
      })
      active = { id, flags, task }
      return task
    },
    async close() {
      closed = true
      if (active) {
        records.cancel(active.id)
        Atomics.store(active.flags, 0, 1)
        await active.task
      }
    },
  }
}
