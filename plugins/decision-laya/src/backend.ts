import type { DecisionCheckpoint, DecisionFailureCode, ParsedDecisionRequest } from '@hbar/contracts/decision'

export class DecisionBackendError extends Error {
  constructor(
    public readonly code: DecisionFailureCode,
    message: string,
  ) {
    super(message)
  }
}

/** stop must settle the owned computation before a new request uses its inference slot. */
export interface DecisionBackend {
  ready(signal: AbortSignal): Promise<void>
  predict(request: ParsedDecisionRequest, signal: AbortSignal): Promise<unknown>
  revision(checkpoint: DecisionCheckpoint): string | null
  stop(): Promise<void>
  dispose(): Promise<void>
}
