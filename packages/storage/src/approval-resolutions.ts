import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { HbarError, sessionEventSchema, type Approval, type SessionEvent } from '@hbar/contracts'

export const APPROVAL_RESOLUTION_INDEX = `
  CREATE INDEX IF NOT EXISTS events_approval_resolution_identity ON events(sessionId,json_extract(data,'$.id'),seq) WHERE type='approval.resolved';
  CREATE INDEX IF NOT EXISTS events_plan_resolution_identity ON events(sessionId,json_extract(data,'$.approval.id'),seq) WHERE type='plan_exit.resolved';`

/** Read an already committed result after an unknown acknowledgement; this port never replays a decision. */
export function createApprovalResolutionStorage(db: Database, approval: (id: string) => Approval) {
  type Row = Omit<SessionEvent, 'data'> & { data: string }
  const ordinary = db.query<Row, [string, string]>(`SELECT * FROM events WHERE sessionId=?
    AND json_extract(data,'$.id')=? AND type='approval.resolved' ORDER BY seq DESC LIMIT 1`)
  const plan = db.query<Row, [string, string]>(`SELECT * FROM events WHERE sessionId=?
    AND json_extract(data,'$.approval.id')=? AND type='plan_exit.resolved' ORDER BY seq DESC LIMIT 1`)
  const identity = z.object({
    id: z.string(),
    sessionId: z.string(),
    runId: z.string(),
    callId: z.string(),
    tool: z.string(),
    status: z.string(),
    decidedBy: z.string().optional(),
    feedback: z.string().optional(),
  })
  return {
    read(id: string) {
      const value = approval(id)
      if (value.status === 'pending') return null
      const isPlan = value.tool === 'exit_plan_mode' && value.status !== 'cancelled'
      const row = (isPlan ? plan : ordinary).get(value.sessionId, id)
      if (!row) throw new HbarError('APPROVAL_RESULT_UNKNOWN', 'The approval has no matching canonical resolution')
      const event = sessionEventSchema.parse({ ...row, data: JSON.parse(row.data) as unknown })
      const data = isPlan
        ? z
            .object({
              approval: identity,
              mode: z.literal('default').nullable(),
              exitRunId: z.string(),
              callId: z.string(),
            })
            .parse(event.data)
        : null
      const resolved = data?.approval ?? identity.parse(event.data)
      if (
        event.sessionId !== value.sessionId ||
        event.runId !== value.runId ||
        JSON.stringify(identity.parse(value)) !== JSON.stringify(resolved) ||
        (data && (data.exitRunId !== value.runId || data.callId !== value.callId)) ||
        (data && (value.status === 'allowed') !== (data.mode === 'default'))
      )
        throw new HbarError(
          'SESSION_LOG_CORRUPTED',
          'The canonical approval resolution differs from the original request',
        )
      const delegationEvents: SessionEvent[] = []
      return { approval: value, event, modeEvent: data?.mode === 'default' ? event : null, delegationEvents }
    },
  }
}
