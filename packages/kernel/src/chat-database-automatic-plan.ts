import { HbarError } from '@hbar/contracts'
import type {
  ChatDatabaseOperation,
  ChatDatabasePreviewItem,
  ChatDatabaseSkipReason,
} from '@hbar/contracts/commands/chat-database'
import type { StoragePort, ChatDatabaseCandidateCursor, ChatDatabaseCandidatePage } from '@hbar/storage'
import type { SettingsService } from './settings-service'
import type { ChatDatabaseStatisticsService } from './chat-database-statistics'
import type { ChatDatabaseResourcePort } from './chat-database-resources'
import { resolveChatDatabasePolicy } from './chat-database-policy'

export interface ChatDatabaseAutomaticInput {
  scope: ChatDatabaseOperation['scope']
  trigger: 'schedule' | 'capacity'
  totalBytes: number
  targetBytes: number | null
}
const same = (left: Record<string, number>, right: Record<string, number>) =>
  Object.keys(left).length === Object.keys(right).length &&
  Object.entries(left).every(([key, value]) => right[key] === value)

export function createChatDatabaseAutomaticPlanner(
  storage: StoragePort,
  settings: SettingsService,
  statistics: ChatDatabaseStatisticsService,
  protection: (id: string) => ChatDatabaseSkipReason | null,
  resources?: ChatDatabaseResourcePort,
) {
  return async function plan(start: ChatDatabaseOperation, signal: AbortSignal): Promise<boolean> {
    const id = start.operationId
    const check = async () => {
      signal.throwIfAborted()
      return (await storage.call('chatDatabaseOperationRead', id)).cancellationRequested
    }
    let selection = await storage.call('chatDatabaseAutomaticPlanRead', id)
    if (!selection) {
      await storage.call('chatDatabasePreviewReset', id)
      await storage.call('chatDatabaseOperationUpdate', id, {
        status: 'running',
        stage: 'scanning',
        processedCount: 0,
        candidateCount: 0,
        totalCount: 0,
        estimatedBytes: 0,
        skipped: [],
      })
      const root = await settings.get(start.scope)
      if (!same(root.revisions, start.policyRevisions))
        throw new HbarError('POLICY_CHANGED', 'Automatic cleanup rules changed before planning')
      await statistics.readComplete(start.scope, signal)
      let candidates = 0
      let total = 0
      let estimated = 0
      const skipped = new Map<ChatDatabaseSkipReason, number>()
      async function append(items: ChatDatabasePreviewItem[]) {
        await storage.call('chatDatabasePreviewAppend', id, items)
        for (const item of items) {
          total++
          if (item.skipReason) skipped.set(item.skipReason, (skipped.get(item.skipReason) ?? 0) + 1)
          else {
            candidates++
            estimated += item.estimatedBytes
          }
        }
      }
      if (resources && start.scope.kind === 'global') {
        await resources.prepare(signal)
        const rule = resolveChatDatabasePolicy(root.resolution)
        for (const kind of ['cache', 'attachments'] as const) {
          let batch: ChatDatabasePreviewItem[] = []
          for await (const item of resources.scan(
            {
              kind,
              scope: start.scope,
              policyRevisions: root.revisions,
              cutoffAt:
                start.createdAt -
                (kind === 'cache' ? rule.cacheRetentionDays : rule.attachmentRetentionDays) * 86_400_000,
            },
            signal,
          )) {
            if (await check()) return false
            batch.push(item)
            if (batch.length >= 50) {
              await append(batch)
              batch = []
              await new Promise<void>((resolve) => setTimeout(resolve, 0))
            }
          }
          if (batch.length) await append(batch)
        }
      }
      let after: ChatDatabaseCandidateCursor | null = null
      do {
        const page: ChatDatabaseCandidatePage = await storage.call('chatDatabaseCandidates', start.scope, after, 100)
        for (const candidate of page.items) {
          if (await check()) return false
          const session = await storage.call('findSession', candidate.id)
          let reason = candidate.skipReason ?? protection(candidate.id)
          let revisions: Record<string, number> = {}
          if (!session) reason = 'missing'
          else {
            const saved = await settings.get({ kind: 'session', targetId: session.id })
            revisions = saved.revisions
            const rule = resolveChatDatabasePolicy(saved.resolution)
            if (!reason && !rule.autoEnabled) reason = 'autoDisabled'
            if (!reason && rule.archivedOnly && !session.archived) reason = 'notArchived'
            if (
              !reason &&
              !(start.trigger === 'capacity' && rule.capacityFirst) &&
              (candidate.lastActivityAt === null ||
                candidate.lastActivityAt >= start.createdAt - rule.retentionDays * 86_400_000)
            )
              reason = 'retention'
            if (!reason && (await storage.call('chatDatabaseRetainedChild', id, session.id))) reason = 'retainedChild'
          }
          await append([{ ...candidate, policyRevisions: revisions, eligible: reason === null, skipReason: reason }])
        }
        after = page.next
        await storage.call('chatDatabaseOperationUpdate', id, {
          candidateCount: candidates,
          totalCount: total,
          estimatedBytes: estimated,
          skipped: [...skipped].map(([code, count]) => ({ code, count })),
        })
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      } while (after)
      if (!same(root.revisions, (await settings.get(start.scope)).revisions))
        throw new HbarError('POLICY_CHANGED', 'Automatic cleanup rules changed during planning')
    }
    const budget = start.targetBytes === null ? null : Math.max(0, (start.remainingBytes ?? 0) - start.targetBytes)
    do {
      if (await check()) return false
      const next = await storage.call('chatDatabaseAutomaticPlanStep', id, budget)
      selection = { ...next, budgetBytes: budget, complete: Number(next.complete) }
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    } while (!selection.complete)
    const state = await storage.call('chatDatabaseOperationRead', id)
    const excluded = state.candidateCount - selection.selectedCount
    await storage.call('chatDatabaseOperationUpdate', id, {
      status: 'running',
      stage: 'deleting',
      candidateCount: selection.selectedCount,
      totalCount: selection.selectedCount,
      estimatedBytes: selection.plannedBytes,
      skipped: excluded > 0 ? [...state.skipped, { code: 'capacityTarget', count: excluded }] : state.skipped,
    })
    return true
  }
}
