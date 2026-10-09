import { HbarError } from '@hbar/contracts'
import {
  CHAT_DATABASE_REFRESH_MS,
  chatDatabaseStatisticsSchema,
  type ChatDatabaseDiskUsage,
  type ChatDatabaseScope,
  type ChatDatabaseStatistics,
} from '@hbar/contracts/commands/chat-database'
import type { ChatDatabaseFilesPort, StoragePort } from '@hbar/storage'
import { emptyChatDatabaseDiskUsage } from '@hbar/storage'
import { resolveChatDatabasePolicy } from './chat-database-policy'
import type { SettingsService } from './settings-service'

interface ScanEntry {
  readonly controller: AbortController
  task: Promise<void> | null
  disk: ChatDatabaseDiskUsage
  sampledAt: number
  startedAt: number
  error: string | null
}
function waitForStatistics(task: Promise<void> | null | undefined, signal?: AbortSignal): Promise<void> {
  if (!task) return Promise.resolve()
  if (!signal) return task
  signal.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const abort = () =>
      reject(signal.reason instanceof Error ? signal.reason : new HbarError('CANCELLED', 'Statistics wait cancelled'))
    signal.addEventListener('abort', abort, { once: true })
    void task.then(
      () => {
        signal.removeEventListener('abort', abort)
        resolve()
      },
      (reason: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(reason)
      },
    )
  })
}
export function createChatDatabaseStatisticsService(
  storage: StoragePort,
  settings: SettingsService,
  files: ChatDatabaseFilesPort,
) {
  const scans = new Map<string, ScanEntry>()
  let disposed = false
  let backfill: Promise<void> | null = null
  const key = (scope: ChatDatabaseScope) => (scope.kind === 'global' ? 'global' : `${scope.kind}:${scope.targetId}`)
  const advance = (): Promise<void> => {
    if (backfill) return backfill
    const task = (async () => {
      while (!disposed) {
        if ((await storage.call('chatDatabaseUsageBackfill', 250)).complete) return
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
      throw new HbarError('DISPOSED', 'Chat database statistics are disposed')
    })()
    backfill = task
    void task.then(
      () => {
        if (backfill === task) backfill = null
      },
      () => {
        if (backfill === task) backfill = null
      },
    )
    return task
  }
  function begin(scope: ChatDatabaseScope): ScanEntry {
    if (scans.size >= 8 && !scans.has(key(scope))) {
      const oldest = [...scans.entries()]
        .filter(([, entry]) => entry.task === null)
        .sort((left, right) => left[1].sampledAt - right[1].sampledAt)[0]
      if (!oldest) throw new HbarError('BUSY', 'Too many chat database statistics scans')
      scans.delete(oldest[0])
    }
    const previous = scans.get(key(scope))
    const entry: ScanEntry = {
      controller: new AbortController(),
      task: null,
      disk: previous?.disk ?? emptyChatDatabaseDiskUsage(),
      sampledAt: previous?.sampledAt ?? 0,
      startedAt: Date.now(),
      error: null,
    }
    scans.set(key(scope), entry)
    const timer = setTimeout(
      () => entry.controller.abort(new HbarError('TIMEOUT', 'Chat database statistics scan timed out')),
      600_000,
    )
    entry.task = (async () => {
      try {
        await advance()
        entry.controller.signal.throwIfAborted()
        entry.disk = await files.scan(
          scope,
          {
            artifacts: (after) => storage.call('chatDatabaseArtifactPage', scope, after, 100),
            logs: (after) => storage.call('chatDatabaseLogPage', scope, after, 100),
          },
          entry.controller.signal,
          (disk) => {
            if (!disposed && scans.get(key(scope)) === entry) entry.disk = disk
          },
        )
        entry.sampledAt = Date.now()
        if (!entry.disk.complete) entry.error = 'FILE_SCAN_INCOMPLETE'
      } catch (reason) {
        entry.error = reason instanceof HbarError ? reason.code : 'STATISTICS_FAILED'
      } finally {
        clearTimeout(timer)
        entry.task = null
      }
    })()
    return entry
  }
  async function get(scope: ChatDatabaseScope, refresh = false): Promise<ChatDatabaseStatistics> {
    if (disposed) throw new HbarError('DISPOSED', 'Chat database statistics are disposed')
    const policy = await settings.get(scope)
    const history = await storage.call('chatDatabaseUsage', scope)
    if (disposed) throw new HbarError('DISPOSED', 'Chat database statistics are disposed')
    let entry = scans.get(key(scope))
    if (
      !entry ||
      (entry.task === null &&
        (refresh || Date.now() - Math.max(entry.startedAt, entry.sampledAt) >= CHAT_DATABASE_REFRESH_MS))
    )
      entry = begin(scope)
    const disk = entry.disk
    const complete = entry.task === null && entry.error === null && disk.complete && history.complete
    const totalBytes =
      scope.kind === 'global'
        ? disk.databaseBytes + disk.walBytes + disk.shmBytes + disk.logBytes + disk.attachmentBytes + disk.cacheBytes
        : history.logicalBytes + disk.scopedLogBytes + disk.scopedAttachmentBytes
    return chatDatabaseStatisticsSchema.parse({
      schemaVersion: 1,
      scope,
      sampledAt: entry.sampledAt,
      status: entry.task ? 'scanning' : entry.error ? 'error' : 'ready',
      complete,
      history,
      disk,
      totalBytes,
      totalKind: scope.kind === 'global' ? 'physical' : 'attributable',
      policy: resolveChatDatabasePolicy(policy.resolution),
      policyRevisions: policy.revisions,
      error: entry.error,
    })
  }
  return {
    get,
    async readComplete(scope: ChatDatabaseScope, signal?: AbortSignal): Promise<ChatDatabaseStatistics> {
      await get(scope, true)
      await waitForStatistics(scans.get(key(scope))?.task, signal)
      const result = await get(scope)
      if (!result.complete)
        throw new HbarError(result.error ?? 'STATISTICS_INCOMPLETE', 'Complete statistics are required')
      return result
    },
    async close(): Promise<void> {
      disposed = true
      for (const entry of scans.values()) entry.controller.abort(new HbarError('DISPOSED', 'Statistics are closing'))
      await Promise.all([...scans.values()].map((entry) => entry.task))
      await backfill?.catch(() => undefined)
      scans.clear()
    },
  }
}
export type ChatDatabaseStatisticsService = ReturnType<typeof createChatDatabaseStatisticsService>
