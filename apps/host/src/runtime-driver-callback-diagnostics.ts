import { diagnosticEvent } from '@hbar/contracts/diagnostics'
import type { DiagnosticEvent } from '@hbar/contracts/diagnostics'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import type { RuntimeDriverCallbackValue } from '@hbar/plugin-sdk/runtime-driver'
import { DRIVER_CALLBACK_ADMISSION_CONTRACT, type CallbackAdmissionObserver } from './runtime-driver-callback-gate'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function driverCallbackCorrelation(value?: string): string {
  return value && uuid.test(value) ? value : crypto.randomUUID()
}

/** Named metadata only; never retain callback payloads or raw error descriptions. */
export async function observeDriverCallback<Value>(input: {
  readonly side: 'source' | 'relay'
  readonly owner: RuntimeOwner
  readonly rpcId: string
  readonly invocationId: string
  readonly runId?: string | undefined
  readonly sessionId?: string | undefined
  readonly method: RuntimeDriverCallbackValue['method']
  readonly emit: (event: DiagnosticEvent) => void
  readonly operation: (observe: CallbackAdmissionObserver) => Promise<Value>
}): Promise<Value> {
  const started = performance.now()
  const rpcId = driverCallbackCorrelation(input.rpcId)
  const emit = (phase: 'started' | 'settled', outcome: 'success' | 'failure', errorCode?: string) => {
    try {
      input.emit(
        diagnosticEvent({
          component: 'host',
          level: outcome === 'failure' ? 'error' : 'debug',
          event: 'host.runtime_driver_callback',
          phase: `${input.side}_${phase}`,
          contextId: input.owner.unitId,
          requestId: input.owner.incarnation,
          rpcId,
          ...(uuid.test(input.invocationId) ? { callId: input.invocationId } : {}),
          ...(input.runId && uuid.test(input.runId) ? { runId: input.runId } : {}),
          ...(input.sessionId && uuid.test(input.sessionId) ? { sessionId: input.sessionId } : {}),
          method: `driver.callback.${input.method}`,
          durationMs: Math.max(0, performance.now() - started),
          outcome,
          ...(errorCode ? { errorCode } : {}),
        }),
      )
    } catch {
      /* Observers never own callback execution. */
    }
  }
  const observe: CallbackAdmissionObserver = (event) => {
    try {
      const failed = Boolean(event.errorCode) || event.phase === 'transport_send_failed'
      input.emit(
        diagnosticEvent({
          component: 'host',
          level: failed ? 'error' : 'debug',
          event: 'host.runtime_driver_callback',
          phase: input.side + '_' + event.phase,
          contextId: input.owner.unitId,
          requestId: input.owner.incarnation,
          rpcId,
          ...(uuid.test(input.invocationId) ? { callId: input.invocationId } : {}),
          ...(input.runId && uuid.test(input.runId) ? { runId: input.runId } : {}),
          ...(input.sessionId && uuid.test(input.sessionId) ? { sessionId: input.sessionId } : {}),
          method: 'driver.callback.' + input.method,
          durationMs: event.elapsedMs,
          admissionLane: DRIVER_CALLBACK_ADMISSION_CONTRACT.leafMethods.some((method) => method === input.method)
            ? 'leaf'
            : 'recursive',
          callbackStage: event.stage,
          admissionActive: event.active,
          admissionUnconfirmed: event.unconfirmed,
          queueDepth: event.queued,
          budgetMs: event.budgetMs,
          remainingBudgetMs: event.remainingBudgetMs,
          outcome: failed ? 'failure' : 'success',
          ...(event.errorCode ? { errorCode: event.errorCode } : {}),
        }),
      )
    } catch {
      /* Fixed metadata observation cannot change execution. */
    }
  }
  emit('started', 'success')
  try {
    const value = await input.operation(observe)
    emit('settled', 'success')
    return value
  } catch (error) {
    let code: unknown
    try {
      code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    } catch {
      /* Untrusted error access cannot replace its original identity. */
    }
    emit(
      'settled',
      'failure',
      code === 'IPC_TIMEOUT' ? 'IPC_TIMEOUT' : code === 'IPC_CANCELLED' ? 'IPC_CANCELLED' : 'DRIVER_CALLBACK_FAILED',
    )
    throw error
  }
}
