import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { Storage, createPathLayout, storageRpcCallSchema, STORAGE_SCHEMA_VERSION, STORAGE_RPC_FINGERPRINT } from '@hbar/storage'
import { procedure, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { acquireHostProcessLock } from './process-lock'

const configurationSchema = z.strictObject({
  database: z.string().min(1).max(4_000), dataRoot: z.string().min(1).max(4_000), cacheRoot: z.string().min(1).max(4_000),
  pointerFile: z.string().min(1).max(4_000), settingsRoot: z.string().min(1).max(4_000),
  sessionsRoot: z.string().min(1).max(4_000), skillsRoot: z.string().min(1).max(4_000), identityRoot: z.string().min(1).max(4_000),
  workerPath: z.string().min(1).max(4_000).optional(),
})
export async function create(context: RuntimeProcessContext): Promise<RuntimeProcessService> {
  const configuration = configurationSchema.parse(context.configuration)
  const layout = createPathLayout(configuration.dataRoot, configuration.cacheRoot, configuration.pointerFile, configuration)
  let storage: Storage | undefined
  let releaseWriter: (() => Promise<void>) | undefined
  let calls = 0
  let draining = false
  context.peer.register('storage.call', procedure(storageRpcCallSchema, z.unknown(), async input => {
    if (context.preparing() || !storage || draining) throw new HbarError('STORAGE_WRITER_UNAVAILABLE', 'Storage writer is not serving')
    calls++
    try { return await storage.executeRpc(input) } finally { calls-- }
  }))
  return {
    async prepare() {
      if (existsSync(configuration.database)) {
        const database = new Database(configuration.database, { readonly: true, strict: true })
        try {
          const version = z.object({ user_version: z.number().int() }).parse(database.query('PRAGMA user_version').get()).user_version
          if (version !== STORAGE_SCHEMA_VERSION) throw new HbarError('RESTART_REQUIRED', 'Storage candidate requires an incompatible schema migration')
          const integrity = z.object({ quick_check: z.literal('ok') }).safeParse(database.query('PRAGMA quick_check(1)').get())
          if (!integrity.success) throw new HbarError('STORAGE_INTEGRITY_UNKNOWN', 'Storage candidate could not confirm database integrity')
        } finally { database.close() }
      }
      return { contractFingerprint: STORAGE_RPC_FINGERPRINT, storageSchema: STORAGE_SCHEMA_VERSION, capabilities: ['storage.call'] }
    },
    async activate(role) {
      if (role !== 'default') throw new HbarError('STORAGE_WRITER_UNAVAILABLE', 'Only the default storage process may own the writer')
      // This process-lifetime OS lease remains held until the Worker has actually exited.
      releaseWriter = await acquireHostProcessLock(`${configuration.database}.runtime-writer.lock`).catch(() => {
        throw new HbarError('STORAGE_WRITER_ACTIVE', 'The previous storage process still owns the database writer')
      })
      try {
        if (configuration.workerPath) process.env.HBAR_STORAGE_WORKER = configuration.workerPath
        storage = new Storage(configuration.database, layout, { onFatal: () => process.exit(76) })
        await storage.call('ready')
      } catch (error) {
        await storage?.close()
        await releaseWriter()
        releaseWriter = undefined
        throw error
      }
    },
    async drain() { draining = true; return { requests: calls, runs: 0, resources: storage ? 1 : 0 } },
    async dispose() {
      draining = true
      await storage?.close()
      storage = undefined
      await releaseWriter?.()
      releaseWriter = undefined
    },
  }
}
