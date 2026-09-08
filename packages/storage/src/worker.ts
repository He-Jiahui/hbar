import { Database } from 'bun:sqlite'
import { workerData, parentPort } from 'node:worker_threads'
import { HbarError, contentBlockSchema, emptyUsage, providerSchema } from '@hbar/contracts'
import type {
  Approval,
  ArtifactRef,
  Device,
  Message,
  Run,
  Session,
  SessionEvent,
  Usage,
  Workspace,
} from '@hbar/contracts'
import type { StorageCall, StorageMethods, StorageReply } from './types.ts'

const db = new Database((workerData as { path: string }).path, { create: true, strict: true })
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;')
const schemaVersion = (db.query('PRAGMA user_version').get() as { user_version: number }).user_version
if (schemaVersion > 1) throw new Error(`Unsupported database version ${schemaVersion}`)
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
    PRAGMA user_version=1;
  `)
  })()

type Row = Record<string, unknown>
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
  return { ...value, input: JSON.parse(value.input as string) } as unknown as Run
}
function messageRow(row: Row): Message {
  return {
    ...row,
    content: JSON.parse(row.content as string),
    providerData: row.providerData ? JSON.parse(row.providerData as string) : undefined,
  } as unknown as Message
}
function eventRow(row: Row): SessionEvent {
  return { ...row, data: JSON.parse(row.data as string) } as unknown as SessionEvent
}
function approvalRow(row: Row | null): Approval {
  const value = required(row, 'Approval')
  return { ...value, args: JSON.parse(value.args as string) } as unknown as Approval
}
// All event writes and their projections share a transaction and sequence allocation.
function appendEvent(sessionId: string, type: string, data: unknown, runId?: string, stepId?: string): SessionEvent {
  const s = sessionRow(db.query('SELECT * FROM sessions WHERE id=?').get(sessionId) as Row | null)
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
  ready: () => ({ version: 1 }),
  createWorkspace(path, name) {
    const existing = db.query('SELECT * FROM workspaces WHERE path=?').get(path)
    if (existing) return existing as Workspace
    const workspace: Workspace = { id: crypto.randomUUID(), path, name, createdAt: Date.now() }
    db.query('INSERT INTO workspaces VALUES(?,?,?,?)').run(workspace.id, path, name, workspace.createdAt)
    return workspace
  },
  workspaces: () => db.query('SELECT * FROM workspaces ORDER BY createdAt').all() as Workspace[],
  workspace: (id) => required(db.query('SELECT * FROM workspaces WHERE id=?').get(id), 'Workspace') as Workspace,
  createSession(workspaceId, title = 'New session', parentId) {
    methods.workspace(workspaceId)
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
    return session
  },
  sessions: () =>
    (db.query('SELECT * FROM sessions ORDER BY updatedAt DESC LIMIT 2000').all() as Row[]).map(sessionRow),
  session: (id) => sessionRow(db.query('SELECT * FROM sessions WHERE id=?').get(id) as Row | null),
  updateSession(id, update) {
    const session = methods.session(id)
    db.query('UPDATE sessions SET title=?,archived=?,updatedAt=? WHERE id=?').run(
      update.title ?? session.title,
      Number(update.archived ?? session.archived),
      Date.now(),
      id,
    )
    return methods.session(id)
  },
  append: (...args) => db.transaction(() => appendEvent(...args))(),
  events(sessionId, after, limit = 2000) {
    return (
      db
        .query('SELECT * FROM events WHERE sessionId=? AND seq>? ORDER BY seq LIMIT ?')
        .all(sessionId, after, limit) as Row[]
    ).map(eventRow)
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
      return { message, event }
    })(),
  snapshot(sessionId, before, limit = 60) {
    const session = methods.session(sessionId)
    const rows = db
      .query('SELECT * FROM messages WHERE sessionId=? AND seq<? ORDER BY seq DESC LIMIT ?')
      .all(sessionId, before ?? Number.MAX_SAFE_INTEGER, limit + 1) as Row[]
    const usage = emptyUsage()
    for (const row of db
      .query("SELECT data FROM events WHERE sessionId=? AND type='usage.recorded'")
      .all(sessionId) as { data: string }[]) {
      const item = JSON.parse(row.data) as Usage
      for (const key of Object.keys(usage) as (keyof Usage)[]) usage[key] += item[key] ?? 0
    }
    return {
      session,
      messages: rows.slice(0, limit).reverse().map(messageRow),
      hasOlder: rows.length > limit,
      runs: (
        db.query('SELECT * FROM runs WHERE sessionId=? ORDER BY createdAt DESC LIMIT 40').all(sessionId) as Row[]
      ).map(runRow),
      approvals: (
        db.query("SELECT * FROM approvals WHERE sessionId=? AND status='pending'").all(sessionId) as Row[]
      ).map(approvalRow),
      usage,
      cursor: session.seq,
      streams: [],
    }
  },
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
  enqueue: (sessionId, requestId, input, modelId) =>
    db.transaction(() => {
      const existing = db
        .query('SELECT * FROM runs WHERE sessionId=? AND requestId=?')
        .get(sessionId, requestId) as Row | null
      if (existing) {
        const prior = runRow(existing)
        if (prior.modelId !== modelId || JSON.stringify(prior.input) !== JSON.stringify(input))
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
      db.query('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?,?)').run(
        run.id,
        sessionId,
        requestId,
        JSON.stringify(input),
        modelId,
        'queued',
        run.createdAt,
        null,
        null,
        null,
      )
      return run
    })(),
  claim: (sessionId) =>
    db.transaction(() => {
      if (db.query("SELECT id FROM runs WHERE sessionId=? AND status IN ('running','waiting_approval')").get(sessionId))
        return null
      const row = db
        .query("SELECT * FROM runs WHERE sessionId=? AND status='queued' ORDER BY createdAt,rowid LIMIT 1")
        .get(sessionId) as Row | null
      if (!row) return null
      db.query("UPDATE runs SET status='running',startedAt=? WHERE id=?").run(Date.now(), row.id as string)
      return methods.run(row.id as string)
    })(),
  run: (id) => runRow(db.query('SELECT * FROM runs WHERE id=?').get(id) as Row | null),
  setRun: (id, status, error) =>
    db.transaction(() => {
      const run = methods.run(id)
      const settled = !['queued', 'running', 'waiting_approval'].includes(status)
      db.query('UPDATE runs SET status=?,error=?,endedAt=? WHERE id=?').run(
        status,
        error ?? null,
        settled ? Date.now() : null,
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
      db.query('INSERT INTO approvals VALUES(?,?,?,?,?,?,?,?)').run(
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
  toolEnd(_sessionId, runId, callId) {
    db.query("UPDATE tool_intents SET status='settled' WHERE id=?").run(`${runId}:${callId}`)
  },
  recover: () =>
    db.transaction(() => {
      const active = (db.query("SELECT * FROM runs WHERE status IN ('running','waiting_approval')").all() as Row[]).map(
        runRow,
      )
      for (const run of active) {
        const settledCalls = new Set(
          (
            db.query("SELECT content FROM messages WHERE runId=? AND role='tool'").all(run.id) as { content: string }[]
          ).flatMap((row) =>
            (JSON.parse(row.content) as Message['content']).flatMap((block) =>
              block.type === 'tool_result' ? [block.callId] : [],
            ),
          ),
        )
        for (const intent of db.query("SELECT * FROM tool_intents WHERE runId=? AND status='started'").all(run.id) as {
          callId: string
          name: string
        }[]) {
          if (settledCalls.has(intent.callId)) {
            methods.toolEnd(run.sessionId, run.id, intent.callId)
            continue
          }
          appendEvent(run.sessionId, 'tool.unknown', intent, run.id)
          methods.commit(run.sessionId, run.id, 'tool', [
            {
              type: 'tool_result',
              callId: intent.callId,
              name: intent.name,
              text: 'Host interrupted during execution. The effect may already have happened. Inspect state before retrying.',
              isError: true,
            },
          ])
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
        )
        for (const queued of db
          .query("SELECT id FROM runs WHERE sessionId=? AND status='queued'")
          .all(run.sessionId) as { id: string }[])
          methods.setRun(
            queued.id,
            'interrupted',
            'Queued input retained; resume explicitly after inspecting the interrupted run.',
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
  close() {
    db.close()
  },
}

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
