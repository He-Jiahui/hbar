/**
 * Process-local admission state for steering messages.
 *
 * The canonical messages and guided Run transition live in the session journal
 * and SQLite projection. This gate is deliberately ephemeral: a restarted
 * storage Worker starts closed and must be reopened by the current driver.
 * Keeping it here prevents a stale driver from reopening a drained Run while
 * the Run is still alive, without adding a durable table or migration.
 */

export const RUN_STEERING_MAX_PENDING = 20

interface GateState {
  readonly runId: string
  closed: boolean
  readonly pendingMessageIds: Set<string>
}

export type RunSteeringGateResult = 'opened' | 'already-open'

export class RunSteeringRegistry {
  private readonly gates = new Map<string, GateState>()

  open(sessionId: string, runId: string): RunSteeringGateResult | 'closed' | 'conflict' | 'capacity' {
    const existing = this.gates.get(sessionId)
    if (existing) {
      if (existing.runId !== runId) return 'conflict'
      if (existing.closed) return 'closed'
      return 'already-open'
    }
    if (this.gates.size >= 4_096) return 'capacity'
    this.gates.set(sessionId, { runId, closed: false, pendingMessageIds: new Set() })
    return 'opened'
  }

  close(sessionId: string, runId: string): 'closed' | 'already-closed' | 'conflict' {
    const existing = this.gates.get(sessionId)
    if (!existing) {
      return 'already-closed'
    }
    if (existing.runId !== runId) return 'conflict'
    if (existing.closed) return 'already-closed'
    existing.closed = true
    existing.pendingMessageIds.clear()
    return 'closed'
  }

  retire(sessionId: string, runId: string): void {
    const existing = this.gates.get(sessionId)
    if (existing?.runId === runId) this.gates.delete(sessionId)
  }

  isOpen(sessionId: string, runId: string): boolean {
    const gate = this.gates.get(sessionId)
    return Boolean(gate && gate.runId === runId && !gate.closed)
  }

  canAdmit(sessionId: string, runId: string): boolean {
    const gate = this.gates.get(sessionId)
    return Boolean(
      gate && gate.runId === runId && !gate.closed && gate.pendingMessageIds.size < RUN_STEERING_MAX_PENDING,
    )
  }

  /** Whether this owner still has accepted messages that the caller has not acknowledged. */
  hasPending(sessionId: string, runId: string): boolean {
    const gate = this.gates.get(sessionId)
    return Boolean(gate && gate.runId === runId && gate.pendingMessageIds.size > 0)
  }

  admit(sessionId: string, runId: string, messageId: string): void {
    const gate = this.gates.get(sessionId)
    if (!gate || gate.runId !== runId || gate.closed) return
    gate.pendingMessageIds.add(messageId)
  }

  acknowledge(sessionId: string, runId: string, messageIds: readonly string[]): void {
    const gate = this.gates.get(sessionId)
    if (!gate || gate.runId !== runId) return
    for (const messageId of messageIds) gate.pendingMessageIds.delete(messageId)
  }
}
