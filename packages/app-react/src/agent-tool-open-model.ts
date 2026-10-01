import { agentToolResultSchema, type AgentToolResult } from '@hbar/contracts/commands/agents'
import type { SessionToolRow } from './session-message-model'

/** Only typed Host details, never JSON text or a guessed tool-call ID, authorize a visible entrance. */
export function agentToolOpenIdentity(row: SessionToolRow, parentSessionId: string): AgentToolResult | null {
  if (row.name !== 'agent' || row.call?.name !== 'agent' || row.result?.name !== 'agent' || row.result.isError)
    return null
  if (row.call.callId !== row.result.callId) return null
  if (row.result.outcome && row.result.outcome.kind !== 'succeeded') return null
  const parsed = agentToolResultSchema.safeParse(row.result.details)
  if (!parsed.success || parsed.data.parentSessionId !== parentSessionId || parsed.data.sessionId === parentSessionId)
    return null
  return parsed.data
}
