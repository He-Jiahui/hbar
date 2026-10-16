import { AsyncLocalStorage } from 'node:async_hooks'
import { commandExecutionOwnerSchema, type CommandExecutionOwner } from '@hbar/contracts/command-execution'
import { executionOwnershipSchema, type ExecutionOwnership, type RuntimeOwner } from '@hbar/contracts/runtime'
import { HbarError } from '@hbar/contracts'
import type {
  IpcCallOptions,
  RuntimeCoordinator,
  RuntimeResourceLease,
  StableHostResourceLease,
  RuntimeValuePort,
} from '@hbar/runtime'
import { RUNTIME_APPLICATION_METHODS } from '@hbar/kernel/runtime-application'

export interface HostSourceApplication {
  readonly owner: RuntimeOwner
  readonly callId: string
  readonly signal: AbortSignal
  readonly timeoutMs: number
  readonly port: Pick<RuntimeValuePort, 'call'>
}

export interface HostCommandExecutionScope {
  readonly source: ExecutionOwnership
  readonly beforeStart: (owner: CommandExecutionOwner, signal: AbortSignal) => Promise<void>
  readonly callId?: string
  readonly application?: HostSourceApplication
}

/** Stable Host composition context. No model, network, or child process can supply its actor or source lease. */
export class HostCommandExecutionScopes {
  private readonly context = new AsyncLocalStorage<HostCommandExecutionScope>()
  run<Result>(value: HostCommandExecutionScope, operation: () => Result): Result {
    const source = executionOwnershipSchema.parse(value.source)
    const application = value.application
    if (
      application &&
      (application.owner.unitId !== source.owner.unitId ||
        application.owner.generation !== source.owner.generation ||
        application.owner.incarnation !== source.owner.incarnation ||
        application.callId !== value.callId)
    )
      throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Source application belongs to another Kernel or tool call')
    if (
      application &&
      (!Number.isSafeInteger(application.timeoutMs) || application.timeoutMs < 1 || application.timeoutMs > 1_200_000)
    )
      throw new HbarError('INVALID_INPUT', 'Source application deadline is invalid')
    return this.context.run(
      {
        source,
        beforeStart: value.beforeStart,
        ...(value.callId ? { callId: value.callId } : {}),
        ...(application
          ? {
              application: {
                owner: { ...application.owner },
                callId: application.callId,
                signal: application.signal,
                timeoutMs: application.timeoutMs,
                port: application.port,
              },
            }
          : {}),
      },
      operation,
    )
  }
  hasSource(): boolean {
    return this.context.getStore() !== undefined
  }
  execution(): ExecutionOwnership | undefined {
    const source = this.context.getStore()?.source
    return source ? executionOwnershipSchema.parse(source) : undefined
  }
  applicationOptions(): IpcCallOptions | undefined {
    const application = this.context.getStore()?.application
    if (!application) return undefined
    application.signal.throwIfAborted()
    return {
      signal: application.signal,
      timeoutMs: application.timeoutMs,
      requestId: application.callId,
    }
  }
  invokeApplication<Result>(target: string, method: string, args: readonly unknown[]): Promise<Result> | undefined {
    const scope = this.context.getStore()
    if (!scope || (target !== 'execution' && target !== 'workspaceQuery' && target !== 'git')) return undefined
    if (!(RUNTIME_APPLICATION_METHODS[target] as readonly string[]).includes(method))
      throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Undeclared source application capability')
    const application = scope.application
    if (!application)
      throw new HbarError(
        'COMMAND_SOURCE_APPLICATION_REQUIRED',
        'This command requires its admitted source Kernel capability',
      )
    application.signal.throwIfAborted()
    return application.port.call<Result>(`${target}.${method}`, args, {
      signal: application.signal,
      timeoutMs: application.timeoutMs,
      requestId: application.callId,
    })
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
