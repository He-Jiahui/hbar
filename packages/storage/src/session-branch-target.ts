import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { HbarError, idSchema } from '@hbar/contracts'
import {
  sessionBranchTargetOperationSchema,
  sessionBranchTargetSelectInputSchema,
  type SessionBranchTargetOperation,
  type SessionBranchTargetSelectInput,
} from '@hbar/contracts/commands/session-branch-target'
import { hasActiveSessionLaunchTargetPreparation } from './session-launch-target-preparations'

export const SESSION_BRANCH_TARGET_SQL = `
  CREATE TABLE IF NOT EXISTS session_branch_targets(
    sessionId TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    targetPath TEXT NOT NULL,
    commonPath TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('checkout','worktree'))
  );
  CREATE TABLE IF NOT EXISTS session_branch_target_operations(
    operationId TEXT PRIMARY KEY,
    actorId TEXT NOT NULL,
    idempotencyKey TEXT NOT NULL,
    sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    requestJson TEXT NOT NULL,
    targetPath TEXT NOT NULL,
    commonPath TEXT NOT NULL,
    kind TEXT NOT NULL,
    branch TEXT NOT NULL,
    head TEXT NOT NULL,
    snapshotJson TEXT NOT NULL,
    status TEXT NOT NULL,
    UNIQUE(actorId,idempotencyKey)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS session_branch_target_pending
    ON session_branch_target_operations(sessionId) WHERE status IN ('switching','unknown');
`
const rootSchema = z.strictObject({
  sessionId: idSchema,
  revision: z.number().int().nonnegative().safe(),
  targetPath: z.string().min(1).max(4_000),
  commonPath: z.string().min(1).max(4_000),
  kind: z.enum(['checkout', 'worktree']),
  branch: z.string().min(1).max(1_000).nullable(),
})
export const SESSION_BRANCH_TARGET_BRANCH_SQL = `
  CREATE TABLE IF NOT EXISTS session_branch_target_branches(
    sessionId TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    branch TEXT NOT NULL
  );
  INSERT OR IGNORE INTO session_branch_target_branches(sessionId,branch)
    SELECT t.sessionId,r.branch FROM session_branch_targets t
    JOIN session_launch_target_resolutions r ON r.sessionId=t.sessionId AND r.revision=t.revision
    WHERE r.branch IS NOT NULL;
`
export type SessionBranchExecutionRoot = z.infer<typeof rootSchema>
export interface SessionBranchTargetIdentity {
  actorId: string
  idempotencyKey: string
  sessionId: string
}
export interface SessionBranchTargetIntent extends SessionBranchTargetIdentity {
  operationId: string
  request: SessionBranchTargetSelectInput
  targetPath: string
  commonPath: string
  kind: 'checkout' | 'worktree'
  branch: string
  head: string
}
export interface SessionBranchTargetRecord extends SessionBranchTargetIntent {
  snapshot: SessionBranchTargetOperation
}
const intentSchema = z
  .strictObject({
    actorId: idSchema,
    idempotencyKey: z.string().min(1).max(128),
    sessionId: idSchema,
    operationId: idSchema,
    request: sessionBranchTargetSelectInputSchema,
    targetPath: z.string().min(1).max(4_000),
    commonPath: z.string().min(1).max(4_000),
    kind: z.enum(['checkout', 'worktree']),
    branch: z.string().min(1).max(1_000),
    head: z
      .string()
      .regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i)
      .toLowerCase(),
  })
  .refine((value) => value.sessionId === value.request.sessionId)

export function readSessionBranchExecutionRoot(db: Database, sessionId: string): SessionBranchExecutionRoot | null {
  const row = db
    .query(
      'SELECT t.sessionId,t.revision,t.targetPath,t.commonPath,t.kind,b.branch FROM session_branch_targets t LEFT JOIN session_branch_target_branches b ON b.sessionId=t.sessionId WHERE t.sessionId=?',
    )
    .get(sessionId)
  return row ? rootSchema.parse(row) : null
}
export function hasPendingSessionBranchTarget(db: Database, sessionId: string): boolean {
  return Boolean(
    db
      .query(
        "SELECT operationId FROM session_branch_target_operations WHERE sessionId=? AND status IN ('switching','unknown') LIMIT 1",
      )
      .get(sessionId),
  )
}

export function createSessionBranchTargetStorage(db: Database, readRevision: (sessionId: string) => number) {
  const read = (identity: SessionBranchTargetIdentity): SessionBranchTargetRecord | null => {
    const row = db
      .query<
        {
          operationId: string
          actorId: string
          idempotencyKey: string
          sessionId: string
          requestJson: string
          targetPath: string
          commonPath: string
          kind: string
          branch: string
          head: string
          snapshotJson: string
        },
        [string, string, string]
      >(
        `SELECT operationId,actorId,idempotencyKey,sessionId,requestJson,targetPath,commonPath,kind,branch,head,snapshotJson FROM session_branch_target_operations WHERE actorId=? AND idempotencyKey=? AND sessionId=?`,
      )
      .get(identity.actorId, identity.idempotencyKey, identity.sessionId)
    if (!row) return null
    const { requestJson, snapshotJson, ...fields } = row
    const intent = intentSchema.parse({ ...fields, request: JSON.parse(requestJson) as unknown })
    return { ...intent, snapshot: sessionBranchTargetOperationSchema.parse(JSON.parse(snapshotJson) as unknown) }
  }
  const assertIdle = (request: SessionBranchTargetSelectInput) => {
    const session = db
      .query<{ workspaceId: string; archived: number }, [string]>(
        'SELECT workspaceId,archived FROM sessions WHERE id=?',
      )
      .get(request.sessionId)
    if (!session) throw new HbarError('NOT_FOUND', 'Session not found')
    if (session.workspaceId !== request.workspaceId)
      throw new HbarError('STALE_TARGET', 'The session belongs to another workspace')
    if (session.archived) throw new HbarError('SESSION_ARCHIVED', 'Archived sessions cannot switch execution targets')
    if (readRevision(request.sessionId) !== request.expectedRevision)
      throw new HbarError('COMMAND_CONFLICT', 'Refresh the branch list before switching targets')
    if (
      db
        .query("SELECT id FROM runs WHERE sessionId=? AND status IN ('queued','running','waiting_approval') LIMIT 1")
        .get(request.sessionId)
    )
      throw new HbarError('BUSY', 'Wait for session tasks to finish before switching targets')
    if (hasActiveSessionLaunchTargetPreparation(db, request.sessionId))
      throw new HbarError('BUSY', 'Wait for launch preparation before switching targets')
  }
  const begin = (raw: SessionBranchTargetIntent): SessionBranchTargetRecord =>
    db
      .transaction(() => {
        const input = intentSchema.parse(raw)
        const prior = read(input)
        if (prior) {
          if (JSON.stringify(prior.request) !== JSON.stringify(input.request))
            throw new HbarError('IDEMPOTENCY_CONFLICT', 'This operation key belongs to another branch choice')
          return prior
        }
        if (
          db
            .query('SELECT operationId FROM session_branch_target_operations WHERE actorId=? AND idempotencyKey=?')
            .get(input.actorId, input.idempotencyKey)
        )
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'This operation key belongs to another session')
        assertIdle(input.request)
        if (hasPendingSessionBranchTarget(db, input.sessionId))
          throw new HbarError('RESULT_UNKNOWN', 'Reconcile the preceding branch operation before switching again')
        const snapshot = sessionBranchTargetOperationSchema.parse({
          operationId: input.operationId,
          request: input.request,
          status: 'switching',
          revision: input.request.expectedRevision,
          execution: null,
          error: null,
        })
        db.query(
          `INSERT INTO session_branch_target_operations(operationId,actorId,idempotencyKey,sessionId,requestJson,targetPath,commonPath,kind,branch,head,snapshotJson,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).run(
          input.operationId,
          input.actorId,
          input.idempotencyKey,
          input.sessionId,
          JSON.stringify(input.request),
          input.targetPath,
          input.commonPath,
          input.kind,
          input.branch,
          input.head,
          JSON.stringify(snapshot),
          snapshot.status,
        )
        return { ...input, snapshot }
      })
      .immediate()

  const finish = (
    identity: SessionBranchTargetIdentity,
    result: { status: 'ready' | 'failed' | 'unknown'; error?: { code: string; message: string } },
  ): SessionBranchTargetOperation =>
    db
      .transaction(() => {
        const operation = read(identity)
        if (!operation) throw new HbarError('NOT_FOUND', 'Branch operation not found')
        if (operation.snapshot.status === 'ready' || operation.snapshot.status === 'failed') return operation.snapshot
        const { request, branch, head, targetPath, commonPath, kind } = operation
        const nextRevision = request.expectedRevision + Number(result.status === 'ready')
        if (result.status === 'ready') {
          assertIdle(request)
          const selectionJson = JSON.stringify({
            mode: 'shared-branch',
            branch: { ref: `refs/heads/${branch}`, tipOid: head },
          })
          const now = Date.now()
          db.query(
            `INSERT INTO session_launch_targets(sessionId,revision,selectionJson,updatedAt) VALUES(?,?,?,?) ON CONFLICT(sessionId) DO UPDATE SET revision=excluded.revision,selectionJson=excluded.selectionJson,updatedAt=excluded.updatedAt`,
          ).run(identity.sessionId, nextRevision, selectionJson, now)
          db.query(
            `INSERT INTO session_branch_targets(sessionId,revision,targetPath,commonPath,kind) VALUES(?,?,?,?,?) ON CONFLICT(sessionId) DO UPDATE SET revision=excluded.revision,targetPath=excluded.targetPath,commonPath=excluded.commonPath,kind=excluded.kind`,
          ).run(identity.sessionId, nextRevision, targetPath, commonPath, kind)
          db.query(
            'INSERT INTO session_branch_target_branches(sessionId,branch) VALUES(?,?) ON CONFLICT(sessionId) DO UPDATE SET branch=excluded.branch',
          ).run(identity.sessionId, branch)
          db.query(
            `INSERT INTO session_launch_target_resolutions(sessionId,revision,selectionJson,targetPath,branch,requestedHead,resolvedHead,state,errorCode,errorMessage,updatedAt) VALUES(?,?,?,?,?,?,?,'ready',NULL,NULL,?)`,
          ).run(identity.sessionId, nextRevision, selectionJson, targetPath, branch, head, head, now)
          const run = db
            .query<{ id: string }, [string]>(
              'SELECT id FROM runs WHERE sessionId=? ORDER BY createdAt DESC,rowid DESC LIMIT 1',
            )
            .get(identity.sessionId)
          if (run)
            db.query(
              `INSERT INTO session_launch_target_bindings(sessionId,revision,selectionJson,targetPath,branch,head,boundRunId,boundAt) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(sessionId) DO UPDATE SET revision=excluded.revision,selectionJson=excluded.selectionJson,targetPath=excluded.targetPath,branch=excluded.branch,head=excluded.head,boundRunId=excluded.boundRunId,boundAt=excluded.boundAt`,
            ).run(identity.sessionId, nextRevision, selectionJson, targetPath, branch, head, run.id, now)
        }
        const snapshot = sessionBranchTargetOperationSchema.parse({
          operationId: operation.operationId,
          request,
          status: result.status,
          revision: nextRevision,
          execution: result.status === 'ready' ? { path: targetPath, kind, branch } : null,
          error: result.error ?? null,
        })
        db.query('UPDATE session_branch_target_operations SET status=?,snapshotJson=? WHERE operationId=?').run(
          snapshot.status,
          JSON.stringify(snapshot),
          operation.operationId,
        )
        return snapshot
      })
      .immediate()
  const observeRunBranch = (input: {
    sessionId: string
    runId: string
    expectedRevision: number
    targetPath: string
    branch: string
  }): boolean =>
    db
      .transaction(() => {
        const root = readSessionBranchExecutionRoot(db, input.sessionId)
        const run = db
          .query<{ status: string }, [string, string]>('SELECT status FROM runs WHERE id=? AND sessionId=?')
          .get(input.runId, input.sessionId)
        if (
          !root ||
          root.revision !== input.expectedRevision ||
          root.targetPath !== input.targetPath ||
          !run ||
          !['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)
        )
          return false
        db.query(
          'INSERT INTO session_branch_target_branches(sessionId,branch) VALUES(?,?) ON CONFLICT(sessionId) DO UPDATE SET branch=excluded.branch',
        ).run(input.sessionId, z.string().min(1).max(1_000).parse(input.branch))
        return true
      })
      .immediate()
  const pending = (
    sessionId: string,
    actorId?: string,
  ): {
    operationId: string
    owned: boolean
    idempotencyKey?: string
    request?: SessionBranchTargetSelectInput
  } | null => {
    const row = db
      .query<{ actorId: string; idempotencyKey: string; operationId: string }, [string]>(
        "SELECT actorId,idempotencyKey,operationId FROM session_branch_target_operations WHERE sessionId=? AND status IN ('switching','unknown') LIMIT 1",
      )
      .get(sessionId)
    if (!row) return null
    if (!actorId || actorId !== row.actorId) return { operationId: row.operationId, owned: false }
    const operation = read({ sessionId, actorId, idempotencyKey: row.idempotencyKey })
    return operation
      ? { operationId: row.operationId, owned: true, idempotencyKey: row.idempotencyKey, request: operation.request }
      : null
  }
  return { read, begin, finish, observeRunBranch, pending }
}
