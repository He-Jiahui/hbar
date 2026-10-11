import { HbarError } from '@hbar/contracts'
import {
  CHAT_DATABASE_PREVIEW_TTL_MS,
  chatDatabaseOperationSchema,
  type ChatDatabaseOperation,
  type ChatDatabasePreviewItem,
  type ChatDatabasePreviewInput,
  type ChatDatabaseCleanupInput,
  type ChatDatabaseSkipReason,
  type ChatDatabaseHistoryInput,
} from '@hbar/contracts/commands/chat-database'
import type {
  StoragePort,
  ChatDatabaseDeleteInput,
  ChatDatabaseDeleteResult,
  ChatDatabaseCandidateCursor,
  ChatDatabaseCandidatePage,
  ChatDatabaseTaskRuntime,
} from '@hbar/storage'
import type { SettingsService } from './settings-service'
import type { ChatDatabaseStatisticsService } from './chat-database-statistics'
import { resolveChatDatabasePolicy } from './chat-database-policy'
import type { ChatDatabaseResourcePort } from './chat-database-resources'
import type { ChatDatabaseDatabasePort } from './chat-database-database'
import { createChatDatabaseAutomaticPlanner, type ChatDatabaseAutomaticInput } from './chat-database-automatic-plan'

export interface ChatDatabaseCleanupDomainPort {
  protection(sessionId: string): ChatDatabaseSkipReason | null | Promise<ChatDatabaseSkipReason | null>
  removeSession(input: ChatDatabaseDeleteInput): Promise<ChatDatabaseDeleteResult>
  deleted(sessionIds: string[], revision: number): void | Promise<void>
}
export interface ChatDatabaseMaintenanceLifecycle {
  readonly recover?: boolean
  started?(operation: ChatDatabaseOperation): Promise<void>
  finished?(operationId: string): Promise<void>
}
interface WriteIdentity {
  actorId: string
  idempotencyKey: string
}
const sameRevisions = (left: Readonly<Record<string, number>>, right: Readonly<Record<string, number>>) =>
  Object.keys(left).length === Object.keys(right).length &&
  Object.entries(left).every(([key, value]) => right[key] === value)
const yieldBatch = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
function addSkip(
  skipped: ChatDatabaseOperation['skipped'],
  code: ChatDatabaseSkipReason,
): ChatDatabaseOperation['skipped'] {
  const found = skipped.find((item) => item.code === code)
  return found
    ? skipped.map((item) => (item.code === code ? { ...item, count: item.count + 1 } : item))
    : [...skipped, { code, count: 1 }]
}
function operation(
  type: ChatDatabaseOperation['type'],
  input: ChatDatabasePreviewInput,
  previewId: string | null = null,
): ChatDatabaseOperation {
  const now = Date.now()
  return chatDatabaseOperationSchema.parse({
    schemaVersion: 1,
    operationId: crypto.randomUUID(),
    type,
    kind: input.kind,
    scope: input.scope,
    trigger: 'manual',
    status: 'accepted',
    stage: 'pending',
    version: 1,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    previewId,
    expiresAt: null,
    policyRevisions: {},
    candidateCount: 0,
    processedCount: 0,
    deletedCount: 0,
    estimatedBytes: 0,
    reclaimedBytes: 0,
    reusableDatabaseBytes: 0,
    remainingBytes: null,
    targetBytes: null,
    skipped: [],
    cancellationRequested: false,
    error: null,
  })
}

export function createChatDatabaseMaintenanceService(
  storage: StoragePort,
  settings: SettingsService,
  statistics: ChatDatabaseStatisticsService,
  domain: ChatDatabaseCleanupDomainPort,
  resources?: ChatDatabaseResourcePort,
  database?: ChatDatabaseDatabasePort,
  lifecycle: ChatDatabaseMaintenanceLifecycle = {},
) {
  let closed = false
  let current: { id: string; controller: AbortController; task: Promise<void> } | null = null
  const automaticPlan = createChatDatabaseAutomaticPlanner(storage, settings, statistics, domain.protection, resources)
  async function cancelled(id: string, signal: AbortSignal): Promise<boolean> {
    signal.throwIfAborted()
    return (await storage.call('chatDatabaseOperationRead', id)).cancellationRequested
  }
  async function finishCancelled(id: string): Promise<void> {
    await storage.call('chatDatabaseOperationUpdate', id, {
      status: 'cancelled',
      stage: 'finished',
      completedAt: Date.now(),
    })
  }
  const savedPolicy = (state: Pick<ChatDatabaseOperation, 'kind' | 'scope'>) =>
    settings.get(state.kind === 'sessions' ? state.scope : { kind: 'global' })
  async function resourcePreview(start: ChatDatabaseOperation, signal: AbortSignal): Promise<void> {
    if (!resources || (start.kind !== 'cache' && start.kind !== 'attachments'))
      throw new HbarError('UNSUPPORTED_OPERATION', 'Resource cleanup is not installed')
    const id = start.operationId
    if (start.kind === 'cache' && start.scope.kind !== 'global')
      throw new HbarError('INVALID_SCOPE', 'Shared cache requires global scope')
    await storage.call('chatDatabasePreviewReset', id)
    const policy = await savedPolicy(start)
    const rule = resolveChatDatabasePolicy(policy.resolution)
    const cutoffAt =
      start.createdAt - (start.kind === 'cache' ? rule.cacheRetentionDays : rule.attachmentRetentionDays) * 86_400_000
    await storage.call('chatDatabaseOperationUpdate', id, {
      status: 'running',
      stage: 'scanning',
      policyRevisions: policy.revisions,
    })
    await resources.prepare(signal)
    await statistics.readComplete({ kind: 'global' }, signal)
    let candidates = 0
    let processed = 0
    let estimated = 0
    let skipped: ChatDatabaseOperation['skipped'] = []
    let batch: ChatDatabasePreviewItem[] = []
    async function flush(): Promise<void> {
      if (!batch.length) return
      await storage.call('chatDatabasePreviewAppend', id, batch)
      batch = []
      await storage.call('chatDatabaseOperationUpdate', id, {
        candidateCount: candidates,
        totalCount: processed,
        processedCount: processed,
        estimatedBytes: estimated,
        skipped,
      })
      await yieldBatch()
    }
    for await (const item of resources.scan(
      { kind: start.kind, scope: start.scope, cutoffAt, policyRevisions: policy.revisions },
      signal,
    )) {
      if (await cancelled(id, signal)) {
        await flush()
        await finishCancelled(id)
        return
      }
      batch.push(item)
      processed++
      if (item.skipReason) skipped = addSkip(skipped, item.skipReason)
      else {
        candidates++
        estimated += item.estimatedBytes
      }
      if (batch.length >= 50) await flush()
    }
    await flush()
    if (!sameRevisions(policy.revisions, (await savedPolicy(start)).revisions))
      throw new HbarError('POLICY_CHANGED', 'Resource rules changed during preview')
    if (await cancelled(id, signal)) {
      await finishCancelled(id)
      return
    }
    await storage.call('chatDatabaseOperationUpdate', id, {
      status: 'completed',
      stage: 'finished',
      completedAt: Date.now(),
      expiresAt: Date.now() + CHAT_DATABASE_PREVIEW_TTL_MS,
    })
  }
  async function databasePreview(start: ChatDatabaseOperation, signal: AbortSignal): Promise<void> {
    if (!database || start.scope.kind !== 'global')
      throw new HbarError('UNSUPPORTED_OPERATION', 'Database maintenance requires its global worker')
    await storage.call('chatDatabasePreviewReset', start.operationId)
    await storage.call('chatDatabaseOperationUpdate', start.operationId, { status: 'running', stage: 'scanning' })
    const report = await statistics.readComplete({ kind: 'global' }, signal)
    const item = await database.preview(report)
    if (await cancelled(start.operationId, signal)) {
      await finishCancelled(start.operationId)
      return
    }
    await storage.call('chatDatabasePreviewAppend', start.operationId, [item])
    await storage.call('chatDatabaseOperationUpdate', start.operationId, {
      status: 'completed',
      stage: 'finished',
      completedAt: Date.now(),
      expiresAt: Date.now() + CHAT_DATABASE_PREVIEW_TTL_MS,
      policyRevisions: report.policyRevisions,
      candidateCount: Number(item.eligible),
      totalCount: 1,
      processedCount: 1,
      estimatedBytes: item.eligible ? item.estimatedBytes : 0,
      skipped: item.skipReason ? [{ code: item.skipReason, count: 1 }] : [],
    })
  }
  async function databaseCleanup(state: ChatDatabaseOperation, signal: AbortSignal): Promise<void> {
    if (!database || !state.previewId)
      throw new HbarError('UNSUPPORTED_OPERATION', 'Database maintenance worker is missing')
    const page = await storage.call('chatDatabasePreviewPage', { previewId: state.previewId, limit: 1 })
    const item = page.items[0]
    if (!item) throw new HbarError('INVALID_STATE', 'Database maintenance lacks a fixed target')
    if (!item.eligible) {
      await storage.call('chatDatabaseOperationUpdate', state.operationId, {
        status: 'completed',
        stage: 'finished',
        processedCount: 1,
        skipped: item.skipReason ? [{ code: item.skipReason, count: 1 }] : [],
        completedAt: Date.now(),
      })
      return
    }
    if (await cancelled(state.operationId, signal)) {
      await finishCancelled(state.operationId)
      return
    }
    if (!sameRevisions((await savedPolicy(state)).revisions, state.policyRevisions))
      throw new HbarError('POLICY_CHANGED', 'Database maintenance rules changed')
    await storage.call('chatDatabaseOperationUpdate', state.operationId, { status: 'running', stage: 'checkpoint' })
    try {
      const receipt = await database.run(state.operationId, item, signal)
      await storage.call('chatDatabaseOperationUpdate', state.operationId, {
        status: receipt.status,
        stage: 'finished',
        processedCount: 1,
        deletedCount: Number(receipt.didVacuum),
        reclaimedBytes: receipt.reclaimedBytes,
        cancellationRequested: receipt.cancellationRequested,
        completedAt: receipt.status === 'unknown' ? null : Date.now(),
        error: receipt.error,
      })
    } catch (reason) {
      if (!(reason instanceof HbarError && reason.code === 'BUSY')) throw reason
      await storage.call('chatDatabaseOperationUpdate', state.operationId, {
        status: 'completed',
        stage: 'finished',
        processedCount: 1,
        skipped: [{ code: 'inUse', count: 1 }],
        completedAt: Date.now(),
      })
    }
    await statistics.get({ kind: 'global' }, true)
  }
  function overlay(state: ChatDatabaseOperation): ChatDatabaseOperation {
    if (
      state.kind !== 'database' ||
      state.type !== 'cleanup' ||
      ['completed', 'cancelled', 'failed'].includes(state.status)
    )
      return state
    const receipt = database?.progress(state.operationId)
    if (!receipt) return state
    const active = database?.isRunning(state.operationId)
    return {
      ...state,
      stage: active
        ? receipt.stage === 'verifying' || receipt.stage === 'finished'
          ? 'vacuum'
          : receipt.stage
        : 'finished',
      status: active ? (receipt.cancellationRequested ? 'cancelRequested' : 'running') : receipt.status,
      cancellationRequested: receipt.cancellationRequested,
      reclaimedBytes: receipt.reclaimedBytes,
      processedCount: active ? state.processedCount : 1,
      deletedCount: active ? state.deletedCount : Number(receipt.didVacuum),
      completedAt: !active && receipt.status !== 'unknown' ? receipt.updatedAt : state.completedAt,
      updatedAt: Math.max(state.updatedAt, receipt.updatedAt),
      error: receipt.error,
    }
  }
  async function preview(id: string, signal: AbortSignal): Promise<void> {
    const start = await storage.call('chatDatabaseOperationRead', id)
    if (await cancelled(id, signal)) {
      await finishCancelled(id)
      return
    }
    if (start.kind === 'database') return databasePreview(start, signal)
    if (start.kind !== 'sessions') return resourcePreview(start, signal)
    await storage.call('chatDatabasePreviewReset', id)
    const policy = await settings.get(start.scope)
    await storage.call('chatDatabaseOperationUpdate', id, {
      status: 'running',
      stage: 'scanning',
      policyRevisions: policy.revisions,
      candidateCount: 0,
      processedCount: 0,
      estimatedBytes: 0,
      skipped: [],
    })
    await statistics.readComplete(start.scope, signal)
    let after: ChatDatabaseCandidateCursor | null = null
    let candidates = 0
    let processed = 0
    let estimated = 0
    let skipped: ChatDatabaseOperation['skipped'] = []
    do {
      const page: ChatDatabaseCandidatePage = await storage.call('chatDatabaseCandidates', start.scope, after, 100)
      for (const candidate of page.items) {
        if (await cancelled(id, signal)) {
          await finishCancelled(id)
          return
        }
        const session = await storage.call('findSession', candidate.id)
        let reason = candidate.skipReason ?? await domain.protection(candidate.id)
        let revisions: Record<string, number> = {}
        if (!session) reason = 'missing'
        else {
          const saved = await settings.get({ kind: 'session', targetId: session.id })
          revisions = saved.revisions
          const rule = resolveChatDatabasePolicy(saved.resolution)
          if (!reason && start.trigger !== 'manual' && !rule.autoEnabled) reason = 'autoDisabled'
          if (!reason && rule.archivedOnly && !session.archived) reason = 'notArchived'
          if (
            !reason &&
            (candidate.lastActivityAt === null ||
              candidate.lastActivityAt >= start.createdAt - rule.retentionDays * 86_400_000)
          )
            reason = 'retention'
          if (!reason && (await storage.call('chatDatabaseRetainedChild', id, session.id))) reason = 'retainedChild'
        }
        const item: ChatDatabasePreviewItem = {
          ...candidate,
          policyRevisions: revisions,
          eligible: reason === null,
          skipReason: reason,
        }
        await storage.call('chatDatabasePreviewAppend', id, [item])
        processed++
        if (reason) skipped = addSkip(skipped, reason)
        else {
          candidates++
          estimated += candidate.estimatedBytes
        }
      }
      await storage.call('chatDatabaseOperationUpdate', id, {
        candidateCount: candidates,
        totalCount: processed,
        processedCount: processed,
        estimatedBytes: estimated,
        skipped,
      })
      after = page.next
      await yieldBatch()
    } while (after)
    const latest = await settings.get(start.scope)
    if (!sameRevisions(policy.revisions, latest.revisions))
      throw new HbarError('POLICY_CHANGED', 'Cleanup rules changed during preview')
    if (await cancelled(id, signal)) {
      await finishCancelled(id)
      return
    }
    await storage.call('chatDatabaseOperationUpdate', id, {
      status: 'completed',
      stage: 'finished',
      completedAt: Date.now(),
      expiresAt: Date.now() + CHAT_DATABASE_PREVIEW_TTL_MS,
    })
  }
  async function cleanup(id: string, signal: AbortSignal): Promise<void> {
    let state = await storage.call('chatDatabaseOperationRead', id)
    if (state.kind === 'database') return databaseCleanup(state, signal)
    if (!state.previewId) throw new HbarError('INVALID_STATE', 'Cleanup requires a fixed preview')
    const previewId = state.previewId
    const fixed = await storage.call('chatDatabaseOperationRead', previewId)
    const resourcePolicy = resources
      ? resolveChatDatabasePolicy((await settings.get({ kind: 'global' })).resolution)
      : null
    await storage.call('chatDatabaseOperationUpdate', id, { status: 'running', stage: 'deleting' })
    let after: number | null = state.processedCount || null
    do {
      const page =
        fixed.trigger === 'manual'
          ? await storage.call('chatDatabasePreviewPage', { previewId, after, limit: 50 })
          : await storage.call('chatDatabaseAutomaticPlanPage', previewId, after, 50)
      for (let index = 0; index < page.items.length; index++) {
        const item = page.items[index]!
        if (await cancelled(id, signal)) {
          await finishCancelled(id)
          return
        }
        state = await storage.call('chatDatabaseOperationRead', id)
        let reason: ChatDatabaseSkipReason | null = item.eligible ? null : item.skipReason
        let result:
          | (Pick<ChatDatabaseDeleteResult, 'deleted' | 'reason' | 'reclaimedBytes'> & {
              reusableBytes?: number
              revision?: number
            })
          | null = null
        if (item.eligible && item.kind !== 'sessions') {
          result = await storage.call('chatDatabaseResourceReceipt', id, item.kind, item.id)
          if (!result) {
            if (!sameRevisions((await settings.get({ kind: 'global' })).revisions, item.policyRevisions))
              reason = 'policyChanged'
            if (!reason && resources && resourcePolicy)
              result = await resources.remove({
                operationId: id,
                scope: fixed.scope,
                item,
                cutoffAt:
                  fixed.createdAt -
                  (item.kind === 'cache' ? resourcePolicy.cacheRetentionDays : resourcePolicy.attachmentRetentionDays) *
                    86_400_000,
              })
          }
          reason = result?.reason ?? reason
        } else if (item.eligible) {
          const exists = await storage.call('findSession', item.id)
          if (!exists && item.expectedSeq !== null && item.lastActivityAt !== null) {
            result = await domain.removeSession({
              sessionId: item.id,
              operationId: id,
              expectedSeq: item.expectedSeq,
              expectedActivityAt: item.lastActivityAt,
            })
            reason = result.reason
          } else {
            const saved = await settings.get(fixed.scope).catch((error: unknown) => {
              if (error instanceof HbarError && error.code === 'NOT_FOUND') return null
              throw error
            })
            if (!saved || !sameRevisions(saved.revisions, fixed.policyRevisions)) reason = 'policyChanged'
            else {
              if (exists) {
                const local = await settings.get({ kind: 'session', targetId: item.id })
                if (!sameRevisions(local.revisions, item.policyRevisions)) reason = 'policyChanged'
              }
              if (!reason && item.expectedSeq !== null && item.lastActivityAt !== null) {
                result = await domain.removeSession({
                  sessionId: item.id,
                  operationId: id,
                  expectedSeq: item.expectedSeq,
                  expectedActivityAt: item.lastActivityAt,
                })
                reason = result.reason
              }
            }
          }
          if (result?.deleted && result.revision !== undefined) await domain.deleted([item.id], result.revision)
        }
        await storage.call('chatDatabaseOperationUpdate', id, {
          processedCount: page.positions[index]!,
          deletedCount: state.deletedCount + Number(result?.deleted ?? false),
          reclaimedBytes: state.reclaimedBytes + (result?.reclaimedBytes ?? 0),
          reusableDatabaseBytes: state.reusableDatabaseBytes + (result?.reusableBytes ?? 0),
          skipped: reason ? addSkip(state.skipped, reason) : state.skipped,
        })
      }
      after = page.next
      await yieldBatch()
    } while (after)
    if (await cancelled(id, signal)) {
      await finishCancelled(id)
      return
    }
    const report =
      fixed.trigger === 'manual'
        ? null
        : await statistics.readComplete(fixed.scope, signal).catch((reason: unknown) => {
            if (fixed.scope.kind !== 'global' && reason instanceof HbarError && reason.code === 'NOT_FOUND') return null
            throw reason
          })
    state = await storage.call('chatDatabaseOperationRead', id)
    await storage.call('chatDatabaseOperationUpdate', id, {
      status: 'completed',
      stage: 'finished',
      completedAt: Date.now(),
      ...(fixed.trigger === 'manual'
        ? {}
        : {
            remainingBytes: report?.totalBytes ?? 0,
            skipped:
              state.targetBytes !== null && report && report.totalBytes > state.targetBytes
                ? addSkip(state.skipped, 'capacityUnreachable')
                : state.skipped,
          }),
    })
    await statistics.get({ kind: 'global' }, true)
  }
  function launch(state: ChatDatabaseOperation): void {
    if (closed || ['completed', 'cancelled', 'failed'].includes(state.status)) return
    if (current) {
      void current.task
        .then(async () => launch(await storage.call('chatDatabaseOperationRead', state.operationId)))
        .catch((error: unknown) => console.error('Chat database job handoff failed', error))
      return
    }
    const controller = new AbortController()
    const task = Promise.resolve().then(async () => {
      await lifecycle.started?.(state)
      return state.type === 'preview'
        ? preview(state.operationId, controller.signal)
        : state.trigger === 'manual'
          ? cleanup(state.operationId, controller.signal)
          : automatic(state, controller.signal)
    })
      .catch(async (reason: unknown) => {
        const latest = await storage.call('chatDatabaseOperationRead', state.operationId)
        if (['completed', 'cancelled', 'failed'].includes(latest.status)) {
          console.error('Chat database post-operation refresh failed', reason)
          return
        }
        console.error('Chat database operation failed', state.operationId, latest.stage, reason)
        if (!closed && state.type === 'preview' && latest.cancellationRequested) {
          await finishCancelled(state.operationId)
          return
        }
        const unknown = closed || state.type === 'cleanup'
        await storage.call('chatDatabaseOperationUpdate', state.operationId, {
          status: unknown ? 'unknown' : 'failed',
          stage: 'finished',
          error: closed ? 'HOST_RESTARTED' : reason instanceof HbarError ? reason.code : 'CLEANUP_FAILED',
          completedAt: unknown ? null : Date.now(),
        })
      })
      .finally(async () => {
        try { await lifecycle.finished?.(state.operationId) }
        finally { if (current?.id === state.operationId) current = null }
      })
    current = { id: state.operationId, controller, task }
    void task.catch((error: unknown) => console.error('Chat database journal update failed', error))
  }
  let recovered = false
  let recoveryTask: Promise<void> | undefined
  function resume(): Promise<void> {
    if (closed || recovered) return Promise.resolve()
    recoveryTask ??= storage.call('chatDatabasePending').then(pending => {
      if (pending) launch(pending)
      recovered = true
    }).finally(() => { recoveryTask = undefined })
    return recoveryTask
  }
  const ready = lifecycle.recover === false ? Promise.resolve() : resume()
  void ready.catch((error: unknown) => console.error('Chat database recovery failed', error))
  async function automatic(state: ChatDatabaseOperation, signal: AbortSignal): Promise<void> {
    const selected = await storage.call('chatDatabaseAutomaticPlanRead', state.operationId)
    if (!selected?.complete) {
      if (!(await automaticPlan(state, signal))) {
        await finishCancelled(state.operationId)
        return
      }
    }
    await cleanup(state.operationId, signal)
  }
  return {
    resume,
    currentOperationId: () => current?.id ?? null,
    async automatic(
      input: ChatDatabaseAutomaticInput,
      identity: WriteIdentity,
      taskRuntime?: ChatDatabaseTaskRuntime,
    ): Promise<ChatDatabaseOperation> {
      await ready
      if (closed) throw new HbarError('DISPOSED', 'Chat database maintenance is closed')
      const prior = await storage.call('chatDatabaseOperationReceipt', identity.actorId, identity.idempotencyKey)
      if (prior) {
        if (
          prior.trigger !== input.trigger ||
          JSON.stringify(prior.scope) !== JSON.stringify(input.scope) ||
          prior.targetBytes !== input.targetBytes
        )
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'Automatic cleanup key was used with different rules')
        if (taskRuntime)
          await storage.call('chatDatabaseTaskSave', { ...taskRuntime, lastOperationId: prior.operationId })
        return prior
      }
      const saved = await settings.get(input.scope)
      const rule = resolveChatDatabasePolicy(saved.resolution)
      if (!rule.autoEnabled || (input.trigger === 'schedule' ? !rule.scheduleEnabled : !rule.capacityEnabled))
        throw new HbarError('AUTO_DISABLED', 'Automatic cleanup is disabled')
      const initial = operation('cleanup', { scope: input.scope, kind: 'sessions' })
      const accepted = await storage.call('chatDatabaseOperationAccept', {
        ...identity,
        operation: {
          ...initial,
          trigger: input.trigger,
          previewId: initial.operationId,
          targetBytes: input.targetBytes,
          remainingBytes: input.totalBytes,
          policyRevisions: saved.revisions,
        },
        request: JSON.stringify({ type: 'automatic', input }),
        ...(taskRuntime ? { taskRuntime } : {}),
      })
      if (accepted.created) launch(accepted.operation)
      return accepted.operation
    },
    async preview(input: ChatDatabasePreviewInput, identity: WriteIdentity): Promise<ChatDatabaseOperation> {
      await ready
      if (closed) throw new HbarError('DISPOSED', 'Chat database maintenance is closed')
      if (input.kind !== 'sessions' && !(input.kind === 'database' && database) && !resources?.supports(input.kind))
        throw new HbarError('UNSUPPORTED_OPERATION', 'Resource cleanup is not installed')
      if ((input.kind === 'cache' || input.kind === 'database') && input.scope.kind !== 'global')
        throw new HbarError('INVALID_SCOPE', 'Shared resource maintenance requires global scope')
      const accepted = await storage.call('chatDatabaseOperationAccept', {
        ...identity,
        operation: operation('preview', input),
        request: JSON.stringify({ type: 'preview', input }),
      })
      if (accepted.created) launch(accepted.operation)
      return accepted.operation
    },
    async cleanup(input: ChatDatabaseCleanupInput, identity: WriteIdentity): Promise<ChatDatabaseOperation> {
      await ready
      if (closed) throw new HbarError('DISPOSED', 'Chat database maintenance is closed')
      const receipt = await storage.call('chatDatabaseOperationReceipt', identity.actorId, identity.idempotencyKey)
      if (receipt) {
        if (receipt.type !== 'cleanup' || receipt.previewId !== input.previewId)
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'Cleanup key was used with different input')
        return receipt
      }
      const fixed = await storage.call('chatDatabaseOperationRead', input.previewId)
      if (fixed.type !== 'preview' || fixed.status !== 'completed' || !fixed.expiresAt || Date.now() >= fixed.expiresAt)
        throw new HbarError('PREVIEW_EXPIRED', 'Generate a fresh completed preview')
      const saved = await savedPolicy(fixed)
      if (!sameRevisions(saved.revisions, fixed.policyRevisions))
        throw new HbarError('POLICY_CHANGED', 'Cleanup rules changed after preview')
      const accepted = await storage.call('chatDatabaseOperationAccept', {
        ...identity,
        operation: {
          ...operation('cleanup', fixed, fixed.operationId),
          policyRevisions: fixed.policyRevisions,
          candidateCount: fixed.candidateCount,
          totalCount: fixed.totalCount,
          estimatedBytes: fixed.estimatedBytes,
        },
        request: JSON.stringify({ type: 'cleanup', input }),
      })
      if (accepted.created) launch(accepted.operation)
      return accepted.operation
    },
    read: (id: string) => storage.call('chatDatabaseOperationRead', id).then(overlay),
    page: (input: { previewId: string; after?: number | null; limit?: number }) =>
      storage.call('chatDatabasePreviewPage', input).then(({ positions: _positions, ...page }) => page),
    receipt: (identity: WriteIdentity) =>
      storage
        .call('chatDatabaseOperationReceipt', identity.actorId, identity.idempotencyKey)
        .then((state) => (state ? overlay(state) : null)),
    async cancel(id: string, identity: WriteIdentity) {
      if (database?.isRunning(id)) {
        database.cancel(id, identity)
        return {
          ...overlay(await storage.call('chatDatabaseOperationRead', id)),
          status: 'cancelRequested' as const,
          cancellationRequested: true,
        }
      }
      const result = await storage.call('chatDatabaseOperationCancel', id, identity)
      if (current?.id === id && result.type === 'preview')
        current.controller.abort(new HbarError('CANCELLED', 'Preview cancellation requested'))
      if (!current) launch(await storage.call('chatDatabaseOperationRead', id))
      return result
    },
    async reconcile(id: string, identity: WriteIdentity) {
      await storage.call('chatDatabaseOperationReconcile', id, identity)
      const result = await storage.call('chatDatabaseOperationRead', id)
      launch(result)
      return result
    },
    history: (input: ChatDatabaseHistoryInput) =>
      storage.call('chatDatabaseHistory', input).then((page) => ({ ...page, items: page.items.map(overlay) })),
    async close(): Promise<void> {
      closed = true
      await ready
      await recoveryTask
      current?.controller.abort(new HbarError('DISPOSED', 'Chat database maintenance is closing'))
      await current?.task
      await database?.close()
    },
  }
}
export type ChatDatabaseMaintenanceService = ReturnType<typeof createChatDatabaseMaintenanceService>
