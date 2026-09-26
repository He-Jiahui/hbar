import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { HbarError, idSchema } from '@hbar/contracts'
import {
  WORKSPACE_ORGANIZATION_MAX_BYTES,
  WORKSPACE_ORGANIZATION_MAX_HIDDEN,
  workspaceOrganizationApplyInputSchema,
  workspaceOrganizationReceiptInputSchema,
  workspaceOrganizationReceiptSchema,
  workspaceOrganizationRequestsEqual,
  workspaceOrganizationSnapshotSchema,
  type WorkspaceOrganizationReceipt,
  type WorkspaceOrganizationSnapshot,
} from '@hbar/contracts/commands/workspace-organization'
import type { WorkspaceOrganizationMutationInput } from './types.ts'

export const WORKSPACE_ORGANIZATION_SQL = `
  CREATE TABLE IF NOT EXISTS workspace_organization_state(
    id INTEGER PRIMARY KEY CHECK(id=1), snapshotJson TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workspace_organization_receipts(
    actorId TEXT NOT NULL, idempotencyKey TEXT NOT NULL,
    requestJson TEXT NOT NULL, receiptJson TEXT NOT NULL,
    PRIMARY KEY(actorId,idempotencyKey)
  );
`

function invalidState(): never {
  throw new HbarError('INVALID_STATE', 'Stored workspace organization is invalid')
}

function parseStoredJson(value: unknown): unknown {
  if (
    typeof value !== 'string' ||
    value.length > WORKSPACE_ORGANIZATION_MAX_BYTES ||
    new TextEncoder().encode(value).byteLength > WORKSPACE_ORGANIZATION_MAX_BYTES
  )
    return invalidState()
  try {
    return JSON.parse(value) as unknown
  } catch {
    return invalidState()
  }
}

const mutationInputSchema = z.strictObject({
  actorId: idSchema,
  ...workspaceOrganizationReceiptInputSchema.shape,
})

function parseInput(input: unknown): WorkspaceOrganizationMutationInput {
  const parsed = mutationInputSchema.safeParse(input)
  if (!parsed.success) throw new HbarError('INVALID_INPUT', 'Invalid workspace organization request')
  return parsed.data
}

/** All writes, including no-op receipts, use one immediate transaction across Worker connections. */
export function createWorkspaceOrganizationStorage(db: Database) {
  function read(): WorkspaceOrganizationSnapshot {
    const row = db
      .query<{ snapshotJson: unknown }, []>('SELECT snapshotJson FROM workspace_organization_state WHERE id=1')
      .get()
    if (!row) return { schemaVersion: 1, revision: 0, hiddenWorkspaceIds: [] }
    const value = parseStoredJson(row.snapshotJson)
    if (value !== null && typeof value === 'object' && 'schemaVersion' in value && value.schemaVersion !== 1)
      throw new HbarError('VERSION_MISMATCH', 'Unsupported workspace organization schema version')
    const parsed = workspaceOrganizationSnapshotSchema.safeParse(value)
    if (!parsed.success) return invalidState()
    return parsed.data
  }

  function findReceipt(input: WorkspaceOrganizationMutationInput): WorkspaceOrganizationReceipt | null {
    const row = db
      .query<{ requestJson: unknown; receiptJson: unknown }, [string, string]>(
        'SELECT requestJson,receiptJson FROM workspace_organization_receipts WHERE actorId=? AND idempotencyKey=?',
      )
      .get(input.actorId, input.idempotencyKey)
    if (!row) return null
    const original = workspaceOrganizationApplyInputSchema.safeParse(parseStoredJson(row.requestJson))
    if (!original.success) return invalidState()
    if (!workspaceOrganizationRequestsEqual(original.data, input.request))
      throw new HbarError('IDEMPOTENCY_CONFLICT', 'Workspace organization key was used with different input')
    const parsed = workspaceOrganizationReceiptSchema.safeParse(parseStoredJson(row.receiptJson))
    if (!parsed.success || !workspaceOrganizationRequestsEqual(parsed.data.request, original.data))
      return invalidState()
    return parsed.data
  }

  function receipt(input: WorkspaceOrganizationMutationInput): WorkspaceOrganizationReceipt | null {
    return findReceipt(parseInput(input))
  }

  function apply(input: WorkspaceOrganizationMutationInput): WorkspaceOrganizationReceipt {
    const parsed = parseInput(input)
    return db
      .transaction(() => {
        // An acknowledged request remains replayable even after newer revisions or workspace removal.
        const previous = findReceipt(parsed)
        if (previous) return previous
        const current = read()
        const { request } = parsed
        if (request.expectedRevision !== current.revision)
          throw new HbarError('COMMAND_CONFLICT', 'Workspace organization revision changed')
        let hiddenWorkspaceIds: string[]
        if (request.change.kind === 'setHidden') {
          const { workspaceId, hidden, expectedHidden } = request.change
          const isHidden = current.hiddenWorkspaceIds.includes(workspaceId)
          if (isHidden !== expectedHidden) throw new HbarError('COMMAND_CONFLICT', 'Workspace visibility changed')
          if (hidden && !db.query<{ id: string }, [string]>('SELECT id FROM workspaces WHERE id=?').get(workspaceId))
            throw new HbarError('NOT_FOUND', 'Workspace not found')
          hiddenWorkspaceIds = hidden
            ? isHidden
              ? current.hiddenWorkspaceIds
              : [...current.hiddenWorkspaceIds, workspaceId]
            : current.hiddenWorkspaceIds.filter((id) => id !== workspaceId)
        } else {
          hiddenWorkspaceIds = []
        }
        const changed = hiddenWorkspaceIds.length !== current.hiddenWorkspaceIds.length
        if (changed && current.revision === Number.MAX_SAFE_INTEGER) return invalidState()
        const next: WorkspaceOrganizationSnapshot = {
          schemaVersion: 1,
          revision: current.revision + (changed ? 1 : 0),
          hiddenWorkspaceIds,
        }
        const snapshotJson = JSON.stringify(next)
        if (
          hiddenWorkspaceIds.length > WORKSPACE_ORGANIZATION_MAX_HIDDEN ||
          new TextEncoder().encode(snapshotJson).byteLength > WORKSPACE_ORGANIZATION_MAX_BYTES
        )
          throw new HbarError('INPUT_TOO_LARGE', 'Workspace organization capacity exceeded')
        const result: WorkspaceOrganizationReceipt = {
          commitId: crypto.randomUUID(),
          revision: next.revision,
          request,
          changed,
        }
        if (changed)
          db.query(
            'INSERT INTO workspace_organization_state(id,snapshotJson) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET snapshotJson=excluded.snapshotJson',
          ).run(snapshotJson)
        db.query('INSERT INTO workspace_organization_receipts VALUES(?,?,?,?)').run(
          parsed.actorId,
          parsed.idempotencyKey,
          JSON.stringify(request),
          JSON.stringify(result),
        )
        return result
      })
      .immediate()
  }

  return { read, apply, receipt }
}
