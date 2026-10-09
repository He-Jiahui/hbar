import { lstat, opendir } from 'node:fs/promises'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import type {
  ChatDatabaseDraftSyncInput,
  ChatDatabaseInventoryBeginInput,
  ChatDatabaseInventoryFinishInput,
} from '@hbar/contracts/commands/chat-database'
import type { StoragePort } from '@hbar/storage'

interface WriteIdentity {
  actorId: string
  idempotencyKey: string
}
const absent = (reason: unknown) => reason instanceof Error && 'code' in reason && reason.code === 'ENOENT'
export function createChatDatabaseArtifactReferenceService(storage: StoragePort, settingsRoot: string) {
  let closed = false
  let task: Promise<void> | null = null
  async function recover(): Promise<void> {
    let result = await storage.call('chatDatabaseDraftBackfill', 100)
    while (!closed && !result.done) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      result = await storage.call('chatDatabaseDraftBackfill', 100)
    }
    if (closed) return
    let complete = true
    try {
      const root = await lstat(settingsRoot)
      if (root.isSymbolicLink()) complete = false
      else {
        try {
          complete = (await storage.call('chatDatabaseLegacySettingsRefs', 'global', null)).complete && complete
        } catch (reason) {
          if (!absent(reason) && !(reason instanceof HbarError && reason.message.includes('ENOENT'))) complete = false
        }
        for (const scope of ['project', 'session'] as const) {
          const path = join(settingsRoot, scope === 'project' ? 'projects' : 'sessions')
          try {
            if ((await lstat(path)).isSymbolicLink()) {
              complete = false
              continue
            }
            const directory = await opendir(path)
            for await (const entry of directory) {
              if (closed) return
              if (!entry.name.endsWith('.json') || !entry.isFile() || entry.isSymbolicLink()) {
                complete = false
                continue
              }
              const targetId = entry.name.slice(0, -5)
              try {
                complete = (await storage.call('chatDatabaseLegacySettingsRefs', scope, targetId)).complete && complete
              } catch {
                complete = false
              }
            }
          } catch (reason) {
            if (!absent(reason)) complete = false
          }
        }
      }
    } catch (reason) {
      if (!absent(reason)) complete = false
    }
    if (!closed) await storage.call('chatDatabaseLegacySettingsComplete', complete)
  }
  function ensure(): Promise<void> {
    if (closed) return Promise.reject(new HbarError('DISPOSED', 'Attachment reference service is closed'))
    if (task) return task
    const next = (async () => {
      const health = await storage.call('chatDatabaseReferenceHealth')
      if (!health.drafts || !health.legacySettings) await recover()
    })().finally(() => {
      if (task === next) task = null
    })
    task = next
    return next
  }
  const ready = ensure()
  void ready.catch((reason: unknown) => console.error('Attachment reference recovery failed', reason))
  return {
    ensure,
    ready,
    async sync(input: ChatDatabaseDraftSyncInput, identity: WriteIdentity) {
      await ensure()
      return storage.call('chatDatabaseDraftSync', input, identity)
    },
    async begin(input: ChatDatabaseInventoryBeginInput, identity: WriteIdentity) {
      await ensure()
      return storage.call('chatDatabaseInventoryBegin', input, identity)
    },
    async finish(input: ChatDatabaseInventoryFinishInput, identity: WriteIdentity) {
      await ensure()
      return storage.call('chatDatabaseInventoryFinish', input, identity)
    },
    list: (actorId: string, after: string | null, limit: number) =>
      storage.call('chatDatabaseDraftList', actorId, after, limit),
    inventory: (actorId: string) => storage.call('chatDatabaseInventoryRead', actorId),
    async close(): Promise<void> {
      closed = true
      await task?.catch(() => undefined)
    },
  }
}
export type ChatDatabaseArtifactReferenceService = ReturnType<typeof createChatDatabaseArtifactReferenceService>
