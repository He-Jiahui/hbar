import { HbarError } from '@hbar/contracts'
import { Worker } from 'node:worker_threads'
import type { StorageMethods, StorageReply } from './types.ts'
export type { StorageMethods } from './types.ts'
export * from './path-layout.ts'
export * from './session-log-writer.ts'
export * from './session-log-recovery.ts'
export * from './project-registry.ts'
import type { PathLayout } from './path-layout.ts'
export interface StoragePort {
  call<K extends keyof StorageMethods>(
    method: K,
    ...args: Parameters<StorageMethods[K]>
  ): Promise<ReturnType<StorageMethods[K]>>
  close(): Promise<void>
}

export class Storage {
  private worker: Worker
  private nextId = 0
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()
  private stopped = false
  constructor(path: string, layout?: PathLayout) {
    this.worker = new Worker(process.env.HBAR_STORAGE_WORKER ?? new URL('./worker.ts', import.meta.url), {
      workerData: {
        path,
        sessions: layout?.sessions,
        diagnostics: layout?.diagnostics,
      },
    })
    this.worker.on('message', (reply: StorageReply) => {
      const handler = this.pending.get(reply.id)
      if (!handler) return
      this.pending.delete(reply.id)
      if (reply.ok) handler.resolve(reply.result)
      else handler.reject(new HbarError(reply.code, reply.error))
    })
    this.worker.on('error', (event) => {
      this.stopped = true
      for (const handler of this.pending.values())
        handler.reject(new Error(`Storage worker failed: ${event instanceof Error ? event.message : String(event)}`))
      this.pending.clear()
    })
  }
  call<K extends keyof StorageMethods>(
    method: K,
    ...args: Parameters<StorageMethods[K]>
  ): Promise<ReturnType<StorageMethods[K]>> {
    if (this.stopped) return Promise.reject(new Error('Storage is closed'))
    return new Promise((resolve, reject) => {
      const id = ++this.nextId
      this.pending.set(id, { resolve: (value) => resolve(value as ReturnType<StorageMethods[K]>), reject })
      this.worker.postMessage({ id, method, args })
    })
  }
  async close(): Promise<void> {
    if (this.stopped) return
    await this.call('close')
    this.stopped = true
    await this.worker.terminate()
  }
}
