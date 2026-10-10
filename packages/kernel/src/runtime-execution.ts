import { AsyncLocalStorage } from 'node:async_hooks'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import type { Run } from '@hbar/contracts'
import type { StorageMethods, StoragePort } from '@hbar/storage'

/** Local composition ports; callbacks remain in the Kernel process, never on the IPC wire. */
export interface KernelExecutionPort {
  claim(sessionId: string): Promise<{ run: Run; lease: ExecutionOwnership } | null>
  /** A null claim can mean a version handoff or reconciliation gate, rather than an idle Session. */
  canIdle?(sessionId: string): Promise<boolean>
  release(lease: ExecutionOwnership): Promise<void>
  interrupted?(lease: ExecutionOwnership, reasonCode: string): Promise<void>
  call<K extends keyof StorageMethods>(
    lease: ExecutionOwnership, method: K, ...args: Parameters<StorageMethods[K]>
  ): Promise<ReturnType<StorageMethods[K]>>
}

export class KernelExecutionScope {
  private readonly context = new AsyncLocalStorage<ExecutionOwnership>()
  private readonly recovery = new AsyncLocalStorage<{ runId: string; recoveryId: string; sessionId: string }>()
  constructor(private readonly execution: KernelExecutionPort | undefined) {}
  get current(): ExecutionOwnership | undefined { return this.context.getStore() }
  get currentRecovery() { return this.recovery.getStore() }
  reconcile<Result>(context: { runId: string; recoveryId: string; sessionId: string }, operation: () => Promise<Result>): Promise<Result> {
    return this.recovery.run(context, operation)
  }
  bind<Args extends unknown[], Result>(operation: (...args: Args) => Result): (...args: Args) => Result {
    const captured = AsyncLocalStorage.snapshot()
    return (...args) => captured(operation, ...args)
  }
  storage(source: StoragePort): StoragePort {
    return {
      call: <K extends keyof StorageMethods>(method: K, ...args: Parameters<StorageMethods[K]>) => {
        const lease = this.context.getStore()
        return lease && this.execution ? this.execution.call(lease, method, ...args) : source.call(method, ...args)
      },
      close: () => source.close(),
    }
  }
  run<Result>(lease: ExecutionOwnership | undefined, operation: () => Promise<Result>): Promise<Result> {
    return lease ? this.context.run(lease, operation) : operation()
  }
  observe<Result>(operation: () => Result): Result { return this.context.exit(operation) }
}
