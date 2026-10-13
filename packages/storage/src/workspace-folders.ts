import type { Database } from 'bun:sqlite'
import { posix, win32 } from 'node:path'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { readWorkspaceRow } from './node-workspaces'
import { isNodeWorkspacePath, nodeWorkspaceLocator, parseNodeWorkspaceLocator } from '@hbar/contracts/node-address'
import { nodeCapabilitiesSchema } from '@hbar/contracts/node'
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
  function validateNodeFolders(workspaceId: string, folders: readonly WorkspaceFolder[]): void {
    const owner = db
      .query<{ nodeId: string; rootId: string; nodePath: string }, [string]>(
        'SELECT nodeId,rootId,nodePath FROM node_workspace_locations WHERE workspaceId=?',
      )
      .get(workspaceId)
    if (!owner) throw new HbarError('WORKSPACE_REMOTE', 'Remote roots require an existing node workspace')
    const node = db
      .query<{ revokedAt: number | null; capabilities: string | null }, [string]>(
        'SELECT revokedAt,capabilities FROM workspace_nodes WHERE nodeId=?',
      )
      .get(owner.nodeId)
    if (!node || node.revokedAt !== null || node.capabilities === null)
      throw new HbarError('NODE_REVOKED', 'Workspace node is unavailable')
    const capabilities = nodeCapabilitiesSchema.parse(decode(node.capabilities))
    if (capabilities.nodeId !== owner.nodeId)
      throw new HbarError('INVALID_STATE', 'Workspace node capability identity is inconsistent')
    const roots = new Map(capabilities.roots.map((root) => [root.rootId, root]))
    const paths: string[] = []
    for (const folder of folders) {
      let locator: ReturnType<typeof parseNodeWorkspaceLocator>
      try {
        locator = parseNodeWorkspaceLocator(folder.path)
      } catch {
        throw new HbarError('WORKSPACE_NODE_MISMATCH', 'Remote folders must use exact same-node root locators')
      }
      if (
        !locator ||
        locator.nodeId !== owner.nodeId ||
        nodeWorkspaceLocator(locator.nodeId, locator.rootId) !== folder.path
      )
        throw new HbarError('WORKSPACE_NODE_MISMATCH', 'Remote folders must use exact same-node root locators')
      const root = roots.get(locator.rootId)
      if (!root) throw new HbarError('NODE_ROOT_NOT_FOUND', `Node has no static registered root ${locator.rootId}`)
      if (locator.rootId === owner.rootId && root.nodePath !== owner.nodePath)
        throw new HbarError('NODE_ROOT_CHANGED', 'Primary workspace root differs from its original registration pin')
      const pathApi = capabilities.platform === 'win32' ? win32 : posix
      if (!pathApi.isAbsolute(root.nodePath) || pathApi.normalize(root.nodePath) !== root.nodePath)
        throw new HbarError('NODE_ROOT_CHANGED', `Node root ${locator.rootId} is not registered canonically`)
      const normalize = (value: string) => {
        const path = capabilities.platform === 'win32' ? value.replaceAll('\\', '/') : value
        return capabilities.platform === 'win32' ? path.toLowerCase() : path
      }
      const path = normalize(root.nodePath)
      const separator = '/'
      for (const previous of paths) {
        const left = normalize(previous)
        const isWithin = (parent: string, candidate: string) =>
          candidate === parent || candidate.startsWith(parent.endsWith(separator) ? parent : `${parent}${separator}`)
        if (isWithin(left, path) || isWithin(path, left))
          throw new HbarError('WORKSPACE_NODE_MISMATCH', 'Remote workspace roots cannot overlap')
      }
      paths.push(root.nodePath)
    }
    if (!folders.some((folder) => folder.path === nodeWorkspaceLocator(owner.nodeId, owner.rootId)))
      throw new HbarError('STALE_TARGET', 'Workspace folders must retain their primary registered root')
  }
  function apply(input: WorkspaceFolderStorageMutation) {
    const parsed = mutationSchema.parse(input)
    return db
      .transaction(() => {
        const previous = receipt(parsed.actorId, parsed.idempotencyKey, parsed.request)
        if (previous) return previous.result
        let owner
        let revision: number
        if (parsed.request.operation === 'create') {
          const primary = parsed.folders[0]
          if (!primary) throw new HbarError('INVALID_INPUT', 'At least one folder is required')
          if (parsed.folders.some((folder) => isNodeWorkspacePath(folder.path)))
            throw new HbarError('WORKSPACE_REMOTE', 'Create local workspaces with local directories')
          if (db.query('SELECT id FROM workspaces WHERE path=?').get(primary.path))
            throw new HbarError('WORKSPACE_EXISTS', 'Open the existing workspace to manage its folders')
          owner = { id: crypto.randomUUID(), path: primary.path, name: primary.alias, createdAt: Date.now() }
          db.query('INSERT INTO workspaces VALUES(?,?,?,?)').run(owner.id, owner.path, owner.name, owner.createdAt)
          db.query('INSERT INTO projects VALUES(?,?,?,?)').run(owner.id, owner.path, owner.name, owner.createdAt)
          revision = 1
        } else {
          owner = workspace(parsed.request.input.workspaceId)
          if (owner.location?.kind === 'node') {
            if (JSON.stringify(parsed.request.input.folders) !== JSON.stringify(parsed.folders))
              throw new HbarError(
                'INVALID_INPUT',
                'Remote workspace folders must match the accepted folder declaration',
              )
            validateNodeFolders(owner.id, parsed.folders)
          } else if (parsed.folders.some((folder) => isNodeWorkspacePath(folder.path)))
            throw new HbarError('WORKSPACE_NODE_MISMATCH', 'Local workspaces cannot mount node folders')
          const current = read(owner.id)
          if (current.revision !== parsed.request.input.expectedRevision)
            throw new HbarError('COMMAND_CONFLICT', 'Workspace folders changed; reload before saving')
          const active = db
            .query(
              "SELECT r.id FROM runs r JOIN sessions s ON s.id=r.sessionId WHERE s.workspaceId=? AND r.status IN ('queued','running','waiting_approval','interrupted') LIMIT 1",
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
