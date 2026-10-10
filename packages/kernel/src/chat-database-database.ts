import { lstat } from 'node:fs/promises'
import { basename } from 'node:path'
import { HbarError } from '@hbar/contracts'
import type { ChatDatabasePreviewItem, ChatDatabaseStatistics } from '@hbar/contracts/commands/chat-database'
import {
  createChatDatabaseMaintenanceWorker,
  type ChatDatabaseMaintenanceWorkerPort,
  type PathLayout,
  type StoragePort,
  type ChatDatabaseWriterHandover,
} from '@hbar/storage'

export interface ChatDatabaseDatabasePort extends Omit<ChatDatabaseMaintenanceWorkerPort, 'run'> {
  preview(statistics: ChatDatabaseStatistics): Promise<ChatDatabasePreviewItem>
  run(
    operationId: string,
    item: ChatDatabasePreviewItem,
    signal: AbortSignal,
  ): ReturnType<ChatDatabaseMaintenanceWorkerPort['run']>
}
export function createChatDatabaseDatabaseService(
  storage: StoragePort,
  layout: PathLayout,
  domain: {
    idle(): boolean | Promise<boolean>
    maintain<Value>(action: () => Promise<Value>): Promise<Value>
    handover?: ChatDatabaseWriterHandover
  },
): ChatDatabaseDatabasePort {
  const worker = createChatDatabaseMaintenanceWorker(storage, layout, 120_000, domain.handover)
  return {
    ...worker,
    async preview(statistics) {
      const info = await lstat(layout.database, { bigint: true })
      if (!info.isFile() || info.isSymbolicLink()) throw new HbarError('PATH_REDIRECTED', 'Database root is redirected')
      const eligible = await domain.idle()
      return {
        kind: 'database',
        id: 'sqlite',
        title: basename(layout.database),
        workspaceId: null,
        expectedSeq: null,
        lastActivityAt: null,
        estimatedBytes: statistics.history.freePageBytes + statistics.disk.walBytes,
        depth: 0,
        policyRevisions: statistics.policyRevisions,
        eligible,
        skipReason: eligible ? null : 'inUse',
        resource: {
          path: basename(layout.database),
          device: info.dev.toString(),
          inode: info.ino.toString(),
          size: Number(info.size),
          modifiedNs: info.mtimeNs.toString(),
          changedNs: info.ctimeNs.toString(),
        },
      }
    },
    run(id, item, signal) {
      return domain.maintain(async () => {
        const info = await lstat(layout.database, { bigint: true })
        if (
          !item.resource ||
          info.isSymbolicLink() ||
          !info.isFile() ||
          info.dev.toString() !== item.resource.device ||
          info.ino.toString() !== item.resource.inode
        )
          throw new HbarError('PATH_REDIRECTED', 'Previewed database file identity changed')
        return worker.run(id, signal)
      })
    },
  }
}
