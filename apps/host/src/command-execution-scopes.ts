import { AsyncLocalStorage } from 'node:async_hooks'
import { commandExecutionOwnerSchema, type CommandExecutionOwner } from '@hbar/contracts/command-execution'
import { executionOwnershipSchema, type ExecutionOwnership, type RuntimeOwner } from '@hbar/contracts/runtime'
import { HbarError } from '@hbar/contracts'
import type { RuntimeCoordinator, RuntimeResourceLease, StableHostResourceLease } from '@hbar/runtime'

export interface HostCommandExecutionScope {
  readonly source: ExecutionOwnership
  readonly beforeStart: (owner: CommandExecutionOwner, signal: AbortSignal) => Promise<void>
}

/** Stable Host composition context. No model, network, or child process can supply its actor or source lease. */
export class HostCommandExecutionScopes {
  private readonly context = new AsyncLocalStorage<HostCommandExecutionScope>()
  run<Result>(value: HostCommandExecutionScope, operation: () => Result): Result {
    return this.context.run(
      { source: executionOwnershipSchema.parse(value.source), beforeStart: value.beforeStart },
      operation,
    )
  }
  hasSource(): boolean {
    return this.context.getStore() !== undefined
  }
  beforeStart(owner: CommandExecutionOwner): ((signal: AbortSignal) => Promise<void>) | undefined {
    const scope = this.context.getStore()
    if (!scope) return undefined
    const actual = commandExecutionOwnerSchema.parse(owner)
    if (actual.kind === 'runtime') Object.freeze(actual.owner)
    Object.freeze(actual)
    return (signal) => scope.beforeStart(actual, signal)
  }
  retain(coordinator: RuntimeCoordinator, owner: RuntimeOwner, key: string): RuntimeResourceLease | null {
    const scope = this.context.getStore()
    return scope ? coordinator.retainSourceResource(owner, key, scope.source) : coordinator.acquireResource(owner, key)
  }
  retainHost(coordinator: RuntimeCoordinator, instanceId: string, key: string): StableHostResourceLease {
    const scope = this.context.getStore()
    if (!scope) throw new HbarError('EXECUTION_SOURCE_REQUIRED', 'A stable Host resource requires an authenticated Run')
    return coordinator.retainHostSourceResource(instanceId, key, scope.source)
  }
}
