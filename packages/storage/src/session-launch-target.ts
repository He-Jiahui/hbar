import type { Database } from 'bun:sqlite'
import { HbarError, idSchema } from '@hbar/contracts'
import { z } from 'zod'
import {
  sessionLaunchSelectionSchema,
  sessionLaunchTargetSchema,
  sessionLaunchTargetSetInputSchema,
  sessionLaunchTargetSetReceiptSchema,
  type SessionLaunchTarget,
  type SessionLaunchSelection,
  type SessionLaunchTargetSetInput,
  type SessionLaunchTargetSetReceipt,
} from '@hbar/contracts/commands/session-launch-target'
import type {
  SessionLaunchTargetBinding,
  SessionLaunchTargetBindingInput,
  SessionLaunchTargetMutationInput,
  SessionLaunchTargetPreparationInput,
  SessionLaunchTargetPreparationUpdate,
  SessionLaunchTargetReceiptLookup,
  SessionLaunchTargetResolutionRecord,
  SessionLaunchTargetRuntimeSnapshot,
} from './types.ts'

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

export const SESSION_LAUNCH_TARGET_RESOLUTION_SQL = `
  CREATE TABLE IF NOT EXISTS session_launch_target_resolutions(
    sessionId TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision >= 0),
    selectionJson TEXT NOT NULL,
    targetPath TEXT NOT NULL,
    branch TEXT,
    requestedHead TEXT,
    resolvedHead TEXT,
    state TEXT NOT NULL CHECK(state IN ('preparing','ready','reconciling','cancelled','failed')),
    errorCode TEXT,
    errorMessage TEXT,
    updatedAt INTEGER NOT NULL,
    PRIMARY KEY(sessionId,revision)
  );
  CREATE TABLE IF NOT EXISTS session_launch_target_bindings(
    sessionId TEXT PRIMARY KEY,
    revision INTEGER NOT NULL CHECK(revision >= 0),
    selectionJson TEXT NOT NULL,
    targetPath TEXT NOT NULL,
    branch TEXT,
    head TEXT,
    boundRunId TEXT NOT NULL,
    boundAt INTEGER NOT NULL
  );
`

const mutationInputSchema = sessionLaunchTargetSetInputSchema.extend({
  actorId: idSchema,
  idempotencyKey: z.string().min(1).max(128),
})

type TargetRow = { revision: number; selectionJson: string; updatedAt: number }
type SessionRow = { id: string; workspaceId: string; createdAt: number; archived: number }
type ResolutionRow = {
  sessionId: string
  revision: number
  selectionJson: string
  targetPath: string
  branch: string | null
  requestedHead: string | null
  resolvedHead: string | null
  state: string
  errorCode: string | null
  errorMessage: string | null
  updatedAt: number
}
type BindingRow = {
  sessionId: string
  revision: number
  selectionJson: string
  targetPath: string
  branch: string | null
  head: string | null
  boundRunId: string
  boundAt: number
}

const headSchema = z
  .string()
  .regex(/^[0-9a-f]{40,64}$/i)
  .nullable()
const preparationInputSchema = z.strictObject({
  sessionId: idSchema,
  expectedRevision: z.number().int().nonnegative().safe(),
  selection: sessionLaunchSelectionSchema,
  targetPath: z.string().min(1).max(4_000),
  branch: z.string().min(1).max(1_000).nullable(),
  requestedHead: headSchema,
})
const preparationUpdateSchema = z.strictObject({
  sessionId: idSchema,
  revision: z.number().int().nonnegative().safe(),
  targetPath: z.string().min(1).max(4_000),
  state: z.enum(['preparing', 'ready', 'reconciling', 'cancelled', 'failed']),
  resolvedHead: headSchema.optional(),
  errorCode: z.string().min(1).max(128).optional(),
  errorMessage: z.string().max(1_000).optional(),
})
const bindingInputSchema = z.strictObject({
  sessionId: idSchema,
  expectedRevision: z.number().int().nonnegative().safe(),
  selection: sessionLaunchSelectionSchema,
  targetPath: z.string().min(1).max(4_000),
  branch: z.string().min(1).max(1_000).nullable(),
  head: headSchema,
})

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

function sameSelection(left: SessionLaunchSelection, right: SessionLaunchSelection): boolean {
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

  function resolutionRow(sessionId: string, revision: number): ResolutionRow | null {
    return (
      (db
        .query<ResolutionRow, [string, number]>(
          `SELECT sessionId,revision,selectionJson,targetPath,branch,requestedHead,resolvedHead,state,errorCode,errorMessage,updatedAt
           FROM session_launch_target_resolutions WHERE sessionId=? AND revision=?`,
        )
        .get(sessionId, revision) as ResolutionRow | null) ?? null
    )
  }

  function parseResolution(row: ResolutionRow): SessionLaunchTargetResolutionRecord {
    const selection = sessionLaunchSelectionSchema.safeParse(storedJson(row.selectionJson))
    if (!selection.success || !['preparing', 'ready', 'reconciling', 'cancelled', 'failed'].includes(row.state))
      return invalidState()
    const parsed = preparationInputSchema.safeParse({
      sessionId: row.sessionId,
      expectedRevision: row.revision,
      selection: selection.data,
      targetPath: row.targetPath,
      branch: row.branch,
      requestedHead: row.requestedHead,
    })
    const resolvedHead = headSchema.safeParse(row.resolvedHead)
    if (!parsed.success || !resolvedHead.success) return invalidState()
    if (row.state === 'failed' || row.state === 'cancelled' || row.state === 'reconciling') {
      if (!row.errorCode || row.errorMessage === null) return invalidState()
    } else if (row.errorCode !== null || row.errorMessage !== null) return invalidState()
    return {
      ...parsed.data,
      state: row.state as SessionLaunchTargetResolutionRecord['state'],
      resolvedHead: resolvedHead.data,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      updatedAt: row.updatedAt,
    }
  }

  function readBinding(sessionId: string): SessionLaunchTargetBinding | null {
    const row = db
      .query<BindingRow, [string]>(
        `SELECT sessionId,revision,selectionJson,targetPath,branch,head,boundRunId,boundAt
         FROM session_launch_target_bindings WHERE sessionId=?`,
      )
      .get(sessionId) as BindingRow | null
    if (!row) return null
    const selection = sessionLaunchSelectionSchema.safeParse(storedJson(row.selectionJson))
    const parsed = bindingInputSchema.safeParse({
      sessionId: row.sessionId,
      expectedRevision: row.revision,
      selection: selection.success ? selection.data : null,
      targetPath: row.targetPath,
      branch: row.branch,
      head: row.head,
    })
    if (!parsed.success || !idSchema.safeParse(row.boundRunId).success || !Number.isSafeInteger(row.boundAt))
      return invalidState()
    return { ...parsed.data, boundRunId: row.boundRunId, boundAt: row.boundAt }
  }

  function bindingForPath(targetPath: string): SessionLaunchTargetBinding | null {
    const path = z.string().min(1).max(4_000).parse(targetPath)
    const row = db
      .query<{ sessionId: string }, [string]>(
        'SELECT sessionId FROM session_launch_target_bindings WHERE targetPath=? LIMIT 1',
      )
      .get(path)
    if (!row) return null
    const binding = readBinding(row.sessionId)
    return binding?.selection.mode === 'isolated-worktree' ? binding : null
  }

  function read(sessionId: string): SessionLaunchTarget {
    const owner = session(sessionId)
    const row = db
      .query<TargetRow, [string]>('SELECT revision,selectionJson,updatedAt FROM session_launch_targets WHERE sessionId=?')
      .get(sessionId)
    const selection = row ? sessionLaunchSelectionSchema.safeParse(storedJson(row.selectionJson)) : null
    if (selection && !selection.success) return invalidState()
    const revision = row?.revision ?? 0
    const selectionValue = selection?.data ?? { mode: 'shared-current' as const }
    const currentResolution = resolutionRow(sessionId, revision)
    const resolution = currentResolution ? parseResolution(currentResolution) : null
    const binding = readBinding(sessionId)
    const publicResolution = !resolution
      ? binding || (hasRuns(sessionId) && selectionValue.mode === 'shared-current')
        ? { status: 'ready' as const, branch: binding?.branch ?? null }
        : { status: 'idle' as const }
      : resolution.state === 'failed' || resolution.state === 'cancelled'
        ? { status: resolution.state, code: resolution.errorCode!, message: resolution.errorMessage! }
        : resolution.state === 'preparing'
          ? { status: resolution.state }
          : resolution.state === 'reconciling'
            ? { status: resolution.state, code: resolution.errorCode!, message: resolution.errorMessage! }
            : binding || (hasRuns(sessionId) && selectionValue.mode === 'shared-current')
              ? { status: 'ready' as const, branch: binding?.branch ?? null }
              : { status: 'ready' as const, branch: resolution.branch }
    return sessionLaunchTargetSchema.parse({
      sessionId: owner.id,
      workspaceId: owner.workspaceId,
      revision,
      selection: selectionValue,
      locked: hasRuns(sessionId) || binding !== null,
      resolution: publicResolution,
      updatedAt: row?.updatedAt ?? owner.createdAt,
    })
  }

  function runtime(sessionId: string): SessionLaunchTargetRuntimeSnapshot {
    const target = read(sessionId)
    const row = resolutionRow(sessionId, target.revision)
    return {
      target,
      resolution: row ? parseResolution(row) : null,
      binding: readBinding(sessionId),
    }
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

  function beginPreparation(raw: SessionLaunchTargetPreparationInput): SessionLaunchTargetResolutionRecord {
    const parsed = preparationInputSchema.safeParse(raw)
    if (!parsed.success) throw new HbarError('INVALID_INPUT', 'Invalid session launch target preparation')
    const input = parsed.data
    const expectedBranch = input.selection.mode === 'isolated-worktree' ? input.selection.branch.name : null
    if (input.branch !== expectedBranch)
      throw new HbarError('INVALID_INPUT', 'Preparation branch does not match the selected launch target')
    const now = Date.now()
    return db
      .transaction(() => {
        const owner = session(input.sessionId)
        if (owner.archived)
          throw new HbarError('SESSION_ARCHIVED', 'Restore the session before preparing its launch target')
        const current = read(input.sessionId)
        if (current.locked)
          throw new HbarError('SESSION_LAUNCH_TARGET_LOCKED', 'The launch target is already bound to a Run')
        if (current.revision !== input.expectedRevision || !sameSelection(current.selection, input.selection))
          throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed')
        const previous = resolutionRow(input.sessionId, input.expectedRevision)
        if (previous) {
          const value = parseResolution(previous)
          if (
            value.targetPath !== input.targetPath ||
            value.branch !== input.branch ||
            !sameSelection(value.selection, input.selection)
          )
            throw new HbarError('COMMAND_CONFLICT', 'Preparation intent does not match the persisted target')
          if (value.state === 'ready' || value.state === 'preparing' || value.state === 'reconciling') return value
          db.query(
            `UPDATE session_launch_target_resolutions SET requestedHead=?,resolvedHead=NULL,state='preparing',errorCode=NULL,errorMessage=NULL,updatedAt=?
             WHERE sessionId=? AND revision=?`,
          ).run(input.requestedHead, now, input.sessionId, input.expectedRevision)
        } else {
          db.query(
            `INSERT INTO session_launch_target_resolutions
             (sessionId,revision,selectionJson,targetPath,branch,requestedHead,resolvedHead,state,errorCode,errorMessage,updatedAt)
             VALUES(?,?,?,?,?,?,NULL,'preparing',NULL,NULL,?)`,
          ).run(
            input.sessionId,
            input.expectedRevision,
            JSON.stringify(input.selection),
            input.targetPath,
            input.branch,
            input.requestedHead,
            now,
          )
        }
        const result = resolutionRow(input.sessionId, input.expectedRevision)
        if (!result) return invalidState()
        return parseResolution(result)
      })
      .immediate()
  }

  function updatePreparation(raw: SessionLaunchTargetPreparationUpdate): SessionLaunchTargetResolutionRecord {
    const parsed = preparationUpdateSchema.safeParse(raw)
    if (!parsed.success) throw new HbarError('INVALID_INPUT', 'Invalid session launch target preparation update')
    const input = parsed.data
    const hasError = input.state === 'failed' || input.state === 'cancelled' || input.state === 'reconciling'
    if (hasError !== (input.errorCode !== undefined && input.errorMessage !== undefined))
      throw new HbarError('INVALID_INPUT', 'Preparation errors require a code and safe message')
    return db
      .transaction(() => {
        session(input.sessionId)
        const prior = resolutionRow(input.sessionId, input.revision)
        if (!prior) throw new HbarError('NOT_FOUND', 'Launch target preparation was not found')
        if (prior.targetPath !== input.targetPath)
          throw new HbarError('COMMAND_CONFLICT', 'Launch target preparation path changed')
        const resolvedHead = input.resolvedHead === undefined ? prior.resolvedHead : input.resolvedHead
        db.query(
          `UPDATE session_launch_target_resolutions SET state=?,resolvedHead=?,errorCode=?,errorMessage=?,updatedAt=?
           WHERE sessionId=? AND revision=?`,
        ).run(
          input.state,
          resolvedHead,
          hasError ? input.errorCode! : null,
          hasError ? input.errorMessage! : null,
          Date.now(),
          input.sessionId,
          input.revision,
        )
        const result = resolutionRow(input.sessionId, input.revision)
        if (!result) return invalidState()
        return parseResolution(result)
      })
      .immediate()
  }

  function validateReplayBinding(sessionId: string, candidate: SessionLaunchTargetBindingInput): void {
    const parsed = bindingInputSchema.safeParse(candidate)
    if (!parsed.success || parsed.data.sessionId !== sessionId)
      throw new HbarError('INVALID_INPUT', 'Invalid session launch target binding')
    const prior = readBinding(sessionId)
    if (!prior) throw new HbarError('INVALID_STATE', 'Accepted Run has no session launch target binding')
    if (
      prior.expectedRevision !== parsed.data.expectedRevision ||
      !sameSelection(prior.selection, parsed.data.selection) ||
      prior.targetPath !== parsed.data.targetPath ||
      prior.branch !== parsed.data.branch
    )
      throw new HbarError('IDEMPOTENCY_CONFLICT', 'Accepted Run is bound to another launch target')
  }

  /** Called inside the SQLite transaction that accepts and inserts the Run. */
  function bindToRun(
    sessionId: string,
    runId: string,
    workspacePath: string,
    candidate?: SessionLaunchTargetBindingInput,
  ): SessionLaunchTargetBinding {
    const existing = readBinding(sessionId)
    if (existing) {
      if (candidate) validateReplayBinding(sessionId, candidate)
      return existing
    }
    const current = read(sessionId)
    const selected = candidate
      ? bindingInputSchema.safeParse(candidate)
      : bindingInputSchema.safeParse({
          sessionId,
          expectedRevision: current.revision,
          selection: current.selection,
          targetPath: workspacePath,
          branch: null,
          head: null,
        })
    if (!selected.success || selected.data.sessionId !== sessionId)
      throw new HbarError('INVALID_INPUT', 'Invalid session launch target binding')
    const binding = selected.data
    if (
      current.locked ||
      current.revision !== binding.expectedRevision ||
      !sameSelection(current.selection, binding.selection)
    )
      throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed before Run acceptance')
    if (binding.selection.mode === 'shared-current') {
      if (binding.targetPath !== workspacePath || binding.branch !== null)
        throw new HbarError('INVALID_INPUT', 'Shared launch target must resolve to the current workspace')
    } else {
      const ready = resolutionRow(sessionId, binding.expectedRevision)
      if (
        !ready ||
        parseResolution(ready).state !== 'ready' ||
        ready.targetPath !== binding.targetPath ||
        ready.branch !== binding.branch ||
        ready.resolvedHead !== binding.head
      )
        throw new HbarError('SESSION_LAUNCH_TARGET_UNRESOLVED', 'Prepare the selected worktree before accepting a Run')
    }
    const now = Date.now()
    db.query(
      `INSERT INTO session_launch_target_bindings
       (sessionId,revision,selectionJson,targetPath,branch,head,boundRunId,boundAt) VALUES(?,?,?,?,?,?,?,?)`,
    ).run(
      sessionId,
      binding.expectedRevision,
      JSON.stringify(binding.selection),
      binding.targetPath,
      binding.branch,
      binding.head,
      runId,
      now,
    )
    return { ...binding, boundRunId: runId, boundAt: now }
  }

  return {
    read,
    runtime,
    bindingForPath,
    set,
    receipt,
    beginPreparation,
    updatePreparation,
    bindToRun,
    validateReplayBinding,
  }
}
