import { HbarError } from '@hbar/contracts'
import { Worker } from 'node:worker_threads'
import type { StorageMethods, StorageReply } from './types.ts'
export type {
  CreateSessionCommandInput,
  ForkSessionCommandInput,
  ForkFromMessageCommandInput,
  ForkFromMessageReceiptInput,
  ForkableMessagesInput,
  ForkableMessagesResult,
  SettingsCommitInput,
  SettingsCommitReceipt,
  StoredSettingsLayer,
  StorageMethods,
  WorkspaceOrganizationMutationInput,
  WorkspaceDisplayNamesMutationInput,
  SessionLaunchTargetMutationInput,
  SessionLaunchTargetReceiptLookup,
  SessionLaunchTargetPreparationInput,
  SessionLaunchTargetPreparationUpdate,
  SessionLaunchTargetBindingInput,
  SessionLaunchTargetBinding,
  SessionLaunchTargetResolutionRecord,
  SessionLaunchTargetRuntimeSnapshot,
  SessionLaunchTargetPreparationStartMutationInput,
  SessionLaunchTargetPreparationOperationRecord,
  SessionLaunchTargetPreparationOperationTransitionInput,
  GuideQueuedRunMutationInput,
  GuideQueuedRunResult,
} from './types.ts'
export * from './path-layout.ts'
export * from './storage-locations.ts'
export { createChatDatabaseFileScanner, emptyChatDatabaseDiskUsage } from './chat-database-files'
export type { ChatDatabaseFilesPort } from './chat-database-files'
export * from './session-log-writer.ts'
export * from './session-log-recovery.ts'
export * from './project-registry.ts'
export type { SessionBranchExecutionRoot, SessionBranchTargetIntent, SessionBranchTargetIdentity, SessionBranchTargetRecord } from './session-branch-target'
import type { PathLayout } from './path-layout.ts'
export interface StoragePort {
  call<K extends keyof StorageMethods>(
    method: K,
    ...args: Parameters<StorageMethods[K]>
  ): Promise<ReturnType<StorageMethods[K]>>
  close(): Promise<void>
}

export interface StorageLifecycleOptions {
  readonly requestTimeoutMs?: number
  readonly closeTimeoutMs?: number
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void
  readonly reject: (error: Error) => void
  readonly timer: ReturnType<typeof setTimeout>
}

function timeoutOption(value: number | undefined, fallback: number): number {
  const timeout = value ?? fallback
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2_147_483_647)
    throw new RangeError('Storage timeout must be a positive timer-safe integer')
  return timeout
}

export class Storage {
  private worker: Worker
  private exited: Promise<void>
  private nextId = 0
  private pending = new Map<number, PendingRequest>()
  private stopped = false
  private closing: Promise<void> | null = null
  private terminating: Promise<void> | null = null
  private readonly requestTimeoutMs: number
  private readonly closeTimeoutMs: number
  constructor(path: string, layout?: PathLayout, lifecycle: StorageLifecycleOptions = {}) {
    this.requestTimeoutMs = timeoutOption(lifecycle.requestTimeoutMs, 30_000)
    this.closeTimeoutMs = timeoutOption(lifecycle.closeTimeoutMs, 5_000)
    const options = {
      workerData: {
        path,
        sessions: layout?.sessions,
        diagnostics: layout?.diagnostics,
        settings: layout?.settings,
      },
    }
    this.worker = process.env.HBAR_STORAGE_WORKER
      ? new Worker(process.env.HBAR_STORAGE_WORKER, options)
      : Bun.isStandaloneExecutable
        ? // Bun only embeds Worker entrypoints referenced by a direct path literal matching the build input.
          new Worker('./packages/storage/src/worker.ts', options)
        : new Worker(new URL('./worker.ts', import.meta.url), options)
    this.exited = new Promise((resolve) => {
      this.worker.once('exit', (code: number) => {
        this.stop(new HbarError('STORAGE_WORKER_EXITED', `Storage worker exited with code ${code}`))
        resolve()
      })
    })
    this.worker.on('message', (reply: StorageReply) => {
      const handler = this.pending.get(reply.id)
      if (!handler) return
      this.pending.delete(reply.id)
      clearTimeout(handler.timer)
      if (reply.ok) handler.resolve(reply.result)
      else handler.reject(new HbarError(reply.code, reply.error))
    })
    this.worker.on('error', (event) => {
      this.stop(
        new HbarError(
          'STORAGE_WORKER_FAILED',
          `Storage worker failed: ${event instanceof Error ? event.message : String(event)}`,
        ),
      )
      void this.terminate().catch(() => {
        // close() awaits the same termination result; no unhandled event-callback rejection.
      })
    })
  }
  call<K extends keyof StorageMethods>(
    method: K,
    ...args: Parameters<StorageMethods[K]>
  ): Promise<ReturnType<StorageMethods[K]>> {
    if (this.stopped || this.closing) return Promise.reject(new HbarError('STORAGE_CLOSED', 'Storage is closed'))
    return this.request(method, args, this.requestTimeoutMs)
  }
  private request<K extends keyof StorageMethods>(
    method: K,
    args: Parameters<StorageMethods[K]>,
    timeoutMs: number,
  ): Promise<ReturnType<StorageMethods[K]>> {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId
      const timer = setTimeout(() => {
        // A timed-out write may have committed. Fail the owner without replaying it or accepting more work.
        this.stop(
          new HbarError(
            'STORAGE_TIMEOUT',
            `Storage ${method} did not reply within ${timeoutMs}ms; result may be unknown`,
          ),
        )
        void this.terminate().catch(() => {
          // The explicit close path reports a failed termination to its caller.
        })
      }, timeoutMs)
      this.pending.set(id, { resolve: (value) => resolve(value as ReturnType<StorageMethods[K]>), reject, timer })
      try {
        this.worker.postMessage({ id, method, args })
      } catch (error) {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(error)
      }
    })
  }
  private stop(error: Error): void {
    this.stopped = true
    for (const handler of this.pending.values()) {
      clearTimeout(handler.timer)
      handler.reject(error)
    }
    this.pending.clear()
  }
  private terminate(): Promise<void> {
    this.terminating ??= this.worker.terminate().then(() => this.exited)
    return this.terminating
  }
  close(): Promise<void> {
    this.closing ??= this.closeWorker()
    return this.closing
  }
  private async closeWorker(): Promise<void> {
    try {
      if (!this.stopped) await this.request('close', [], this.closeTimeoutMs)
    } finally {
      this.stop(new HbarError('STORAGE_CLOSED', 'Storage is closed'))
      await this.terminate()
    }
  }
}
