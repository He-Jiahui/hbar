import type { DecisionRequest, DecisionResult } from '@hbar/contracts/decision'

/** Host-owned correlation, supplied by the calling plugin, never by model tool arguments. */
export interface DecisionContext {
  sessionId: string
  runId?: string
  stepId?: string
}

/** Advisory inference only. Consumers retain their existing execution and acceptance gates. */
export interface DecisionService {
  evaluate(request: DecisionRequest, signal: AbortSignal, context?: DecisionContext): Promise<DecisionResult>
}
