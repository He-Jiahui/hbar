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
} from '@hbar/storage'
import type { SettingsService } from './settings-service'
import type { ChatDatabaseStatisticsService } from './chat-database-statistics'
import { resolveChatDatabasePolicy } from './chat-database-policy'

export interface ChatDatabaseCleanupDomainPort {
  protection(sessionId: string): ChatDatabaseSkipReason | null
  removeSession(input: ChatDatabaseDeleteInput): Promise<ChatDatabaseDeleteResult>
  deleted(sessionIds: string[], revision: number): void
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
) {
  let closed = false
  let current: { id: string; controller: AbortController; task: Promise<void> } | null = null
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
  async function preview(id: string, signal: AbortSignal): Promise<void> {
    const start = await storage.call('chatDatabaseOperationRead', id)
    if (await cancelled(id, signal)) {
      await finishCancelled(id)
      return
    }
    if (start.kind !== 'sessions') throw new HbarError('UNSUPPORTED_OPERATION', 'Resource cleanup is not installed')
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
        let reason = candidate.skipReason ?? domain.protection(candidate.id)
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
    if (!state.previewId) throw new HbarError('INVALID_STATE', 'Cleanup requires a fixed preview')
    const previewId = state.previewId
    const fixed = await storage.call('chatDatabaseOperationRead', previewId)
    await storage.call('chatDatabaseOperationUpdate', id, { status: 'running', stage: 'deleting' })
    let after: number | null = state.processedCount || null
    do {
      const page = await storage.call('chatDatabasePreviewPage', { previewId, after, limit: 50 })
      for (let index = 0; index < page.items.length; index++) {
        const item = page.items[index]!
        if (await cancelled(id, signal)) {
          await finishCancelled(id)
          return
        }
        state = await storage.call('chatDatabaseOperationRead', id)
        let reason: ChatDatabaseSkipReason | null = item.eligible ? null : item.skipReason
        let result: ChatDatabaseDeleteResult | null = null
        if (item.eligible) {
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
          if (result?.deleted) domain.deleted([item.id], result.revision)
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
    await storage.call('chatDatabaseOperationUpdate', id, {
      status: 'completed',
      stage: 'finished',
      completedAt: Date.now(),
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
    const task = (
      state.type === 'preview'
        ? preview(state.operationId, controller.signal)
        : cleanup(state.operationId, controller.signal)
    )
      .catch(async (reason: unknown) => {
        const latest = await storage.call('chatDatabaseOperationRead', state.operationId)
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
      .finally(() => {
        if (current?.id === state.operationId) current = null
      })
    current = { id: state.operationId, controller, task }
    void task.catch((error: unknown) => console.error('Chat database journal update failed', error))
  }
  const ready = storage.call('chatDatabasePending').then((pending) => {
    if (pending) launch(pending)
  })
  void ready.catch((error: unknown) => console.error('Chat database recovery failed', error))
  return {
    async preview(input: ChatDatabasePreviewInput, identity: WriteIdentity): Promise<ChatDatabaseOperation> {
      await ready
      if (closed) throw new HbarError('DISPOSED', 'Chat database maintenance is closed')
      if (input.kind !== 'sessions') throw new HbarError('UNSUPPORTED_OPERATION', 'Resource cleanup is not installed')
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
      const saved = await settings.get(fixed.scope)
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
    read: (id: string) => storage.call('chatDatabaseOperationRead', id),
    page: (input: { previewId: string; after?: number | null; limit?: number }) =>
      storage.call('chatDatabasePreviewPage', input).then(({ positions: _positions, ...page }) => page),
    receipt: (identity: WriteIdentity) =>
      storage.call('chatDatabaseOperationReceipt', identity.actorId, identity.idempotencyKey),
    async cancel(id: string, identity: WriteIdentity) {
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
    history: (input: ChatDatabaseHistoryInput) => storage.call('chatDatabaseHistory', input),
    async close(): Promise<void> {
      closed = true
      await ready
      current?.controller.abort(new HbarError('DISPOSED', 'Chat database maintenance is closing'))
      await current?.task
    },
  }
}
export type ChatDatabaseMaintenanceService = ReturnType<typeof createChatDatabaseMaintenanceService>
