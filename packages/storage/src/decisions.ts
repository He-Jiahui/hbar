import { createHash } from 'node:crypto'
import type { Database } from 'bun:sqlite'
import { HbarError, type SessionEvent } from '@hbar/contracts'
import { decisionPageInputSchema, decisionPageSchema, type DecisionPageInput } from '@hbar/contracts/commands/decisions'
import {
  decisionOperationIdentitySchema,
  decisionOperationSchema,
  decisionOperationCompleteSchema,
  type DecisionOperationIdentity,
  type DecisionOperationComplete,
  type DecisionOperation,
} from '@hbar/contracts/commands/decisions'

export const DECISION_PAGE_INDEX = `CREATE INDEX IF NOT EXISTS approvals_decision_page
  ON approvals(sessionId,CASE WHEN tool='exit_plan_mode' THEN 'plan_exit' ELSE 'approval' END,id);`

/** Paged metadata only; neither history nor answer/approval bodies are loaded to list pending decisions. */
export function createDecisionStorage(
  db: Database,
  append: (sessionId: string, type: string, data: unknown) => SessionEvent,
) {
  type Row = {
    cursor: string
    id: string
    runId: string
    callId: string
    revision: number
    status: string
    sourceRunStatus: string
    createdAt: number
  }
  const operationType = (input: DecisionOperationIdentity) =>
    'decision.operation.' +
    createHash('sha256')
      .update(JSON.stringify([input.actorId, input.idempotencyKey]))
      .digest('hex')
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    if (value && typeof value === 'object')
      return `{${Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
        .join(',')}}`
    return JSON.stringify(value) ?? 'null'
  }
  function operationRead(raw: DecisionOperationIdentity): DecisionOperation | null {
    const input = decisionOperationIdentitySchema.parse(raw)
    const row = db
      .query<{ data: string }, [string, string]>(
        'SELECT data FROM events WHERE sessionId=? AND type=? ORDER BY seq DESC LIMIT 1',
      )
      .get(input.input.sessionId, operationType(input))
    if (!row) return null
    const state = decisionOperationSchema.parse(JSON.parse(row.data) as unknown)
    if (
      canonical({ actorId: state.actorId, idempotencyKey: state.idempotencyKey, input: state.input }) !==
      canonical(input)
    )
      throw new HbarError('IDEMPOTENCY_CONFLICT', 'This decision key already belongs to another input')
    return state
  }
  function operationWrite(state: DecisionOperation): DecisionOperation {
    const value = decisionOperationSchema.parse(state)
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 512 * 1024)
      throw new HbarError('DECISION_CAPACITY', 'The decision receipt exceeds its durable capacity')
    append(value.input.sessionId, operationType(value), value)
    return value
  }
  return {
    operationRead,
    operationBegin(raw: DecisionOperationIdentity) {
      const input = decisionOperationIdentitySchema.parse(raw)
      return db
        .transaction(() => {
          const prior = operationRead(input)
          if (prior) return { created: false, state: prior }
          const state = operationWrite({ ...input, version: 1, outcome: { status: 'pending' } })
          return { created: true, state }
        })
        .immediate()
    },
    operationComplete(raw: DecisionOperationComplete) {
      const input = decisionOperationCompleteSchema.parse(raw)
      if (input.outcome.status === 'succeeded') {
        const decision = input.outcome.result.decision
        if (
          decision.sessionId !== input.input.sessionId ||
          decision.id !== input.input.id ||
          decision.kind !== input.input.resolution.kind ||
          decision.revision < input.input.expectedRevision ||
          (input.outcome.result.accepted && decision.status === 'pending')
        )
          throw new HbarError('DECISION_RECEIPT_INVALID', 'The receipt must describe the original decision')
      }
      return db
        .transaction(() => {
          const prior = operationRead({
            actorId: input.actorId,
            idempotencyKey: input.idempotencyKey,
            input: input.input,
          })
          if (!prior) throw new HbarError('NOT_FOUND', 'The original decision intent is unavailable')
          if (prior.outcome.status !== 'pending') {
            if (canonical(prior.outcome) !== canonical(input.outcome))
              throw new HbarError('DECISION_CONFLICT', 'The original decision receipt is already settled')
            return prior
          }
          return operationWrite({ ...prior, outcome: input.outcome })
        })
        .immediate()
    },
    page(raw: DecisionPageInput) {
      const input = decisionPageInputSchema.parse(raw)
      let rows: Row[]
      if (input.kind === 'questionnaire') {
        if (input.after && !/^user_input\.state\.[a-f0-9]{64}$/.test(input.after))
          throw new HbarError('INVALID_CURSOR', 'Use the question page cursor with the same Session and kind')
        rows = db
          .query<Row, [string, string, string, number]>(
            `SELECT e.type AS cursor,
          json_extract(e.data,'$.request.requestId') AS id,e.runId,
          json_extract(e.data,'$.request.callId') AS callId,json_extract(e.data,'$.revision') AS revision,
          CASE WHEN json_extract(e.data,'$.settlement') IS NULL THEN 'pending'
            WHEN json_extract(e.data,'$.settlement.kind')='cancelled' THEN 'cancelled' ELSE 'answered' END AS status,
          r.status AS sourceRunStatus,json_extract(e.data,'$.createdAt') AS createdAt
          FROM events e INDEXED BY events_session_type_seq JOIN runs r ON r.id=e.runId
          WHERE e.sessionId=? AND e.type>='user_input.state.' AND e.type<'user_input.state/' AND e.type>?
          AND NOT EXISTS(SELECT 1 FROM events newer INDEXED BY events_session_type_seq
            WHERE newer.sessionId=e.sessionId AND newer.type=e.type AND newer.seq>e.seq)
          AND (?='all' OR json_extract(e.data,'$.settlement') IS NULL) ORDER BY e.type LIMIT ?`,
          )
          .all(input.sessionId, input.after ?? '', input.status, input.limit + 1)
      } else {
        if (input.after && input.after.length > 160)
          throw new HbarError('INVALID_CURSOR', 'Use the approval page cursor with the same Session and kind')
        rows = db
          .query<Row, [string, string, string, string, number]>(
            `SELECT a.id AS cursor,a.id,a.runId,a.callId,
          CASE WHEN a.status='pending' THEN 1 ELSE 2 END AS revision,a.status,r.status AS sourceRunStatus,a.createdAt
          FROM approvals a INDEXED BY approvals_decision_page JOIN runs r ON r.id=a.runId
          WHERE a.sessionId=? AND (CASE WHEN a.tool='exit_plan_mode' THEN 'plan_exit' ELSE 'approval' END)=?
          AND a.id>? AND (?='all' OR a.status='pending') ORDER BY a.id LIMIT ?`,
          )
          .all(input.sessionId, input.kind, input.after ?? '', input.status, input.limit + 1)
      }
      const selected = rows.slice(0, input.limit)
      return decisionPageSchema.parse({
        items: selected.map(({ cursor: _cursor, ...row }) => ({
          ...row,
          sessionId: input.sessionId,
          kind: input.kind,
        })),
        nextCursor: rows.length > input.limit ? (selected.at(-1)?.cursor ?? null) : null,
      })
    },
  }
}
