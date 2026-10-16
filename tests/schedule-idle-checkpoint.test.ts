import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { createScheduleStorage } from '../packages/storage/src/schedules'
import { readScheduleIdleCheckpoint } from '../packages/storage/src/schedule-idle-checkpoint'
import { projectScheduleIdleManifest, sameScheduleSource } from '../apps/host/src/runtime-schedule-idle-contract'
import type { ScheduleDefinition } from '@hbar/contracts/commands/schedules'

const databaseId = 'd'.repeat(64)
function definition(id: string, enabled = true): ScheduleDefinition {
  return {
    id,
    workspaceId: 'workspace',
    name: 'private-name',
    input: 'private-input'.repeat(50_000),
    modelId: 'private-model',
    timezone: 'UTC',
    target: { mode: 'existing-session', sessionId: 'private-target' },
    spec: { kind: 'once', at: 10_000 },
    enabled,
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
  }
}
function fixture() {
  const db = new Database(':memory:')
  db.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE workspaces(id TEXT PRIMARY KEY); INSERT INTO workspaces VALUES ('workspace')",
  )
  const store = createScheduleStorage(db)
  db.exec(`CREATE TABLE runs(id TEXT PRIMARY KEY,sessionId TEXT,requestId TEXT,status TEXT);
    CREATE TABLE events(seq INTEGER,runId TEXT,sessionId TEXT,type TEXT,data TEXT);
    CREATE TABLE messages(id TEXT PRIMARY KEY,content TEXT);
    CREATE TABLE session_search_progress(id INTEGER PRIMARY KEY,lastMessageRowid INTEGER NOT NULL);
    INSERT INTO session_search_progress VALUES(1,0);
    CREATE TABLE session_search_queue(messageId TEXT PRIMARY KEY,nextOffset INTEGER,segmentIndex INTEGER,body TEXT)`)
  const insert = (value: ScheduleDefinition): void => {
    db.query('INSERT INTO schedules VALUES(?,?,?,?,?,?)').run(
      value.id,
      value.workspaceId,
      JSON.stringify(value),
      value.revision,
      value.createdAt,
      value.updatedAt,
    )
  }
  return { db, store, insert, read: () => readScheduleIdleCheckpoint(db, databaseId) }
}

describe('atomic Schedule idle checkpoint', () => {
  test('real repository facts are projected with no writes, large inputs, disabled definitions or neighboring receipts', () => {
    const { db, store, insert, read } = fixture()
    try {
      insert(definition('enabled'))
      insert(definition('disabled', false))
      const active = store.claim('disabled', 100, 200)
      // A disabled definition cannot be newly claimed; existing active facts are checked separately below.
      expect(active).toBeNull()
      const claimed = store.claim('enabled', 100, 200)
      if (!claimed) throw new Error('Expected an original occurrence')
      store.transition(claimed.id, 'running', 'original-run', 'private-error', 'original-session')
      db.query('INSERT INTO runs VALUES(?,?,?,?)').run(
        'original-run',
        'original-session',
        'original-request',
        'running',
      )
      const command = {
        actorId: 'hbar:scheduler',
        idempotencyKey: claimed.idempotencyKey,
        requestId: 'original-request',
        inputHash: 'a'.repeat(64),
      }
      db.query('INSERT INTO events VALUES(?,?,?,?,?)').run(
        2,
        'original-run',
        'neighbor',
        'run.queued',
        JSON.stringify({ command: { ...command, actorId: 'private-neighbor' } }),
      )
      db.query('INSERT INTO events VALUES(?,?,?,?,?)').run(
        3,
        'original-run',
        'original-session',
        'run.queued',
        JSON.stringify({ command, input: 'private-event-input'.repeat(50_000) }),
      )
      const changes = db.query<{ count: number }, []>('SELECT total_changes() AS count').get()?.count
      db.exec('PRAGMA query_only=ON')
      const snapshot = read()
      expect(snapshot.coverage).toBe('complete')
      expect(snapshot.definitions.map((value) => value.id)).toEqual(['enabled'])
      expect(snapshot.activeOccurrences).toHaveLength(1)
      expect(snapshot.activeOccurrences[0]).toMatchObject({
        id: claimed.id,
        sessionId: 'original-session',
        runId: 'original-run',
        idempotencyKey: claimed.idempotencyKey,
        receipt: { acceptedSeq: 3, acceptedCommand: command, runRequestId: 'original-request', runStatus: 'running' },
      })
      expect(db.query<{ count: number }, []>('SELECT total_changes() AS count').get()?.count).toBe(changes)
      const encoded = JSON.stringify(snapshot)
      for (const secret of [
        'private-input',
        'private-name',
        'private-model',
        'private-target',
        'private-error',
        'private-neighbor',
        'private-event-input',
      ])
        expect(encoded).not.toContain(secret)
      expect(Buffer.byteLength(encoded)).toBe(snapshot.replyBytes)
      expect(snapshot.replyBytes).toBeLessThan(8192)
      expect(read()).toEqual(snapshot)
    } finally {
      db.close()
    }
  })

  test('item and byte overflow is incomplete with explicit last included cursors, never merged into a complete snapshot', () => {
    const { db, insert } = fixture()
    try {
      for (let index = 0; index < 40; index++) insert(definition(`schedule-${String(index).padStart(3, '0')}`))
      const page = readScheduleIdleCheckpoint(db, databaseId, { maxItems: 2 })
      expect(page.coverage).toBe('incomplete')
      expect(page.itemCount).toBe(2)
      expect(page.cursors).toMatchObject({ enabledComplete: false, enabledAfter: 'schedule-001', activeComplete: true })
      expect(projectScheduleIdleManifest(page, 1000).nextDueAt).toBeNull()
      const bytes = readScheduleIdleCheckpoint(db, databaseId, { maxItems: 512, maxBytes: 8192 })
      expect(bytes.coverage).toBe('incomplete')
      expect(bytes.replyBytes).toBeLessThanOrEqual(8192)
      expect(bytes.itemCount).toBeLessThan(40)
      const complete = readScheduleIdleCheckpoint(db, databaseId, { maxItems: 512, maxBytes: 262144 })
      expect(complete.coverage).toBe('complete')
      expect(complete.itemCount).toBe(40)
      expect(
        sameScheduleSource(projectScheduleIdleManifest(page, 1000), projectScheduleIdleManifest(complete, 1000)),
      ).toBe(false)
    } finally {
      db.close()
    }
  })

  test('definition, runtime, disabled active occurrence and terminal changes affect the same-database source revision', () => {
    const { db, store, insert, read } = fixture()
    try {
      insert(definition('one'))
      const first = read()
      store.recordCandidate('one', 7000, 2)
      const pending = read()
      expect(pending.database.sourceRevision).not.toBe(first.database.sourceRevision)
      expect(pending.definitions[0]?.runtime).toMatchObject({ pendingDueAt: 7000, updatedAt: 2 })
      const claimed = store.claim('one', 7000, 3)
      if (!claimed) throw new Error('Expected a durable occurrence')
      const current = store.get('one')
      if (!current) throw new Error('Expected original definition')
      store.update({ ...current, scheduleId: current.id, expectedRevision: current.revision, enabled: false })
      const disabled = read()
      expect(disabled.definitions).toEqual([])
      expect(disabled.activeOccurrences[0]?.id).toBe(claimed.id)
      expect(disabled.database.sourceRevision).not.toBe(pending.database.sourceRevision)
      store.transition(claimed.id, 'unknown')
      const unknown = read()
      expect(unknown.activeOccurrences[0]?.status).toBe('unknown')
      expect(unknown.activeOccurrences[0]?.receipt.acceptedCommand).toBeNull()
      expect(unknown.database.sourceRevision).not.toBe(disabled.database.sourceRevision)
      store.transition(claimed.id, 'cancelled')
      expect(read().activeOccurrences).toEqual([])
    } finally {
      db.close()
    }
  })

  test('active occurrences have their own bounded coverage and due/id cursor even when every definition is disabled', () => {
    const { db, store, insert } = fixture()
    try {
      const ids: string[] = []
      for (const id of ['a', 'b', 'c']) {
        insert(definition(id))
        const claimed = store.claim(id, 100, 200)
        const current = store.get(id)
        if (!claimed || !current) throw new Error('Expected original durable facts')
        ids.push(claimed.id)
        store.update({ ...current, scheduleId: id, expectedRevision: current.revision, enabled: false })
      }
      const result = readScheduleIdleCheckpoint(db, databaseId, { maxItems: 2 })
      expect(result.coverage).toBe('incomplete')
      expect(result.definitions).toEqual([])
      expect(result.activeOccurrences.map((value) => value.id)).toEqual([...ids].sort().slice(0, 2))
      expect(result.cursors).toMatchObject({
        enabledComplete: true,
        activeComplete: false,
        activeAfter: { dueAt: 100, id: [...ids].sort()[1] },
      })
      expect(result.itemCount).toBe(2)
    } finally {
      db.close()
    }
  })

  test('same persisted once schedule projects future, current and consumed due without candidate writes', () => {
    const { db, store, insert, read } = fixture()
    try {
      insert(definition('once'))
      const initial = read()
      expect(projectScheduleIdleManifest(initial, 1000).nextDueAt).toBe(10_000)
      expect(projectScheduleIdleManifest(initial, 12_000).nextDueAt).toBe(12_000)
      expect(read()).toEqual(initial)
      const claimed = store.claim('once', 10_000, 12_000)
      if (!claimed) throw new Error('Expected original claim')
      store.transition(claimed.id, 'completed', 'original-run')
      expect(projectScheduleIdleManifest(read(), 12_001).nextDueAt).toBe(72_001)
    } finally {
      db.close()
    }
  })

  test('same atomic checkpoint binds durable search progress and a bounded inspection deadline without reading message or queue bodies', () => {
    const { db, read } = fixture()
    try {
      const empty = read()
      expect(empty.search).toMatchObject({ complete: true, lastMessageRowid: 0, sourceHighwater: 0, queued: false })
      expect(projectScheduleIdleManifest(empty, 1000)).toMatchObject({ nextSearchCheckAt: 61_000, nextDueAt: 61_000 })
      db.query('INSERT INTO messages VALUES(?,?)').run('original-message', 'private-message-body'.repeat(10_000))
      const pending = read()
      expect(pending.search).toMatchObject({ complete: false, lastMessageRowid: 0, sourceHighwater: 1 })
      expect(pending.database.sourceRevision).not.toBe(empty.database.sourceRevision)
      expect(projectScheduleIdleManifest(pending, 1000)).toMatchObject({ nextSearchCheckAt: 2000, nextDueAt: 2000 })
      db.exec('UPDATE session_search_progress SET lastMessageRowid=1 WHERE id=1')
      db.query('INSERT INTO session_search_queue VALUES(?,?,?,?)').run(
        'original-queue',
        4096,
        1,
        'private-queue-body'.repeat(10_000),
      )
      const queued = read()
      expect(queued.search).toMatchObject({
        complete: false,
        queued: true,
        firstQueued: { messageId: 'original-queue', nextOffset: 4096, segmentIndex: 1 },
      })
      expect(queued.database.sourceRevision).not.toBe(pending.database.sourceRevision)
      const changes = db.query<{ count: number }, []>('SELECT total_changes() AS count').get()?.count
      db.exec('PRAGMA query_only=ON')
      expect(read()).toEqual(queued)
      expect(db.query<{ count: number }, []>('SELECT total_changes() AS count').get()?.count).toBe(changes)
      expect(JSON.stringify(queued)).not.toContain('private-message-body')
      expect(JSON.stringify(queued)).not.toContain('private-queue-body')
    } finally {
      db.close()
    }
  })
})
