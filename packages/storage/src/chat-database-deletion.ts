import type { Database } from 'bun:sqlite'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type { ChatDatabaseSkipReason } from '@hbar/contracts/commands/chat-database'
import { hasActiveSessionLaunchTargetPreparation } from './session-launch-target-preparations'
import { hasPendingSessionBranchTarget } from './session-branch-target'

const safeId = z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/)
const markerSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sessionId: safeId,
  workspaceId: safeId,
  operationId: safeId,
  deletedAt: z.number().int().nonnegative().safe(),
  logicalBytes: z.number().int().nonnegative().safe(),
  logBytes: z.number().int().nonnegative().safe(),
  reusableBytes: z.number().int().nonnegative().safe(),
  logProjects: z.array(safeId).max(10_000),
  createReceipts: z.array(
    z.strictObject({
      commandId: z.enum(['session.create', 'session.fork', 'session.forkFromMessage']),
      actorId: z.string(),
      idempotencyKey: z.string(),
      payloadHash: z.string(),
    }),
  ),
})
type Marker = z.output<typeof markerSchema>
export type ChatDatabaseDeletionStage = 'marked' | 'projected' | 'unlinked'
export interface ChatDatabaseDeleteInput {
  sessionId: string
  operationId: string
  expectedSeq: number
  expectedActivityAt: number
}
export interface ChatDatabaseDeleteResult {
  deleted: boolean
  reason: ChatDatabaseSkipReason | null
  reclaimedBytes: number
  reusableBytes: number
  revision: number
}

/** Every ancestor is checked with lstat; a junction is never a maintenance path. */
function verifyPath(root: string, target: string): void {
  const suffix = relative(resolve(root), resolve(target))
  if (isAbsolute(suffix) || suffix === '..' || suffix.startsWith(`..\\`) || suffix.startsWith('../'))
    throw new HbarError('PATH_REDIRECTED', 'Maintenance path leaves its managed root')
  let path = resolve(root)
  for (const part of ['', ...suffix.split(/[\\/]/).filter(Boolean)]) {
    if (part) path = join(path, part)
    try {
      if (lstatSync(path).isSymbolicLink())
        throw new HbarError('PATH_REDIRECTED', 'Maintenance path is a link or junction')
    } catch (reason) {
      if (!(reason instanceof Error && 'code' in reason && reason.code === 'ENOENT')) throw reason
    }
  }
}

export function chatDatabaseSessionProtection(db: Database, sessionId: string): ChatDatabaseSkipReason | null {
  const active = db
    .query<{ status: string }, [string]>(
      "SELECT status FROM runs WHERE sessionId=? AND status IN ('running','waiting_approval','queued') ORDER BY CASE status WHEN 'waiting_approval' THEN 0 WHEN 'running' THEN 1 ELSE 2 END LIMIT 1",
    )
    .get(sessionId)
  if (active)
    return active.status === 'queued' ? 'queued' : active.status === 'waiting_approval' ? 'approval' : 'active'
  if (db.query("SELECT id FROM approvals WHERE sessionId=? AND status='pending' LIMIT 1").get(sessionId))
    return 'approval'
  const latest = db
    .query<{ status: string }, [string]>(
      'SELECT status FROM runs WHERE sessionId=? ORDER BY createdAt DESC,id DESC LIMIT 1',
    )
    .get(sessionId)
  if (latest?.status === 'interrupted') return 'resume'
  if (hasActiveSessionLaunchTargetPreparation(db, sessionId) || hasPendingSessionBranchTarget(db, sessionId))
    return 'preparation'
  if (
    db
      .query(
        "SELECT id FROM schedules WHERE json_extract(data,'$.enabled')=1 AND json_extract(data,'$.target.sessionId')=? LIMIT 1",
      )
      .get(sessionId)
  )
    return 'schedule'
  if (
    db
      .query(
        "SELECT id FROM schedule_occurrences WHERE sessionId=? AND status IN ('pending','running','unknown') LIMIT 1",
      )
      .get(sessionId)
  )
    return 'schedule'
  if (
    db
      .query(
        "SELECT eventId FROM events requested WHERE requested.sessionId=? AND requested.type='user_input.requested' AND NOT EXISTS(SELECT 1 FROM events resolved WHERE resolved.sessionId=requested.sessionId AND resolved.type='user_input.resolved' AND json_extract(resolved.data,'$.requestId')=json_extract(requested.data,'$.requestId') AND resolved.seq>requested.seq) LIMIT 1",
      )
      .get(sessionId)
  )
    return 'userInput'
  return null
}

export function createChatDatabaseDeletionStorage(
  db: Database,
  sessionsRoot: string,
  fault?: (stage: ChatDatabaseDeletionStage) => void,
  settingsRoot = join(dirname(sessionsRoot), 'settings'),
) {
  const markerRoot = join(sessionsRoot, '.maintenance', 'deleted')
  const excluded = new Set<string>()
  const recoveryIssues: { sessionId: string; code: string }[] = []
  const identifier = (name: string) => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new HbarError('INVALID_STATE', 'Invalid storage table name')
    return `"${name}"`
  }
  const tables = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'session_search_fts%' AND name NOT LIKE 'chat_database_%'",
    )
    .all()
    .map(({ name }) => ({
      name,
      columns: db
        .query<{ name: string }, []>(`PRAGMA table_info(${identifier(name)})`)
        .all()
        .map((column) => column.name),
      dependencies: db
        .query<{ table: string }, []>(`PRAGMA foreign_key_list(${identifier(name)})`)
        .all()
        .map((row) => row.table),
    }))
  const sessionTables = tables.filter((table) => table.name !== 'sessions' && table.columns.includes('sessionId'))
  const depth = (name: string, seen: ReadonlySet<string> = new Set()): number => {
    if (seen.has(name)) return 0
    const next = new Set(seen).add(name)
    return Math.max(
      0,
      ...(tables.find((table) => table.name === name)?.dependencies ?? []).map(
        (dependency) => 1 + depth(dependency, next),
      ),
    )
  }
  sessionTables.sort((left, right) => depth(right.name) - depth(left.name))
  function revision(): number {
    return (
      db.query<{ revision: number }, []>('SELECT revision FROM directory_activity_revision WHERE id=1').get()
        ?.revision ?? 0
    )
  }
  function project(marker: Marker): Marker {
    const result = db
      .transaction(() => {
        const previous = db
          .query<{ dataJson: string }, [string]>(
            'SELECT dataJson FROM chat_database_deleted_sessions WHERE sessionId=?',
          )
          .get(marker.sessionId)
        const saved = previous ? markerSchema.parse(JSON.parse(previous.dataJson)) : marker
        for (const receipt of marker.createReceipts)
          db.query(
            'INSERT INTO entity_command_receipts VALUES(?,?,?,?,?) ON CONFLICT(actorId,idempotencyKey) DO UPDATE SET resultJson=excluded.resultJson',
          ).run(
            receipt.actorId,
            receipt.idempotencyKey,
            receipt.commandId,
            receipt.payloadHash,
            JSON.stringify({ deletedSessionId: marker.sessionId }),
          )
        db.query('INSERT OR IGNORE INTO chat_database_deleted_sessions VALUES(?,?,?,?)').run(
          marker.sessionId,
          marker.operationId,
          marker.deletedAt,
          JSON.stringify(marker),
        )
        if (!db.query('SELECT id FROM sessions WHERE id=?').get(marker.sessionId)) return saved
        const before = db.query<{ freelist_count: number }, []>('PRAGMA freelist_count').get()?.freelist_count ?? 0
        db.query(
          "INSERT INTO session_search_fts(session_search_fts,rowid,normalizedBody) SELECT 'delete',id,normalizedBody FROM session_search_documents WHERE sessionId=?",
        ).run(marker.sessionId)
        db.query(
          'DELETE FROM session_search_indexed WHERE messageId IN (SELECT id FROM messages WHERE sessionId=?)',
        ).run(marker.sessionId)
        db.query('DELETE FROM settings_layers WHERE kind=? AND targetId=?').run('session', marker.sessionId)
        db.query('DELETE FROM chat_database_artifact_refs WHERE source=? AND ownerId=?').run('legacySettings', `session:${marker.sessionId}`)
        db.query('DELETE FROM chat_database_artifact_refs WHERE source=? AND deviceId=? AND ownerId=?').run('upload', 'host-tools', `host-tools/session:${marker.sessionId}`)
        db.query("DELETE FROM settings_receipts WHERE json_extract(receiptJson,'$.scope.targetId')=?").run(
          marker.sessionId,
        )
        db.query(
          "DELETE FROM entity_command_receipts WHERE commandId!='session.create' AND (json_extract(resultJson,'$.sessionId')=? OR json_extract(resultJson,'$.scope.targetId')=?)",
        ).run(marker.sessionId, marker.sessionId)
        for (const table of sessionTables)
          db.query(`DELETE FROM ${identifier(table.name)} WHERE sessionId=?`).run(marker.sessionId)
        db.query('DELETE FROM sessions WHERE id=?').run(marker.sessionId)
        const after = db.query<{ freelist_count: number }, []>('PRAGMA freelist_count').get()?.freelist_count ?? 0
        const pageSize = db.query<{ page_size: number }, []>('PRAGMA page_size').get()?.page_size ?? 0
        const completed = { ...saved, reusableBytes: Math.max(0, after - before) * pageSize }
        db.query('UPDATE chat_database_deleted_sessions SET dataJson=? WHERE sessionId=?').run(
          JSON.stringify(completed),
          marker.sessionId,
        )
        return completed
      })
      .immediate()
    excluded.add(marker.sessionId)
    writeMarker(result)
    return result
  }
  function unlinkLogs(marker: Marker): number {
    let reclaimed = 0
    const visit = (path: string, level: number): void => {
      if (!existsSync(path) || level > 8) return
      verifyPath(sessionsRoot, path)
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const child = join(path, entry.name)
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) visit(child, level + 1)
        else if (entry.isFile() && entry.name === `${marker.sessionId}.jsonl`) {
          verifyPath(sessionsRoot, child)
          const size = lstatSync(child).size
          unlinkSync(child)
          reclaimed += size
        }
      }
    }
    for (const projectId of marker.logProjects) {
      const root = join(sessionsRoot, projectId)
      verifyPath(sessionsRoot, root)
      visit(root, 0)
    }
    const settingsPath = join(settingsRoot, 'sessions', `${marker.sessionId}.json`)
    verifyPath(settingsRoot, settingsPath)
    if (existsSync(settingsPath)) unlinkSync(settingsPath)
    return reclaimed
  }
  function writeMarker(marker: Marker): void {
    verifyPath(sessionsRoot, markerRoot)
    mkdirSync(markerRoot, { recursive: true })
    verifyPath(sessionsRoot, markerRoot)
    const path = join(markerRoot, `${marker.sessionId}.json`)
    const temporary = `${path}.${crypto.randomUUID()}.pending`
    writeFileSync(temporary, JSON.stringify(marker), { flag: 'wx', mode: 0o600 })
    const descriptor = openSync(temporary, 'r+')
    try {
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    renameSync(temporary, path)
    // Directory fsync is supported on POSIX. Windows does not expose directory handles through this API.
    if (process.platform !== 'win32') {
      const directory = openSync(markerRoot, 'r')
      try {
        fsyncSync(directory)
      } finally {
        closeSync(directory)
      }
    }
  }
  function reconcile(): ReadonlySet<string> {
    verifyPath(sessionsRoot, markerRoot)
    if (existsSync(markerRoot))
      for (const entry of readdirSync(markerRoot, { withFileTypes: true })) {
        if (!entry.name.endsWith('.json')) continue
        if (!entry.isFile()) throw new HbarError('PATH_REDIRECTED', 'Deletion marker is not a regular file')
        const marker = markerSchema.parse(JSON.parse(readFileSync(join(markerRoot, entry.name), 'utf8')))
        if (entry.name !== `${marker.sessionId}.json`)
          throw new HbarError('INVALID_STATE', 'Deletion marker identity mismatch')
        const completed = project(marker)
        try {
          unlinkLogs(completed)
        } catch (reason) {
          if (!(reason instanceof Error)) throw reason
          if (recoveryIssues.length < 32)
            recoveryIssues.push({
              sessionId: marker.sessionId,
              code: reason instanceof HbarError ? reason.code : 'LOG_DELETE_FAILED',
            })
        }
      }
    for (const row of db.query<{ sessionId: string }, []>('SELECT sessionId FROM chat_database_deleted_sessions').all())
      excluded.add(row.sessionId)
    return excluded
  }
  function remove(input: ChatDatabaseDeleteInput): ChatDatabaseDeleteResult {
    const row = db
      .query<{ id: string; workspaceId: string; seq: number; lastActivityAt: number; logicalBytes: number }, [string]>(
        'SELECT s.id,s.workspaceId,s.seq,COALESCE(u.lastActivityAt,s.createdAt) AS lastActivityAt,COALESCE(u.logicalBytes,0) AS logicalBytes FROM sessions s LEFT JOIN chat_database_usage u ON u.sessionId=s.id WHERE s.id=?',
      )
      .get(input.sessionId)
    const skipped = (reason: ChatDatabaseSkipReason): ChatDatabaseDeleteResult => ({
      deleted: false,
      reason,
      reclaimedBytes: 0,
      reusableBytes: 0,
      revision: revision(),
    })
    if (!row) {
      const prior = db
        .query<{ dataJson: string }, [string, string]>(
          'SELECT dataJson FROM chat_database_deleted_sessions WHERE sessionId=? AND operationId=?',
        )
        .get(input.sessionId, input.operationId)
      if (!prior) return skipped('missing')
      const marker = markerSchema.parse(JSON.parse(prior.dataJson))
      unlinkLogs(marker)
      return {
        deleted: true,
        reason: null,
        reclaimedBytes: marker.logBytes,
        reusableBytes: marker.reusableBytes,
        revision: revision(),
      }
    }
    if (row.seq !== input.expectedSeq || row.lastActivityAt !== input.expectedActivityAt) return skipped('changed')
    const protection = chatDatabaseSessionProtection(db, row.id)
    if (protection) return skipped(protection)
    if (db.query('SELECT id FROM sessions WHERE parentId=? LIMIT 1').get(row.id)) return skipped('retainedChild')
    const logBytes =
      db
        .query<{ size: number }, [string]>(
          'SELECT COALESCE(SUM(size),0) AS size FROM session_log_files WHERE sessionId=?',
        )
        .get(row.id)?.size ?? 0
    const marker = markerSchema.parse({
      schemaVersion: 1,
      sessionId: row.id,
      workspaceId: row.workspaceId,
      operationId: input.operationId,
      deletedAt: Date.now(),
      logicalBytes: row.logicalBytes,
      logBytes,
      reusableBytes: 0,
      logProjects: db
        .query<{ projectId: string }, [string]>('SELECT DISTINCT projectId FROM session_log_files WHERE sessionId=?')
        .all(row.id)
        .map((item) => item.projectId),
      createReceipts: db
        .query<{ commandId: string; actorId: string; idempotencyKey: string; payloadHash: string }, [string]>(
          "SELECT commandId,actorId,idempotencyKey,payloadHash FROM entity_command_receipts WHERE commandId IN ('session.create','session.fork','session.forkFromMessage') AND json_extract(resultJson,'$.id')=?",
        )
        .all(row.id),
    })
    writeMarker(marker)
    fault?.('marked')
    const completed = project(marker)
    fault?.('projected')
    const reclaimedBytes = unlinkLogs(marker)
    fault?.('unlinked')
    return { deleted: true, reason: null, reclaimedBytes, reusableBytes: completed.reusableBytes, revision: revision() }
  }
  return { remove, reconcile, excluded, recoveryIssues }
}
