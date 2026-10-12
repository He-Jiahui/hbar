import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { readWorkspaceRow } from './node-workspaces'
import { isNodeWorkspacePath } from '@hbar/contracts/node-address'
import {
  workspaceFolderAlias,
  workspaceFolderSnapshotSchema,
  workspaceFolderMutationSchema,
  workspaceFolderReceiptSchema,
  workspaceFoldersSchema,
  type WorkspaceFolder,
  type WorkspaceFolderMutation,
  type WorkspaceFolderSnapshot,
} from '@hbar/contracts/commands/workspace-folders'

export const WORKSPACE_FOLDERS_SQL = `
CREATE TABLE IF NOT EXISTS workspace_folders(workspaceId TEXT PRIMARY KEY REFERENCES workspaces(id), snapshotJson TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS workspace_folder_receipts(actorId TEXT NOT NULL,idempotencyKey TEXT NOT NULL,receiptJson TEXT NOT NULL,PRIMARY KEY(actorId,idempotencyKey));
`
export interface WorkspaceFolderStorageMutation {
  readonly actorId: string
  readonly idempotencyKey: string
  readonly request: WorkspaceFolderMutation
  readonly folders: readonly WorkspaceFolder[]
}
const identity = z.string().min(1).max(160)
const mutationSchema = z.strictObject({
  actorId: identity,
  idempotencyKey: identity,
  request: workspaceFolderMutationSchema,
  folders: workspaceFoldersSchema,
})
function decode(value: string): unknown {
  if (value.length > 512_000) throw new HbarError('INVALID_STATE', 'Stored workspace folders exceed the limit')
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new HbarError('INVALID_STATE', 'Stored workspace folders are invalid')
  }
}

export function createWorkspaceFolderStorage(db: Database) {
  const workspace = (id: string) => {
    const value = db.query('SELECT * FROM workspaces WHERE id=?').get(id)
    if (!value) throw new HbarError('WORKSPACE_NOT_FOUND', 'Workspace not found')
    return readWorkspaceRow(db, value)
  }
  function read(workspaceId: string): WorkspaceFolderSnapshot {
    const owner = workspace(workspaceId)
    const row = db
      .query<{ snapshotJson: string }, [string]>('SELECT snapshotJson FROM workspace_folders WHERE workspaceId=?')
      .get(workspaceId)
    return row
      ? workspaceFolderSnapshotSchema.parse(decode(row.snapshotJson))
      : {
          schemaVersion: 1,
          workspaceId,
          revision: 0,
          folders: [{ id: 'registered-root', alias: workspaceFolderAlias(owner.name), path: owner.path }],
        }
  }
  function receipt(actorId: string, idempotencyKey: string, request: WorkspaceFolderMutation) {
    const row = db
      .query<{ receiptJson: string }, [string, string]>(
        'SELECT receiptJson FROM workspace_folder_receipts WHERE actorId=? AND idempotencyKey=?',
      )
      .get(actorId, idempotencyKey)
    if (!row) return null
    const saved = workspaceFolderReceiptSchema.parse(decode(row.receiptJson))
    if (JSON.stringify(saved.request) !== JSON.stringify(workspaceFolderMutationSchema.parse(request)))
      throw new HbarError('IDEMPOTENCY_CONFLICT', 'Workspace folder key was used for another request')
    return saved
  }
  function apply(input: WorkspaceFolderStorageMutation) {
    const parsed = mutationSchema.parse(input)
    if (parsed.folders.some((folder) => isNodeWorkspacePath(folder.path)))
      throw new HbarError('WORKSPACE_REMOTE', 'Remote shared roots use the node workspace contract')
    return db
      .transaction(() => {
        const previous = receipt(parsed.actorId, parsed.idempotencyKey, parsed.request)
        if (previous) return previous.result
        let owner
        let revision: number
        if (parsed.request.operation === 'create') {
          const primary = parsed.folders[0]
          if (!primary) throw new HbarError('INVALID_INPUT', 'At least one folder is required')
          if (db.query('SELECT id FROM workspaces WHERE path=?').get(primary.path))
            throw new HbarError('WORKSPACE_EXISTS', 'Open the existing workspace to manage its folders')
          owner = { id: crypto.randomUUID(), path: primary.path, name: primary.alias, createdAt: Date.now() }
          db.query('INSERT INTO workspaces VALUES(?,?,?,?)').run(owner.id, owner.path, owner.name, owner.createdAt)
          db.query('INSERT INTO projects VALUES(?,?,?,?)').run(owner.id, owner.path, owner.name, owner.createdAt)
          revision = 1
        } else {
          owner = workspace(parsed.request.input.workspaceId)
          if (isNodeWorkspacePath(owner.path))
            throw new HbarError('WORKSPACE_REMOTE', 'Node folders cannot be changed through local mounts')
          const current = read(owner.id)
          if (current.revision !== parsed.request.input.expectedRevision)
            throw new HbarError('COMMAND_CONFLICT', 'Workspace folders changed; reload before saving')
          const active = db
            .query(
              "SELECT r.id FROM runs r JOIN sessions s ON s.id=r.sessionId WHERE s.workspaceId=? AND r.status IN ('queued','running','waiting_approval') LIMIT 1",
            )
            .get(owner.id)
          if (active) throw new HbarError('BUSY', 'Wait for workspace runs to settle before changing folders')
          revision = current.revision + 1
        }
        const snapshot = workspaceFolderSnapshotSchema.parse({
          schemaVersion: 1,
          workspaceId: owner.id,
          revision,
          folders: parsed.folders,
        })
        const result = { workspace: owner, snapshot }
        const saved = workspaceFolderReceiptSchema.parse({ request: parsed.request, result })
        db.query(
          'INSERT INTO workspace_folders VALUES(?,?) ON CONFLICT(workspaceId) DO UPDATE SET snapshotJson=excluded.snapshotJson',
        ).run(owner.id, JSON.stringify(snapshot))
        db.query('INSERT INTO workspace_folder_receipts VALUES(?,?,?)').run(
          parsed.actorId,
          parsed.idempotencyKey,
          JSON.stringify(saved),
        )
        return result
      })
      .immediate()
  }
  return { read, receipt, apply }
}
