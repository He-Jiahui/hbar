import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { contentBlockSchema, type ContentBlock } from '@hbar/contracts'
import {
  sessionRecentInputSchema,
  sessionRecentPageSchema,
  sessionSearchInputSchema,
  sessionSearchPageSchema,
  type SessionRecentInput,
  type SessionRecentPage,
  type SessionSearchInput,
  type SessionSearchPage,
} from '@hbar/contracts/commands/session-search'

/** A disposable projection; canonical messages and JSONL remain the source of truth. */
export const SESSION_SEARCH_SQL = `
  CREATE TABLE IF NOT EXISTS session_search_progress(id INTEGER PRIMARY KEY CHECK(id=1), lastMessageRowid INTEGER NOT NULL);
  INSERT OR IGNORE INTO session_search_progress(id,lastMessageRowid) VALUES(1,0);
  CREATE TABLE IF NOT EXISTS session_search_queue(
    messageId TEXT PRIMARY KEY, sessionId TEXT NOT NULL, role TEXT NOT NULL,
    seq INTEGER NOT NULL, body TEXT NOT NULL, nextOffset INTEGER NOT NULL,
    segmentIndex INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS session_search_indexed(messageId TEXT PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS session_search_documents(
    id INTEGER PRIMARY KEY, messageId TEXT NOT NULL, sessionId TEXT NOT NULL,
    role TEXT NOT NULL, seq INTEGER NOT NULL, segmentIndex INTEGER NOT NULL,
    body TEXT NOT NULL, normalizedBody TEXT NOT NULL,
    UNIQUE(messageId,segmentIndex)
  );
  CREATE INDEX IF NOT EXISTS session_search_documents_session ON session_search_documents(sessionId,seq);
  CREATE VIRTUAL TABLE IF NOT EXISTS session_search_fts USING fts5(
    normalizedBody, content='session_search_documents', content_rowid='id', tokenize='trigram'
  );
  CREATE INDEX IF NOT EXISTS sessions_recent_search ON sessions(archived,updatedAt DESC,id);
`

const DISCOVER_PER_STEP = 8
const SEGMENTS_PER_STEP = 8
const SEGMENT_LENGTH = 4096
const SEGMENT_OVERLAP = 160
const CANDIDATE_CAP = 4000
const MATCH_COUNT_CAP = 999
const SNIPPET_CONTEXT = 70

interface MessageRow {
  rowid: number
  id: string
  sessionId: string
  role: string
  seq: number
  content: string
}
interface QueueRow {
  messageId: string
  sessionId: string
  role: string
  seq: number
  nextOffset: number
  segmentIndex: number
}
interface CandidateRow {
  id: number
  messageId: string
  sessionId: string
  role: 'user' | 'assistant'
  seq: number
  segmentIndex: number
  workspaceId: string
  title: string
  workspaceName: string
  updatedAt: number
}
interface RecentRow {
  sessionId: string
  workspaceId: string
  title: string
  workspaceName: string
  updatedAt: number
}

function normalize(value: string): string {
  return Array.from(value, (point) => point.toLowerCase()).join('')
}

function snippet(body: string, normalizedNeedle: string): { before: string; hit: string; after: string } | null {
  let normalized = ''
  const starts: number[] = []
  const ends: number[] = []
  for (let offset = 0; offset < body.length;) {
    const codePoint = body.codePointAt(offset)
    if (codePoint === undefined) break
    const source = String.fromCodePoint(codePoint)
    const lower = source.toLowerCase()
    normalized += lower
    for (let index = 0; index < lower.length; index++) {
      starts.push(offset)
      ends.push(offset + source.length)
    }
    offset += source.length
  }
  const matchAt = normalized.indexOf(normalizedNeedle)
  if (matchAt < 0) return null
  const start = starts[matchAt]
  const end = ends[matchAt + normalizedNeedle.length - 1]
  if (start === undefined || end === undefined) return null
  return {
    before: Array.from(body.slice(0, start)).slice(-SNIPPET_CONTEXT).join(''),
    hit: body.slice(start, end),
    after: Array.from(body.slice(end)).slice(0, SNIPPET_CONTEXT).join(''),
  }
}

function textBody(role: string, content: readonly ContentBlock[]): string | null {
  if (role !== 'user' && role !== 'assistant') return null
  const body = content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n')
  return body.trim() ? body : null
}

export function createSessionSearchStorage(db: Database, displayNames: () => ReadonlyMap<string, string>) {
  function indexStatus(): { complete: boolean } {
    const progress = db.query('SELECT lastMessageRowid FROM session_search_progress WHERE id=1').get() as {
      lastMessageRowid: number
    }
    const hasMore = Boolean(db.query('SELECT rowid FROM messages WHERE rowid>? LIMIT 1').get(progress.lastMessageRowid))
    const hasQueue = Boolean(db.query('SELECT messageId FROM session_search_queue LIMIT 1').get())
    return { complete: !hasMore && !hasQueue }
  }

  function queueMessage(
    messageId: string,
    sessionId: string,
    role: string,
    seq: number,
    content: readonly ContentBlock[],
  ) {
    const body = textBody(role, content)
    if (!body) return
    if (db.query('SELECT messageId FROM session_search_indexed WHERE messageId=?').get(messageId)) return
    db.query('INSERT OR IGNORE INTO session_search_queue VALUES(?,?,?,?,?,?,?)').run(
      messageId,
      sessionId,
      role,
      seq,
      body,
      0,
      0,
    )
  }

  function backfillStep(): { complete: boolean } {
    return db.transaction(() => {
      const progress = db.query('SELECT lastMessageRowid FROM session_search_progress WHERE id=1').get() as {
        lastMessageRowid: number
      }
      const legacy = db
        .query('SELECT rowid,id,sessionId,role,seq,content FROM messages WHERE rowid>? ORDER BY rowid LIMIT ?')
        .all(progress.lastMessageRowid, DISCOVER_PER_STEP) as MessageRow[]
      for (const row of legacy) {
        if (row.role !== 'user' && row.role !== 'assistant') continue
        const content = z.array(contentBlockSchema).parse(JSON.parse(row.content) as unknown)
        queueMessage(row.id, row.sessionId, row.role, row.seq, content)
      }
      const last = legacy.at(-1)
      if (last) db.query('UPDATE session_search_progress SET lastMessageRowid=? WHERE id=1').run(last.rowid)

      for (let index = 0; index < SEGMENTS_PER_STEP; index++) {
        const queued = db
          .query(
            'SELECT messageId,sessionId,role,seq,nextOffset,segmentIndex FROM session_search_queue ORDER BY messageId LIMIT 1',
          )
          .get() as QueueRow | null
        if (!queued) break
        const segment = db
          .query(
            'SELECT length(body) AS bodyLength,substr(body,?,?) AS body FROM session_search_queue WHERE messageId=?',
          )
          .get(queued.nextOffset + 1, SEGMENT_LENGTH + SEGMENT_OVERLAP, queued.messageId) as {
          bodyLength: number
          body: string
        }
        if (segment.body) {
          db.query(
            'INSERT INTO session_search_documents(messageId,sessionId,role,seq,segmentIndex,body,normalizedBody) VALUES(?,?,?,?,?,?,?)',
          ).run(
            queued.messageId,
            queued.sessionId,
            queued.role,
            queued.seq,
            queued.segmentIndex,
            segment.body,
            normalize(segment.body),
          )
          const inserted = db.query('SELECT last_insert_rowid() AS id').get() as { id: number }
          db.query('INSERT INTO session_search_fts(rowid,normalizedBody) VALUES(?,?)').run(
            inserted.id,
            normalize(segment.body),
          )
        }
        const nextOffset = queued.nextOffset + SEGMENT_LENGTH
        if (nextOffset >= segment.bodyLength) {
          db.query('INSERT INTO session_search_indexed(messageId) VALUES(?)').run(queued.messageId)
          db.query('DELETE FROM session_search_queue WHERE messageId=?').run(queued.messageId)
        } else {
          db.query('UPDATE session_search_queue SET nextOffset=?,segmentIndex=? WHERE messageId=?').run(
            nextOffset,
            queued.segmentIndex + 1,
            queued.messageId,
          )
        }
      }
      return indexStatus()
    })()
  }

  function recent(input: SessionRecentInput): SessionRecentPage {
    const { limit } = sessionRecentInputSchema.parse(input)
    const names = displayNames()
    const rows = db
      .query(
        `SELECT s.id AS sessionId,s.workspaceId,s.title,w.name AS workspaceName,s.updatedAt
         FROM sessions s JOIN workspaces w ON w.id=s.workspaceId
         WHERE s.archived=0 ORDER BY s.updatedAt DESC,s.id LIMIT ?`,
      )
      .all(limit) as RecentRow[]
    return sessionRecentPageSchema.parse({
      items: rows.map((row) => ({ ...row, workspaceName: names.get(row.workspaceId) ?? row.workspaceName })),
    })
  }

  function search(input: SessionSearchInput): SessionSearchPage {
    const parsed = sessionSearchInputSchema.parse(input)
    const normalizedQuery = normalize(parsed.query)
    const codePoints = Array.from(normalizedQuery).length
    const candidateIds =
      codePoints >= 3
        ? (
            db
              .query('SELECT rowid AS id FROM session_search_fts WHERE session_search_fts MATCH ? LIMIT ?')
              .all(`"${normalizedQuery.replaceAll('"', '""')}"`, CANDIDATE_CAP + 1) as { id: number }[]
          ).map((item) => item.id)
        : (
            db.query('SELECT id FROM session_search_documents ORDER BY id LIMIT ?').all(CANDIDATE_CAP + 1) as {
              id: number
            }[]
          ).map((item) => item.id)
    const scanCap = candidateIds.length > CANDIDATE_CAP
    const names = displayNames()
    const groups = new Map<string, { identity: RecentRow; messages: Map<string, CandidateRow> }>()
    for (let offset = 0; offset < Math.min(candidateIds.length, CANDIDATE_CAP); offset += 200) {
      const ids = candidateIds.slice(offset, offset + 200)
      if (!ids.length) break
      const placeholders = ids.map(() => '?').join(',')
      const rows = db
        .query(
          `SELECT d.id,d.messageId,d.sessionId,d.role,d.seq,d.segmentIndex,
                  s.workspaceId,s.title,w.name AS workspaceName,s.updatedAt
           FROM session_search_documents d
           JOIN sessions s ON s.id=d.sessionId
           JOIN workspaces w ON w.id=s.workspaceId
           WHERE d.id IN (${placeholders}) AND s.archived=0
             AND instr(d.normalizedBody,?)>0`,
        )
        .all(...ids, normalizedQuery) as CandidateRow[]
      for (const row of rows) {
        if (row.role !== 'user' && row.role !== 'assistant') continue
        let group = groups.get(row.sessionId)
        if (!group) {
          group = {
            identity: {
              sessionId: row.sessionId,
              workspaceId: row.workspaceId,
              title: row.title,
              workspaceName: names.get(row.workspaceId) ?? row.workspaceName,
              updatedAt: row.updatedAt,
            },
            messages: new Map(),
          }
          groups.set(row.sessionId, group)
        }
        const previous = group.messages.get(row.messageId)
        if (!previous || row.segmentIndex < previous.segmentIndex) group.messages.set(row.messageId, row)
      }
    }
    const ranked = [...groups.values()].sort(
      (left, right) =>
        right.identity.updatedAt - left.identity.updatedAt ||
        left.identity.sessionId.localeCompare(right.identity.sessionId),
    )
    const items = ranked.slice(0, parsed.limit).map((group) => {
      const messages = [...group.messages.values()]
      messages.sort((left, right) => right.seq - left.seq || left.segmentIndex - right.segmentIndex)
      const matches = messages.slice(0, parsed.matchesPerSession).flatMap((row) => {
        const document = db.query('SELECT body FROM session_search_documents WHERE id=?').get(row.id) as {
          body: string
        } | null
        if (!document) return []
        const excerpt = snippet(document.body, normalizedQuery)
        return excerpt ? [{ messageId: row.messageId, role: row.role, snippet: excerpt }] : []
      })
      return {
        ...group.identity,
        matchCount: Math.min(group.messages.size, MATCH_COUNT_CAP),
        matchCountCapped: scanCap || group.messages.size > MATCH_COUNT_CAP,
        matches,
      }
    })
    return sessionSearchPageSchema.parse({
      items,
      truncated: ranked.length > parsed.limit,
      incompleteReason: scanCap ? 'scan_cap' : null,
    })
  }

  return { queueMessage, indexStatus, backfillStep, recent, search }
}
