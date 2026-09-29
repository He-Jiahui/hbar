import type { Database } from 'bun:sqlite'
import { HbarError, idSchema } from '@hbar/contracts'
import { z } from 'zod'
import {
  sessionLaunchSelectionSchema,
  sessionLaunchTargetSchema,
  sessionLaunchTargetSetInputSchema,
  sessionLaunchTargetSetReceiptSchema,
  type SessionLaunchTarget,
  type SessionLaunchTargetSetInput,
  type SessionLaunchTargetSetReceipt,
} from '@hbar/contracts/commands/session-launch-target'
import type { SessionLaunchTargetMutationInput, SessionLaunchTargetReceiptLookup } from './types.ts'

export const SESSION_LAUNCH_TARGET_SQL = `
  CREATE TABLE IF NOT EXISTS session_launch_targets(
    sessionId TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK(revision >= 1),
    selectionJson TEXT NOT NULL,
    updatedAt INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS session_launch_target_receipts(
    actorId TEXT NOT NULL,
    idempotencyKey TEXT NOT NULL,
    sessionId TEXT NOT NULL,
    requestJson TEXT NOT NULL,
    receiptJson TEXT NOT NULL,
    PRIMARY KEY(actorId,idempotencyKey)
  );
`

const mutationInputSchema = sessionLaunchTargetSetInputSchema.extend({
  actorId: idSchema,
  idempotencyKey: z.string().min(1).max(128),
})

type TargetRow = { revision: number; selectionJson: string; updatedAt: number }
type SessionRow = { id: string; workspaceId: string; createdAt: number; archived: number }

function invalidState(): never {
  throw new HbarError('INVALID_STATE', 'Stored session launch target is invalid')
}

function storedJson(value: unknown): unknown {
  if (typeof value !== 'string' || value.length > 8_192 || new TextEncoder().encode(value).byteLength > 8_192)
    return invalidState()
  try {
    return JSON.parse(value) as unknown
  } catch {
    return invalidState()
  }
}

function sameRequest(left: SessionLaunchTargetSetInput, right: SessionLaunchTargetSetInput): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function createSessionLaunchTargetStorage(db: Database) {
  function session(sessionId: string): SessionRow {
    const row = db
      .query<{ id: string; workspaceId: string; createdAt: number; archived: number }, [string]>(
        'SELECT id,workspaceId,createdAt,archived FROM sessions WHERE id=?',
      )
      .get(sessionId)
    if (!row) throw new HbarError('NOT_FOUND', 'Session not found')
    return row
  }

  function hasRuns(sessionId: string): boolean {
    return Boolean(db.query('SELECT id FROM runs WHERE sessionId=? LIMIT 1').get(sessionId))
  }

  function read(sessionId: string): SessionLaunchTarget {
    const owner = session(sessionId)
    const row = db
      .query<TargetRow, [string]>('SELECT revision,selectionJson,updatedAt FROM session_launch_targets WHERE sessionId=?')
      .get(sessionId)
    const selection = row ? sessionLaunchSelectionSchema.safeParse(storedJson(row.selectionJson)) : null
    if (selection && !selection.success) return invalidState()
    return sessionLaunchTargetSchema.parse({
      sessionId: owner.id,
      workspaceId: owner.workspaceId,
      revision: row?.revision ?? 0,
      selection: selection?.data ?? { mode: 'shared-current' },
      locked: hasRuns(sessionId),
      updatedAt: row?.updatedAt ?? owner.createdAt,
    })
  }

  function receipt(input: SessionLaunchTargetReceiptLookup): SessionLaunchTargetSetReceipt | null {
    const parsed = {
      actorId: idSchema.parse(input.actorId),
      idempotencyKey: z.string().min(1).max(128).parse(input.idempotencyKey),
      sessionId: idSchema.parse(input.sessionId),
    }
    const row = db
      .query<{ sessionId: string; requestJson: string; receiptJson: string }, [string, string]>(
        'SELECT sessionId,requestJson,receiptJson FROM session_launch_target_receipts WHERE actorId=? AND idempotencyKey=?',
      )
      .get(parsed.actorId, parsed.idempotencyKey)
    if (!row) return null
    if (row.sessionId !== parsed.sessionId)
      throw new HbarError('IDEMPOTENCY_CONFLICT', 'Session launch target key was used for another session')
    const request = sessionLaunchTargetSetInputSchema.safeParse(storedJson(row.requestJson))
    const result = sessionLaunchTargetSetReceiptSchema.safeParse(storedJson(row.receiptJson))
    if (!request.success || !result.success || !sameRequest(request.data, result.data.request)) return invalidState()
    return result.data
  }

  function set(raw: SessionLaunchTargetMutationInput): SessionLaunchTargetSetReceipt {
    const parsed = mutationInputSchema.safeParse(raw)
    if (!parsed.success) throw new HbarError('INVALID_INPUT', 'Invalid session launch target request')
    const input = parsed.data
    return db
      .transaction(() => {
        // A committed result remains replayable after a newer draft or an accepted Run.
        const prior = receipt(input)
        if (prior) {
          const request: SessionLaunchTargetSetInput = {
            sessionId: input.sessionId,
            expectedRevision: input.expectedRevision,
            selection: input.selection,
          }
          if (!sameRequest(prior.request, request))
            throw new HbarError('IDEMPOTENCY_CONFLICT', 'Session launch target key was used with different input')
          return prior
        }

        const owner = session(input.sessionId)
        if (owner.archived) throw new HbarError('SESSION_ARCHIVED', 'Restore the session before changing its launch target')
        if (hasRuns(input.sessionId))
          throw new HbarError('SESSION_LAUNCH_TARGET_LOCKED', 'The launch target is locked after the first accepted Run')

        const current = read(input.sessionId)
        if (current.revision !== input.expectedRevision)
          throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed')
        const changed = JSON.stringify(current.selection) !== JSON.stringify(input.selection)
        if (changed && current.revision === Number.MAX_SAFE_INTEGER) return invalidState()

        const updatedAt = changed ? Date.now() : current.updatedAt
        const revision = current.revision + Number(changed)
        if (changed)
          db.query(
            `INSERT INTO session_launch_targets(sessionId,revision,selectionJson,updatedAt) VALUES(?,?,?,?)
             ON CONFLICT(sessionId) DO UPDATE SET revision=excluded.revision,selectionJson=excluded.selectionJson,updatedAt=excluded.updatedAt`,
          ).run(input.sessionId, revision, JSON.stringify(input.selection), updatedAt)

        const result = sessionLaunchTargetSetReceiptSchema.parse({
          commitId: crypto.randomUUID(),
          request: {
            sessionId: input.sessionId,
            expectedRevision: input.expectedRevision,
            selection: input.selection,
          },
          revision,
          changed,
          updatedAt,
        })
        db.query('INSERT INTO session_launch_target_receipts VALUES(?,?,?,?,?)').run(
          input.actorId,
          input.idempotencyKey,
          input.sessionId,
          JSON.stringify(result.request),
          JSON.stringify(result),
        )
        return result
      })
      .immediate()
  }

  return { read, set, receipt }
}
