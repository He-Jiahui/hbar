import { z } from 'zod'
import type { Database } from 'bun:sqlite'
import type { Approval } from '@hbar/contracts'
import { approvalAutomationContextSchema } from '@hbar/contracts/autonomy'
import { delegatedApprovalSubjectSchema } from '@hbar/contracts/delegated-approval'
import type { DelegatedInputIdentity } from '@hbar/contracts/delegated-user-input'

export const DELEGATED_APPROVAL_INDEX = `CREATE INDEX IF NOT EXISTS events_approval_request_identity
  ON events(sessionId, json_extract(data, '$.id')) WHERE type='approval.requested'`

/** Read only the original durable request; later chat or decision events cannot supply admission. */
export function createDelegatedApprovalSource(db: Database, approval: (id: string) => Approval) {
  const request = db.query<{ data: string }, [string, string]>(
    `SELECT data FROM events WHERE sessionId=? AND json_extract(data, '$.id')=?
      AND type='approval.requested' ORDER BY seq LIMIT 1`,
  )
  const contextSchema = z.object({ status: z.literal('pending'), automationContext: approvalAutomationContextSchema })
  const snapshotSchema = delegatedApprovalSubjectSchema.shape.approval.strip()
  return (identity: DelegatedInputIdentity, kind: 'approval' | 'plan_exit') => {
    const original = request.get(identity.sessionId, identity.requestId)
    if (!original) return null
    const context = contextSchema.safeParse(JSON.parse(original.data) as unknown)
    if (!context.success) return null
    const current = approval(identity.requestId)
    if (
      current.sessionId !== identity.sessionId ||
      current.status !== 'pending' ||
      context.data.automationContext.policy.sessionId !== identity.sessionId ||
      (kind === 'plan_exit' ? current.tool !== 'exit_plan_mode' : current.tool === 'exit_plan_mode') ||
      (kind === 'approval' && !context.data.automationContext.admission)
    )
      return null
    const subject = delegatedApprovalSubjectSchema.parse({
      kind,
      approval: snapshotSchema.parse(current),
      context: context.data.automationContext,
    })
    // Projection arguments must still match the immutable original approval, including a remote target.
    const originalSubject = delegatedApprovalSubjectSchema.parse({
      kind,
      approval: snapshotSchema.parse(JSON.parse(original.data) as unknown),
      context: context.data.automationContext,
    })
    if (JSON.stringify(subject) !== JSON.stringify(originalSubject)) return null
    return subject
  }
}
