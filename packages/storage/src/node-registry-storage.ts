import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { nodeIdentitySchema, registeredNodeSchema } from '@hbar/contracts/node-registry'
import { nodeCapabilitiesSchema } from '@hbar/contracts/node'

export const NODE_REGISTRY_SQL = `
CREATE TABLE IF NOT EXISTS node_conversation_identity(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  publicKey TEXT NOT NULL,
  privateKey TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS workspace_nodes(
  nodeId TEXT PRIMARY KEY, publicKey TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  createdAt INTEGER NOT NULL, lastSeenAt INTEGER, revokedAt INTEGER, capabilities TEXT CHECK(capabilities IS NULL OR json_valid(capabilities))
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_nodes_live_name ON workspace_nodes(name COLLATE NOCASE) WHERE revokedAt IS NULL;
`
const rowSchema = registeredNodeSchema.omit({ capabilities: true }).extend({ capabilities: z.string().nullable() })
function decode(value: unknown) {
  const row = rowSchema.parse(value)
  const capabilities: unknown = row.capabilities === null ? null : JSON.parse(row.capabilities)
  return registeredNodeSchema.parse({ ...row, capabilities })
}
export function createNodeRegistryStorage(db: Database) {
  const get = (nodeId: string) => {
    const row = db.query('SELECT * FROM workspace_nodes WHERE nodeId=?').get(nodeId)
    return row === null ? null : decode(row)
  }
  return {
    ensureIdentity(value: unknown) {
      const identity = nodeIdentitySchema.parse(value)
      return db
        .transaction(() => {
          db.query(
            'INSERT OR IGNORE INTO node_conversation_identity(singleton,publicKey,privateKey) VALUES(1,?,?)',
          ).run(identity.publicKey, identity.privateKey)
          return nodeIdentitySchema.parse(
            db.query('SELECT publicKey,privateKey FROM node_conversation_identity WHERE singleton=1').get(),
          )
        })
        .immediate()
    },
    list() {
      return db.query('SELECT * FROM workspace_nodes ORDER BY createdAt,nodeId LIMIT 1000').all().map(decode)
    },
    get,
    register(value: unknown) {
      const input = registeredNodeSchema.omit({ lastSeenAt: true, revokedAt: true, capabilities: true }).parse(value)
      return db
        .transaction(() => {
          const prior = get(input.nodeId)
          if (prior) {
            if (prior.revokedAt !== null) throw new HbarError('NODE_REVOKED', 'Node identity has been revoked')
            if (prior.publicKey !== input.publicKey)
              throw new HbarError('NODE_IDENTITY_CONFLICT', 'Node identity differs from its pinned public key')
            return prior
          }
          const count = z
            .object({ count: z.number() })
            .parse(db.query('SELECT COUNT(*) AS count FROM workspace_nodes').get()).count
          if (count >= 1000) throw new HbarError('NODE_CAPACITY', 'Node registry capacity reached')
          if (
            db
              .query('SELECT nodeId FROM workspace_nodes WHERE name=? COLLATE NOCASE AND revokedAt IS NULL')
              .get(input.name)
          )
            throw new HbarError('NODE_NAME_CONFLICT', 'A live node already has this name')
          db.query('INSERT INTO workspace_nodes(nodeId,publicKey,name,createdAt) VALUES(?,?,?,?)').run(
            input.nodeId,
            input.publicKey,
            input.name,
            input.createdAt,
          )
          return registeredNodeSchema.parse({ ...input, lastSeenAt: null, revokedAt: null, capabilities: null })
        })
        .immediate()
    },
    touch(nodeId: string, time: number, value: unknown) {
      const capabilities = nodeCapabilitiesSchema.parse(value)
      if (capabilities.nodeId !== nodeId)
        throw new HbarError('NODE_IDENTITY_CONFLICT', 'Capabilities belong to another identity')
      const changed = db
        .query('UPDATE workspace_nodes SET lastSeenAt=?,capabilities=? WHERE nodeId=? AND revokedAt IS NULL')
        .run(time, JSON.stringify(capabilities), nodeId)
      if (!changed.changes) throw new HbarError('NODE_REVOKED', 'Node is unknown or revoked')
      return get(nodeId)
    },
    revoke(nodeId: string, time: number) {
      const changed = db
        .query('UPDATE workspace_nodes SET revokedAt=COALESCE(revokedAt,?) WHERE nodeId=?')
        .run(time, nodeId)
      if (!changed.changes) throw new HbarError('NODE_NOT_FOUND', 'Node is not registered')
      return get(nodeId)
    },
  }
}
