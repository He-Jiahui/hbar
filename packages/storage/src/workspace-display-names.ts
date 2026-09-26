import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { HbarError, idSchema } from '@hbar/contracts'
import {
  WORKSPACE_DISPLAY_NAMES_MAX_BYTES,
  WORKSPACE_DISPLAY_NAMES_MAX_ENTRIES,
  workspaceDisplayNamesApplyInputSchema,
  workspaceDisplayNamesReceiptInputSchema,
  workspaceDisplayNamesReceiptSchema,
  workspaceDisplayNamesRequestsEqual,
  workspaceDisplayNamesSnapshotSchema,
  type WorkspaceDisplayNamesReceipt,
  type WorkspaceDisplayNamesSnapshot,
} from '@hbar/contracts/commands/workspace-display-names'
import type { WorkspaceDisplayNamesMutationInput } from './types.ts'

export const WORKSPACE_DISPLAY_NAMES_SQL = `
  CREATE TABLE IF NOT EXISTS workspace_display_names_state(
    id INTEGER PRIMARY KEY CHECK(id=1), snapshotJson TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workspace_display_names_receipts(
    actorId TEXT NOT NULL, idempotencyKey TEXT NOT NULL,
    requestJson TEXT NOT NULL, receiptJson TEXT NOT NULL,
    PRIMARY KEY(actorId,idempotencyKey)
  );
`

function invalidState(): never {
  throw new HbarError('INVALID_STATE', 'Stored workspace display names are invalid')
}

function parseStoredJson(value: unknown): unknown {
  if (
    typeof value !== 'string' ||
    value.length > WORKSPACE_DISPLAY_NAMES_MAX_BYTES ||
    new TextEncoder().encode(value).byteLength > WORKSPACE_DISPLAY_NAMES_MAX_BYTES
  )
    return invalidState()
  try {
    return JSON.parse(value) as unknown
  } catch {
    return invalidState()
  }
}

const mutationInputSchema = z.strictObject({ actorId: idSchema, ...workspaceDisplayNamesReceiptInputSchema.shape })

function parseInput(input: unknown): WorkspaceDisplayNamesMutationInput {
  const parsed = mutationInputSchema.safeParse(input)
  if (!parsed.success) throw new HbarError('INVALID_INPUT', 'Invalid workspace display name request')
  return parsed.data
}

/** One transaction covers CAS, alias and exact actor-scoped acknowledgement, including no-ops. */
export function createWorkspaceDisplayNamesStorage(db: Database) {
  function read(): WorkspaceDisplayNamesSnapshot {
    const row = db
      .query<{ snapshotJson: unknown }, []>('SELECT snapshotJson FROM workspace_display_names_state WHERE id=1')
      .get()
    if (!row) return { schemaVersion: 1, revision: 0, entries: [] }
    const value = parseStoredJson(row.snapshotJson)
    if (value !== null && typeof value === 'object' && 'schemaVersion' in value && value.schemaVersion !== 1)
      throw new HbarError('VERSION_MISMATCH', 'Unsupported workspace display name schema version')
    const parsed = workspaceDisplayNamesSnapshotSchema.safeParse(value)
    if (!parsed.success) return invalidState()
    return parsed.data
  }

  function findReceipt(input: WorkspaceDisplayNamesMutationInput): WorkspaceDisplayNamesReceipt | null {
    const row = db
      .query<{ requestJson: unknown; receiptJson: unknown }, [string, string]>(
        'SELECT requestJson,receiptJson FROM workspace_display_names_receipts WHERE actorId=? AND idempotencyKey=?',
      )
      .get(input.actorId, input.idempotencyKey)
    if (!row) return null
    const original = workspaceDisplayNamesApplyInputSchema.safeParse(parseStoredJson(row.requestJson))
    if (!original.success) return invalidState()
    if (!workspaceDisplayNamesRequestsEqual(original.data, input.request))
      throw new HbarError('IDEMPOTENCY_CONFLICT', 'Workspace display name key was used with different input')
    const parsed = workspaceDisplayNamesReceiptSchema.safeParse(parseStoredJson(row.receiptJson))
    if (!parsed.success || !workspaceDisplayNamesRequestsEqual(parsed.data.request, original.data))
      return invalidState()
    return parsed.data
  }

  function receipt(input: WorkspaceDisplayNamesMutationInput): WorkspaceDisplayNamesReceipt | null {
    return findReceipt(parseInput(input))
  }

  function apply(input: WorkspaceDisplayNamesMutationInput): WorkspaceDisplayNamesReceipt {
    const parsed = parseInput(input)
    return db
      .transaction(() => {
        // Replay remains valid after later changes or directory removal; it does not restore old state.
        const previous = findReceipt(parsed)
        if (previous) return previous
        const current = read()
        const { request } = parsed
        if (request.expectedRevision !== current.revision)
          throw new HbarError('COMMAND_CONFLICT', 'Workspace display name revision changed')
        const { workspaceId, expectedDisplayName, displayName } = request
        const currentName = current.entries.find((entry) => entry.workspaceId === workspaceId)?.displayName ?? null
        if (expectedDisplayName !== currentName)
          throw new HbarError('COMMAND_CONFLICT', 'Workspace display name changed')
        if (
          displayName !== null &&
          !db.query<{ id: string }, [string]>('SELECT id FROM workspaces WHERE id=?').get(workspaceId)
        )
          throw new HbarError('NOT_FOUND', 'Workspace not found')
        const changed = currentName !== displayName
        if (changed && current.revision === Number.MAX_SAFE_INTEGER) return invalidState()
        const entries = changed ? current.entries.filter((entry) => entry.workspaceId !== workspaceId) : current.entries
        if (changed && displayName !== null) entries.push({ workspaceId, displayName })
        const next: WorkspaceDisplayNamesSnapshot = {
          schemaVersion: 1,
          revision: current.revision + (changed ? 1 : 0),
          entries,
        }
        const snapshotJson = JSON.stringify(next)
        if (
          entries.length > WORKSPACE_DISPLAY_NAMES_MAX_ENTRIES ||
          new TextEncoder().encode(snapshotJson).byteLength > WORKSPACE_DISPLAY_NAMES_MAX_BYTES
        )
          throw new HbarError('INPUT_TOO_LARGE', 'Workspace display name capacity exceeded')
        const result: WorkspaceDisplayNamesReceipt = {
          commitId: crypto.randomUUID(),
          revision: next.revision,
          request,
          changed,
        }
        if (changed)
          db.query(
            'INSERT INTO workspace_display_names_state(id,snapshotJson) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET snapshotJson=excluded.snapshotJson',
          ).run(snapshotJson)
        db.query('INSERT INTO workspace_display_names_receipts VALUES(?,?,?,?)').run(
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
