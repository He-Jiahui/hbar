import { HbarError } from '@hbar/contracts'
import { BACKEND_UNATTENDED_VALUE_KEY } from '@hbar/contracts/backend'
import {
  runtimeBackendRecoveryPageSchema,
  type RuntimeBackendRecoveryCursor,
  type RuntimeBackendRecoveryPage,
  type StoragePort,
} from '@hbar/storage'

interface Scan {
  cursor?: RuntimeBackendRecoveryCursor
  page?: RuntimeBackendRecoveryPage
  index: number
}

interface Continuation {
  timer: ReturnType<typeof setTimeout>
  settled: Promise<void>
  settle(): void
}

/** One scan, one coalesced refresh, and at most one queued continuation or executing batch. */
export class BackendRecoveryDiscovery {
  private scan: Scan | undefined
  private refreshRequested = false
  private batch: Promise<void> | undefined
  private continuation: Continuation | undefined
  private canContinue: () => boolean = () => false
  private closed = false

  constructor(
    private readonly storage: StoragePort,
    private readonly resume: (predecessorRunId: string) => Promise<void>,
  ) {}

  get pending(): boolean {
    return this.batch !== undefined || this.continuation !== undefined
  }

  request(canContinue: () => boolean): void {
    if (this.closed) return
    this.canContinue = canContinue
    if (!canContinue()) {
      this.pause()
      return
    }
    if (this.scan) this.refreshRequested = true
    else this.scan = { index: 0 }
    if (!this.batch && !this.continuation) this.startBatch()
  }

  pause(): void {
    this.scan = undefined
    this.refreshRequested = false
    const queued = this.continuation
    if (queued) {
      clearTimeout(queued.timer)
      this.continuation = undefined
      queued.settle()
    }
  }

  close(): void {
    this.closed = true
    this.pause()
  }

  async waitForSettlement(): Promise<void> {
    while (this.pending) {
      if (this.batch) await this.batch
      else if (this.continuation) await this.continuation.settled
    }
  }

  private allowed(): boolean {
    return !this.closed && this.canContinue()
  }

  private startBatch(): void {
    // Install ownership before any read or admission can run, including reentrant callbacks.
    this.batch = Promise.resolve().then(async () => {
      const ownedScan = this.scan
      try {
        await this.runBatch()
      } catch (error) {
        if (this.scan === ownedScan) this.scan = undefined
        console.error(
          '[hbar recovery] backend discovery failed',
          error instanceof HbarError ? error.code : 'BACKEND_RECOVERY_DISCOVERY_FAILED',
        )
      } finally {
        this.batch = undefined
        if (!this.allowed()) this.pause()
        else {
          if (!this.scan && this.refreshRequested) {
            this.refreshRequested = false
            this.scan = { index: 0 }
          }
          if (this.scan) this.queueContinuation()
        }
      }
    })
  }

  private queueContinuation(): void {
    if (this.continuation || this.batch || !this.allowed()) return
    const settled = Promise.withResolvers<void>()
    const timer = setTimeout(() => {
      this.continuation = undefined
      if (this.allowed() && this.scan) this.startBatch()
      else this.pause()
      settled.resolve()
    }, 10)
    timer.unref?.()
    this.continuation = { timer, settled: settled.promise, settle: settled.resolve }
  }

  private async runBatch(): Promise<void> {
    if (!this.allowed() || !this.scan) return
    const ownedScan = this.scan
    const deadline = Date.now() + 2_000
    const layers = await this.storage.call('settingsLayers', ['settings:global'])
    if (!this.allowed() || this.scan !== ownedScan) return
    if (
      !layers.some((layer) => layer.id === 'settings:global' && layer.values[BACKEND_UNATTENDED_VALUE_KEY] === true)
    ) {
      this.scan = undefined
      return
    }
    let pages = 0
    let admissions = 0
    while (this.allowed() && this.scan) {
      // The in-flight operation settles under its existing RPC/admission contract; the deadline starts no more work.
      if (pages + admissions > 0 && Date.now() >= deadline) return
      const current: Scan = this.scan
      if (!current.page) {
        if (pages >= 4) return
        const page = runtimeBackendRecoveryPageSchema.parse(
          await this.storage.call('runtimeBackendRecoveryPage', {
            ...(current.cursor ? { cursor: current.cursor } : {}),
            limit: 32,
          }),
        )
        if (!this.allowed() || this.scan !== current) return
        if (
          page.items.length > 32 ||
          (page.nextCursor &&
            (page.nextCursor.after <= (current.cursor?.after ?? '') ||
              page.nextCursor.after > page.nextCursor.through ||
              (current.cursor && page.nextCursor.through !== current.cursor.through)))
        )
          throw new HbarError('STORAGE_CURSOR_INVALID', 'Backend recovery discovery did not advance its bounded cursor')
        current.page = page
        current.index = 0
        pages++
      }
      const item = current.page.items[current.index]
      if (item) {
        if (admissions >= 32) return
        await this.resume(item.predecessorRunId)
        if (!this.allowed() || this.scan !== current) return
        current.index++
        admissions++
      } else {
        const cursor = current.page.nextCursor
        if (cursor) {
          current.cursor = cursor
          delete current.page
          current.index = 0
        } else this.scan = undefined
      }
    }
  }
}
