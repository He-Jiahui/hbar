import { Database } from 'bun:sqlite'
import { existsSync, writeSync } from 'node:fs'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import {
  Storage,
  storageActivatedCatalogSchema,
  createPathLayout,
  storageRpcCallSchema,
  STORAGE_SCHEMA_VERSION,
  STORAGE_RPC_FINGERPRINT,
  type StorageFatalEvent,
} from '@hbar/storage'
import { procedure, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { runtimeOwnerSchema } from '@hbar/contracts/runtime'
import { acquireHostProcessLock } from './process-lock'

const fatalDiagnosticSchema = 'hbar.storage-fatal.v1'
const maxFatalDiagnosticBytes = 1_024

/** Formats only bounded lifecycle metadata; Storage error messages may contain untrusted details. */
export function formatStorageFatalDiagnostic(event: StorageFatalEvent): string {
  const safeCode = /^[A-Z][A-Z0-9_]{0,79}$/.test(event.code) ? event.code : 'STORAGE_FATAL'
  const safeMethod = event.method && /^[A-Za-z][A-Za-z0-9]{0,79}$/.test(event.method) ? event.method : undefined
  const storageRequestId = event.storageRequestId
  const pendingCount = event.pendingCount
  const occurredAt = Number.isFinite(event.occurredAt) ? Math.max(0, Math.trunc(event.occurredAt)) : 0
  const payload = {
    schema: fatalDiagnosticSchema,
    kind: event.kind,
    code: safeCode,
    ...(safeMethod ? { method: safeMethod } : {}),
    ...(typeof storageRequestId === 'number' && Number.isSafeInteger(storageRequestId) && storageRequestId >= 0
      ? { storageRequestId }
      : {}),
    ...(typeof pendingCount === 'number' && Number.isSafeInteger(pendingCount) && pendingCount >= 0
      ? { pendingCount: Math.min(pendingCount, 1_000_000) }
      : {}),
    workerState: event.workerState ?? 'failed',
    outcome: event.outcome ?? 'unknown',
    ...(event.durationMs !== undefined && Number.isFinite(event.durationMs)
      ? { durationMs: Math.min(Math.max(0, Math.trunc(event.durationMs)), 2_147_483_647) }
      : {}),
    occurredAt,
  }
  const line = `${JSON.stringify(payload)}\n`
  if (Buffer.byteLength(line, 'utf8') <= maxFatalDiagnosticBytes) return line
  return `${JSON.stringify({ schema: fatalDiagnosticSchema, kind: event.kind, code: safeCode, truncated: true })}\n`
}

export function exitStorageProcessForFatal(event: StorageFatalEvent): never {
  try {
    writeSync(2, Buffer.from(formatStorageFatalDiagnostic(event), 'utf8'))
  } catch {
    // A failed diagnostic write must not prevent the owner from terminating a poisoned Worker.
  }
  process.exit(76)
}

const configurationSchema = z.strictObject({
  database: z.string().min(1).max(4_000),
  dataRoot: z.string().min(1).max(4_000),
  cacheRoot: z.string().min(1).max(4_000),
  pointerFile: z.string().min(1).max(4_000),
  settingsRoot: z.string().min(1).max(4_000),
  sessionsRoot: z.string().min(1).max(4_000),
  skillsRoot: z.string().min(1).max(4_000),
  identityRoot: z.string().min(1).max(4_000),
  workerPath: z.string().min(1).max(4_000).optional(),
  diagnosticsEnabled: z.boolean().optional(),
  diagnosticsFullCoverage: z.boolean().optional(),
})
export async function create(context: RuntimeProcessContext): Promise<RuntimeProcessService> {
  const configuration = configurationSchema.parse(context.configuration)
  const layout = createPathLayout(
    configuration.dataRoot,
    configuration.cacheRoot,
    configuration.pointerFile,
    configuration,
  )
  let storage: Storage | undefined
  let probe: Storage | undefined
  let releaseWriter: (() => Promise<void>) | undefined
  let calls = 0
  let draining = false
  let activated = false
  let suspended: string | null = null
  let hibernation: { readonly operationId: string; phase: 'closing' | 'checkpointed' | 'unknown' } | null = null
  const verify = () => {
    if (!existsSync(configuration.database)) return
    const database = new Database(configuration.database, { readonly: true, strict: true })
    try {
      const version = z
        .object({ user_version: z.number().int() })
        .parse(database.query('PRAGMA user_version').get()).user_version
      if (version !== STORAGE_SCHEMA_VERSION)
        throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Storage candidate requires an incompatible schema migration')
    } finally {
      database.close()
    }
  }
  const verifyWorker = async () => {
    if (probe) throw new HbarError('BUSY', 'Storage Worker preparation is already pending')
    const candidateProbe = new Storage(configuration.database, layout, {
      preflight: true,
      ...(configuration.workerPath ? { workerPath: configuration.workerPath } : {}),
      requestTimeoutMs: 120_000,
    })
    probe = candidateProbe
    try {
      z.strictObject({ version: z.literal(STORAGE_SCHEMA_VERSION) }).parse(await candidateProbe.call('ready'))
    } finally {
      await candidateProbe.close()
      if (probe === candidateProbe) probe = undefined
    }
  }
  const open = async () => {
    if (hibernation)
      throw new HbarError('STORAGE_IDLE_OUTCOME_UNKNOWN', 'A hibernated owner cannot reopen its old Worker')
    verify()
    releaseWriter = await acquireHostProcessLock(`${configuration.database}.runtime-writer.lock`).catch(() => {
      throw new HbarError('STORAGE_WRITER_ACTIVE', 'The previous storage process still owns the database writer')
    })
    try {
      await verifyWorker()
      if (draining)
        throw new HbarError('STORAGE_WRITER_UNAVAILABLE', 'Storage owner closed before its verified writer opened')
      if (configuration.workerPath) process.env.HBAR_STORAGE_WORKER = configuration.workerPath
      storage = new Storage(configuration.database, layout, {
        onFatal: (_error, event) => exitStorageProcessForFatal(event),
        ...(configuration.diagnosticsEnabled
          ? {
              diagnostics: {
                emit: (event) => {
                  void context.peer.notify('runtime.diagnostic', event).catch(() => {})
                },
              },
              instanceId: context.peer.owner.incarnation,
              diagnosticsFullCoverage: configuration.diagnosticsFullCoverage ?? false,
            }
          : {}),
      })
      await storage.ready(120_000)
    } catch (error) {
      await storage?.close()
      storage = undefined
      await releaseWriter?.()
      releaseWriter = undefined
      throw error
    }
  }
  context.peer.register(
    'storage.catalog',
    procedure(z.undefined(), storageActivatedCatalogSchema, () => {
      if (context.preparing() || !activated || !storage || draining || suspended || hibernation)
        throw new HbarError('STORAGE_CATALOG_UNAVAILABLE', 'Storage catalog requires an activated healthy writer')
      // Pure cached metadata. No Worker RPC, database read, demand acquisition or wake.
      return storage.activatedCatalog()
    }),
  )
  context.peer.register(
    'storage.call',
    procedure(storageRpcCallSchema, z.unknown(), async (input) => {
      if (context.preparing() || !storage || draining || suspended)
        throw new HbarError('STORAGE_WRITER_UNAVAILABLE', 'Storage writer is not serving')
      calls++
      try {
        return await storage.executeRpc(input)
      } finally {
        calls--
      }
    }),
  )
  const hibernateInput = z.strictObject({ operationId: z.string().min(1).max(160), owner: runtimeOwnerSchema })
  const hibernateCheckpoint = hibernateInput.extend({
    databaseCloseAcknowledged: z.literal(true), workerExitConfirmed: z.literal(true), writerLeaseReleased: z.literal(true),
    queuedSessionCount: z.literal(0),
  })
  context.peer.register(
    'storage.hibernate',
    procedure(hibernateInput, hibernateCheckpoint, async ({ operationId, owner }) => {
      const self = context.peer.owner
      if (owner.unitId !== self.unitId || owner.generation !== self.generation || owner.incarnation !== self.incarnation)
        throw new HbarError('STORAGE_IDLE_OWNER_CHANGED', 'Storage checkpoint requires its exact owner')
      if (context.preparing() || !storage || probe || draining || suspended || hibernation || calls)
        throw new HbarError('STORAGE_IDLE_BUSY', 'Storage must quiesce before the explicit checkpoint')
      const ipc = context.peer.snapshot()
      if (ipc.failed || ipc.inFlight || ipc.queued || ipc.queuedBytes || ipc.incoming !== 1 || ipc.incomingQueued || ipc.bufferedBytes)
        throw new HbarError('STORAGE_IDLE_BUSY', 'Storage transport must quiesce before the explicit checkpoint')
      const checkpoint: { readonly operationId: string; phase: 'closing' | 'checkpointed' | 'unknown' } = { operationId, phase: 'closing' }
      hibernation = checkpoint
      draining = true
      const current = storage
      try {
        // The drain seal rejects new business RPC before this bounded queue-existence probe.
        // Nonempty persistent work cannot be called an idle checkpoint.
        const hasQueuedRuns = await current.call('hasQueuedRuns')
        if (hasQueuedRuns) {
          // Only a completed read occurred: this exact pre-close busy boundary is reopenable.
          hibernation = null
          draining = false
          throw new HbarError('STORAGE_IDLE_QUEUE_NOT_EMPTY', 'Storage queue prevents hibernation')
        }
        const closed = await current.closeIdle()
        // closeIdle resolves only after close ACK and Worker exit; the OS writer lock is still held here.
        if (storage !== current || hibernation !== checkpoint || !releaseWriter || calls !== 0 || suspended)
          throw new HbarError('STORAGE_IDLE_OUTCOME_UNKNOWN', 'Storage checkpoint authority changed')
        await releaseWriter()
        releaseWriter = undefined
        storage = undefined
        checkpoint.phase = 'checkpointed'
        return { operationId, owner, ...closed, writerLeaseReleased: true, queuedSessionCount: 0 }
      } catch (error) {
        if (hibernation === checkpoint) checkpoint.phase = 'unknown'
        // Do not release the writer lock or claim eligibility on an uncertain close.
        throw error
      }
    }),
  )
  const maintenance = z.strictObject({ operationId: z.string().min(1).max(160) })
  context.peer.register(
    'storage.suspend',
    procedure(maintenance, z.undefined(), async ({ operationId }) => {
      if (context.preparing() || !storage || draining || suspended || calls)
        throw new HbarError('STORAGE_WRITER_UNAVAILABLE', 'Storage calls must drain before maintenance')
      suspended = operationId
      await storage.call('chatDatabaseMaintenanceBegin', operationId)
      await storage.close()
      storage = undefined
      await releaseWriter?.()
      releaseWriter = undefined
    }),
  )
  context.peer.register(
    'storage.resume',
    procedure(maintenance, z.undefined(), async ({ operationId }) => {
      if (context.preparing() || suspended !== operationId || storage || draining || calls)
        throw new HbarError('STORAGE_RECONCILIATION_REQUIRED', 'The suspended writer identity changed')
      await open()
      suspended = null
    }),
  )
  return {
    async prepare() {
      verify()
      await verifyWorker()
      return {
        contractFingerprint: STORAGE_RPC_FINGERPRINT,
        storageSchema: STORAGE_SCHEMA_VERSION,
        capabilities: ['storage.call', 'storage.suspend', 'storage.resume', 'storage.hibernate', 'storage.catalog'],
      }
    },
    async activate(role) {
      if (role !== 'default')
        throw new HbarError('STORAGE_WRITER_UNAVAILABLE', 'Only the default storage process may own the writer')
      // This process-lifetime OS lease remains held until the Worker has actually exited.
      await open()
      activated = true
    },
    idle() {
      const checkpointed = hibernation?.phase === 'checkpointed'
      const resources = Number(storage !== undefined) + Number(probe !== undefined)
        + Number(releaseWriter !== undefined) + Number(suspended !== null)
        + Number(hibernation !== null && !checkpointed)
      return { eligible: checkpointed && calls === 0 && resources === 0, requests: calls, runs: 0, resources }
    },
    async drain() {
      draining = true
      return { requests: calls, runs: 0, resources: Number(storage !== undefined) + Number(probe !== undefined)
        + Number(releaseWriter !== undefined) + Number(suspended !== null)
        + Number(hibernation !== null && hibernation.phase !== 'checkpointed') }
    },
    async dispose() {
      activated = false
      draining = true
      await probe?.close()
      probe = undefined
      await storage?.close()
      storage = undefined
      await releaseWriter?.()
      releaseWriter = undefined
    },
  }
}
