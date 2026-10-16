import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type { GoalService, PlanService } from '@hbar/plugin-sdk'
import type { runtimePluginAuthoritySchema, runtimePluginInvocationSchema } from './runtime-plugin-contract'

type ObservationMethod = keyof Pick<GoalService & PlanService, 'get' | 'snapshot'>
export interface RuntimePublicObservation {
  readonly sessionId: string
  readonly capability: 'goal' | 'plan'
  readonly method: ObservationMethod
}
const sessionArguments = z.tuple([z.string().min(1).max(160)])

/** Audited pure projections only. Explicit execution never changes into observation authority. */
export function runtimePublicObservation(
  unitId: string,
  authority: z.output<typeof runtimePluginAuthoritySchema>,
  request: z.output<typeof runtimePluginInvocationSchema>,
  args: readonly unknown[],
): RuntimePublicObservation | undefined {
  if (authority.execution || request.workspaceExecutionScope || request.operation !== 'capability') return undefined
  if (request.method !== 'get' && request.method !== 'snapshot') return undefined
  const capability = unitId === 'plugin.goal' ? 'goal' : unitId === 'plugin.plan' ? 'plan' : undefined
  if (!capability || request.name !== capability) return undefined
  const [sessionId] = sessionArguments.parse(args)
  if (sessionId !== authority.sessionId)
    throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Observation must retain its routed Session')
  return { sessionId, capability, method: request.method }
}

/** The four audited methods need only this read. Fail closed if their implementation changes. */
export function assertRuntimePublicObservationCallback(
  observation: RuntimePublicObservation,
  method: string,
  args: readonly unknown[],
): void {
  if (method !== 'sessions.get')
    throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Observation cannot invoke an execution or mutation callback')
  const [sessionId] = sessionArguments.parse(args)
  if (sessionId !== observation.sessionId)
    throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Observation callback must retain its original Session')
}
