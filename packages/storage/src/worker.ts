import { Database } from 'bun:sqlite'
import { workerData, parentPort } from 'node:worker_threads'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  HbarError,
  contentBlockSchema,
  emptyUsage,
  providerSchema,
  runFailureSchema,
  runSchema,
  sessionEventSchema,
} from '@hbar/contracts'
import { z } from 'zod'
import {
  workspaceSchema,
  sessionSchema,
  workspaceListInputSchema,
  sessionListInputSchema,
} from '@hbar/contracts/directory'
import { runCommandRecordSchema } from '@hbar/contracts/commands/run'
import { USAGE_EVENT_TYPES } from '@hbar/usage'
import type { UsageReadInput, UsageReadRow } from '@hbar/usage'
import type {
  Approval,
  ContentBlock,
  ArtifactRef,
  Device,
  Message,
  Run,
  Session,
  SessionEvent,
  Usage,
  Workspace,
} from '@hbar/contracts'
import type { StorageCall, StorageMethods, StorageReply, StoredSettingsLayer } from './types.ts'
import { SessionLogWriter } from './session-log-writer.ts'
import { recordRecoveryDiagnostic, scanSessionLogs } from './session-log-recovery.ts'
import { readActiveOperations } from './active-operations.ts'
import { readQueuedUserRuns } from './queued-user-runs.ts'
import { GOAL_HISTORY_INDEX_SQL, readGoalHistory } from './goal-history.ts'
import { createWorkspaceOrganizationStorage, WORKSPACE_ORGANIZATION_SQL } from './workspace-organization.ts'
import { createWorkspaceDisplayNamesStorage, WORKSPACE_DISPLAY_NAMES_SQL } from './workspace-display-names.ts'
import { createSessionSearchStorage, SESSION_SEARCH_SQL } from './session-search.ts'

const options = workerData as { path: string; sessions?: string; diagnostics?: string }
const sessionsRoot = options.sessions ?? join(dirname(options.path), 'sessions')
const diagnosticsRoot = options.diagnostics ?? join(dirname(options.path), 'diagnostics')
const logWriter = new SessionLogWriter(sessionsRoot)
const db = new Database(options.path, { create: true, strict: true })
// Configure this connection's bounded wait before WAL recovery/configuration can contend with another opener.
db.exec('PRAGMA busy_timeout=5000;')
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;')
const schemaVersion = (db.query('PRAGMA user_version').get() as { user_version: number }).user_version
if (schemaVersion > 9) throw new Error(`Unsupported database version ${schemaVersion}`)
if (schemaVersion === 0)
  db.transaction(() => {
    db.exec(`
    CREATE TABLE workspaces(id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, createdAt INTEGER NOT NULL);
    CREATE TABLE sessions(id TEXT PRIMARY KEY, workspaceId TEXT NOT NULL REFERENCES workspaces(id), title TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, parentId TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, seq INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE events(eventId TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id), seq INTEGER NOT NULL, runId TEXT, stepId TEXT, type TEXT NOT NULL, data TEXT NOT NULL, time INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1, UNIQUE(sessionId,seq));
    CREATE TABLE messages(id TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id), runId TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, seq INTEGER NOT NULL, createdAt INTEGER NOT NULL, providerData TEXT);
    CREATE INDEX messages_session_seq ON messages(sessionId,seq);
    CREATE TABLE runs(id TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id), requestId TEXT NOT NULL, input TEXT NOT NULL, modelId TEXT NOT NULL, status TEXT NOT NULL, createdAt INTEGER NOT NULL, startedAt INTEGER, endedAt INTEGER, error TEXT, UNIQUE(sessionId,requestId));
    CREATE INDEX runs_session_status ON runs(sessionId,status,createdAt);
    CREATE TABLE approvals(id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, runId TEXT NOT NULL, callId TEXT NOT NULL, tool TEXT NOT NULL, args TEXT NOT NULL, status TEXT NOT NULL, createdAt INTEGER NOT NULL);
    CREATE TABLE tool_intents(id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, runId TEXT NOT NULL, callId TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE providers(id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE artifacts(id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE devices(id TEXT PRIMARY KEY, name TEXT NOT NULL, tokenHash TEXT NOT NULL UNIQUE, createdAt INTEGER NOT NULL, lastSeenAt INTEGER NOT NULL);
    CREATE TABLE plugins(id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, config TEXT NOT NULL, path TEXT);
    CREATE TABLE compactions(sessionId TEXT NOT NULL, throughSeq INTEGER NOT NULL, summary TEXT NOT NULL, eventSeq INTEGER NOT NULL, PRIMARY KEY(sessionId,eventSeq));
    CREATE TABLE projects(id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, createdAt INTEGER NOT NULL);
    CREATE TABLE session_log_files(path TEXT PRIMARY KEY, projectId TEXT NOT NULL, sessionId TEXT NOT NULL, firstSeq INTEGER NOT NULL, lastSeq INTEGER NOT NULL, size INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
    CREATE TABLE session_event_index(eventId TEXT PRIMARY KEY, sessionId TEXT NOT NULL, seq INTEGER NOT NULL, logPath TEXT NOT NULL REFERENCES session_log_files(path), byteOffset INTEGER NOT NULL, byteLength INTEGER NOT NULL, contentHash TEXT NOT NULL, UNIQUE(sessionId,seq));
    CREATE INDEX session_event_index_session_seq ON session_event_index(sessionId,seq);
    CREATE TABLE path_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE settings_layers(id TEXT PRIMARY KEY, kind TEXT NOT NULL, targetId TEXT, schemaVersion INTEGER NOT NULL, revision INTEGER NOT NULL, valuesJson TEXT NOT NULL, updatedAt INTEGER NOT NULL);
    CREATE TABLE settings_receipts(actorId TEXT NOT NULL, idempotencyKey TEXT NOT NULL, payloadHash TEXT NOT NULL, receiptJson TEXT NOT NULL, PRIMARY KEY(actorId,idempotencyKey));
    CREATE TABLE entity_command_receipts(actorId TEXT NOT NULL, idempotencyKey TEXT NOT NULL, commandId TEXT NOT NULL, payloadHash TEXT NOT NULL, resultJson TEXT NOT NULL, PRIMARY KEY(actorId,idempotencyKey));
    PRAGMA user_version=4;
  `)
  })()
if (schemaVersion === 1)
  db.transaction(() => {
    db.exec(`
      CREATE TABLE projects(id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, createdAt INTEGER NOT NULL);
      INSERT OR IGNORE INTO projects SELECT id,path,name,createdAt FROM workspaces;
      CREATE TABLE session_log_files(path TEXT PRIMARY KEY, projectId TEXT NOT NULL, sessionId TEXT NOT NULL, firstSeq INTEGER NOT NULL, lastSeq INTEGER NOT NULL, size INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
      CREATE TABLE session_event_index(eventId TEXT PRIMARY KEY, sessionId TEXT NOT NULL, seq INTEGER NOT NULL, logPath TEXT NOT NULL REFERENCES session_log_files(path), byteOffset INTEGER NOT NULL, byteLength INTEGER NOT NULL, contentHash TEXT NOT NULL, UNIQUE(sessionId,seq));
      CREATE INDEX session_event_index_session_seq ON session_event_index(sessionId,seq);
      CREATE TABLE path_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version=2;
    `)
  })()
if (schemaVersion > 0 && schemaVersion <= 2)
  db.transaction(() => {
    db.exec(`
      CREATE TABLE settings_layers(id TEXT PRIMARY KEY, kind TEXT NOT NULL, targetId TEXT, schemaVersion INTEGER NOT NULL, revision INTEGER NOT NULL, valuesJson TEXT NOT NULL, updatedAt INTEGER NOT NULL);
      CREATE TABLE settings_receipts(actorId TEXT NOT NULL, idempotencyKey TEXT NOT NULL, payloadHash TEXT NOT NULL, receiptJson TEXT NOT NULL, PRIMARY KEY(actorId,idempotencyKey));
      PRAGMA user_version=3;
    `)
  })()
if (schemaVersion > 0 && schemaVersion <= 3)
  db.transaction(() => {
    db.exec(`
      CREATE TABLE entity_command_receipts(actorId TEXT NOT NULL, idempotencyKey TEXT NOT NULL, commandId TEXT NOT NULL, payloadHash TEXT NOT NULL, resultJson TEXT NOT NULL, PRIMARY KEY(actorId,idempotencyKey));
      PRAGMA user_version=4;
    `)
  })()
if (schemaVersion < 5)
  db.transaction(() => {
    db.exec('ALTER TABLE runs ADD COLUMN failure TEXT; PRAGMA user_version=5;')
  })()
if (schemaVersion < 6)
  db.transaction(() => {
    db.exec(
      'ALTER TABLE approvals ADD COLUMN feedback TEXT; ALTER TABLE approvals ADD COLUMN decidedBy TEXT; PRAGMA user_version=6;',
    )
  })()

if (schemaVersion < 7)
  db.transaction(() => {
    // Another Worker may already have completed this migration while this one waited for the write lock.
    const current = db.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version
    if (current !== 7 && current !== 8 && current !== 9) {
      if (current !== 6) throw new HbarError('VERSION_MISMATCH', 'Unsupported database migration state')
      db.exec(WORKSPACE_ORGANIZATION_SQL)
      db.exec('PRAGMA user_version=7;')
    }
  }).immediate()

if (schemaVersion < 8)
  db.transaction(() => {
    const current = db.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version
    if (current !== 8 && current !== 9) {
      if (current !== 7) throw new HbarError('VERSION_MISMATCH', 'Unsupported database migration state')
      db.exec(WORKSPACE_DISPLAY_NAMES_SQL)
      db.exec('PRAGMA user_version=8;')
    }
  }).immediate()

if (schemaVersion < 9)
  db.transaction(() => {
    const current = db.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version
    if (current !== 9) {
      if (current !== 8) throw new HbarError('VERSION_MISMATCH', 'Unsupported database migration state')
      db.exec(SESSION_SEARCH_SQL)
      db.exec('PRAGMA user_version=9;')
    }
  }).immediate()

const workspaceOrganization = createWorkspaceOrganizationStorage(db)
const workspaceDisplayNames = createWorkspaceDisplayNamesStorage(db)
const sessionSearch = createSessionSearchStorage(
  db,
  () => new Map(workspaceDisplayNames.read().entries.map((entry) => [entry.workspaceId, entry.displayName])),
)

db.exec('CREATE INDEX IF NOT EXISTS events_run_type ON events(runId,type);')
db.exec(GOAL_HISTORY_INDEX_SQL)

type Row = Record<string, unknown>
const parseJson = (value: string): unknown => JSON.parse(value) as unknown
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
function entityPayloadHash(commandId: string, input: unknown): string {
  return createHash('sha256')
    .update(stableJson({ commandId, version: 1, input }))
    .digest('hex')
}
function entityCommandReceipt(
  actorId: string,
  idempotencyKey: string,
  commandId: string,
  payloadHash: string,
): Session | null {
  const row = db
    .query('SELECT commandId,payloadHash,resultJson FROM entity_command_receipts WHERE actorId=? AND idempotencyKey=?')
    .get(actorId, idempotencyKey) as { commandId: string; payloadHash: string; resultJson: string } | null
  if (!row) return null
  if (row.commandId !== commandId || row.payloadHash !== payloadHash)
    throw new HbarError('IDEMPOTENCY_CONFLICT', 'Entity command key was already used with different input')
  return sessionSchema.parse(parseJson(row.resultJson))
}
function storeEntityCommandReceipt(
  actorId: string,
  idempotencyKey: string,
  commandId: string,
  payloadHash: string,
  result: Session,
) {
  db.query('INSERT INTO entity_command_receipts VALUES(?,?,?,?,?)').run(
    actorId,
    idempotencyKey,
    commandId,
    payloadHash,
    stableJson(result),
  )
}
function required<T>(row: T | null, kind: string): T {
  if (!row) throw new HbarError('NOT_FOUND', `${kind} not found`)
  return row
}
function sessionRow(row: Row | null): Session {
  const value = required(row, 'Session')
  return { ...value, archived: Boolean(value.archived) } as unknown as Session
}
function runRow(row: Row | null): Run {
  const value = required(row, 'Run')
  const { failure, ...fields } = value
  return runSchema.parse({
    ...fields,
    input: parseJson(z.string().parse(value.input)),
    ...(typeof failure === 'string' ? { failure: runFailureSchema.parse(parseJson(failure)) } : {}),
  })
}
function messageRow(row: Row): Message {
  return {
    ...row,
    content: z.array(contentBlockSchema).parse(parseJson(row.content as string)),
    providerData: row.providerData ? parseJson(row.providerData as string) : undefined,
  } as unknown as Message
}

/** Shared target/run checks for the read-only affordance and the atomic write. */
function messageForkTarget(sessionId: string, messageId: string): Message {
  const targetRow = db
    .query('SELECT * FROM messages WHERE id=? AND sessionId=?')
    .get(messageId, sessionId) as Row | null
  if (!targetRow) throw new HbarError('NOT_FOUND', 'Message not found in source session')
  const target = messageRow(targetRow)
  if (target.role !== 'user' && target.role !== 'assistant')
    throw new HbarError('INVALID_TARGET', 'Only completed user or final assistant messages can be forked')
  const runRowValue = db
    .query('SELECT * FROM runs WHERE id=? AND sessionId=?')
    .get(target.runId, sessionId) as Row | null
  if (!runRowValue || runRow(runRowValue).status !== 'completed')
    throw new HbarError('INVALID_TARGET', 'The target run must have completed successfully')
  if (
    db
      .query("SELECT id FROM runs WHERE sessionId=? AND status IN ('running','waiting_approval','queued') LIMIT 1")
      .get(sessionId)
  )
    throw new HbarError('BUSY', 'Fork after the source run has settled')

  const lastRow = db
    .query('SELECT * FROM messages WHERE sessionId=? AND runId=? ORDER BY seq DESC LIMIT 1')
    .get(sessionId, target.runId) as Row | null
  const lastMessage = lastRow ? messageRow(lastRow) : null
  const settled = db
    .query("SELECT seq FROM events WHERE sessionId=? AND runId=? AND type='run.settled' ORDER BY seq LIMIT 1")
    .get(sessionId, target.runId) as { seq: number } | null
  if (!settled || !lastMessage || lastMessage.seq >= settled.seq)
    throw new HbarError('INVALID_TARGET', 'The message must precede its run settlement')
  if (
    lastMessage.role !== 'assistant' ||
    !lastMessage.content.some((block) => block.type === 'text' && block.text.trim())
  )
    throw new HbarError('INVALID_TARGET', 'The completed turn has no final assistant reply')
  if (target.role === 'user') {
    if (!target.content.some((block) => block.type === 'text' && block.text.trim()))
      throw new HbarError('INVALID_TARGET', 'The user prompt has no visible text')
    if (
      db
        .query('SELECT id FROM messages WHERE sessionId=? AND runId=? AND seq<? LIMIT 1')
        .get(sessionId, target.runId, target.seq)
    )
      throw new HbarError('INVALID_TARGET', 'The user message must start its run')
    if (lastMessage.seq <= target.seq) throw new HbarError('INVALID_TARGET', 'The user turn has no committed response')
  } else if (lastMessage.id !== target.id) {
    throw new HbarError('INVALID_TARGET', 'The assistant reply is not the end of its run')
  }

  return target
}

function toolPrefixChecker() {
  const toolCalls = new Set<string>()
  const toolResults = new Set<string>()
  let unmatched = 0
  let duplicated = false
  return {
    add(message: Pick<Message, 'runId' | 'content'>) {
      for (const block of message.content) {
        if (block.type !== 'tool_call' && block.type !== 'tool_result') continue
        const key = JSON.stringify([message.runId, block.callId, block.name])
        const bucket = block.type === 'tool_call' ? toolCalls : toolResults
        const other = block.type === 'tool_call' ? toolResults : toolCalls
        if (bucket.has(key)) duplicated = true
        else {
          bucket.add(key)
          unmatched += other.has(key) ? -1 : 1
        }
      }
    },
    valid() {
      return !duplicated && unmatched === 0
    },
  }
}

function messageForkPrefix(sessionId: string, messageId: string): { target: Message; prefix: Message[] } {
  const target = messageForkTarget(sessionId, messageId)
  const prefix = (
    db.query('SELECT * FROM messages WHERE sessionId=? AND seq<=? ORDER BY seq').all(sessionId, target.seq) as Row[]
  ).map(messageRow)
  const checker = toolPrefixChecker()
  for (const message of prefix) checker.add(message)
  if (!checker.valid())
    throw new HbarError('INVALID_BOUNDARY', 'The message prefix contains unfinished or duplicate tool facts')
  return { target, prefix }
}
function eventRow(row: Row): SessionEvent {
  return sessionEventSchema.parse({ ...row, data: parseJson(row.data as string) })
}
function usageReadRow(row: Row): UsageReadRow {
  const event = eventRow({
    eventId: row.eventId,
    sessionId: row.sessionId,
    seq: row.seq,
    runId: row.runId,
    stepId: row.stepId,
    type: row.type,
    data: row.data,
    time: row.time,
    version: row.version,
  })
  const run = row.r_id
    ? runRow({
        id: row.r_id,
        sessionId: row.r_sessionId,
        requestId: row.r_requestId,
        input: row.r_input,
        modelId: row.r_modelId,
        status: row.r_status,
        createdAt: row.r_createdAt,
        startedAt: row.r_startedAt,
        endedAt: row.r_endedAt,
        error: row.r_error,
      })
    : null
  return {
    event,
    workspaceId: String(row.workspaceId),
    parentSessionId: row.parentSessionId ? String(row.parentSessionId) : null,
    run,
  }
}
function approvalRow(row: Row | null): Approval {
  const { feedback, decidedBy, ...value } = required(row, 'Approval')
  return {
    ...value,
    args: z.record(z.string(), z.unknown()).parse(parseJson(value.args as string)),
    ...(typeof feedback === 'string' ? { feedback } : {}),
    ...(typeof decidedBy === 'string' ? { decidedBy } : {}),
  } as unknown as Approval
}
function settingsLayerRow(row: Row): StoredSettingsLayer {
  return {
    id: row.id as string,
    kind: row.kind as string,
    targetId: (row.targetId as string | null) ?? null,
    schemaVersion: row.schemaVersion as number,
    revision: row.revision as number,
    values: z.record(z.string(), z.unknown()).parse(parseJson(row.valuesJson as string)),
  }
}
function indexEvent(projectId: string, event: SessionEvent, location: ReturnType<SessionLogWriter['append']>) {
  db.query(
    `
    INSERT INTO session_log_files VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(path) DO UPDATE SET
      firstSeq=MIN(firstSeq,excluded.firstSeq),lastSeq=MAX(lastSeq,excluded.lastSeq),
      size=MAX(size,excluded.size),updatedAt=excluded.updatedAt
  `,
  ).run(
    location.relativePath,
    projectId,
    event.sessionId,
    event.seq,
    event.seq,
    location.offset + location.length,
    event.time,
  )
  db.query('INSERT INTO session_event_index VALUES(?,?,?,?,?,?,?)').run(
    event.eventId,
    event.sessionId,
    event.seq,
    location.relativePath,
    location.offset,
    location.length,
    location.hash,
  )
}

// JSONL is committed first. SQLite is a query projection and can be rebuilt from it.
function appendEvent(sessionId: string, type: string, data: unknown, runId?: string, stepId?: string): SessionEvent {
  const row = required(
    db
      .query(
        'SELECT sessions.*,workspaces.id AS projectId FROM sessions JOIN workspaces ON workspaces.id=sessions.workspaceId WHERE sessions.id=?',
      )
      .get(sessionId) as Row | null,
    'Session',
  )
  const s = sessionRow(row)
  const event: SessionEvent = {
    eventId: crypto.randomUUID(),
    sessionId,
    seq: s.seq + 1,
    runId: runId ?? null,
    stepId: stepId ?? null,
    type,
    data,
    time: Date.now(),
    version: 1,
  }
  const location = logWriter.append(row.projectId as string, event)
  indexEvent(row.projectId as string, event, location)
  db.query('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?)').run(
    event.eventId,
    sessionId,
    event.seq,
    event.runId,
    event.stepId,
    type,
    JSON.stringify(data),
    event.time,
    1,
  )
  db.query('UPDATE sessions SET seq=?,updatedAt=? WHERE id=?').run(event.seq, event.time, sessionId)
  return event
}
const methods: StorageMethods = {
  ready: () => ({ version: 9 }),
  searchIndexStatus: sessionSearch.indexStatus,
  searchIndexStep: sessionSearch.backfillStep,
  recentSessions: sessionSearch.recent,
  searchSessions: sessionSearch.search,
  workspaceDisplayNames: workspaceDisplayNames.read,
  applyWorkspaceDisplayNames: workspaceDisplayNames.apply,
  workspaceDisplayNamesReceipt: workspaceDisplayNames.receipt,
  workspaceOrganization: workspaceOrganization.read,
  applyWorkspaceOrganization: workspaceOrganization.apply,
  workspaceOrganizationReceipt: workspaceOrganization.receipt,
  createWorkspace(path, name) {
    const existing = db.query('SELECT * FROM workspaces WHERE path=?').get(path)
    if (existing) return existing as Workspace
    const workspace: Workspace = { id: crypto.randomUUID(), path, name, createdAt: Date.now() }
    db.query('INSERT INTO workspaces VALUES(?,?,?,?)').run(workspace.id, path, name, workspace.createdAt)
    db.query('INSERT INTO projects VALUES(?,?,?,?)').run(workspace.id, path, name, workspace.createdAt)
    return workspace
  },
  workspaces: () => db.query('SELECT * FROM workspaces ORDER BY createdAt').all() as Workspace[],
  workspacePage(input) {
    const { after, limit } = workspaceListInputSchema.parse(input)
    const rows = z
      .array(workspaceSchema)
      .parse(
        db
          .query('SELECT * FROM workspaces WHERE (? IS NULL OR id > ?) ORDER BY id LIMIT ?')
          .all(after ?? null, after ?? null, limit + 1),
      )
    const items = rows.slice(0, limit)
    return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null }
  },
  sessionPage(input) {
    const { workspaceId, after, title, includeArchived, limit } = sessionListInputSchema.parse(input)
    methods.workspace(workspaceId)
    const rows = z
      .array(z.record(z.string(), z.unknown()))
      .parse(
        db
          .query(
            `SELECT * FROM sessions
      WHERE workspaceId = ? AND (? IS NULL OR id > ?) AND (? IS NULL OR title = ?)
      AND (? = 1 OR archived = 0) ORDER BY id LIMIT ?`,
          )
          .all(
            workspaceId,
            after ?? null,
            after ?? null,
            title ?? null,
            title ?? null,
            Number(includeArchived),
            limit + 1,
          ),
      )
      .map((row) => sessionSchema.parse({ ...row, archived: Boolean(row.archived) }))
    const items = rows.slice(0, limit)
    return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null }
  },
  findWorkspace(id) {
    const row = db.query('SELECT * FROM workspaces WHERE id=?').get(id)
    return row === null ? null : workspaceSchema.parse(row)
  },
  findSession(id) {
    const row = db.query('SELECT * FROM sessions WHERE id=?').get(id)
    if (row === null) return null
    const data = z.record(z.string(), z.unknown()).parse(row)
    return sessionSchema.parse({ ...data, archived: Boolean(data.archived) })
  },
  workspace: (id) => required(db.query('SELECT * FROM workspaces WHERE id=?').get(id), 'Workspace') as Workspace,
  createSession(workspaceId, title = 'New session', parentId) {
    return db.transaction(() => {
      const workspace = methods.workspace(workspaceId)
      const session: Session = {
        id: crypto.randomUUID(),
        workspaceId,
        title,
        archived: false,
        parentId: parentId ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        seq: 0,
      }
      db.query('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)').run(
        session.id,
        workspaceId,
        title,
        0,
        session.parentId,
        session.createdAt,
        session.updatedAt,
        0,
      )
      appendEvent(session.id, 'session.created', { session, workspace })
      return methods.session(session.id)
    })()
  },
  createSessionCommand(input) {
    return db.transaction(() => {
      const commandId = 'session.create'
      const payloadHash = entityPayloadHash(commandId, { workspaceId: input.workspaceId, title: input.title ?? null })
      const prior = entityCommandReceipt(input.actorId, input.idempotencyKey, commandId, payloadHash)
      if (prior) return prior
      const session = methods.createSession(input.workspaceId, input.title)
      storeEntityCommandReceipt(input.actorId, input.idempotencyKey, commandId, payloadHash, session)
      return session
    })()
  },
  sessions: () =>
    (db.query('SELECT * FROM sessions ORDER BY updatedAt DESC LIMIT 2000').all() as Row[]).map(sessionRow),
  childSessions(parentId, after, limit = 200) {
    methods.session(parentId)
    return (
      db
        .query('SELECT * FROM sessions WHERE parentId=? AND (? IS NULL OR id>?) ORDER BY id LIMIT ?')
        .all(parentId, after ?? null, after ?? null, Math.min(Math.max(limit, 1), 200)) as Row[]
    ).map(sessionRow)
  },
  session: (id) => sessionRow(db.query('SELECT * FROM sessions WHERE id=?').get(id) as Row | null),
  updateSession(id, update) {
    return db.transaction(() => {
      const prior = methods.session(id)
      if (update.expectedTitle !== undefined) {
        if (prior.archived) throw new HbarError('SESSION_ARCHIVED', 'Restore the session before renaming it')
        if (prior.title !== update.expectedTitle && prior.title !== update.title)
          throw new HbarError('VERSION_CONFLICT', 'The session title changed after editing began')
        if (prior.title === update.title && (update.archived === undefined || update.archived === prior.archived))
          return { session: prior, event: null }
      }
      const updated: Session = {
        ...prior,
        title: update.title ?? prior.title,
        archived: update.archived ?? prior.archived,
        updatedAt: Date.now(),
      }
      const event = appendEvent(id, 'session.updated', { session: updated })
      db.query('UPDATE sessions SET title=?,archived=?,updatedAt=? WHERE id=?').run(
        updated.title,
        Number(updated.archived),
        updated.updatedAt,
        id,
      )
      return { session: methods.session(id), event }
    })()
  },
  append: (...args) => db.transaction(() => appendEvent(...args))(),
  events(sessionId, after, limit = 2000) {
    return (
      db
        .query('SELECT * FROM events WHERE sessionId=? AND seq>? ORDER BY seq LIMIT ?')
        .all(sessionId, after, limit) as Row[]
    ).map(eventRow)
  },
  goalHistory: (input) => readGoalHistory(db, input),
  usageEvents(input: UsageReadInput) {
    const limit = Math.min(Math.max(input.limit, 1), 2_000)
    const params: (string | number | null)[] = [...USAGE_EVENT_TYPES, input.from, input.to]
    let scope = ''
    if (input.scope.kind === 'workspace') {
      methods.workspace(input.scope.workspaceId)
      scope = 'AND s.workspaceId=?'
      params.push(input.scope.workspaceId)
    } else if (input.scope.kind === 'session') {
      methods.session(input.scope.sessionId)
      if (input.scope.includeDescendants) {
        scope = `AND e.sessionId IN (
          WITH RECURSIVE tree(id) AS (
            SELECT ? UNION ALL SELECT child.id FROM sessions child JOIN tree parent ON child.parentId=parent.id
          ) SELECT id FROM tree
        )`
      } else scope = 'AND e.sessionId=?'
      params.push(input.scope.sessionId)
    } else if (input.scope.kind === 'run') {
      methods.run(input.scope.runId)
      scope = 'AND e.runId=?'
      params.push(input.scope.runId)
    }
    let cursor = ''
    if (input.after) {
      cursor = 'AND (e.time>? OR (e.time=? AND e.eventId>?))'
      params.push(input.after.time, input.after.time, input.after.eventId)
    }
    params.push(limit + 1)
    const placeholders = USAGE_EVENT_TYPES.map(() => '?').join(',')
    const rows = db
      .query(
        `SELECT
          e.eventId,e.sessionId,e.seq,e.runId,e.stepId,e.type,e.data,e.time,e.version,
          s.workspaceId,s.parentId AS parentSessionId,
          r.id AS r_id,r.sessionId AS r_sessionId,r.requestId AS r_requestId,r.input AS r_input,
          r.modelId AS r_modelId,r.status AS r_status,r.createdAt AS r_createdAt,
          r.startedAt AS r_startedAt,r.endedAt AS r_endedAt,r.error AS r_error
        FROM events e
        JOIN sessions s ON s.id=e.sessionId
        LEFT JOIN runs r ON r.id=e.runId
        WHERE e.type IN (${placeholders}) AND e.time>=? AND e.time<? ${scope} ${cursor}
        ORDER BY e.time,e.eventId LIMIT ?`,
      )
      .all(...params) as Row[]
    const items = rows.slice(0, limit).map(usageReadRow)
    const last = items.at(-1)?.event
    return {
      items,
      hasMore: rows.length > limit,
      ...(rows.length > limit && last ? { next: { time: last.time, eventId: last.eventId } } : {}),
    }
  },
  commit: (...args) =>
    db.transaction(() => {
      const [sessionId, runId, role, content, messageId = crypto.randomUUID(), providerData] = args
      content.forEach((block) => contentBlockSchema.parse(block))
      const event = appendEvent(sessionId, 'message.committed', { id: messageId, role, content, providerData }, runId)
      const message: Message = { id: messageId, sessionId, runId, role, content, seq: event.seq, createdAt: event.time }
      db.query('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)').run(
        message.id,
        sessionId,
        runId,
        role,
        JSON.stringify(content),
        event.seq,
        event.time,
        providerData ? JSON.stringify(providerData) : null,
      )
      sessionSearch.queueMessage(message.id, sessionId, role, event.seq, content)
      return { message, event }
    })(),
  snapshot(sessionId, before, limit = 60) {
    const session = methods.session(sessionId)
    const rows = db
      .query('SELECT * FROM messages WHERE sessionId=? AND seq<? ORDER BY seq DESC LIMIT ?')
      .all(sessionId, before ?? Number.MAX_SAFE_INTEGER, limit + 1) as Row[]
    const messages = rows.slice(0, limit).reverse().map(messageRow)
    const approvals = (
      db
        .query("SELECT * FROM approvals WHERE sessionId=? AND status='pending' ORDER BY createdAt,id LIMIT 80")
        .all(sessionId) as Row[]
    ).map(approvalRow)
    if (messages.length && approvals.length < 80) {
      const pageIds = messages.map((message) => message.id)
      const completed = db
        .query(
          `
          SELECT DISTINCT approvals.* FROM approvals
          JOIN messages ON messages.sessionId=approvals.sessionId AND messages.runId=approvals.runId
          JOIN json_each(messages.content) AS block
            ON json_extract(block.value,'$.callId')=approvals.callId
            AND json_extract(block.value,'$.name')=approvals.tool
          WHERE approvals.sessionId=? AND approvals.tool='exit_plan_mode' AND approvals.status<>'pending'
            AND ((messages.role='assistant' AND json_extract(block.value,'$.type')='tool_call')
              OR (messages.role='tool' AND json_extract(block.value,'$.type')='tool_result'))
            AND messages.id IN (${pageIds.map(() => '?').join(',')})
          ORDER BY approvals.createdAt DESC,approvals.id LIMIT ?
        `,
        )
        .all(sessionId, ...pageIds, 80 - approvals.length) as Row[]
      approvals.push(...completed.map(approvalRow))
    }
    const usage = emptyUsage()
    for (const row of db
      .query("SELECT data FROM events WHERE sessionId=? AND type='usage.recorded'")
      .all(sessionId) as { data: string }[]) {
      const item = JSON.parse(row.data) as Usage
      for (const key of Object.keys(usage) as (keyof Usage)[]) usage[key] += item[key] ?? 0
    }
    return {
      session,
      messages,
      hasOlder: rows.length > limit,
      runs: (
        db.query('SELECT * FROM runs WHERE sessionId=? ORDER BY createdAt DESC LIMIT 40').all(sessionId) as Row[]
      ).map(runRow),
      approvals,
      userInputs: [],
      usage,
      cursor: session.seq,
      streams: [],
    }
  },
  activeOperations: (input) => readActiveOperations(db, input),
  queuedUserRuns: (input) => readQueuedUserRuns(db, input),
  context(sessionId) {
    const compacted = db
      .query('SELECT * FROM compactions WHERE sessionId=? ORDER BY eventSeq DESC LIMIT 1')
      .get(sessionId) as { summary: string; throughSeq: number } | null
    return {
      summary: compacted?.summary ?? null,
      throughSeq: compacted?.throughSeq ?? 0,
      messages: (
        db
          .query('SELECT * FROM messages WHERE sessionId=? AND seq>? ORDER BY seq')
          .all(sessionId, compacted?.throughSeq ?? 0) as Row[]
      ).map(messageRow),
    }
  },
  compact: (sessionId, throughSeq, summary, modelId) =>
    db.transaction(() => {
      const event = appendEvent(sessionId, 'context.compacted', { throughSeq, summary, modelId })
      db.query('INSERT INTO compactions VALUES(?,?,?,?)').run(sessionId, throughSeq, summary, event.seq)
      return event
    })(),
  fork: (sessionId, atSeq) =>
    db.transaction(() => {
      const parent = methods.session(sessionId)
      const boundary = atSeq ?? parent.seq
      const ongoing = db
        .query("SELECT id FROM runs WHERE sessionId=? AND status IN ('running','waiting_approval','queued')")
        .get(sessionId)
      if (ongoing) throw new HbarError('BUSY', 'Fork after the run has settled')
      if (
        atSeq &&
        !db.query("SELECT eventId FROM events WHERE sessionId=? AND seq=? AND type='run.settled'").get(sessionId, atSeq)
      )
        throw new HbarError('INVALID_BOUNDARY', 'A fork must end at a settled run')
      const child = methods.createSession(parent.workspaceId, `${parent.title} (fork)`, parent.id)
      appendEvent(child.id, 'session.forked', { parentId: parent.id, atSeq: boundary })
      for (const row of db
        .query('SELECT * FROM messages WHERE sessionId=? AND seq<=? ORDER BY seq')
        .all(sessionId, boundary) as Row[]) {
        const message = messageRow(row)
        methods.commit(
          child.id,
          message.runId,
          message.role,
          message.content,
          undefined,
          row.providerData ? JSON.parse(row.providerData as string) : undefined,
        )
      }
      return methods.session(child.id)
    })(),
  forkSessionCommand(input) {
    return db.transaction(() => {
      const commandId = 'session.fork'
      const payloadHash = entityPayloadHash(commandId, { sessionId: input.sessionId, atSeq: input.atSeq ?? null })
      const prior = entityCommandReceipt(input.actorId, input.idempotencyKey, commandId, payloadHash)
      if (prior) return prior
      const session = methods.fork(input.sessionId, input.atSeq)
      storeEntityCommandReceipt(input.actorId, input.idempotencyKey, commandId, payloadHash, session)
      return session
    })()
  },
  forkFromMessageCommand(input) {
    return db.transaction(() => {
      const commandId = 'session.forkFromMessage'
      const payloadHash = entityPayloadHash(commandId, {
        sessionId: input.sessionId,
        messageId: input.messageId,
      })
      const prior = entityCommandReceipt(input.actorId, input.idempotencyKey, commandId, payloadHash)
      if (prior) return prior

      const parent = methods.session(input.sessionId)
      const { target, prefix } = messageForkPrefix(parent.id, input.messageId)

      const child = methods.createSession(parent.workspaceId, `${parent.title} (fork)`, parent.id)
      appendEvent(child.id, 'session.forked', {
        parentId: parent.id,
        sourceMessageId: target.id,
        sourceSeq: target.seq,
        boundary: 'message',
      })
      for (const message of prefix)
        methods.commit(child.id, message.runId, message.role, message.content, undefined, message.providerData)
      const session = methods.session(child.id)
      storeEntityCommandReceipt(input.actorId, input.idempotencyKey, commandId, payloadHash, session)
      return session
    })()
  },
  forkFromMessageReceipt(input) {
    const commandId = 'session.forkFromMessage'
    const payloadHash = entityPayloadHash(commandId, { sessionId: input.sessionId, messageId: input.messageId })
    return entityCommandReceipt(input.actorId, input.idempotencyKey, commandId, payloadHash)
  },
  forkableMessages(input) {
    return db.transaction(() => {
      const parsed = z
        .object({
          sessionId: z.string().min(1).max(160),
          messageIds: z.array(z.string().min(1).max(160)).min(1).max(200),
        })
        .parse(input)
      methods.session(parsed.sessionId)
      const unique = new Map<
        string,
        {
          messageId: string
          eligible: boolean
          reason: 'ready' | 'not_found' | 'invalid_target' | 'busy' | 'invalid_boundary' | 'scan_limit'
        }
      >()
      const candidates = new Map<number, string[]>()
      for (const messageId of parsed.messageIds) {
        if (unique.has(messageId)) continue
        try {
          const target = messageForkTarget(parsed.sessionId, messageId)
          candidates.set(target.seq, [...(candidates.get(target.seq) ?? []), messageId])
          unique.set(messageId, { messageId, eligible: false, reason: 'scan_limit' })
        } catch (error) {
          if (!(error instanceof HbarError)) throw error
          const reason =
            error.code === 'NOT_FOUND'
              ? 'not_found'
              : error.code === 'BUSY'
                ? 'busy'
                : error.code === 'INVALID_BOUNDARY'
                  ? 'invalid_boundary'
                  : error.code === 'INVALID_TARGET'
                    ? 'invalid_target'
                    : null
          if (!reason) throw error
          unique.set(messageId, { messageId, eligible: false, reason })
        }
      }
      if (candidates.size > 0) {
        const checker = toolPrefixChecker()
        const lastSeq = Math.max(...candidates.keys())
        // One streaming read for all targets, capped independently of the total session history.
        for (const row of db
          .query('SELECT seq,runId,content FROM messages WHERE sessionId=? AND seq<=? ORDER BY seq LIMIT 50000')
          .iterate(parsed.sessionId, lastSeq) as IterableIterator<{ seq: number; runId: string; content: string }>) {
          checker.add({ runId: row.runId, content: z.array(contentBlockSchema).parse(parseJson(row.content)) })
          for (const messageId of candidates.get(row.seq) ?? [])
            unique.set(messageId, {
              messageId,
              eligible: checker.valid(),
              reason: checker.valid() ? 'ready' : 'invalid_boundary',
            })
        }
      }
      return { sessionId: parsed.sessionId, items: parsed.messageIds.map((id) => unique.get(id)!) }
    })()
  },
  enqueue: (sessionId, requestId, input, modelId, command) =>
    db.transaction(() => {
      const existing = db
        .query('SELECT * FROM runs WHERE sessionId=? AND requestId=?')
        .get(sessionId, requestId) as Row | null
      if (existing) {
        const prior = runRow(existing)
        if (prior.modelId !== modelId || stableJson(prior.input) !== stableJson(input))
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'This request id was already used with different input')
        return prior
      }
      if (methods.session(sessionId).archived) throw new HbarError('ARCHIVED', 'Unarchive the session before running')
      const run: Run = {
        id: crypto.randomUUID(),
        sessionId,
        requestId,
        input,
        modelId,
        status: 'queued',
        createdAt: Date.now(),
        startedAt: null,
        endedAt: null,
        error: null,
      }
      db.query(
        'INSERT INTO runs(id,sessionId,requestId,input,modelId,status,createdAt,startedAt,endedAt,error) VALUES(?,?,?,?,?,?,?,?,?,?)',
      ).run(run.id, sessionId, requestId, JSON.stringify(input), modelId, 'queued', run.createdAt, null, null, null)
      const queuedEvent = appendEvent(sessionId, 'run.queued', { run, ...(command ? { command } : {}) }, run.id)
      return { ...run, queuedEvent }
    })(),
  runByRequest(sessionId, requestId) {
    const row = db.query('SELECT * FROM runs WHERE sessionId=? AND requestId=?').get(sessionId, requestId) as Row | null
    if (!row) return null
    const run = runRow(row)
    const event = db.query("SELECT data FROM events WHERE runId=? AND type='run.queued' LIMIT 1").get(run.id) as {
      data: string
    } | null
    if (!event) throw new HbarError('RUN_JOURNAL_MISSING', 'Run acceptance event is unavailable')
    const data = JSON.parse(event.data) as { command?: unknown }
    return { run, command: data.command ? runCommandRecordSchema.parse(data.command) : null }
  },
  claim: (sessionId) =>
    db.transaction(() => {
      if (db.query("SELECT id FROM runs WHERE sessionId=? AND status IN ('running','waiting_approval')").get(sessionId))
        return null
      const row = db
        .query(
          "SELECT * FROM runs WHERE sessionId=? AND status='queued' ORDER BY CASE WHEN json_extract(input,'$.source')='goal' THEN 1 ELSE 0 END,createdAt,rowid LIMIT 1",
        )
        .get(sessionId) as Row | null
      if (!row) return null
      db.query("UPDATE runs SET status='running',startedAt=? WHERE id=?").run(Date.now(), row.id as string)
      return methods.run(row.id as string)
    })(),
  run: (id) => runRow(db.query('SELECT * FROM runs WHERE id=?').get(id) as Row | null),
  requestCancel: (id) =>
    db.transaction(() => {
      const run = methods.run(id)
      if (['completed', 'cancelled', 'failed', 'interrupted'].includes(run.status)) return { run, event: null }
      if (run.status === 'queued') {
        const event = methods.setRun(id, 'cancelled', 'Cancelled by user', {
          code: 'USER_CANCELLED',
          category: 'cancelled',
          retryable: false,
        })
        const cancelled = methods.run(id)
        return { run: cancelled, event }
      }
      const already = db
        .query("SELECT eventId FROM events WHERE runId=? AND type='run.cancelRequested' LIMIT 1")
        .get(id)
      return {
        run,
        event: already ? null : appendEvent(run.sessionId, 'run.cancelRequested', { runId: id }, id),
      }
    })(),
  cancelRequested: (id) =>
    Boolean(db.query("SELECT eventId FROM events WHERE runId=? AND type='run.cancelRequested' LIMIT 1").get(id)),
  setRun: (id, status, error, failure) =>
    db.transaction(() => {
      const run = methods.run(id)
      const settled = !['queued', 'running', 'waiting_approval'].includes(status)
      const parsedFailure = failure === undefined ? undefined : runFailureSchema.parse(failure)
      db.query('UPDATE runs SET status=?,error=?,endedAt=?,failure=? WHERE id=?').run(
        status,
        error ?? null,
        settled ? Date.now() : null,
        parsedFailure ? JSON.stringify(parsedFailure) : null,
        id,
      )
      return appendEvent(run.sessionId, settled ? 'run.settled' : 'run.status', { run: methods.run(id) }, id)
    })(),
  queuedSessions: () =>
    (db.query("SELECT DISTINCT sessionId FROM runs WHERE status='queued'").all() as { sessionId: string }[]).map(
      (row) => row.sessionId,
    ),
  createApproval: (approval) =>
    db.transaction(() => {
      db.query(
        'INSERT INTO approvals(id,sessionId,runId,callId,tool,args,status,createdAt) VALUES(?,?,?,?,?,?,?,?)',
      ).run(
        approval.id,
        approval.sessionId,
        approval.runId,
        approval.callId,
        approval.tool,
        JSON.stringify(approval.args),
        approval.status,
        approval.createdAt,
      )
      return appendEvent(approval.sessionId, 'approval.requested', approval, approval.runId)
    })(),
  approval: (id) => approvalRow(db.query('SELECT * FROM approvals WHERE id=?').get(id) as Row | null),
  resolveApproval: (id, status) =>
    db.transaction(() => {
      const approval = methods.approval(id)
      if (approval.status !== 'pending') return null
      db.query('UPDATE approvals SET status=? WHERE id=?').run(status, id)
      approval.status = status
      return { approval, event: appendEvent(approval.sessionId, 'approval.resolved', approval, approval.runId) }
    })(),
  resolvePlanExit: (id, sessionId, runId, callId, decision, feedback, actorId) =>
    db.transaction(() => {
      const approval = methods.approval(id)
      if (
        approval.sessionId !== sessionId ||
        approval.runId !== runId ||
        approval.callId !== callId ||
        approval.tool !== 'exit_plan_mode'
      )
        throw new HbarError('PLAN_EXIT_TARGET', 'Plan exit request does not match the selected call')
      if (approval.status !== 'pending') throw new HbarError('PLAN_EXIT_SETTLED', 'Plan exit was already decided')
      const run = methods.run(runId)
      if (run.sessionId !== sessionId || run.input.mode !== 'plan' || run.status !== 'waiting_approval')
        throw new HbarError('PLAN_EXIT_UNAVAILABLE', 'The original Plan run is no longer waiting for approval')
      if (methods.cancelRequested(runId))
        throw new HbarError('PLAN_EXIT_CANCELLED', 'The original Plan run is being cancelled')
      const status = decision === 'implement' ? 'allowed' : 'denied'
      db.query('UPDATE approvals SET status=?,feedback=?,decidedBy=? WHERE id=?').run(
        status,
        feedback ?? null,
        actorId,
        id,
      )
      const resolved = methods.approval(id)
      // JSONL, not the SQLite projection, is the canonical journal. Both facts
      // must occupy one durable record so recovery cannot observe half an exit.
      const event = appendEvent(
        sessionId,
        'plan_exit.resolved',
        { approval: resolved, mode: decision === 'implement' ? 'default' : null, exitRunId: runId, callId },
        runId,
      )
      const modeEvent = decision === 'implement' ? event : null
      return { approval: resolved, event, modeEvent }
    })(),
  toolStart: (sessionId, runId, callId, name, args) =>
    db.transaction(() => {
      db.query('INSERT INTO tool_intents VALUES(?,?,?,?,?,?)').run(
        `${runId}:${callId}`,
        sessionId,
        runId,
        callId,
        name,
        'started',
      )
      return appendEvent(sessionId, 'tool.started', { callId, name, args }, runId)
    })(),
  toolEnd: (sessionId, runId, callId, failed = false) =>
    db.transaction(() => {
      const result = db
        .query("UPDATE tool_intents SET status='settled' WHERE id=? AND status='started'")
        .run(`${runId}:${callId}`)
      return result.changes ? appendEvent(sessionId, 'tool.settled', { callId, failed }, runId) : null
    })(),
  recover: () =>
    db.transaction(() => {
      const active = (db.query("SELECT * FROM runs WHERE status IN ('running','waiting_approval')").all() as Row[]).map(
        runRow,
      )
      for (const run of active) {
        let unknownEffects = false
        const sequenceCalls = new Map<string, string>()
        const sequenceResults: string[] = []
        for (const row of db
          .query(
            "SELECT type,data FROM events WHERE runId=? AND type IN ('tool.sequence_call','tool.sequence_result') ORDER BY seq",
          )
          .all(run.id) as { type: string; data: string }[]) {
          const value: unknown = JSON.parse(row.data)
          if (row.type === 'tool.sequence_call') {
            const parsed = z.object({ callId: z.string(), parentCallId: z.string() }).safeParse(value)
            if (parsed.success) sequenceCalls.set(parsed.data.callId, parsed.data.parentCallId)
          } else {
            const parsed = z.object({ content: z.array(contentBlockSchema) }).safeParse(value)
            if (parsed.success)
              sequenceResults.push(
                ...parsed.data.content.flatMap((block) => (block.type === 'tool_result' ? [block.callId] : [])),
              )
          }
        }
        const settledCalls = new Set(
          (
            db.query("SELECT content FROM messages WHERE runId=? AND role='tool'").all(run.id) as { content: string }[]
          ).flatMap((row) =>
            (JSON.parse(row.content) as Message['content']).flatMap((block) =>
              block.type === 'tool_result' ? [block.callId] : [],
            ),
          ),
        )
        for (const callId of sequenceResults) if (sequenceCalls.has(callId)) settledCalls.add(callId)
        for (const intent of db.query("SELECT * FROM tool_intents WHERE runId=? AND status='started'").all(run.id) as {
          callId: string
          name: string
        }[]) {
          if (settledCalls.has(intent.callId)) {
            methods.toolEnd(run.sessionId, run.id, intent.callId)
            continue
          }
          appendEvent(run.sessionId, 'tool.unknown', intent, run.id)
          unknownEffects = true
          const content: ContentBlock[] = [
            {
              type: 'tool_result',
              callId: intent.callId,
              name: intent.name,
              text: 'Host interrupted during execution. The effect may already have happened. Inspect state before retrying.',
              isError: true,
              outcome: { kind: 'unknown', executionStarted: true },
            },
          ]
          const parentCallId = sequenceCalls.get(intent.callId)
          if (parentCallId) appendEvent(run.sessionId, 'tool.sequence_result', { parentCallId, content }, run.id)
          else methods.commit(run.sessionId, run.id, 'tool', content)
          settledCalls.add(intent.callId)
        }
        // Complete the model protocol even when a crash occurred before approval/execution.
        for (const row of db.query("SELECT content FROM messages WHERE runId=? AND role='assistant'").all(run.id) as {
          content: string
        }[]) {
          for (const block of JSON.parse(row.content) as Message['content'])
            if (block.type === 'tool_call' && !settledCalls.has(block.callId)) {
              methods.commit(run.sessionId, run.id, 'tool', [
                {
                  type: 'tool_result',
                  callId: block.callId,
                  name: block.name,
                  text: 'Host interrupted before execution was recorded. This call was not retried.',
                  isError: true,
                  outcome: { kind: 'interrupted', executionStarted: false },
                },
              ])
              settledCalls.add(block.callId)
            }
        }
        db.query("UPDATE tool_intents SET status='unknown' WHERE runId=? AND status='started'").run(run.id)
        for (const approval of db.query("SELECT id FROM approvals WHERE runId=? AND status='pending'").all(run.id) as {
          id: string
        }[])
          methods.resolveApproval(approval.id, 'cancelled')
        methods.setRun(
          run.id,
          'interrupted',
          'Host stopped before this run settled. Inspect tool outcomes before resuming.',
          {
            code: unknownEffects ? 'EFFECT_UNKNOWN' : 'HOST_INTERRUPTED',
            category: unknownEffects ? 'result_unknown' : 'interrupted',
            retryable: false,
          },
        )
        for (const queued of db
          .query("SELECT id FROM runs WHERE sessionId=? AND status='queued'")
          .all(run.sessionId) as { id: string }[])
          methods.setRun(
            queued.id,
            'interrupted',
            'Queued input retained; resume explicitly after inspecting the interrupted run.',
            { code: 'HOST_INTERRUPTED', category: 'interrupted', retryable: false },
          )
      }
      return active.length
    })(),
  saveProvider(provider) {
    providerSchema.parse(provider)
    db.query('INSERT OR REPLACE INTO providers VALUES(?,?)').run(provider.id, JSON.stringify(provider))
  },
  providers: () =>
    (db.query('SELECT data FROM providers').all() as { data: string }[]).map((row) =>
      providerSchema.parse(JSON.parse(row.data)),
    ),
  deleteProvider(id) {
    db.query('DELETE FROM providers WHERE id=?').run(id)
  },
  putArtifact(artifact) {
    db.query('INSERT OR IGNORE INTO artifacts VALUES(?,?)').run(artifact.id, JSON.stringify(artifact))
  },
  artifact(id) {
    return JSON.parse(
      (required(db.query('SELECT data FROM artifacts WHERE id=?').get(id), 'Artifact') as { data: string }).data,
    ) as ArtifactRef
  },
  putDevice(device, tokenHash) {
    db.query('INSERT INTO devices VALUES(?,?,?,?,?)').run(
      device.id,
      device.name,
      tokenHash,
      device.createdAt,
      device.lastSeenAt,
    )
  },
  deviceByHash(hash) {
    return db.query('SELECT id,name,createdAt,lastSeenAt FROM devices WHERE tokenHash=?').get(hash) as Device | null
  },
  devices: () => db.query('SELECT id,name,createdAt,lastSeenAt FROM devices ORDER BY createdAt').all() as Device[],
  revokeDevice(id) {
    db.query('DELETE FROM devices WHERE id=?').run(id)
  },
  setPlugin(id, enabled, config, path) {
    db.query(
      'INSERT INTO plugins VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,config=excluded.config,path=COALESCE(excluded.path,plugins.path)',
    ).run(id, Number(enabled), JSON.stringify(config), path ?? null)
  },
  setPlugins(plugins) {
    db.transaction(() => {
      for (const plugin of plugins) methods.setPlugin(plugin.id, plugin.enabled, plugin.config, plugin.path)
    })()
  },
  removePlugin(id) {
    db.query('DELETE FROM plugins WHERE id=?').run(id)
  },
  plugins: () =>
    (
      db.query('SELECT * FROM plugins').all() as { id: string; enabled: number; config: string; path: string | null }[]
    ).map((row) => ({
      ...row,
      enabled: Boolean(row.enabled),
      config: JSON.parse(row.config) as Record<string, unknown>,
    })),
  stats() {
    const result: Record<string, number> = {}
    for (const table of ['sessions', 'messages', 'events', 'runs', 'approvals'])
      result[table] = (db.query(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count
    return result
  },
  getSetting(key) {
    const row = db.query('SELECT value FROM path_metadata WHERE key=?').get(key) as { value: string } | null
    return row?.value ?? null
  },
  setSetting(key, value) {
    db.query(
      'INSERT INTO path_metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    ).run(key, value)
  },
  settingsLayers(ids) {
    if (ids.length > 16) throw new HbarError('INVALID_INPUT', 'Settings layer chain is too deep')
    const query = db.query('SELECT * FROM settings_layers WHERE id=?')
    return ids.flatMap((id) => {
      const row = query.get(id) as Row | null
      return row ? [settingsLayerRow(row)] : []
    })
  },
  settingsReceipt(actorId, idempotencyKey) {
    const row = db
      .query('SELECT payloadHash,receiptJson FROM settings_receipts WHERE actorId=? AND idempotencyKey=?')
      .get(actorId, idempotencyKey) as { payloadHash: string; receiptJson: string } | null
    return row
      ? {
          payloadHash: row.payloadHash,
          receipt: JSON.parse(row.receiptJson) as ReturnType<StorageMethods['commitSettings']>,
        }
      : null
  },
  commitSettings(input) {
    return db.transaction(() => {
      const prior = methods.settingsReceipt(input.actorId, input.idempotencyKey)
      if (prior) {
        if (prior.payloadHash !== input.payloadHash)
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'Settings idempotency key was already used')
        return prior.receipt
      }
      for (const [id, expected] of Object.entries(input.expectedRevisions)) {
        const row = db.query('SELECT revision FROM settings_layers WHERE id=?').get(id) as { revision: number } | null
        if ((row?.revision ?? 0) !== expected) throw new HbarError('REVISION_CONFLICT', `Settings layer changed: ${id}`)
      }
      const current = db.query('SELECT revision FROM settings_layers WHERE id=?').get(input.layer.id) as {
        revision: number
      } | null
      const revision = (current?.revision ?? 0) + 1
      db.query(
        `INSERT INTO settings_layers(id,kind,targetId,schemaVersion,revision,valuesJson,updatedAt)
         VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,targetId=excluded.targetId,
         schemaVersion=excluded.schemaVersion,revision=excluded.revision,valuesJson=excluded.valuesJson,updatedAt=excluded.updatedAt`,
      ).run(
        input.layer.id,
        input.layer.kind,
        input.layer.targetId,
        input.layer.schemaVersion,
        revision,
        stableJson(input.layer.values),
        Date.now(),
      )
      const receipt = { ...input.receipt, revision, values: input.layer.values }
      db.query('INSERT INTO settings_receipts VALUES(?,?,?,?)').run(
        input.actorId,
        input.idempotencyKey,
        input.payloadHash,
        stableJson(receipt),
      )
      return receipt
    })()
  },
  close() {
    db.close()
  },
}

function restoreProjection(event: SessionEvent) {
  const data = event.data as Record<string, unknown>
  if (event.type === 'session.created') {
    const workspace = data.workspace as Workspace
    const session = data.session as Session
    if (workspace)
      db.query('INSERT OR IGNORE INTO workspaces VALUES(?,?,?,?)').run(
        workspace.id,
        workspace.path,
        workspace.name,
        workspace.createdAt,
      )
    if (workspace)
      db.query('INSERT OR IGNORE INTO projects VALUES(?,?,?,?)').run(
        workspace.id,
        workspace.path,
        workspace.name,
        workspace.createdAt,
      )
    if (session)
      db.query('INSERT OR IGNORE INTO sessions VALUES(?,?,?,?,?,?,?,?)').run(
        session.id,
        session.workspaceId,
        session.title,
        Number(session.archived),
        session.parentId,
        session.createdAt,
        session.updatedAt,
        0,
      )
  }
  const session = db.query('SELECT id FROM sessions WHERE id=?').get(event.sessionId)
  if (!session) throw new Error(`SESSION_LOG_CORRUPTED event ${event.eventId} has no session.created record`)
  db.query('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?)').run(
    event.eventId,
    event.sessionId,
    event.seq,
    event.runId,
    event.stepId,
    event.type,
    JSON.stringify(event.data),
    event.time,
    event.version,
  )
  db.query('UPDATE sessions SET seq=MAX(seq,?),updatedAt=MAX(updatedAt,?) WHERE id=?').run(
    event.seq,
    event.time,
    event.sessionId,
  )
  if (event.type === 'session.updated') {
    const value = data.session as Session
    db.query('UPDATE sessions SET title=?,archived=?,updatedAt=? WHERE id=?').run(
      value.title,
      Number(value.archived),
      value.updatedAt,
      value.id,
    )
  } else if (event.type === 'message.committed') {
    db.query('INSERT OR IGNORE INTO messages VALUES(?,?,?,?,?,?,?,?)').run(
      String(data.id),
      event.sessionId,
      event.runId ?? '',
      String(data.role),
      JSON.stringify(data.content),
      event.seq,
      event.time,
      data.providerData === undefined ? null : JSON.stringify(data.providerData),
    )
    sessionSearch.queueMessage(
      String(data.id),
      event.sessionId,
      String(data.role),
      event.seq,
      z.array(contentBlockSchema).parse(data.content),
    )
  } else if (['run.queued', 'run.status', 'run.settled'].includes(event.type)) {
    const run = runSchema.parse(data.run)
    db.query(
      `
      INSERT INTO runs(id,sessionId,requestId,input,modelId,status,createdAt,startedAt,endedAt,error,failure) VALUES(?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,startedAt=excluded.startedAt,endedAt=excluded.endedAt,error=excluded.error,failure=excluded.failure
    `,
    ).run(
      run.id,
      run.sessionId,
      run.requestId,
      JSON.stringify(run.input),
      run.modelId,
      run.status,
      run.createdAt,
      run.startedAt,
      run.endedAt,
      run.error,
      run.failure ? JSON.stringify(runFailureSchema.parse(run.failure)) : null,
    )
  } else if (event.type === 'approval.requested') {
    const approval = event.data as Approval
    db.query(
      'INSERT OR IGNORE INTO approvals(id,sessionId,runId,callId,tool,args,status,createdAt,feedback,decidedBy) VALUES(?,?,?,?,?,?,?,?,?,?)',
    ).run(
      approval.id,
      approval.sessionId,
      approval.runId,
      approval.callId,
      approval.tool,
      JSON.stringify(approval.args),
      approval.status,
      approval.createdAt,
      approval.feedback ?? null,
      approval.decidedBy ?? null,
    )
  } else if (event.type === 'plan_exit.resolved') {
    const result = z
      .object({
        approval: z.object({
          id: z.string().min(1),
          sessionId: z.string().min(1),
          runId: z.string().min(1),
          callId: z.string().min(1),
          tool: z.literal('exit_plan_mode'),
          status: z.enum(['allowed', 'denied']),
          feedback: z.string().max(4_000).nullable().optional(),
          decidedBy: z.string().min(1),
        }),
        mode: z.literal('default').nullable(),
        exitRunId: z.string().min(1),
        callId: z.string().min(1),
      })
      .parse(event.data)
    const approval = result.approval
    if (
      approval.sessionId !== event.sessionId ||
      approval.runId !== event.runId ||
      result.exitRunId !== approval.runId ||
      result.callId !== approval.callId ||
      (approval.status === 'allowed') !== (result.mode === 'default')
    )
      throw new Error(`SESSION_LOG_CORRUPTED invalid Plan exit identity or mode in ${event.eventId}`)
    const pending = methods.approval(approval.id)
    if (
      pending.sessionId !== approval.sessionId ||
      pending.runId !== approval.runId ||
      pending.callId !== approval.callId ||
      pending.tool !== approval.tool ||
      pending.status !== 'pending'
    )
      throw new Error(`SESSION_LOG_CORRUPTED Plan exit has no matching pending approval in ${event.eventId}`)
    db.query('UPDATE approvals SET status=?,feedback=?,decidedBy=? WHERE id=?').run(
      approval.status,
      approval.feedback ?? null,
      approval.decidedBy,
      approval.id,
    )
  } else if (event.type === 'approval.resolved') {
    const approval = event.data as Approval
    db.query('UPDATE approvals SET status=?,feedback=?,decidedBy=? WHERE id=?').run(
      approval.status,
      approval.feedback ?? null,
      approval.decidedBy ?? null,
      approval.id,
    )
  } else if (event.type === 'context.compacted') {
    db.query('INSERT OR IGNORE INTO compactions VALUES(?,?,?,?)').run(
      event.sessionId,
      Number(data.throughSeq),
      String(data.summary),
      event.seq,
    )
  } else if (event.type === 'tool.started') {
    db.query('INSERT OR IGNORE INTO tool_intents VALUES(?,?,?,?,?,?)').run(
      `${event.runId}:${String(data.callId)}`,
      event.sessionId,
      event.runId,
      String(data.callId),
      String(data.name),
      'started',
    )
  }
}

function reconcileSessionLogs() {
  const scan = scanSessionLogs(sessionsRoot)
  if (scan.truncated.length) recordRecoveryDiagnostic(diagnosticsRoot, { truncated: scan.truncated })
  const scanned = new Map(scan.events.map((item) => [item.event.eventId, item]))
  for (const indexed of db
    .query('SELECT eventId,logPath,byteOffset,byteLength,contentHash FROM session_event_index')
    .all() as {
    eventId: string
    logPath: string
    byteOffset: number
    byteLength: number
    contentHash: string
  }[]) {
    if (!existsSync(join(sessionsRoot, indexed.logPath)))
      throw new Error(`SESSION_LOG_CORRUPTED indexed log is missing: ${indexed.logPath}`)
    const item = scanned.get(indexed.eventId)
    if (
      !item ||
      item.relativePath !== indexed.logPath ||
      item.offset !== indexed.byteOffset ||
      item.length !== indexed.byteLength ||
      item.hash !== indexed.contentHash
    )
      throw new Error(`SESSION_LOG_CORRUPTED indexed event does not match JSONL: ${indexed.eventId}`)
  }
  let restored = 0
  for (const item of scan.events) {
    if (db.query('SELECT eventId FROM session_event_index WHERE eventId=?').get(item.event.eventId)) continue
    db.transaction(() => {
      const projectId = item.relativePath.split('/')[0]!
      db.query(
        `
        INSERT INTO session_log_files VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(path) DO UPDATE SET
          firstSeq=MIN(firstSeq,excluded.firstSeq),lastSeq=MAX(lastSeq,excluded.lastSeq),
          size=MAX(size,excluded.size),updatedAt=excluded.updatedAt
      `,
      ).run(
        item.relativePath,
        projectId,
        item.event.sessionId,
        item.event.seq,
        item.event.seq,
        item.offset + item.length,
        item.event.time,
      )
      restoreProjection(item.event)
      db.query('INSERT INTO session_event_index VALUES(?,?,?,?,?,?,?)').run(
        item.event.eventId,
        item.event.sessionId,
        item.event.seq,
        item.relativePath,
        item.offset,
        item.length,
        item.hash,
      )
    })()
    restored++
  }
  if (restored) recordRecoveryDiagnostic(diagnosticsRoot, { restored })
}

reconcileSessionLogs()

parentPort!.on('message', ({ id, method, args }: StorageCall) => {
  let reply: StorageReply
  try {
    if (!Object.hasOwn(methods, method)) throw new Error('Unknown storage operation')
    const fn = methods[method] as (...args: unknown[]) => unknown
    reply = { id, ok: true, result: fn(...args) }
  } catch (error) {
    reply = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof HbarError ? error.code : 'STORAGE_ERROR',
    }
  }
  parentPort!.postMessage(reply)
})
