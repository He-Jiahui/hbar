import type { Database } from 'bun:sqlite'
import { HbarError, idSchema } from '@hbar/contracts'
import {
  sessionLaunchSelectionSchema,
  sessionLaunchTargetPreparationOperationInputSchema,
  sessionLaunchTargetPreparationSnapshotSchema,
  sessionLaunchTargetPreparationStartInputSchema,
  sessionLaunchTargetPreparationStartReceiptSchema,
  type SessionLaunchTargetPreparationOperationInput,
} from '@hbar/contracts/commands/session-launch-target'
import { z } from 'zod'
import type {
  SessionLaunchTargetPreparationOperationRecord,
  SessionLaunchTargetPreparationStartMutationInput,
  SessionLaunchTargetPreparationOperationTransitionInput,
} from './types.ts'

export const SESSION_LAUNCH_TARGET_PREPARATION_OPERATION_SQL = `
  CREATE TABLE IF NOT EXISTS session_launch_target_preparation_operations(
    operationId TEXT PRIMARY KEY,
    sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    workspaceId TEXT NOT NULL,
    targetRevision INTEGER NOT NULL CHECK(targetRevision >= 0),
    selectionJson TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('queued','preparing','cancel-requested','ready','cancelled','reconciling','failed')),
    operationVersion INTEGER NOT NULL CHECK(operationVersion >= 1),
    cancellationRequested INTEGER NOT NULL DEFAULT 0 CHECK(cancellationRequested IN (0,1)),
    errorCode TEXT,
    errorMessage TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS session_launch_target_preparation_session_revision
    ON session_launch_target_preparation_operations(sessionId,targetRevision,createdAt);
  CREATE UNIQUE INDEX IF NOT EXISTS session_launch_target_preparation_one_active
    ON session_launch_target_preparation_operations(sessionId,targetRevision)
    WHERE status IN ('queued','preparing','cancel-requested','reconciling');
  CREATE TABLE IF NOT EXISTS session_launch_target_preparation_receipts(
    actorId TEXT NOT NULL,
    idempotencyKey TEXT NOT NULL,
    sessionId TEXT NOT NULL,
    targetRevision INTEGER NOT NULL,
    requestJson TEXT NOT NULL,
    receiptJson TEXT NOT NULL,
    operationId TEXT NOT NULL REFERENCES session_launch_target_preparation_operations(operationId) ON DELETE CASCADE,
    PRIMARY KEY(actorId,idempotencyKey)
  );
`

export const ACTIVE_SESSION_LAUNCH_TARGET_PREPARATION_STATUSES = [
  'queued',
  'preparing',
  'cancel-requested',
  'reconciling',
] as const

const MAX_PENDING_PREPARATIONS = 68
const preparationStatusSchema = z.enum([
  'queued',
  'preparing',
  'cancel-requested',
  'ready',
  'cancelled',
  'reconciling',
  'failed',
])
const errorSchema = z.strictObject({ code: z.string().min(1).max(128), message: z.string().max(1_000) })
const startMutationSchema = sessionLaunchTargetPreparationStartInputSchema.extend({
  actorId: idSchema,
  idempotencyKey: z.string().min(1).max(128),
})
const transitionInputSchema = sessionLaunchTargetPreparationOperationInputSchema.extend({
  expectedOperationVersion: z.number().int().positive().safe(),
  status: preparationStatusSchema,
  error: errorSchema.nullable(),
})
const storedStartInputSchema = sessionLaunchTargetPreparationStartInputSchema

type OperationRow = {
  operationId: string
  sessionId: string
  workspaceId: string
  targetRevision: number
  selectionJson: string
  status: string
  operationVersion: number
  cancellationRequested: number
  errorCode: string | null
  errorMessage: string | null
  createdAt: number
  updatedAt: number
}

function invalidState(): never {
  throw new HbarError('INVALID_STATE', 'Stored session launch preparation operation is invalid')
}

function parseStoredJson(value: unknown): unknown {
  if (typeof value !== 'string' || value.length > 8_192 || new TextEncoder().encode(value).byteLength > 8_192)
    return invalidState()
  try {
    return JSON.parse(value) as unknown
  } catch {
    return invalidState()
  }
}

function sameRequest(
  left: { sessionId: string; expectedRevision: number },
  right: { sessionId: string; expectedRevision: number },
): boolean {
  return left.sessionId === right.sessionId && left.expectedRevision === right.expectedRevision
}

function terminal(status: z.infer<typeof preparationStatusSchema>): boolean {
  return status === 'ready' || status === 'cancelled' || status === 'failed'
}

function canTransition(
  from: z.infer<typeof preparationStatusSchema>,
  to: z.infer<typeof preparationStatusSchema>,
): boolean {
  if (from === to) return from === 'reconciling'
  switch (from) {
    case 'queued':
      return ['preparing', 'cancel-requested', 'cancelled', 'reconciling', 'failed'].includes(to)
    case 'preparing':
      return ['cancel-requested', 'ready', 'cancelled', 'reconciling', 'failed'].includes(to)
    case 'cancel-requested':
      return ['ready', 'cancelled', 'reconciling', 'failed'].includes(to)
    case 'reconciling':
      return ['preparing', 'cancel-requested', 'ready', 'cancelled', 'failed'].includes(to)
    case 'ready':
    case 'cancelled':
    case 'failed':
      return false
  }
}

export function hasActiveSessionLaunchTargetPreparation(db: Database, sessionId: string): boolean {
  const placeholders = ACTIVE_SESSION_LAUNCH_TARGET_PREPARATION_STATUSES.map(() => '?').join(',')
  return Boolean(
    db
      .query(
        `SELECT operationId FROM session_launch_target_preparation_operations
         WHERE sessionId=? AND status IN (${placeholders}) LIMIT 1`,
      )
      .get(sessionId, ...ACTIVE_SESSION_LAUNCH_TARGET_PREPARATION_STATUSES),
  )
}

export function createSessionLaunchTargetPreparationStorage(db: Database) {
  function operationRow(operationId: string, sessionId?: string, targetRevision?: number): OperationRow | null {
    const where = ['operationId=?']
    const values: (string | number)[] = [operationId]
    if (sessionId !== undefined) {
      where.push('sessionId=?')
      values.push(sessionId)
    }
    if (targetRevision !== undefined) {
      where.push('targetRevision=?')
      values.push(targetRevision)
    }
    return (
      (db
        .query<OperationRow, (string | number)[]>(
          `SELECT operationId,sessionId,workspaceId,targetRevision,selectionJson,status,operationVersion,cancellationRequested,
                  errorCode,errorMessage,createdAt,updatedAt
           FROM session_launch_target_preparation_operations WHERE ${where.join(' AND ')}`,
        )
        .get(...values) as OperationRow | null) ?? null
    )
  }

  function toRecord(row: OperationRow): SessionLaunchTargetPreparationOperationRecord {
    const selection = sessionLaunchSelectionSchema.safeParse(parseStoredJson(row.selectionJson))
    const status = preparationStatusSchema.safeParse(row.status)
    if (
      !selection.success ||
      !status.success ||
      !Number.isSafeInteger(row.operationVersion) ||
      row.operationVersion < 1 ||
      (row.cancellationRequested !== 0 && row.cancellationRequested !== 1) ||
      (status.data === 'cancel-requested' && row.cancellationRequested !== 1)
    )
      return invalidState()
    const hasError = status.data === 'reconciling' || status.data === 'failed'
    if (hasError !== (row.errorCode !== null && row.errorMessage !== null)) return invalidState()
    if (!hasError && (row.errorCode !== null || row.errorMessage !== null)) return invalidState()
    const snapshot = sessionLaunchTargetPreparationSnapshotSchema.parse({
      schemaVersion: 1,
      operationId: row.operationId,
      sessionId: row.sessionId,
      workspaceId: row.workspaceId,
      targetRevision: row.targetRevision,
      operationVersion: row.operationVersion,
      status: status.data,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(hasError ? { error: { code: row.errorCode!, message: row.errorMessage! } } : {}),
    })
    return { ...snapshot, selection: selection.data, cancellationRequested: row.cancellationRequested === 1 }
  }

  function record(input: SessionLaunchTargetPreparationOperationInput): SessionLaunchTargetPreparationOperationRecord {
    const parsed = sessionLaunchTargetPreparationOperationInputSchema.safeParse({
      sessionId: input.sessionId,
      expectedRevision: input.expectedRevision,
      operationId: input.operationId,
    })
    if (!parsed.success) throw new HbarError('INVALID_INPUT', 'Invalid session launch preparation operation identity')
    const row = operationRow(parsed.data.operationId, parsed.data.sessionId, parsed.data.expectedRevision)
    if (!row) throw new HbarError('NOT_FOUND', 'Session launch preparation operation not found')
    return toRecord(row)
  }

  function snapshotOf(operation: SessionLaunchTargetPreparationOperationRecord) {
    const { selection: _selection, cancellationRequested: _cancellationRequested, ...snapshot } = operation
    return sessionLaunchTargetPreparationSnapshotSchema.parse(snapshot)
  }

  function receipt(
    actorId: string,
    idempotencyKey: string,
  ): {
    request: { sessionId: string; expectedRevision: number }
    result: ReturnType<typeof sessionLaunchTargetPreparationStartReceiptSchema.parse>
  } | null {
    const row = db
      .query<
        { sessionId: string; targetRevision: number; requestJson: string; receiptJson: string; operationId: string },
        [string, string]
      >(
        `SELECT sessionId,targetRevision,requestJson,receiptJson,operationId FROM session_launch_target_preparation_receipts
         WHERE actorId=? AND idempotencyKey=?`,
      )
      .get(actorId, idempotencyKey)
    if (!row) return null
    const request = storedStartInputSchema.safeParse(parseStoredJson(row.requestJson))
    const result = sessionLaunchTargetPreparationStartReceiptSchema.safeParse(parseStoredJson(row.receiptJson))
    if (
      !request.success ||
      !result.success ||
      row.sessionId !== request.data.sessionId ||
      row.targetRevision !== request.data.expectedRevision ||
      result.data.sessionId !== row.sessionId ||
      result.data.targetRevision !== row.targetRevision ||
      result.data.operationId !== row.operationId
    )
      return invalidState()
    const operation = operationRow(result.data.operationId)
    if (
      !operation ||
      operation.sessionId !== row.sessionId ||
      operation.targetRevision !== row.targetRevision ||
      operation.workspaceId !== result.data.workspaceId
    )
      return invalidState()
    toRecord(operation)
    return { request: request.data, result: result.data }
  }

  function storeReceipt(
    actorId: string,
    idempotencyKey: string,
    request: { sessionId: string; expectedRevision: number },
    result: ReturnType<typeof sessionLaunchTargetPreparationStartReceiptSchema.parse>,
  ): void {
    db.query(
      `INSERT INTO session_launch_target_preparation_receipts
       (actorId,idempotencyKey,sessionId,targetRevision,requestJson,receiptJson,operationId)
       VALUES(?,?,?,?,?,?,?)`,
    ).run(
      actorId,
      idempotencyKey,
      request.sessionId,
      request.expectedRevision,
      JSON.stringify(request),
      JSON.stringify(result),
      result.operationId,
    )
  }

  function start(raw: SessionLaunchTargetPreparationStartMutationInput) {
    const parsed = startMutationSchema.safeParse(raw)
    if (!parsed.success) throw new HbarError('INVALID_INPUT', 'Invalid session launch preparation request')
    const input = parsed.data
    const request = { sessionId: input.sessionId, expectedRevision: input.expectedRevision }
    return db
      .transaction(() => {
        const prior = receipt(input.actorId, input.idempotencyKey)
        if (prior) {
          if (!sameRequest(prior.request, request))
            throw new HbarError('IDEMPOTENCY_CONFLICT', 'Preparation key was used with different input')
          return prior.result
        }

        const owner = db
          .query<{ id: string; workspaceId: string; archived: number }, [string]>(
            'SELECT id,workspaceId,archived FROM sessions WHERE id=?',
          )
          .get(input.sessionId)
        if (!owner) throw new HbarError('NOT_FOUND', 'Session not found')
        if (owner.archived)
          throw new HbarError('SESSION_ARCHIVED', 'Restore the session before preparing its launch target')
        const targetRow = db
          .query<{ revision: number; selectionJson: string }, [string]>(
            'SELECT revision,selectionJson FROM session_launch_targets WHERE sessionId=?',
          )
          .get(input.sessionId)
        const targetRevision = targetRow?.revision ?? 0
        const selection = targetRow
          ? sessionLaunchSelectionSchema.safeParse(parseStoredJson(targetRow.selectionJson))
          : sessionLaunchSelectionSchema.safeParse({ mode: 'shared-current' })
        if (!selection.success) return invalidState()
        if (targetRevision !== input.expectedRevision)
          throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed')
        const hasRuns = Boolean(db.query('SELECT id FROM runs WHERE sessionId=? LIMIT 1').get(input.sessionId))
        const hasBinding = Boolean(
          db.query('SELECT sessionId FROM session_launch_target_bindings WHERE sessionId=?').get(input.sessionId),
        )
        if (hasRuns || hasBinding)
          throw new HbarError(
            'SESSION_LAUNCH_TARGET_LOCKED',
            'The launch target is locked after the first accepted Run',
          )

        const current = db
          .query<OperationRow, [string, number]>(
            `SELECT operationId,sessionId,workspaceId,targetRevision,selectionJson,status,operationVersion,cancellationRequested,
                    errorCode,errorMessage,createdAt,updatedAt
             FROM session_launch_target_preparation_operations
             WHERE sessionId=? AND targetRevision=? AND status IN ('queued','preparing','cancel-requested','reconciling')
             ORDER BY createdAt DESC LIMIT 1`,
          )
          .get(input.sessionId, targetRevision)
        const priorReady = current
          ? null
          : (db
              .query<OperationRow, [string, number]>(
                `SELECT operationId,sessionId,workspaceId,targetRevision,selectionJson,status,operationVersion,cancellationRequested,
                        errorCode,errorMessage,createdAt,updatedAt
                 FROM session_launch_target_preparation_operations
                 WHERE sessionId=? AND targetRevision=? AND status='ready'
                 ORDER BY updatedAt DESC LIMIT 1`,
              )
              .get(input.sessionId, targetRevision) as OperationRow | null)
        let result: ReturnType<typeof sessionLaunchTargetPreparationStartReceiptSchema.parse>
        if (current || priorReady) {
          const reusable = current ?? priorReady
          if (!reusable) return invalidState()
          const priorOperation = toRecord(reusable)
          if (JSON.stringify(priorOperation.selection) !== JSON.stringify(selection.data))
            throw new HbarError('COMMAND_CONFLICT', 'Preparation operation does not match the current target')
          result = sessionLaunchTargetPreparationStartReceiptSchema.parse({
            operationId: priorOperation.operationId,
            sessionId: priorOperation.sessionId,
            workspaceId: priorOperation.workspaceId,
            targetRevision: priorOperation.targetRevision,
          })
          storeReceipt(input.actorId, input.idempotencyKey, request, result)
          return result
        }

        const pending = db
          .query<{ count: number }, []>(
            `SELECT COUNT(*) AS count FROM session_launch_target_preparation_operations
             WHERE status IN ('queued','preparing','cancel-requested','reconciling')`,
          )
          .get()?.count
        if (pending === undefined) return invalidState()
        if (pending >= MAX_PENDING_PREPARATIONS)
          throw new HbarError('BUSY', 'Host session preparation capacity is full; retry after an operation settles')

        const now = Date.now()
        const operationId = crypto.randomUUID()
        db.query(
          `INSERT INTO session_launch_target_preparation_operations
           (operationId,sessionId,workspaceId,targetRevision,selectionJson,status,operationVersion,cancellationRequested,
            errorCode,errorMessage,createdAt,updatedAt)
           VALUES(?,?,?,?,?,'queued',1,0,NULL,NULL,?,?)`,
        ).run(operationId, owner.id, owner.workspaceId, targetRevision, JSON.stringify(selection.data), now, now)
        result = sessionLaunchTargetPreparationStartReceiptSchema.parse({
          operationId,
          sessionId: owner.id,
          workspaceId: owner.workspaceId,
          targetRevision,
        })
        storeReceipt(input.actorId, input.idempotencyKey, request, result)
        return result
      })
      .immediate()
  }

  function transition(raw: SessionLaunchTargetPreparationOperationTransitionInput) {
    const parsed = transitionInputSchema.safeParse(raw)
    if (!parsed.success) throw new HbarError('INVALID_INPUT', 'Invalid session launch preparation transition')
    const input = parsed.data
    return db
      .transaction(() => {
        const current = record(input)
        if (current.operationVersion !== input.expectedOperationVersion) return snapshotOf(current)
        if (current.operationVersion >= Number.MAX_SAFE_INTEGER)
          throw new HbarError('INVALID_STATE', 'Preparation operation version is exhausted')
        const currentError = 'error' in current ? current.error : null
        if (current.status === input.status && JSON.stringify(currentError) === JSON.stringify(input.error))
          return snapshotOf(current)
        if (!canTransition(current.status, input.status)) {
          throw new HbarError(
            'INVALID_STATE',
            `Cannot transition preparation from ${current.status} to ${input.status}`,
          )
        }
        if (terminal(current.status)) throw new HbarError('INVALID_STATE', 'Preparation operation is already terminal')
        const errorRequired = input.status === 'reconciling' || input.status === 'failed'
        if (errorRequired !== (input.error !== null))
          throw new HbarError('INVALID_INPUT', 'Reconciling and failed operations require a safe error')
        const now = Date.now()
        db.query(
          `UPDATE session_launch_target_preparation_operations
           SET status=?,operationVersion=operationVersion+1,errorCode=?,errorMessage=?,updatedAt=?
           WHERE operationId=? AND operationVersion=?`,
        ).run(
          input.status,
          input.error?.code ?? null,
          input.error?.message.slice(0, 1_000) ?? null,
          now,
          input.operationId,
          input.expectedOperationVersion,
        )
        return snapshotOf(record(input))
      })
      .immediate()
  }

  function requestCancellation(raw: SessionLaunchTargetPreparationOperationInput) {
    const parsed = sessionLaunchTargetPreparationOperationInputSchema.safeParse(raw)
    if (!parsed.success) throw new HbarError('INVALID_INPUT', 'Invalid session launch preparation identity')
    return db
      .transaction(() => {
        const current = record(parsed.data)
        if (terminal(current.status) || current.status === 'cancel-requested') return snapshotOf(current)
        if (current.operationVersion >= Number.MAX_SAFE_INTEGER)
          throw new HbarError('INVALID_STATE', 'Preparation operation version is exhausted')
        db.query(
          `UPDATE session_launch_target_preparation_operations
           SET status='cancel-requested',operationVersion=operationVersion+1,cancellationRequested=1,
               errorCode=NULL,errorMessage=NULL,updatedAt=?
           WHERE operationId=? AND operationVersion=?`,
        ).run(Date.now(), current.operationId, current.operationVersion)
        return snapshotOf(record(parsed.data))
      })
      .immediate()
  }

  function listPending(): SessionLaunchTargetPreparationOperationRecord[] {
    const rows = db
      .query<OperationRow, [number]>(
        `SELECT operationId,sessionId,workspaceId,targetRevision,selectionJson,status,operationVersion,cancellationRequested,
                errorCode,errorMessage,createdAt,updatedAt
         FROM session_launch_target_preparation_operations
         WHERE status IN ('queued','preparing','cancel-requested','reconciling')
         ORDER BY createdAt,operationId LIMIT ?`,
      )
      .all(MAX_PENDING_PREPARATIONS) as OperationRow[]
    return rows.map(toRecord)
  }

  return {
    start,
    read(input: SessionLaunchTargetPreparationOperationInput) {
      return snapshotOf(record(input))
    },
    record,
    listPending,
    requestCancellation,
    transition,
  }
}
