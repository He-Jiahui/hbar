import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { workspaceSchema, sessionSchema, sessionPageSchema } from '@hbar/contracts/directory'
import { isNodeWorkspacePath, nodeWorkspaceLocator, workspaceLocationSchema } from '@hbar/contracts/node-address'
import { nodeWorkspaceCreateSchema, nodeSessionListSchema } from '@hbar/contracts/node-workspaces'
import { createNodeRegistryStorage } from './node-registry-storage'

/** Separate metadata preserves old local rows and gives node-session queries a bounded indexed scope. */
export const NODE_WORKSPACES_SQL = `
CREATE TABLE IF NOT EXISTS node_workspace_locations(
  workspaceId TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  nodeId TEXT NOT NULL REFERENCES workspace_nodes(nodeId), rootId TEXT NOT NULL, nodePath TEXT NOT NULL,
  UNIQUE(nodeId,rootId)
) STRICT;
CREATE INDEX IF NOT EXISTS node_workspace_locations_node ON node_workspace_locations(nodeId,workspaceId);
`
export function readWorkspaceRow(db: Database, value: unknown) {
  const row = z.record(z.string(), z.unknown()).parse(value)
  const path = z.string().parse(row.path)
  let location: unknown
  if (isNodeWorkspacePath(path)) {
    const saved = db
      .query('SELECT nodeId,rootId,nodePath FROM node_workspace_locations WHERE workspaceId=?')
      .get(z.string().parse(row.id))
    if (!saved) throw new HbarError('INVALID_STATE', 'Remote workspace has no persisted owner')
    location = workspaceLocationSchema.parse({ ...saved, kind: 'node' })
  }
  return workspaceSchema.parse({
    id: row.id,
    path,
    name: row.name,
    createdAt: row.createdAt,
    ...(location ? { location } : {}),
  })
}
export function createNodeWorkspaceStorage(db: Database) {
  const registry = createNodeRegistryStorage(db)
  return {
    create(input: unknown) {
      const value = nodeWorkspaceCreateSchema.parse(input)
      return db
        .transaction(() => {
          const node = registry.get(value.nodeId)
          if (!node) throw new HbarError('NODE_NOT_FOUND', 'Register the workspace node before selecting a root')
          if (node.revokedAt !== null) throw new HbarError('NODE_REVOKED', 'Workspace node was revoked')
          const root = node.capabilities?.roots.find((root) => root.rootId === value.rootId)
          if (!root) throw new HbarError('NODE_ROOT_NOT_FOUND', 'Node has no verified capability for this shared root')
          const path = nodeWorkspaceLocator(node.nodeId, root.rootId)
          const existing = db.query('SELECT * FROM workspaces WHERE path=?').get(path)
          if (existing) return readWorkspaceRow(db, existing)
          const workspace = { id: crypto.randomUUID(), path, name: value.name ?? root.name, createdAt: Date.now() }
          db.query('INSERT INTO workspaces(id,path,name,createdAt) VALUES(?,?,?,?)').run(
            workspace.id,
            path,
            workspace.name,
            workspace.createdAt,
          )
          db.query('INSERT INTO projects(id,path,name,createdAt) VALUES(?,?,?,?)').run(
            workspace.id,
            path,
            workspace.name,
            workspace.createdAt,
          )
          db.query('INSERT INTO node_workspace_locations(workspaceId,nodeId,rootId,nodePath) VALUES(?,?,?,?)').run(
            workspace.id,
            node.nodeId,
            root.rootId,
            root.nodePath,
          )
          return readWorkspaceRow(db, workspace)
        })
        .immediate()
    },
    sessions(input: unknown) {
      const { nodeId, after, limit } = nodeSessionListSchema.parse(input)
      const rows = db
        .query(
          `SELECT s.* FROM sessions s
        JOIN node_workspace_locations l ON l.workspaceId=s.workspaceId
        JOIN workspace_nodes n ON n.nodeId=l.nodeId
        WHERE l.nodeId=? AND n.revokedAt IS NULL AND s.archived=0 AND (? IS NULL OR s.id>?)
        ORDER BY s.id LIMIT ?`,
        )
        .all(nodeId, after ?? null, after ?? null, limit + 1)
      const items = rows.slice(0, limit).map((value) => {
        const row = z.record(z.string(), z.unknown()).parse(value)
        return sessionSchema.parse({ ...row, archived: Boolean(row.archived) })
      })
      return sessionPageSchema.parse({ items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null })
    },
  }
}
