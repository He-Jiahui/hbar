import type { Database } from 'bun:sqlite'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readSync, renameSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { verifyResourcePathSync } from './chat-database-resource-paths'
import { CHAT_DATABASE_RESOURCE_SQL } from './chat-database-resource-schema'

const chunkSchema = z.strictObject({
  ids: z
    .array(z.string().regex(/^[a-f0-9]{64}$/))
    .min(1)
    .max(100),
})
export interface ChatDatabaseArtifactCauseOwner {
  sessionId: string
  workspaceId: string
  operationId: string
  deletedAt: number
}
export function createChatDatabaseArtifactCauses(db: Database, sessionsRoot: string) {
  db.exec(CHAT_DATABASE_RESOURCE_SQL)
  const root = join(sessionsRoot, '.maintenance', 'deleted-assets')
  const target = (sessionId: string) => {
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(sessionId))
      throw new HbarError('INVALID_INPUT', 'Artifact cause owner is invalid')
    return join(root, `${sessionId}.jsonl`)
  }
  function capture(sessionId: string): void {
    const path = `${target(sessionId)}.pending`
    verifyResourcePathSync(sessionsRoot, path, true)
    mkdirSync(root, { recursive: true, mode: 0o700 })
    verifyResourcePathSync(sessionsRoot, path, true)
    const descriptor = openSync(path, 'w', 0o600)
    try {
      let after: string | null = null
      for (;;) {
        const rows: { artifactId: string }[] = db
          .query<{ artifactId: string }, [string, string, string, string | null, string | null]>(
            "SELECT DISTINCT artifactId FROM chat_database_artifact_refs WHERE (sessionId=? OR (source='legacySettings' AND ownerId=?) OR (source='upload' AND ownerId=?)) AND (? IS NULL OR artifactId>?) ORDER BY artifactId LIMIT 100",
          )
          .all(sessionId, `session:${sessionId}`, `host-tools/session:${sessionId}`, after, after)
        if (!rows.length) break
        const chunk = Buffer.from(`${JSON.stringify({ ids: rows.map((row) => row.artifactId) })}\n`)
        let offset = 0
        while (offset < chunk.length) offset += writeSync(descriptor, chunk, offset, chunk.length - offset)
        after = rows.at(-1)?.artifactId ?? after
        if (rows.length < 100) break
      }
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
  }
  function readChunks(path: string, visit: (ids: string[]) => void): void {
    verifyResourcePathSync(sessionsRoot, path, true)
    if (!existsSync(path)) return
    const descriptor = openSync(path, 'r')
    let pending = Buffer.alloc(0)
    const buffer = Buffer.allocUnsafe(64 * 1024)
    try {
      for (;;) {
        const size = readSync(descriptor, buffer)
        if (!size) break
        pending = Buffer.concat([pending, buffer.subarray(0, size)])
        let end = pending.indexOf(10)
        while (end >= 0) {
          if (end > 16 * 1024) throw new HbarError('REFERENCE_LIMIT', 'Artifact cause record is oversized')
          const chunk = chunkSchema.parse(JSON.parse(pending.subarray(0, end).toString('utf8')))
          visit(chunk.ids)
          pending = pending.subarray(end + 1)
          end = pending.indexOf(10)
        }
        if (pending.length > 16 * 1024) throw new HbarError('REFERENCE_LIMIT', 'Artifact cause record is oversized')
      }
      if (pending.length) throw new HbarError('INVALID_STATE', 'Artifact cause record is incomplete')
    } finally {
      closeSync(descriptor)
    }
  }
  /** Called after reference deletion, inside its transaction, before the commit is acknowledged. */
  function finalize(owner: ChatDatabaseArtifactCauseOwner): void {
    const path = target(owner.sessionId)
    verifyResourcePathSync(sessionsRoot, path, true)
    const temporary = `${path}.${crypto.randomUUID()}.pending`
    const descriptor = openSync(temporary, 'wx', 0o600)
    try {
      readChunks(`${path}.pending`, (ids) => {
        const unowned = ids.filter(
          (id) => !db.query('SELECT ownerId FROM chat_database_artifact_refs WHERE artifactId=? LIMIT 1').get(id),
        )
        if (!unowned.length) return
        const chunk = Buffer.from(`${JSON.stringify({ ids: unowned })}\n`)
        let offset = 0
        while (offset < chunk.length) offset += writeSync(descriptor, chunk, offset, chunk.length - offset)
      })
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    renameSync(temporary, path)
    if (process.platform !== 'win32') {
      const directory = openSync(root, 'r')
      try {
        fsyncSync(directory)
      } finally {
        closeSync(directory)
      }
    }
    project(owner)
  }
  /** Only the finalized manifest proves which cleanup removed the last live reference. */
  function project(owner: ChatDatabaseArtifactCauseOwner): void {
    readChunks(target(owner.sessionId), (ids) => {
      for (const id of ids)
        db.query(
          'INSERT OR IGNORE INTO chat_database_artifact_orphan_causes SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM chat_database_artifact_refs WHERE artifactId=?)',
        ).run(id, owner.workspaceId, owner.sessionId, owner.operationId, owner.deletedAt, id)
    })
  }
  return { capture, finalize, project }
}
