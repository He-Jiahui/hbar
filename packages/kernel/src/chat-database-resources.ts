import { HbarError } from '@hbar/contracts'
import type {
  ChatDatabaseCleanupKind,
  ChatDatabasePreviewItem,
  ChatDatabaseScope as SettingsScope,
} from '@hbar/contracts/commands/chat-database'
import {
  createChatDatabaseResourceScanner,
  type PathLayout,
  type StoragePort,
  type ChatDatabaseResourceResult,
} from '@hbar/storage'
import type { ChatDatabaseArtifactReferenceService } from './chat-database-artifact-references'

export interface ChatDatabaseResourceRequest {
  operationId: string
  scope: SettingsScope
  item: ChatDatabasePreviewItem
  cutoffAt: number
}
export interface ChatDatabaseResourcePort {
  supports(kind: ChatDatabaseCleanupKind): boolean
  prepare(signal: AbortSignal): Promise<void>
  scan(
    input: {
      kind: 'cache' | 'attachments'
      scope: SettingsScope
      cutoffAt: number
      policyRevisions: Record<string, number>
    },
    signal: AbortSignal,
  ): AsyncIterable<ChatDatabasePreviewItem>
  remove(input: ChatDatabaseResourceRequest): Promise<ChatDatabaseResourceResult>
}
export function createChatDatabaseResourceService(
  storage: StoragePort,
  layout: PathLayout,
  references: Pick<ChatDatabaseArtifactReferenceService, 'ensure'>,
  domain: {
    protectedRoots(): string[]
    remove(input: ChatDatabaseResourceRequest): Promise<ChatDatabaseResourceResult>
  },
): ChatDatabaseResourcePort {
  const scanner = createChatDatabaseResourceScanner(layout, storage)
  return {
    supports: (kind) => kind === 'cache' || kind === 'attachments',
    async prepare(signal) {
      signal.throwIfAborted()
      await references.ensure()
      signal.throwIfAborted()
    },
    scan(input, signal) {
      return scanner.scan({ ...input, protectedRoots: domain.protectedRoots() }, signal)
    },
    remove(input) {
      if (input.item.kind !== 'attachments' && input.item.kind !== 'cache')
        throw new HbarError('UNSUPPORTED_OPERATION', 'Resource kind is unsupported')
      return domain.remove(input)
    },
  }
}
