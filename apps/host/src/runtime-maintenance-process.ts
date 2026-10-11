import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import {
  chatDatabaseOperationSchema,
  type ChatDatabaseOperation,
  type ChatDatabaseSkipReason,
} from '@hbar/contracts/commands/chat-database'
import {
  SettingsService,
  createChatDatabaseCommands,
  createChatDatabaseStatisticsService,
  createChatDatabaseMaintenanceService,
  createChatDatabaseArtifactReferenceService,
  createChatDatabaseResourceService,
  createChatDatabaseDatabaseService,
  createChatDatabaseScheduler,
} from '@hbar/kernel/maintenance'
import {
  callStorageRpc,
  createPathLayout,
  createChatDatabaseFileScanner,
  createChatDatabaseMaintenanceWorker,
  chatDatabaseVacuumRecordSchema,
  STORAGE_SCHEMA_VERSION,
  createMaintenanceWorkerPreflight,
  type StoragePort,
  type ChatDatabaseWriterHandover,
} from '@hbar/storage'
import { procedure, RuntimeValuePort, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { acquireHostProcessLock } from './process-lock'
import {
  runtimeMaintenanceConfigurationSchema,
  runtimeMaintenanceDispatchSchema,
  MAINTENANCE_RUNTIME_FINGERPRINT,
} from './runtime-maintenance-contract'

/** All maintenance jobs, scanners, timers and the native SQLite maintenance Worker belong to this process. */
export function create(context: RuntimeProcessContext): RuntimeProcessService {
  const configuration = runtimeMaintenanceConfigurationSchema.parse(context.configuration)
  const layout = createPathLayout(
    configuration.dataRoot,
    configuration.cacheRoot,
    configuration.pointerFile,
    configuration,
  )
  process.env.HBAR_MAINTENANCE_WORKER = configuration.workerPath
  const values = new RuntimeValuePort(context.peer, { prefix: 'maintenance.application' })
  const operations = new Map<string, ChatDatabaseOperation>()
  let releaseWriter: (() => Promise<void>) | undefined
  let probe: ReturnType<typeof createMaintenanceWorkerPreflight> | undefined
  let suspended = false,
    live = false,
    draining = false,
    requests = 0
  const storage: StoragePort = {
    call: (method, ...args) =>
      callStorageRpc(
        {
          execute: async (input) => {
            if (!live || context.preparing())
              throw new HbarError('RUNTIME_PREPARING', 'Maintenance candidates cannot use production storage')
            if (suspended && input.method === 'chatDatabaseOperationRead') {
              const cached = operations.get(z.string().parse(input.args[0]))
              if (cached) return cached
            }
            const result: unknown = await context.peer.call('maintenance.storage', input, z.unknown())
            const parsed = chatDatabaseOperationSchema.safeParse(result)
            const accepted = z.object({ operation: chatDatabaseOperationSchema }).safeParse(result)
            const operation = parsed.success ? parsed.data : accepted.success ? accepted.data.operation : null
            if (operation) {
              if (operations.size >= 256 && !operations.has(operation.operationId))
                operations.delete(operations.keys().next().value ?? '')
              operations.set(operation.operationId, operation)
            }
            return result
          },
        },
        method,
        args,
      ),
    close: async () => {},
  }
  const handover: ChatDatabaseWriterHandover = {
    async begin(operationId) {
      const permission = await context.peer.call(
        'maintenance.writer.begin',
        { operationId },
        z.strictObject({ verificationOnly: z.boolean() }),
        { timeoutMs: 10_000 },
      )
      suspended = true
      releaseWriter = await acquireHostProcessLock(`${layout.database}.runtime-writer.lock`).catch(() => {
        throw new HbarError('STORAGE_WRITER_ACTIVE', 'The previous Worker still owns the database writer')
      })
      return permission
    },
    async end(operationId, receipt) {
      // The Worker run() resolves only after observed exit. Release the OS lease before asking Storage to reopen.
      await releaseWriter?.()
      releaseWriter = undefined
      await context.peer.call('maintenance.writer.end', { operationId, receipt }, z.undefined(), { timeoutMs: 10_000 })
      suspended = false
    },
  }
  const construct = () => {
    const settings = new SettingsService(storage)
    const statistics = createChatDatabaseStatisticsService(storage, settings, createChatDatabaseFileScanner(layout))
    const artifacts = createChatDatabaseArtifactReferenceService(storage, layout.settings, { recover: false })
    const resources = createChatDatabaseResourceService(storage, layout, artifacts, {
      protectedRoots: () => values.call<string[]>('domain.roots', []),
      remove: (input) => values.call('domain.removeResource', [input]),
    })
    const database = createChatDatabaseDatabaseService(storage, layout, {
      idle: () => values.call<boolean>('domain.idle', []),
      maintain: (action) => values.call('domain.maintain', [action]),
      handover,
    })
    const maintenance = createChatDatabaseMaintenanceService(
      storage,
      settings,
      statistics,
      {
        protection: (id) => values.call<ChatDatabaseSkipReason | null>('domain.protection', [id]),
        removeSession: (input) => values.call('domain.removeSession', [input]),
        deleted: async (ids, revision) => {
          await values.call('domain.deleted', [ids, revision])
        },
      },
      resources,
      database,
      {
        recover: false,
        started: (operation) => context.peer.call('maintenance.job.started', { operation }, z.undefined()),
        finished: (operationId) => context.peer.call('maintenance.job.finished', { operationId }, z.undefined()),
      },
    )
    const scheduler = createChatDatabaseScheduler(storage, settings, statistics, maintenance, { start: false })
    const commands = createChatDatabaseCommands(statistics, maintenance, artifacts, scheduler)
    return {
      statistics,
      artifacts,
      maintenance,
      scheduler,
      commands,
      async close() {
        await scheduler.close()
        await maintenance.close()
        await artifacts.close()
        await statistics.close()
        commands.dispose()
      },
    }
  }
  let application = construct()
  const dispatch = async (input: z.infer<typeof runtimeMaintenanceDispatchSchema>, control: boolean) => {
    if (!live || context.preparing()) throw new HbarError('RUNTIME_PREPARING', 'Maintenance is not activated')
    if (
      control &&
      !['chatDatabase.cancel', 'chatDatabase.operation', 'chatDatabase.receipt'].includes(input.invocation.commandId)
    )
      throw new HbarError('INVALID_INPUT', 'Reserved maintenance capacity only accepts control requests')
    if (
      draining &&
      ['chatDatabase.preview', 'chatDatabase.cleanup', 'chatDatabase.inventory.begin'].includes(
        input.invocation.commandId,
      )
    )
      throw new HbarError('RUNTIME_DRAINING', 'New maintenance jobs use the default generation')
    requests++
    try {
      return await application.commands.dispatch(input.invocation, input.actorId)
    } finally {
      requests--
    }
  }
  context.peer.register(
    'maintenance.dispatch',
    procedure(runtimeMaintenanceDispatchSchema, z.unknown(), (input) => dispatch(input, false)),
  )
  context.peer.register(
    'maintenance.control',
    procedure(runtimeMaintenanceDispatchSchema, z.unknown(), (input) => dispatch(input, true)),
  )
  context.peer.register(
    'maintenance.resume',
    procedure(z.strictObject({ recover: z.boolean() }), z.undefined(), async (input) => {
      if (!live || context.preparing() || draining)
        throw new HbarError('RUNTIME_PREPARING', 'Only the serving default resumes maintenance')
      if (input.recover) await application.maintenance.resume()
      application.scheduler.start()
    }),
  )
  context.peer.register(
    'maintenance.verifyWriter',
    procedure(
      z.strictObject({ operationId: z.string().min(1).max(160) }),
      chatDatabaseVacuumRecordSchema,
      async (input) => {
        if (!live || context.preparing() || draining || application.maintenance.currentOperationId())
          throw new HbarError('BUSY', 'Maintenance cannot verify another physical writer')
        const worker = createChatDatabaseMaintenanceWorker(storage, layout, 120_000, handover)
        try {
          return await worker.run(input.operationId, AbortSignal.timeout(120_000))
        } finally {
          await worker.close()
        }
      },
    ),
  )
  return {
    async prepare() {
      const candidateProbe = createMaintenanceWorkerPreflight(layout, configuration.workerPath)
      probe = candidateProbe
      try {
        await candidateProbe.ready
      } finally {
        await candidateProbe.close()
        if (probe === candidateProbe) probe = undefined
      }
      return {
        contractFingerprint: MAINTENANCE_RUNTIME_FINGERPRINT,
        storageSchema: STORAGE_SCHEMA_VERSION,
        capabilities: ['maintenance.dispatch', 'maintenance.control', 'maintenance.resume', 'maintenance.verifyWriter'],
      }
    },
    async activate() {
      await application.close()
      application = construct()
      live = true
    },
    async drain() {
      draining = true
      await application.scheduler.close()
      return { requests, runs: application.maintenance.currentOperationId() ? 1 : 0, resources: releaseWriter ? 1 : 0 }
    },
    async dispose() {
      draining = true
      await probe?.close()
      probe = undefined
      await application.close()
      await releaseWriter?.()
      releaseWriter = undefined
      live = false
      values.dispose()
    },
  }
}
