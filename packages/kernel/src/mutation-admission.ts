/** Additional Host-owned reconciliation gate; it never grants policy, approval, workspace or sandbox permission. */
export interface ToolMutationAdmissionPort {
  assertAllowed(context: ToolMutationAdmissionContext): Promise<void>
}

export interface ToolMutationAdmissionContext {
  readonly sessionId: string
  readonly runId: string
  readonly callId: string
  readonly tool: string
  readonly effect: 'write' | 'process' | 'network'
  readonly signal: AbortSignal
}
