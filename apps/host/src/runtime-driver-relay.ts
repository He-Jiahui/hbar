import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type { ExecutionOwnership, RuntimeOwner, RuntimeVersion } from '@hbar/contracts/runtime'
import {
  runtimeDriverStartSchema,
  runtimeDriverCallbackSchema,
  runtimeDriverCancelSchema,
  runtimeDriverStreamSchema,
  runtimeDriverTerminalSchema,
  runtimeDriverSummarySchema,
  runtimeDriverSummaryResultSchema,
} from '@hbar/plugin-sdk/runtime-driver'
import {
  procedure,
  runtimeDomainError,
  type IpcPeer,
  type RuntimeCoordinator,
  type IpcCallOptions,
} from '@hbar/runtime'
import type { DiagnosticEvent } from '@hbar/contracts/diagnostics'
import { driverCallbackCorrelation, observeDriverCallback } from './runtime-driver-callback-diagnostics'
import { RuntimeDriverCallbackAdmission } from './runtime-driver-callback-gate'
import { driverCallbackTimeoutMs, DRIVER_COMPACTION_RPC_TIMEOUT_MS } from './runtime-driver-timeouts'

export interface RuntimeDriverEndpoint {
  readonly peer: IpcPeer
  readonly owner: RuntimeOwner
  readonly version: RuntimeVersion
}
/** Trusted parent lifecycle adapter. Its hold spans the complete operation, including an unknown RPC outcome. */
export interface RuntimeDriverDemand {
  withDefault<Result>(
    signal: AbortSignal,
    operation: (
      endpoint: RuntimeDriverEndpoint,
      dispatch: Pick<IpcCallOptions, 'onDispatchStarted' | 'onDispatchSettled'>,
    ) => Promise<Result>,
  ): Promise<Result>
}
interface Invocation {
  readonly kernel: IpcPeer
  readonly driver: RuntimeDriverEndpoint
  readonly execution: ExecutionOwnership
  readonly signature: string
  readonly acknowledgement: Promise<{ invocationId: string }>
}
export interface RuntimeDriverRelayOptions {
  readonly coordinator: RuntimeCoordinator
  readonly resolve: (version?: RuntimeVersion) => RuntimeDriverEndpoint
  readonly demand?: RuntimeDriverDemand
  readonly onDiagnostic?: (event: DiagnosticEvent) => void
}
/** The base routes plain descriptors between owners. Kernel callbacks and driver functions never leave their processes. */
export class RuntimeDriverRelay {
  private readonly invocations = new Map<string, Invocation>()
  private readonly callbackGates = new Map<string, RuntimeDriverCallbackAdmission>()
  constructor(private readonly options: RuntimeDriverRelayOptions) {}
  attachKernel(peer: IpcPeer): () => void {
    const disposers = [
      peer.register(
        'driver.start',
        procedure(runtimeDriverStartSchema, z.strictObject({ invocationId: z.string() }), (input) => {
          const lease = input.ownership
          if (
            !lease ||
            lease.owner.incarnation !== peer.remote.incarnation ||
            lease.owner.unitId !== peer.remote.unitId ||
            lease.owner.generation !== peer.remote.generation ||
            lease.runId !== input.run.id ||
            lease.sessionId !== input.session.id
          )
            throw new HbarError(
              'EXECUTION_OWNER_MISMATCH',
              'Driver start must belong to the authenticated Kernel executor',
            )
          this.options.coordinator.assertCanWrite(peer.remote, lease)
          const signature = createHash('sha256').update(JSON.stringify(input)).digest('hex')
          const existing = this.invocations.get(input.invocationId)
          if (existing) {
            if (existing.kernel !== peer || existing.signature !== signature)
              throw new HbarError(
                'DRIVER_INVOCATION_CONFLICT',
                'An accepted driver invocation cannot change its owner or payload',
              )
            return existing.acknowledgement
          }
          if (this.invocations.size >= 128)
            throw new HbarError('DRIVER_CAPACITY', 'Bound driver invocation capacity is exhausted')
          const driver = this.options.resolve(lease.versions.driver)
          this.options.coordinator.assertCanWrite(driver.owner, lease)
          // Publish the routing record before the remote driver can call back, even if start acknowledgement is lost.
          const acknowledgement = Promise.resolve()
            .then(() =>
              driver.peer.call('driver.start', input, z.strictObject({ invocationId: z.literal(input.invocationId) })),
            )
            .catch((error: unknown) => {
              const code = runtimeDomainError(error)?.code
              // These replies are emitted before admission. A missing receipt retains physical routing until terminal or exit.
              if (code === 'DRIVER_NOT_SERVING' || code === 'DRIVER_OWNER_MISMATCH' || code === 'DRIVER_CAPACITY')
                this.invocations.delete(input.invocationId)
              throw error
            })
          this.invocations.set(input.invocationId, {
            kernel: peer,
            driver,
            execution: lease,
            signature,
            acknowledgement,
          })
          return acknowledgement
        }),
      ),
      peer.register(
        'driver.summarize',
        procedure(runtimeDriverSummarySchema, runtimeDriverSummaryResultSchema, async (input, call) => {
          const runId = input.request.context?.runId
          const execution = runId ? this.options.coordinator.execution(runId) : null
          if (execution && execution.owner.incarnation !== peer.remote.incarnation)
            throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Summarization belongs to another Kernel executor')
          this.options.coordinator.assertCanWrite(peer.remote, execution ?? undefined)
          if (!execution && this.options.coordinator.role(peer.remote) !== 'default')
            throw new HbarError('RUNTIME_NOT_DEFAULT', 'Unbound summarization requires the current Kernel')
          const summarize = (
            driver: RuntimeDriverEndpoint,
            dispatch: Pick<IpcCallOptions, 'onDispatchStarted' | 'onDispatchSettled'> = {},
          ) => {
            // A cold start can outlive the original caller's authority or cancellation.
            call.signal.throwIfAborted()
            this.options.coordinator.assertCanWrite(peer.remote, execution ?? undefined)
            if (!execution && this.options.coordinator.role(peer.remote) !== 'default')
              throw new HbarError('RUNTIME_NOT_DEFAULT', 'The unbound summary caller was replaced during demand')
            this.options.coordinator.assertCanWrite(driver.owner, execution ?? undefined)
            return driver.peer.call('driver.summarize', input, runtimeDriverSummaryResultSchema, {
              ...dispatch,
              signal: call.signal,
              timeoutMs: DRIVER_COMPACTION_RPC_TIMEOUT_MS,
            })
          }
          // Bound work never wakes a replacement or changes its accepted version/incarnation.
          if (execution) return summarize(this.options.resolve(execution.versions.driver))
          if (this.options.demand) return this.options.demand.withDefault(call.signal, summarize)
          return summarize(this.options.resolve())
        }),
      ),
      peer.onEvent('driver.cancel', runtimeDriverCancelSchema, (input) => {
        const invocation = this.invocations.get(input.invocationId)
        if (invocation?.kernel !== peer) return
        void invocation.driver.peer.notify('driver.cancel', input).catch(() => {
          /* Physical owner exit settles the executor. */
        })
      }),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }
  attachDriver(peer: IpcPeer): () => void {
    const owned = (id: string): Invocation => {
      const invocation = this.invocations.get(id)
      if (!invocation || invocation.driver.owner.incarnation !== peer.remote.incarnation)
        throw new HbarError('DRIVER_INVOCATION_EXPIRED', 'The original physical driver incarnation is unavailable')
      return invocation
    }
    const disposers = [
      peer.register(
        'driver.callback',
        procedure(runtimeDriverCallbackSchema, z.unknown(), (input, call) => {
          const invocation = owned(input.invocationId)
          this.options.coordinator.assertCanWrite(peer.remote, invocation.execution)
          this.options.coordinator.assertCanWrite(invocation.kernel.remote, invocation.execution)
          const rpcId = driverCallbackCorrelation(call.requestId)
          return observeDriverCallback({
            side: 'relay',
            owner: invocation.kernel.remote,
            rpcId,
            invocationId: input.invocationId,
            method: input.method,
            emit: (event) => this.options.onDiagnostic?.(event),
            operation: () => {
              const incarnation = invocation.kernel.remote.incarnation
              let gate = this.callbackGates.get(incarnation)
              if (!gate) {
                gate = new RuntimeDriverCallbackAdmission()
                this.callbackGates.set(incarnation, gate)
              }
              return gate.run(
                input.method,
                call.signal,
                driverCallbackTimeoutMs(input.method),
                ({ timeoutMs, onDispatchSettled }) => {
                  let current: Invocation
                  try {
                    current = owned(input.invocationId)
                    if (current.kernel !== invocation.kernel)
                      throw new HbarError(
                        'EXECUTION_OWNER_MISMATCH',
                        'The callback target changed while awaiting admission',
                      )
                    this.options.coordinator.assertCanWrite(peer.remote, current.execution)
                    this.options.coordinator.assertCanWrite(current.kernel.remote, current.execution)
                  } catch (error) {
                    onDispatchSettled('not-dispatched')
                    throw error
                  }
                  return current.kernel.call('driver.callback', input, z.unknown(), {
                    signal: call.signal,
                    requestId: rpcId,
                    timeoutMs,
                    onDispatchSettled,
                    ownership: current.execution,
                  })
                },
              )
            },
          })
        }),
      ),
      peer.onEvent('driver.stream', runtimeDriverStreamSchema, (input) => {
        if (!this.invocations.has(input.invocationId)) return
        const invocation = owned(input.invocationId)
        try {
          this.options.coordinator.assertExecution(invocation.execution)
        } catch {
          return
        }
        void invocation.kernel.notify('driver.stream', input).catch(() => {
          /* The Kernel owner will reconcile its durable claim. */
        })
      }),
      peer.onEvent('driver.terminal', runtimeDriverTerminalSchema, (input) => {
        if (!this.invocations.has(input.invocationId)) return
        const invocation = owned(input.invocationId)
        void invocation.kernel
          .notify('driver.terminal', input)
          .catch(() => {
            /* A dead executor does not consume a result; physical driver completion remains observed. */
          })
          .finally(() => {
            this.invocations.delete(input.invocationId)
          })
      }),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }
  kernelExited(owner: RuntimeOwner): void {
    this.callbackGates.get(owner.incarnation)?.close()
    this.callbackGates.delete(owner.incarnation)
    for (const [invocationId, invocation] of this.invocations)
      if (invocation.kernel.remote.incarnation === owner.incarnation)
        void invocation.driver.peer
          .notify('driver.cancel', { invocationId, reasonCode: 'EXECUTION_OWNER_REVOKED' })
          .catch(() => {})
  }
  driverExited(owner: RuntimeOwner): void {
    for (const [invocationId, invocation] of this.invocations) {
      if (invocation.driver.owner.incarnation !== owner.incarnation) continue
      this.invocations.delete(invocationId)
      void invocation.kernel
        .notify('driver.terminal', { invocationId, ok: false, reasonCode: 'EXECUTION_OWNER_REVOKED' })
        .catch(() => {})
    }
  }
  snapshot() {
    return { invocations: this.invocations.size }
  }
  hasRun(runId: string): boolean {
    return [...this.invocations.values()].some((value) => value.execution.runId === runId)
  }
}
