import { HbarError } from '@hbar/contracts'
import type { StorageMethods, StoragePort } from '@hbar/storage'
import type { StorageCall } from '../packages/storage/src/types'
import { createStorageDatabase } from '../packages/storage/src/worker-database'
import { createStorageWorkerDiagnostics } from '../packages/storage/src/worker-diagnostics'

/** Real repositories and transactions, without a Worker. This does not verify Worker transport/lifecycle. */
export function createInProcessStorage(path: string): StoragePort {
  const database = createStorageDatabase({ path }, { diagnostics: createStorageWorkerDiagnostics({ enabled: false }) })
  let requestId = 0
  let closed = false
  return {
    call<K extends keyof StorageMethods>(method: K, ...args: Parameters<StorageMethods[K]>) {
      return Promise.resolve().then(() => {
        if (closed) throw new HbarError('STORAGE_CLOSED', 'In-process test storage is closed')
        // The generic method and its Parameters tuple are correlated by StoragePort, as at the real RPC boundary.
        const reply = database.handle({ id: ++requestId, method, args } as StorageCall)
        if (!reply.ok) throw new HbarError(reply.code, reply.error)
        // The factory executed this same checked method/tuple; its transport reply deliberately erases the result type.
        return reply.result as ReturnType<StorageMethods[K]>
      })
    },
    close() {
      return Promise.resolve().then(() => {
        if (closed) return
        closed = true
        database.close()
      })
    },
  }
}
