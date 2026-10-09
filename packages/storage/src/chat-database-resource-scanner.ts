import { createHash } from 'node:crypto'
import { lstat, opendir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { HbarError } from '@hbar/contracts'
import type {
  ChatDatabasePreviewItem,
  ChatDatabaseSkipReason,
  ChatDatabaseScope as SettingsScope,
} from '@hbar/contracts/commands/chat-database'
import type { PathLayout } from './path-layout'
import type { StoragePort } from './index'
import { chatDatabaseCacheProtection } from './chat-database-cache-protection'
import { isMissingResource, resourceIdentity, verifyResourcePath } from './chat-database-resource-paths'

export interface ChatDatabaseResourceScanInput {
  kind: 'cache' | 'attachments'
  scope: SettingsScope
  cutoffAt: number
  policyRevisions: Record<string, number>
  protectedRoots: readonly string[]
}
export function createChatDatabaseResourceScanner(layout: PathLayout, storage: StoragePort) {
  return {
    async *scan(input: ChatDatabaseResourceScanInput, signal: AbortSignal): AsyncGenerator<ChatDatabasePreviewItem> {
      if (input.kind === 'cache' && input.scope.kind !== 'global')
        throw new HbarError('INVALID_SCOPE', 'Shared cache reclamation requires global scope')
      const root = input.kind === 'cache' ? layout.cacheRoot : layout.artifacts
      async function* visit(path: string, depth: number): AsyncGenerator<ChatDatabasePreviewItem> {
        signal.throwIfAborted()
        if (depth > 64) throw new HbarError('FILE_LIMIT', 'Resource directory exceeds its depth limit')
        await verifyResourcePath(root, path)
        const directory = await opendir(path)
        for await (const entry of directory) {
          signal.throwIfAborted()
          if (entry.name === '.hbar-reclaims') continue
          const target = join(path, entry.name)
          const resourcePath = relative(root, target).replaceAll('\\', '/')
          const id = input.kind === 'attachments' ? entry.name : createHash('sha256').update(resourcePath).digest('hex')
          if (input.kind === 'attachments' && !/^[a-f0-9]{64}$/.test(id)) continue
          if (
            input.kind === 'attachments' &&
            input.scope.kind !== 'global' &&
            !(await storage.call('chatDatabaseArtifactHasCause', id, input.scope))
          )
            continue
          let reason: ChatDatabaseSkipReason | null = entry.isSymbolicLink() ? 'redirected' : null
          if (!reason && input.kind === 'cache')
            reason = chatDatabaseCacheProtection(root, resourcePath, input.protectedRoots)
          if (entry.isDirectory() && !reason) {
            yield* visit(target, depth + 1)
            continue
          }
          let info
          try {
            info = await lstat(target, { bigint: true })
          } catch (error) {
            if (isMissingResource(error)) continue
            throw error
          }
          if (info.isSymbolicLink()) reason = 'redirected'
          if (!reason && !info.isFile()) reason = 'unknownCategory'
          if (!reason) {
            await verifyResourcePath(root, target)
            if (input.kind === 'attachments') {
              await storage.call(
                'chatDatabaseArtifactSeedLegacy',
                id,
                Math.max(0, Math.floor(Number(info.birthtimeMs))),
                Math.max(0, Math.floor(Number(info.mtimeMs))),
              )
              reason = (await storage.call('chatDatabaseArtifactEligibility', id, input.cutoffAt, input.scope)).reason
            } else if (Number(info.mtimeMs) >= input.cutoffAt) reason = 'retention'
          }
          yield {
            kind: input.kind,
            id,
            title: resourcePath,
            workspaceId: input.scope.kind === 'workspace' ? input.scope.targetId : null,
            expectedSeq: null,
            lastActivityAt: Math.max(0, Math.floor(Number(info.mtimeMs))),
            estimatedBytes: info.isFile() ? Number(info.size) : 0,
            depth,
            policyRevisions: input.policyRevisions,
            eligible: reason === null,
            skipReason: reason,
            ...(info.isFile() && !info.isSymbolicLink() ? { resource: resourceIdentity(resourcePath, info) } : {}),
          }
        }
      }
      yield* visit(root, 0)
    },
  }
}
