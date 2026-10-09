import type { Database } from 'bun:sqlite'
import { HbarError } from '@hbar/contracts'
import type { ChatDatabaseScope, ChatDatabaseUsage } from '@hbar/contracts/commands/chat-database'
import {
  chatDatabaseProjectionSources,
  chatDatabaseRecordValues,
  chatDatabaseReferenceStatements,
  CHAT_DATABASE_USAGE_CONFLICT,
} from './chat-database-sources'

export function createChatDatabaseProjection(db: Database) {
  function complete(): boolean {
    return !db.query('SELECT source FROM chat_database_backfill WHERE complete=0 LIMIT 1').get()
  }
  function backfill(limit = 250): { complete: boolean } {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
      throw new HbarError('INVALID_INPUT', 'Invalid history backfill batch size')
    return db.transaction(() => {
      const pending = db
        .query<{ source: string; afterId: string | null }, []>(
          'SELECT source,afterId FROM chat_database_backfill WHERE complete=0 ORDER BY source LIMIT 1',
        )
        .get()
      if (!pending) return { complete: true }
      const source = chatDatabaseProjectionSources.find((item) => item.source === pending.source)
      if (!source) throw new HbarError('INVALID_STATE', 'Unknown chat database projection source')
      const rows = db
        .query<{ recordId: string }, [string | null, string | null, number]>(
          `SELECT ${source.id} AS recordId FROM ${source.table} item
         WHERE (? IS NULL OR ${source.id} COLLATE BINARY>?) ORDER BY ${source.id} COLLATE BINARY LIMIT ?`,
        )
        .all(pending.afterId, pending.afterId, limit)
      for (const row of rows) {
        if (source.usage)
          db.query(
            `INSERT INTO chat_database_usage_records(source,recordId,sessionId,messageCount,contentBytes,payloadBytes,activityAt)
          SELECT ${chatDatabaseRecordValues(source, 'item')} FROM ${source.table} item WHERE ${source.id}=? ${CHAT_DATABASE_USAGE_CONFLICT}`,
          ).run(row.recordId)
        for (const json of source.json) {
          for (const sql of chatDatabaseReferenceStatements(
            source,
            'item',
            json,
            `${source.table} item,`,
            `${source.id}=? AND `,
          ))
            db.query(sql).run(row.recordId)
        }
      }
      db.query('UPDATE chat_database_backfill SET afterId=COALESCE(?,afterId),complete=? WHERE source=?').run(
        rows.at(-1)?.recordId ?? null,
        rows.length < limit ? 1 : 0,
        source.source,
      )
      return { complete: complete() }
    })()
  }
  function scopeTarget(scope: ChatDatabaseScope): string | null {
    if (scope.kind === 'global') return null
    const row =
      scope.kind === 'workspace'
        ? db.query('SELECT id FROM workspaces WHERE id=?').get(scope.targetId)
        : db.query('SELECT id FROM sessions WHERE id=?').get(scope.targetId)
    if (!row) throw new HbarError('NOT_FOUND', 'Chat database scope is unavailable')
    return scope.targetId
  }
  function usage(scope: ChatDatabaseScope): ChatDatabaseUsage {
    const target = scopeTarget(scope)
    const row = db
      .query<
        {
          sessionCount: number
          archivedCount: number
          messageCount: number
          contentBytes: number
          logicalBytes: number
          lastActivityAt: number | null
        },
        [string, string | null, string | null]
      >(
        `SELECT COUNT(s.id) AS sessionCount,COALESCE(SUM(s.archived),0) AS archivedCount,
      COALESCE(SUM(u.messageCount),0) AS messageCount,COALESCE(SUM(u.contentBytes),0) AS contentBytes,
      COALESCE(SUM(u.logicalBytes),0) AS logicalBytes,MAX(COALESCE(u.lastActivityAt,s.createdAt)) AS lastActivityAt
      FROM sessions s LEFT JOIN chat_database_usage u ON u.sessionId=s.id
      WHERE CASE ? WHEN 'global' THEN 1 WHEN 'workspace' THEN s.workspaceId=? ELSE s.id=? END`,
      )
      .get(scope.kind, target, target)
    if (!row) throw new HbarError('INVALID_STATE', 'Chat database usage is unavailable')
    const freePages = db.query<{ freelist_count: number }, []>('PRAGMA freelist_count').get()?.freelist_count ?? 0
    const pageSize = db.query<{ page_size: number }, []>('PRAGMA page_size').get()?.page_size ?? 0
    const revision = db
      .query<{ revision: number }, []>('SELECT revision FROM directory_activity_revision WHERE id=1')
      .get()?.revision
    if (revision === undefined) throw new HbarError('INVALID_STATE', 'Directory revision is unavailable')
    return { ...row, freePageBytes: freePages * pageSize, revision, complete: complete() }
  }
  function artifactPage(
    scope: ChatDatabaseScope,
    after: string | null,
    limit = 100,
  ): { ids: string[]; next: string | null } {
    const target = scopeTarget(scope)
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new HbarError('INVALID_INPUT', 'Invalid attachment page size')
    const rows = db
      .query<{ artifactId: string }, [string, string | null, string | null, string | null, string | null, number]>(
        `SELECT DISTINCT artifactId FROM chat_database_artifact_refs
       WHERE CASE ? WHEN 'global' THEN 1 WHEN 'workspace' THEN workspaceId=? ELSE sessionId=? END
       AND (? IS NULL OR artifactId>?) ORDER BY artifactId LIMIT ?`,
      )
      .all(scope.kind, target, target, after, after, limit + 1)
    const ids = rows.slice(0, limit).map((row) => row.artifactId)
    return { ids, next: rows.length > limit ? (ids.at(-1) ?? null) : null }
  }
  return { backfill, usage, artifactPage }
}
