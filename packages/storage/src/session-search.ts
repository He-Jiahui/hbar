import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { contentBlockSchema, type ContentBlock } from '@hbar/contracts'
import { sessionSearchDocuments } from './session-search-source'
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
    segmentIndex INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'conversation',
    blockIndex INTEGER NOT NULL DEFAULT 0, callId TEXT, targetMessageId TEXT, originalMessageId TEXT
  );
  CREATE TABLE IF NOT EXISTS session_search_indexed(messageId TEXT PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS session_search_documents(
    id INTEGER PRIMARY KEY, messageId TEXT NOT NULL, sessionId TEXT NOT NULL,
    role TEXT NOT NULL, seq INTEGER NOT NULL, segmentIndex INTEGER NOT NULL,
    body TEXT NOT NULL, normalizedBody TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'conversation', blockIndex INTEGER NOT NULL DEFAULT 0,
    callId TEXT, targetMessageId TEXT,
    UNIQUE(messageId,source,blockIndex,segmentIndex)
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
  source: 'conversation' | 'file' | 'patch' | 'tool'
  blockIndex: number
  callId: string | null
  targetMessageId: string | null
  originalMessageId: string
}
interface CandidateRow {
  id: number
  messageId: string | null
  sessionId: string
  role: 'user' | 'assistant' | 'tool'
  seq: number
  segmentIndex: number
  workspaceId: string
  title: string
  workspaceName: string
  updatedAt: number
  source: 'title' | 'conversation' | 'file' | 'patch' | 'tool'
  blockIndex: number
  callId: string | null
  targetMessageId: string | null
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

export function createSessionSearchStorage(db: Database, displayNames: () => ReadonlyMap<string, string>) {
  // Rebuild only disposable search tables when upgrading the source projection.
  const columns = z
    .array(z.object({ name: z.string() }))
    .parse(db.query('PRAGMA table_info(session_search_documents)').all())
  if (!columns.some((column) => column.name === 'source')) {
    db.transaction(() => {
      db.exec(`DROP TABLE IF EXISTS session_search_fts;
        DROP TABLE IF EXISTS session_search_documents;
        DROP TABLE IF EXISTS session_search_queue;
        DROP TABLE IF EXISTS session_search_indexed;
        DROP TABLE IF EXISTS session_search_progress;`)
      db.exec(SESSION_SEARCH_SQL)
    })()
  }
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
    if (db.query('SELECT messageId FROM session_search_indexed WHERE messageId=?').get(messageId)) return
    for (const document of sessionSearchDocuments(role, content)) {
      let targetMessageId = messageId
      let blockIndex = document.blockIndex
      if (role === 'tool' && document.callId) {
        const parent = z
          .object({ id: z.string(), blockIndex: z.number() })
          .nullable()
          .parse(
            db
              .query(
                `SELECT m.id, CAST(b.key AS INTEGER) AS blockIndex FROM messages m, json_each(m.content) b
           WHERE m.sessionId=? AND m.seq<=? AND m.role='assistant'
             AND json_extract(b.value,'$.type')='tool_call' AND json_extract(b.value,'$.callId')=?
           ORDER BY m.seq DESC LIMIT 1`,
              )
              .get(sessionId, seq, document.callId),
          )
        if (parent) {
          targetMessageId = parent.id
          blockIndex = parent.blockIndex
        }
      }
      db.query(
        `INSERT OR IGNORE INTO session_search_queue
        (messageId,sessionId,role,seq,body,nextOffset,segmentIndex,source,blockIndex,callId,targetMessageId,originalMessageId)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        JSON.stringify([messageId, document.source, document.blockIndex]),
        sessionId,
        role,
        seq,
        document.body,
        0,
        0,
        document.source,
        blockIndex,
        document.callId,
        targetMessageId,
        messageId,
      )
    }
    db.query('INSERT OR IGNORE INTO session_search_indexed(messageId) VALUES(?)').run(messageId)
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
        if (!['user', 'assistant', 'tool'].includes(row.role)) continue
        const content = z.array(contentBlockSchema).parse(JSON.parse(row.content) as unknown)
        queueMessage(row.id, row.sessionId, row.role, row.seq, content)
      }
      const last = legacy.at(-1)
      if (last) db.query('UPDATE session_search_progress SET lastMessageRowid=? WHERE id=1').run(last.rowid)

      for (let index = 0; index < SEGMENTS_PER_STEP; index++) {
        const queued = db
          .query('SELECT * FROM session_search_queue ORDER BY messageId LIMIT 1')
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
            `INSERT INTO session_search_documents(messageId,sessionId,role,seq,segmentIndex,body,normalizedBody,
              source,blockIndex,callId,targetMessageId) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
          ).run(
            queued.originalMessageId,
            queued.sessionId,
            queued.role,
            queued.seq,
            queued.segmentIndex,
            segment.body,
            normalize(segment.body),
            queued.source,
            queued.blockIndex,
            queued.callId,
            queued.targetMessageId,
          )
          const inserted = db.query('SELECT last_insert_rowid() AS id').get() as { id: number }
          db.query('INSERT INTO session_search_fts(rowid,normalizedBody) VALUES(?,?)').run(
            inserted.id,
            normalize(segment.body),
          )
        }
        const nextOffset = queued.nextOffset + SEGMENT_LENGTH
        if (nextOffset >= segment.bodyLength) {
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
      parsed.source === 'title'
        ? []
        : codePoints >= 3
          ? (
              db
                .query(
                  `SELECT f.rowid AS id FROM session_search_fts f
                JOIN session_search_documents d ON d.id=f.rowid JOIN sessions s ON s.id=d.sessionId
                WHERE session_search_fts MATCH ? AND s.archived=0 AND (?='all' OR d.source=?) LIMIT ?`,
                )
                .all(`"${normalizedQuery.replaceAll('"', '""')}"`, parsed.source, parsed.source, CANDIDATE_CAP + 1) as {
                id: number
              }[]
            ).map((item) => item.id)
          : (
              db
                .query(
                  `SELECT d.id FROM session_search_documents d JOIN sessions s ON s.id=d.sessionId
              WHERE s.archived=0 AND (?='all' OR d.source=?) ORDER BY d.id LIMIT ?`,
                )
                .all(parsed.source, parsed.source, CANDIDATE_CAP + 1) as {
                id: number
              }[]
            ).map((item) => item.id)
    let scanCap = candidateIds.length > CANDIDATE_CAP
    const names = displayNames()
    const groups = new Map<string, { identity: RecentRow; messages: Map<string, CandidateRow> }>()
    if (parsed.source === 'all' || parsed.source === 'title') {
      const titles = db
        .query(
          `SELECT s.id AS sessionId,s.workspaceId,s.title,w.name AS workspaceName,s.updatedAt
        FROM sessions s JOIN workspaces w ON w.id=s.workspaceId WHERE s.archived=0
        ORDER BY s.updatedAt DESC,s.id LIMIT ?`,
        )
        .all(CANDIDATE_CAP + 1) as RecentRow[]
      scanCap ||= titles.length > CANDIDATE_CAP
      for (const identity of titles.slice(0, CANDIDATE_CAP)) {
        if (!normalize(identity.title).includes(normalizedQuery)) continue
        groups.set(identity.sessionId, {
          identity: { ...identity, workspaceName: names.get(identity.workspaceId) ?? identity.workspaceName },
          messages: new Map([
            [
              'title',
              {
                ...identity,
                id: 0,
                messageId: null,
                role: 'assistant',
                seq: Number.MAX_SAFE_INTEGER,
                segmentIndex: 0,
                source: 'title',
                blockIndex: 0,
                callId: null,
                targetMessageId: null,
              },
            ],
          ]),
        })
      }
    }
    for (let offset = 0; offset < Math.min(candidateIds.length, CANDIDATE_CAP); offset += 200) {
      const ids = candidateIds.slice(offset, offset + 200)
      if (!ids.length) break
      const placeholders = ids.map(() => '?').join(',')
      const rows = db
        .query(
          `SELECT d.id,d.messageId,d.sessionId,d.role,d.seq,d.segmentIndex,d.source,d.blockIndex,d.callId,d.targetMessageId,
                  s.workspaceId,s.title,w.name AS workspaceName,s.updatedAt
           FROM session_search_documents d
           JOIN sessions s ON s.id=d.sessionId
           JOIN workspaces w ON w.id=s.workspaceId
           WHERE d.id IN (${placeholders}) AND s.archived=0
             AND instr(d.normalizedBody,?)>0`,
        )
        .all(...ids, normalizedQuery) as CandidateRow[]
      for (const row of rows) {
        if (!['user', 'assistant', 'tool'].includes(row.role)) continue
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
        const key = JSON.stringify([row.messageId, row.source, row.blockIndex])
        const previous = group.messages.get(key)
        if (!previous || row.segmentIndex < previous.segmentIndex) group.messages.set(key, row)
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
        const document =
          row.source === 'title'
            ? { body: row.title }
            : (db.query('SELECT body FROM session_search_documents WHERE id=?').get(row.id) as {
                body: string
              } | null)
        if (!document) return []
        const excerpt = snippet(document.body, normalizedQuery)
        return excerpt
          ? [
              {
                messageId: row.messageId,
                role: row.role,
                source: row.source,
                targetMessageId: row.targetMessageId,
                blockIndex: row.source === 'title' ? null : row.blockIndex,
                callId: row.callId,
                snippet: excerpt,
              },
            ]
          : []
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
