import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import {
  Storage,
  createPathLayout,
  storageRpcCallSchema,
  STORAGE_SCHEMA_VERSION,
  STORAGE_RPC_FINGERPRINT,
} from '@hbar/storage'
import { procedure, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { acquireHostProcessLock } from './process-lock'

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
  let suspended: string | null = null
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
    verify()
    releaseWriter = await acquireHostProcessLock(`${configuration.database}.runtime-writer.lock`).catch(() => {
      throw new HbarError('STORAGE_WRITER_ACTIVE', 'The previous storage process still owns the database writer')
    })
    try {
      await verifyWorker()
      if (draining)
        throw new HbarError('STORAGE_WRITER_UNAVAILABLE', 'Storage owner closed before its verified writer opened')
      if (configuration.workerPath) process.env.HBAR_STORAGE_WORKER = configuration.workerPath
      storage = new Storage(configuration.database, layout, { onFatal: () => process.exit(76) })
      await storage.call('ready')
    } catch (error) {
      await storage?.close()
      storage = undefined
      await releaseWriter()
      releaseWriter = undefined
      throw error
    }
  }
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
        capabilities: ['storage.call', 'storage.suspend', 'storage.resume'],
      }
    },
    async activate(role) {
      if (role !== 'default')
        throw new HbarError('STORAGE_WRITER_UNAVAILABLE', 'Only the default storage process may own the writer')
      // This process-lifetime OS lease remains held until the Worker has actually exited.
      await open()
    },
    async drain() {
      draining = true
      return { requests: calls, runs: 0, resources: storage ? 1 : 0 }
    },
    async dispose() {
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
