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
  type ChatDatabaseInspectionCheckpoint,
} from '@hbar/kernel/maintenance'
import {
  callStorageRpc,
  createPathLayout,
  createChatDatabaseFileScanner,
  createChatDatabaseMaintenanceWorker,
  chatDatabaseVacuumRecordSchema,
  STORAGE_SCHEMA_VERSION,
  createMaintenanceWorkerPreflight,
  chatDatabaseActiveJournalProofSchema,
  type StoragePort,
  type ChatDatabaseWriterHandover,
} from '@hbar/storage'
import { procedure, RuntimeValuePort, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { acquireHostProcessLock } from './process-lock'
import {
  RuntimePhysicalActivity,
  runtimeMaintenanceIdleCheckpointSchema,
  type RuntimeBackgroundCheckpoint,
} from './runtime-background-idle'
import {
  runtimeMaintenanceConfigurationSchema,
  runtimeMaintenanceDispatchSchema,
  MAINTENANCE_RUNTIME_FINGERPRINT,
} from './runtime-maintenance-contract'
import {
  maintenanceInspectionSourceSchema,
  maintenanceInspectionManifestSchema,
  maintenanceInspectionAckSchema,
  maintenanceInspectionCommitSchema,
  maintenanceInspectionRestoreSchema,
  maintenanceInspectionWakeReplySchema,
  maintenanceInspectionLifecycleGuardSchema,
  type MaintenanceInspectionLifecycleGuard,
  sameMaintenanceAck,
  completeEmptyMaintenanceJournal,
  type MaintenanceInspectionAck,
  type MaintenanceInspectionManifest,
  type MaintenanceInspectionWakeReply,
} from './runtime-maintenance-inspection-contract'

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
  const unresolvedCachedOperations = () =>
    [...operations.values()].filter((operation) => !['completed', 'cancelled', 'failed'].includes(operation.status))
      .length
  const physical = new RuntimePhysicalActivity()
  let writerVerifications = 0
  let transitions = 0
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
            const settle = physical.begin()
            const result: unknown = await context.peer.call('maintenance.storage', input, z.unknown(), {
              onDispatchSettled: settle,
            })
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
      database,
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
  let inspectionPhase: 'active' | 'dormant' | 'sealing' | 'prepared' | 'committed' | 'unknown' =
    context.purpose === 'idle-wake' ? 'dormant' : 'active'
  let inspectionSource: z.infer<typeof maintenanceInspectionSourceSchema> | null = null
  let inspectionAck: MaintenanceInspectionAck | null = null
  let inspectionManifest: MaintenanceInspectionManifest | null = null
  let restoredReply: MaintenanceInspectionWakeReply | null = null
  let lifecycleEpoch: string | null = null
  type InspectionLifecycle =
    | { readonly phase: 'active' }
    | { readonly phase: 'paused'; readonly checkpoint: Promise<ChatDatabaseInspectionCheckpoint> }
  // Single child-owned checkpoint state; active does not manufacture a pause to resume.
  let inspectionLifecycle: InspectionLifecycle = { phase: 'active' }
  const readInspectionLifecycle = (): InspectionLifecycle => inspectionLifecycle
  const requireInspectionLifecycle = (guard: MaintenanceInspectionLifecycleGuard) => {
    const owner = context.peer.owner
    if (
      !live ||
      draining ||
      context.preparing() ||
      inspectionPhase !== 'active' ||
      guard.owner.unitId !== owner.unitId ||
      guard.owner.incarnation !== owner.incarnation ||
      guard.owner.generation !== owner.generation ||
      (inspectionAck !== null && inspectionAck.epoch !== guard.epoch) ||
      (lifecycleEpoch !== null && lifecycleEpoch !== guard.epoch)
    )
      throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Maintenance lifecycle owner or epoch is unavailable')
    lifecycleEpoch = guard.epoch
  }
  context.peer.register(
    'maintenance.inspection.pause',
    procedure(maintenanceInspectionLifecycleGuardSchema, z.undefined(), async (guard) => {
      requireInspectionLifecycle(guard)
      const previous = inspectionLifecycle
      const pause: InspectionLifecycle = {
        phase: 'paused',
        checkpoint: previous.phase === 'paused' ? previous.checkpoint : application.scheduler.quiesceInspection(),
      }
      // A later stop owns a new record even when sharing the same physical quiescence.
      inspectionLifecycle = pause
      try {
        await pause.checkpoint
        requireInspectionLifecycle(guard)
      } catch (error) {
        inspectionPhase = 'unknown'
        throw error
      }
    }),
  )
  context.peer.register(
    'maintenance.inspection.resume',
    procedure(maintenanceInspectionLifecycleGuardSchema, z.undefined(), async (guard) => {
      requireInspectionLifecycle(guard)
      const pause = inspectionLifecycle
      // Ordinary boot, repeated start, and acknowledged idle restore are already active.
      // Identity/epoch/phase validation above still rejects UNKNOWN or committed owners.
      if (pause.phase === 'active') return
      const saved = await pause.checkpoint
      requireInspectionLifecycle(guard)
      const current = readInspectionLifecycle()
      if (current !== pause) {
        if (current.phase === 'active') return // Concurrent start already consumed this exact quiet checkpoint.
        throw new HbarError('BUSY', 'A later stop owns the maintenance checkpoint')
      }
      try {
        application.scheduler.idleRestore(saved)
        application.scheduler.armInspection()
        inspectionLifecycle = { phase: 'active' }
      } catch (error) {
        inspectionPhase = 'unknown'
        throw error
      }
    }),
  )
  const manifest = async (
    source: z.infer<typeof maintenanceInspectionSourceSchema>,
    checkpoint: ChatDatabaseInspectionCheckpoint,
  ) => {
    const journal = chatDatabaseActiveJournalProofSchema.parse(await storage.call('chatDatabaseActiveJournalProof'))
    return maintenanceInspectionManifestSchema.parse({
      version: 1,
      coverage: 'periodic-inspection',
      source,
      checkpoint,
      journal,
    })
  }
  const quietInspection = () => {
    const scheduler = application.scheduler.idleSnapshot(),
      operation = application.maintenance.idleSnapshot()
    const stats = application.statistics.idleSnapshot(),
      artifacts = application.artifacts.idleSnapshot()
    return (
      !requests &&
      !writerVerifications &&
      !physical.snapshot() &&
      !values.snapshot().callbacks &&
      !releaseWriter &&
      !suspended &&
      !probe &&
      !scheduler.current &&
      !operation.currentOperationId &&
      !operation.recoveryPending &&
      !operation.queuedHandoffs &&
      !stats.backfill &&
      !stats.scans &&
      !artifacts.recovering &&
      application.database.idleSnapshot().activeOperationId === null &&
      !unresolvedCachedOperations()
    )
  }
  context.peer.register(
    'maintenance.inspection.preview',
    procedure(maintenanceInspectionSourceSchema, maintenanceInspectionManifestSchema, async (source) => {
      if (
        !live ||
        draining ||
        context.preparing() ||
        inspectionPhase !== 'active' ||
        inspectionLifecycle.phase !== 'active' ||
        transitions ||
        !quietInspection()
      )
        throw new HbarError('BUSY', 'Maintenance inspection cannot be offered')
      const result = await manifest(source, application.scheduler.inspectionCheckpoint())
      if (
        inspectionPhase !== 'active' ||
        inspectionLifecycle.phase !== 'active' ||
        transitions ||
        !quietInspection() ||
        !completeEmptyMaintenanceJournal(result)
      )
        throw new HbarError('BUSY', 'Maintenance inspection changed during preview')
      inspectionSource = source
      return result
    }),
  )
  context.peer.register(
    'maintenance.inspection.quiesce',
    procedure(maintenanceInspectionAckSchema, maintenanceInspectionManifestSchema, async (ack) => {
      if (
        inspectionAck &&
        sameMaintenanceAck(inspectionAck, ack) &&
        inspectionPhase === 'prepared' &&
        inspectionManifest
      )
        return inspectionManifest
      if (
        !live ||
        draining ||
        context.preparing() ||
        inspectionPhase !== 'active' ||
        inspectionLifecycle.phase !== 'active' ||
        transitions ||
        !inspectionSource ||
        (lifecycleEpoch !== null && lifecycleEpoch !== ack.epoch) ||
        ack.source.databaseId !== inspectionSource.databaseId ||
        ack.source.catalogRevision !== inspectionSource.catalogRevision
      )
        throw new HbarError('BUSY', 'Maintenance inspection reservation is unavailable')
      // Parent must already have sealed its dispatch/accept handlers for this exact ACK.
      inspectionPhase = 'sealing'
      inspectionAck = ack
      transitions++
      try {
        const checkpoint = await application.scheduler.quiesceInspection()
        const result = await manifest(ack.source, checkpoint)
        if (inspectionPhase !== 'sealing' || !quietInspection() || !completeEmptyMaintenanceJournal(result))
          throw new HbarError(
            'MAINTENANCE_INSPECTION_UNKNOWN',
            'Maintenance cannot confirm a quiet inspection boundary',
          )
        inspectionManifest = result
        inspectionPhase = 'prepared'
        return result
      } catch (error) {
        inspectionPhase = 'unknown'
        throw error
      } finally {
        transitions--
      }
    }),
  )
  context.peer.register(
    'maintenance.inspection.commit',
    procedure(maintenanceInspectionAckSchema, maintenanceInspectionCommitSchema, (ack) => {
      if (
        !inspectionAck ||
        !sameMaintenanceAck(inspectionAck, ack) ||
        !inspectionManifest ||
        !['prepared', 'committed'].includes(inspectionPhase) ||
        transitions ||
        !quietInspection()
      )
        throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Maintenance commit requires its exact quiet checkpoint')
      inspectionPhase = 'committed'
      return { ack, owner: context.peer.owner }
    }),
  )
  context.peer.register(
    'maintenance.inspection.abort',
    procedure(maintenanceInspectionAckSchema, z.undefined(), async (ack) => {
      // Only Root's positively known parent-abort path may invoke this. No timer-based undo.
      if (
        !inspectionAck ||
        !sameMaintenanceAck(inspectionAck, ack) ||
        !['sealing', 'prepared'].includes(inspectionPhase) ||
        transitions ||
        !quietInspection()
      )
        throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Maintenance transfer cannot be safely aborted')
      const restored = inspectionManifest?.checkpoint ?? application.scheduler.inspectionCheckpoint()
      const result = await manifest(ack.source, restored)
      if (!completeEmptyMaintenanceJournal(result) || !quietInspection()) {
        inspectionPhase = 'unknown'
        throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Maintenance abort lacks a quiet journal')
      }
      application.scheduler.idleRestore(restored)
      application.scheduler.armInspection()
      inspectionPhase = 'active'
      inspectionAck = null
      inspectionManifest = null
      inspectionSource = null
    }),
  )
  context.peer.register(
    'maintenance.inspection.restore',
    procedure(maintenanceInspectionRestoreSchema, maintenanceInspectionWakeReplySchema, async (input) => {
      if (restoredReply && sameMaintenanceAck(restoredReply.ack, input.ack)) {
        const scheduler = application.scheduler.idleSnapshot()
        if (
          !live ||
          draining ||
          context.preparing() ||
          inspectionPhase !== 'active' ||
          inspectionLifecycle.phase !== 'active' ||
          !inspectionAck ||
          !sameMaintenanceAck(inspectionAck, input.ack) ||
          !scheduler.timer ||
          scheduler.paused ||
          scheduler.closed ||
          restoredReply.checkpoint.version !== input.checkpoint.version ||
          restoredReply.checkpoint.cursor !== input.checkpoint.cursor ||
          restoredReply.checkpoint.nextCheckAt !== input.checkpoint.nextCheckAt
        )
          throw new HbarError(
            'MAINTENANCE_INSPECTION_UNKNOWN',
            'The previous restore no longer proves an armed inspection',
          )
        return restoredReply
      }
      if (
        context.purpose !== 'idle-wake' ||
        !live ||
        draining ||
        context.preparing() ||
        inspectionPhase !== 'dormant' ||
        transitions ||
        !quietInspection()
      )
        throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Only an uninitialized idle wake may restore inspection')
      inspectionPhase = 'sealing'
      inspectionAck = input.ack
      transitions++
      try {
        const result = await manifest(input.ack.source, input.checkpoint)
        if (inspectionPhase !== 'sealing' || !quietInspection() || !completeEmptyMaintenanceJournal(result))
          throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Idle restore cannot resume an active journal')
        application.scheduler.idleRestore(input.checkpoint)
        application.scheduler.armInspection()
        const reply = maintenanceInspectionWakeReplySchema.parse({
          ack: input.ack,
          owner: context.peer.owner,
          checkpoint: input.checkpoint,
          timerArmed: true,
        })
        restoredReply = reply
        inspectionPhase = 'active'
        return reply
      } catch (error) {
        inspectionPhase = 'unknown'
        throw error
      } finally {
        transitions--
      }
    }),
  )
  const checkpoint = () => {
    const scheduler = application.scheduler.idleSnapshot()
    const operation = application.maintenance.idleSnapshot()
    const statistics = application.statistics.idleSnapshot()
    const artifacts = application.artifacts.idleSnapshot()
    const database = application.database.idleSnapshot()
    const result: RuntimeBackgroundCheckpoint<{
      scheduler: typeof scheduler
      operation: typeof operation
      statistics: typeof statistics
      artifacts: typeof artifacts
      database: typeof database
    }> = {
      schemaVersion: 1,
      unitId: 'maintenance',
      coverage: 'incomplete',
      alarmsTransferRequired: true,
      requiredDomains: [
        'chatDatabaseTaskScopes/full-page',
        'scope+policyToken+pendingDueAt+lastOperationId',
        'capacity-only/nextCheck',
        'chatDatabasePending/unknown-writer-receipt',
      ],
      nextDueAt: scheduler.nextDueAt,
      state: { scheduler, operation, statistics, artifacts, database },
    }
    return result
  }
  context.peer.register(
    'maintenance.idleCheckpoint',
    procedure(z.undefined(), runtimeMaintenanceIdleCheckpointSchema, () =>
      runtimeMaintenanceIdleCheckpointSchema.parse(checkpoint()),
    ),
  )
  const dispatch = async (input: z.infer<typeof runtimeMaintenanceDispatchSchema>, control: boolean) => {
    if (!live || context.preparing()) throw new HbarError('RUNTIME_PREPARING', 'Maintenance is not activated')
    if (
      control &&
      !['chatDatabase.cancel', 'chatDatabase.operation', 'chatDatabase.receipt'].includes(input.invocation.commandId)
    )
      throw new HbarError('INVALID_INPUT', 'Reserved maintenance capacity only accepts control requests')
    if (inspectionPhase !== 'active' && !control)
      throw new HbarError('MAINTENANCE_INSPECTION_FENCED', 'Maintenance transfer owns new command admission')
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
      if (
        !live ||
        context.preparing() ||
        draining ||
        inspectionLifecycle.phase !== 'active' ||
        context.purpose === 'idle-wake' ||
        inspectionPhase !== 'active'
      )
        throw new HbarError('RUNTIME_PREPARING', 'Only the serving default resumes maintenance')
      transitions++
      try {
        if (input.recover) await application.maintenance.resume()
        application.scheduler.start()
      } finally {
        transitions--
      }
    }),
  )
  context.peer.register(
    'maintenance.pause',
    procedure(z.undefined(), z.undefined(), async () => {
      if (inspectionPhase !== 'active' || inspectionLifecycle.phase !== 'active')
        throw new HbarError('MAINTENANCE_INSPECTION_FENCED', 'Maintenance inspection owns the scheduler checkpoint')
      transitions++
      try {
        await application.scheduler.pause()
      } finally {
        transitions--
      }
    }),
  )
  context.peer.register(
    'maintenance.verifyWriter',
    procedure(
      z.strictObject({ operationId: z.string().min(1).max(160) }),
      chatDatabaseVacuumRecordSchema,
      async (input) => {
        if (
          !live ||
          context.preparing() ||
          draining ||
          inspectionPhase !== 'active' ||
          application.maintenance.currentOperationId() ||
          writerVerifications !== 0 ||
          suspended ||
          releaseWriter !== undefined
        )
          throw new HbarError('BUSY', 'Maintenance cannot verify another physical writer')
        const worker = createChatDatabaseMaintenanceWorker(storage, layout, 120_000, handover)
        writerVerifications++
        try {
          return await worker.run(input.operationId, AbortSignal.timeout(120_000))
        } finally {
          await worker.close()
          writerVerifications--
        }
      },
    ),
  )
  const idle = () => {
    const state = checkpoint().state
    const resources =
      transitions +
      writerVerifications +
      physical.snapshot() +
      values.snapshot().callbacks +
      Number(releaseWriter !== undefined) +
      Number(suspended) +
      Number(probe !== undefined) +
      Number(state.scheduler.timer) +
      Number(state.scheduler.current) +
      Number(state.operation.recoveryPending) +
      state.operation.queuedHandoffs +
      Number(state.statistics.backfill) +
      state.statistics.scans +
      Number(state.artifacts.recovering) +
      Number(state.database.activeOperationId !== null) +
      unresolvedCachedOperations()
    const transferred =
      inspectionPhase === 'committed' &&
      inspectionManifest !== null &&
      completeEmptyMaintenanceJournal(inspectionManifest) &&
      state.scheduler.paused &&
      !state.scheduler.timer
    return {
      eligible: transferred && quietInspection() && resources === 0 && transitions === 0,
      requests,
      runs: Number(state.operation.currentOperationId !== null),
      resources,
    }
  }
  return {
    idle,
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
        capabilities: [
          'maintenance.dispatch',
          'maintenance.control',
          'maintenance.resume',
          'maintenance.verifyWriter',
          'maintenance.inspection.preview',
          'maintenance.inspection.quiesce',
          'maintenance.inspection.commit',
          'maintenance.inspection.abort',
          'maintenance.inspection.restore',
          'maintenance.inspection.pause',
          'maintenance.inspection.resume',
        ],
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
      const state = idle()
      return { requests: state.requests, runs: state.runs, resources: state.resources }
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
