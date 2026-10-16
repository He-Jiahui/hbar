import { CommandError } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import {
  type DecisionOperationIdentity,
  type DecisionOperationComplete,
  type DecisionOperation,
} from '@hbar/contracts/commands/decisions'
import type { StoragePort } from '@hbar/storage'

type Result = Extract<DecisionOperation['outcome'], { status: 'succeeded' }>['result']
const unknownResult = () =>
  new CommandError(
    'RESULT_UNKNOWN',
    'Inspect decision.get before issuing a new decision; the original operation has no confirmed receipt',
  )
const safeFailures = new Set([
  'DECISION_CONFLICT',
  'COMMAND_NOT_FOUND',
  'INVALID_INPUT',
  'USER_INPUT_INVALID',
  'PLAN_EXIT_UNAVAILABLE',
  'PLAN_EXIT_DECISION_REQUIRED',
  'PLAN_EXIT_TARGET',
  'PLAN_EXIT_SETTLED',
  'PLAN_EXIT_CANCELLED',
  'USER_CANCELLED',
  'DECISION_EXECUTOR_UNAVAILABLE',
])

function result(state: DecisionOperation): Result {
  if (state.outcome.status === 'pending') throw unknownResult()
  if (state.outcome.status === 'failed') throw new CommandError(state.outcome.error.code, state.outcome.error.message)
  return state.outcome.result
}

/** An acknowledged result survives retransmission and restart. An interrupted intent is never replayed. */
export async function executeDecisionOperation(
  storage: StoragePort,
  identity: DecisionOperationIdentity,
  action: () => Promise<Result>,
): Promise<Result> {
  const admission = await storage.call('decisionOperationBegin', identity).catch(async (error: unknown) => {
    const prior = await storage.call('decisionOperationRead', identity)
    if (!prior) throw error
    return { created: false, state: prior }
  })
  if (!admission.created) return result(admission.state)
  let outcome: DecisionOperationComplete['outcome']
  try {
    outcome = { status: 'succeeded', result: await action() }
  } catch (error) {
    if (!(error instanceof CommandError || error instanceof HbarError) || !safeFailures.has(error.code))
      throw unknownResult()
    outcome = { status: 'failed', error: { code: error.code, message: error.message.slice(0, 512) } }
  }
  const completed = await storage.call('decisionOperationComplete', { ...identity, outcome }).catch(async () => {
    const prior = await storage.call('decisionOperationRead', identity)
    if (!prior || prior.outcome.status === 'pending') throw unknownResult()
    return prior
  })
  return result(completed)
}
