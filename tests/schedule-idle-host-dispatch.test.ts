import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createScheduleService, createScheduleDueReader } from '@hbar/kernel/controller'
import { createScheduleStorage } from '../packages/storage/src/schedules'
import { readScheduleIdleCheckpoint } from '../packages/storage/src/schedule-idle-checkpoint'
import { createScheduleHostController } from '../apps/host/src/schedule-host-controller'
import { projectScheduleIdleManifest } from '../apps/host/src/runtime-schedule-idle-contract'

test('clean Schedule wake uses the real due reader, runner and repository, preserving the original run.submit idempotency key', async () => {
  const db = new Database(':memory:')
  db.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE workspaces(id TEXT PRIMARY KEY); INSERT INTO workspaces VALUES ('workspace')",
  )
  const store = createScheduleStorage(db)
  db.exec(`CREATE TABLE runs(id TEXT PRIMARY KEY,sessionId TEXT,requestId TEXT,status TEXT);
    CREATE TABLE events(seq INTEGER,runId TEXT,sessionId TEXT,type TEXT,data TEXT);
    CREATE TABLE messages(id TEXT PRIMARY KEY);
    CREATE TABLE session_search_progress(id INTEGER PRIMARY KEY,lastMessageRowid INTEGER NOT NULL);
    INSERT INTO session_search_progress VALUES(1,0);
    CREATE TABLE session_search_queue(messageId TEXT PRIMARY KEY,nextOffset INTEGER,segmentIndex INTEGER)`)
  const definition = {
    id: 'original-schedule',
    workspaceId: 'workspace',
    name: 'Schedule',
    input: 'original-input',
    modelId: 'model',
    timezone: 'UTC',
    target: { mode: 'existing-session', sessionId: 'original-session' },
    spec: { kind: 'once', at: 2000 },
    enabled: true,
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
  }
  db.query('INSERT INTO schedules VALUES(?,?,?,?,?,?)').run(
    definition.id,
    definition.workspaceId,
    JSON.stringify(definition),
    0,
    1,
    1,
  )
  const service = createScheduleService({
    list: async (...args) => store.list(...args),
    get: async (...args) => store.get(...args),
    create: async (...args) => store.create(...args),
    update: async (...args) => store.update(...args),
    delete: async (...args) => store.delete(...args),
    occurrences: async (...args) => store.occurrences(...args),
    claim: async (...args) => store.claim(...args),
    transition: async (...args) => store.transition(...args),
  })
  const due = createScheduleDueReader({
    enabledPage: async (...args) => store.enabledSchedules(...args),
    runtime: async (id) => store.scheduleRuntime(id),
    recordCandidate: async (...args) => store.recordCandidate(...args),
  })
  let now = 1000
  const submits: { input: unknown; actorId: string | undefined; key: string | undefined }[] = []
  const prepared: string[] = []
  // This deterministic RunCommands port is not a claim of native/paid model execution.
  const controller = createScheduleHostController({
    service,
    reader: {
      enabledSchedules: async (...args) => store.enabledSchedules(...args).items,
      activeScheduleOccurrences: async (limit, after) => store.activeScheduleOccurrences(limit, after),
      dueScheduleOccurrences: due,
    },
    actorId: 'hbar:scheduler',
    intervalMs: 60_000,
    now: () => now,
    prepareSession: async (input) => {
      prepared.push(input.occurrenceId)
      return { sessionId: 'original-session' }
    },
    runCommands: {
      execute: async (id, input, options) => {
        if (id === 'operation.get')
          return {
            operationId: 'original-run',
            sessionId: 'original-session',
            status: 'completed',
            startedAt: 2000,
            endedAt: 2001,
            error: null,
          }
        submits.push({ input, actorId: options?.actorId, key: options?.idempotencyKey })
        return {
          status: 'accepted',
          commandId: 'run.submit',
          commandVersion: 1,
          requestId: 'original-request',
          idempotencyKey: options?.idempotencyKey,
          operationId: 'original-run',
          sessionId: 'original-session',
          acceptedAt: 2000,
        }
      },
    },
  })
  const read = () => projectScheduleIdleManifest(readScheduleIdleCheckpoint(db, 'd'.repeat(64)), now)
  try {
    await controller.start()
    const before = read()
    expect(before.nextDueAt).toBe(2000)
    expect(submits).toEqual([])
    await controller.pause()
    expect(controller.idleSnapshot()).toMatchObject({ paused: true, timer: false, ticking: false })
    expect(read().snapshot.database.sourceRevision).toBe(before.snapshot.database.sourceRevision)
    now = 2000
    await controller.tick()
    expect(submits).toEqual([])
    await controller.wakeDue()
    const occurrence = store.occurrences(definition.id, null, 100).items[0]
    if (!occurrence) throw new Error('Expected original durable occurrence')
    expect(occurrence).toMatchObject({
      status: 'completed',
      sessionId: 'original-session',
      runId: 'original-run',
      idempotencyKey: 'schedule:original-schedule:2000',
    })
    expect(prepared).toEqual([occurrence.id])
    expect(submits).toEqual([
      {
        actorId: 'hbar:scheduler',
        key: occurrence.idempotencyKey,
        input: {
          sessionId: 'original-session',
          modelId: 'model',
          input: { text: 'original-input', images: [], source: 'user' },
        },
      },
    ])
    await controller.wakeDue()
    expect(submits).toHaveLength(1)
    expect(store.occurrences(definition.id, null, 100).items.map((value) => value.id)).toEqual([occurrence.id])
    expect(read().nextDueAt).toBe(62_000)
  } finally {
    await controller.close()
    db.close()
  }
})
