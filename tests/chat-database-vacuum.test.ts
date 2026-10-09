import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import {
  Storage,
  createPathLayout,
  ensurePathLayout,
  createChatDatabaseMaintenanceWorker,
  createChatDatabaseFileScanner,
} from '@hbar/storage'
import {
  SettingsService,
  createChatDatabaseDatabaseService,
  createChatDatabaseMaintenanceService,
  createChatDatabaseStatisticsService,
} from '@hbar/kernel'
import type { ChatDatabaseOperation } from '@hbar/contracts/commands/chat-database'
import { HbarError } from '@hbar/contracts'
import { runChatDatabaseVacuum } from '../packages/storage/src/chat-database-vacuum'
import { createChatDatabaseVacuumRecords } from '../packages/storage/src/chat-database-vacuum-record'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})
const errorOf = (task: Promise<unknown>) =>
  task.then(
    () => null,
    (reason: unknown) => reason,
  )
const identity = () => ({ actorId: 'device', idempotencyKey: crypto.randomUUID() })
async function fixture(afterReceipt?: () => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-chat-vacuum-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
  await ensurePathLayout(layout)
  const workers: Storage[] = []
  const services: (() => Promise<void>)[] = []
  cleanups.push(async () => {
    for (const close of services.reverse()) await close()
    for (const worker of workers) await worker.close()
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-chat-vacuum-'))
      throw new Error('Fixture cleanup leaves its managed root')
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
  async function open() {
    const worker = new Storage(layout.database, layout)
    workers.push(worker)
    await worker.call('ready')
    return worker
  }
  const storage = await open()
  const settings = new SettingsService(storage)
  const statistics = createChatDatabaseStatisticsService(storage, settings, createChatDatabaseFileScanner(layout))
  let idle = true
  const databaseWorker = createChatDatabaseDatabaseService(storage, layout, {
    idle: () => idle,
    maintain: (action) => (idle ? action() : Promise.reject(new HbarError('BUSY', 'Host became active'))),
  })
  const database = {
    ...databaseWorker,
    async run(...args: Parameters<typeof databaseWorker.run>) {
      const receipt = await databaseWorker.run(...args)
      await afterReceipt?.()
      return receipt
    },
  }
  const maintenance = createChatDatabaseMaintenanceService(
    storage,
    settings,
    statistics,
    {
      protection: () => null,
      removeSession: (input) => storage.call('chatDatabaseDeleteSession', input),
      deleted: () => undefined,
    },
    undefined,
    database,
  )
  services.push(
    () => statistics.close(),
    () => maintenance.close(),
  )
  const workspace = await storage.call('createWorkspace', root, 'test')
  const session = await storage.call('createSession', workspace.id, 'kept history')
  await storage.call('commit', session.id, 'fixture', 'user', [{ type: 'text', text: 'retained searchable content' }])
  const db = new Database(layout.database, { strict: true })
  db.exec(
    'CREATE TABLE vacuum_fixture(id INTEGER PRIMARY KEY,data BLOB); INSERT INTO vacuum_fixture VALUES(1,randomblob(4194304)); PRAGMA wal_checkpoint(TRUNCATE); DELETE FROM vacuum_fixture; PRAGMA wal_checkpoint(TRUNCATE);',
  )
  db.close()
  async function settled(id: string): Promise<ChatDatabaseOperation> {
    for (let attempt = 0; attempt < 500; attempt++) {
      const state = await maintenance.read(id)
      if (['completed', 'cancelled', 'failed', 'unknown'].includes(state.status)) return state
      await new Promise<void>((resolve) => setTimeout(resolve, 5))
    }
    throw new Error('Vacuum job did not settle')
  }
  async function preview() {
    const fixed = await settled(
      (await maintenance.preview({ kind: 'database', scope: { kind: 'global' } }, identity())).operationId,
    )
    expect(fixed.status).toBe('completed')
    return fixed
  }
  return {
    root,
    layout,
    storage,
    settings,
    statistics,
    database,
    maintenance,
    open,
    workspace,
    session,
    settled,
    preview,
    idle: (value: boolean) => {
      idle = value
    },
  }
}

test('managed independent Worker reclaims physical bytes, preserves messages and returns its original receipt', async () => {
  const f = await fixture()
  const worker = createChatDatabaseMaintenanceWorker(f.storage, f.layout)
  cleanups.push(() => worker.close())
  const before = await stat(f.layout.database)
  const record = await worker.run('reclaim-free-pages', new AbortController().signal)
  expect(record).toMatchObject({ status: 'completed', didVacuum: true, integrityVerified: true, error: null })
  expect(record.reclaimedBytes).toBeGreaterThan(3 * 1024 * 1024)
  expect((await stat(f.layout.database)).size).toBeLessThan(before.size)
  expect((await f.storage.call('context', f.session.id)).messages[0]?.content).toEqual([
    { type: 'text', text: 'retained searchable content' },
  ])
  expect(await worker.run('reclaim-free-pages', new AbortController().signal)).toEqual(record)
  expect((await f.storage.call('chatDatabaseUsage', { kind: 'global' })).freePageBytes).toBe(0)
})

test('global maintenance gates ordinary storage writes but leaves authentication and original job queries responsive', async () => {
  const f = await fixture()
  const fixed = await f.preview()
  await f.storage.call('chatDatabaseMaintenanceBegin', 'barrier')
  expect(await f.storage.call('chatDatabaseOperationRead', fixed.operationId)).toMatchObject({
    operationId: fixed.operationId,
  })
  expect(await f.storage.call('deviceByHash', 'unknown-device')).toBeNull()
  expect(
    await errorOf(f.storage.call('commit', f.session.id, 'blocked', 'user', [{ type: 'text', text: 'blocked' }])),
  ).toMatchObject({ code: 'BUSY' })
  expect(await errorOf(f.storage.call('chatDatabaseMaintenanceEnd', 'wrong-owner'))).toMatchObject({
    code: 'COMMAND_CONFLICT',
  })
  await f.storage.call('chatDatabaseMaintenanceEnd', 'barrier')
  expect(
    (await f.storage.call('commit', f.session.id, 'allowed', 'user', [{ type: 'text', text: 'allowed' }])).message
      .content,
  ).toEqual([{ type: 'text', text: 'allowed' }])
})

test('space-reclaim command uses a fixed global preview and never removes another chat', async () => {
  const f = await fixture()
  const fixed = await f.preview()
  expect(fixed).toMatchObject({ kind: 'database', candidateCount: 1 })
  expect(fixed.estimatedBytes).toBeGreaterThan(3 * 1024 * 1024)
  const accepted = await f.maintenance.cleanup({ previewId: fixed.operationId }, identity())
  expect(await f.settled(accepted.operationId)).toMatchObject({
    status: 'completed',
    processedCount: 1,
    deletedCount: 1,
  })
  expect(await f.storage.call('findSession', f.session.id)).not.toBeNull()
  expect(
    await errorOf(
      f.maintenance.preview({ kind: 'database', scope: { kind: 'session', targetId: f.session.id } }, identity()),
    ),
  ).toMatchObject({ code: 'INVALID_SCOPE' })
})

test('a Host that becomes active after preview skips database maintenance without deleting history', async () => {
  const f = await fixture()
  const fixed = await f.preview()
  f.idle(false)
  const accepted = await f.maintenance.cleanup({ previewId: fixed.operationId }, identity())
  expect(await f.settled(accepted.operationId)).toMatchObject({
    status: 'completed',
    deletedCount: 0,
    reclaimedBytes: 0,
    skipped: [{ code: 'inUse', count: 1 }],
  })
  expect(await f.storage.call('findSession', f.session.id)).not.toBeNull()
})

test('the verified terminal receipt has complete counts before its SQLite operation projection catches up', async () => {
  let enter = () => {}
  let release = () => {}
  const entered = new Promise<void>((resolve) => {
    enter = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const f = await fixture(async () => {
    enter()
    await gate
  })
  const fixed = await f.preview()
  const accepted = await f.maintenance.cleanup({ previewId: fixed.operationId }, identity())
  await entered
  try {
    expect(await f.maintenance.read(accepted.operationId)).toMatchObject({
      status: 'completed',
      processedCount: 1,
      deletedCount: 1,
    })
    expect((await f.maintenance.read(accepted.operationId)).completedAt).not.toBeNull()
    expect((await f.storage.call('chatDatabaseOperationRead', accepted.operationId)).processedCount).toBe(0)
    expect(
      (await f.maintenance.history({ scope: { kind: 'global' } })).items.find(
        (item) => item.operationId === accepted.operationId,
      ),
    ).toMatchObject({ status: 'completed', processedCount: 1, deletedCount: 1 })
  } finally {
    release()
  }
})

test('search discovery resets before VACUUM; retained results and newly committed dialogue remain searchable', async () => {
  const f = await fixture()
  for (let index = 0; index < 12; index++)
    await f.storage.call('commit', f.session.id, 'fixture', 'user', [{ type: 'text', text: `before vacuum ${index}` }])
  while (!(await f.storage.call('searchIndexStep')).complete) {
    /* complete the pre-maintenance index */
  }
  const db = new Database(f.layout.database, { strict: true })
  // A stale large ROWID cursor previously hid subsequent discovery when the database was repacked.
  db.query('UPDATE session_search_progress SET lastMessageRowid=1000000 WHERE id=1').run()
  db.close()
  const worker = createChatDatabaseMaintenanceWorker(f.storage, f.layout)
  cleanups.push(() => worker.close())
  expect((await worker.run('search-after-vacuum', new AbortController().signal)).status).toBe('completed')
  await f.storage.call('commit', f.session.id, 'fixture', 'user', [
    { type: 'text', text: 'fresh unique vacuum message' },
  ])
  while (!(await f.storage.call('searchIndexStep')).complete) {
    /* stable message IDs prevent duplicate documents */
  }
  expect((await f.storage.call('searchSessions', { query: 'fresh unique vacuum message' })).items[0]?.sessionId).toBe(
    f.session.id,
  )
  expect((await f.storage.call('searchSessions', { query: 'retained searchable content' })).items[0]?.matchCount).toBe(
    1,
  )
})

test('cancellation before VACUUM settles only after integrity verification and preserves its request identity', async () => {
  const f = await fixture()
  await f.maintenance.close()
  await f.statistics.close()
  await f.storage.close()
  const flags = new Int32Array(new SharedArrayBuffer(8))
  const records = createChatDatabaseVacuumRecords(f.layout.sessions)
  const record = await runChatDatabaseVacuum(
    {
      path: f.layout.database,
      sessionsRoot: f.layout.sessions,
      operationId: 'cancel-at-boundary',
      mode: 'run',
      flags: flags.buffer,
    },
    () => {
      records.cancel('cancel-at-boundary', { actorId: 'device', idempotencyKey: 'cancel-key' })
      Atomics.store(flags, 0, 1)
      return Promise.resolve()
    },
  )
  expect(record).toMatchObject({
    status: 'cancelled',
    didVacuum: false,
    cancellationRequested: true,
    integrityVerified: true,
  })
  expect(() => records.cancel('different-operation', { actorId: 'device', idempotencyKey: 'cancel-key' })).toThrow(
    'another operation',
  )
  const reopened = await f.open()
  expect(await reopened.call('findSession', f.session.id)).not.toBeNull()
})

test('an aborted Worker owner keeps a durable cancellation and the primary Storage resumes only after exit', async () => {
  const f = await fixture()
  const worker = createChatDatabaseMaintenanceWorker(f.storage, f.layout)
  cleanups.push(() => worker.close())
  const controller = new AbortController()
  controller.abort(new Error('stop before vacuum'))
  const record = await worker.run('abort-worker', controller.signal)
  expect(record).toMatchObject({
    status: 'cancelled',
    didVacuum: false,
    integrityVerified: true,
    cancellationRequested: true,
  })
  expect(
    (await f.storage.call('commit', f.session.id, 'after-abort', 'user', [{ type: 'text', text: 'writes resumed' }]))
      .message.content,
  ).toEqual([{ type: 'text', text: 'writes resumed' }])
})

test('a persisted VACUUM intent with lost final acknowledgment is verified from schema revision and real file bytes', async () => {
  const f = await fixture()
  await f.maintenance.close()
  await f.statistics.close()
  await f.storage.close()
  const records = createChatDatabaseVacuumRecords(f.layout.sessions)
  const db = new Database(f.layout.database, { strict: true })
  const revision = db.query<{ schema_version: number }, []>('PRAGMA schema_version').get()!.schema_version
  const beforeBytes = (await stat(f.layout.database)).size
  records.write({
    schemaVersion: 1,
    operationId: 'lost-vacuum',
    stage: 'vacuum',
    status: 'running',
    beforeBytes,
    afterBytes: null,
    reclaimedBytes: 0,
    schemaRevision: revision,
    didVacuum: false,
    integrityVerified: false,
    cancellationRequested: false,
    updatedAt: Date.now(),
    error: null,
  })
  db.exec('VACUUM; PRAGMA wal_checkpoint(TRUNCATE);')
  db.close()
  const reopened = await f.open()
  const worker = createChatDatabaseMaintenanceWorker(reopened, f.layout)
  cleanups.push(() => worker.close())
  const verified = await worker.run('lost-vacuum', new AbortController().signal)
  expect(verified).toMatchObject({ status: 'completed', didVacuum: true, integrityVerified: true })
  expect(verified.reclaimedBytes).toBeGreaterThan(3 * 1024 * 1024)
  expect(
    JSON.parse(
      await readFile(join(f.layout.sessions, '.maintenance', 'database-maintenance', 'lost-vacuum.json'), 'utf8'),
    ),
  ).toMatchObject({ status: 'completed' })
})

test('a redirected database path cannot enter maintenance on an external file', async () => {
  const f = await fixture()
  const fixed = await f.preview()
  const item = (await f.maintenance.page({ previewId: fixed.operationId })).items[0]!
  const outside = join(f.root, 'external.sqlite')
  const db = new Database(outside, { create: true })
  db.exec("CREATE TABLE external_data(value TEXT); INSERT INTO external_data VALUES('keep');")
  db.close()
  await f.storage.close()
  await rm(f.layout.database)
  await symlink(outside, f.layout.database, 'file')
  expect(await errorOf(f.database.run('redirected-vacuum', item, new AbortController().signal))).toMatchObject({
    code: 'PATH_REDIRECTED',
  })
  const verify = new Database(outside)
  expect(verify.query<{ value: string }, []>('SELECT value FROM external_data').get()?.value).toBe('keep')
  verify.close()
})

test('a timed-out worker exits before recovery verifies SQLite and releases the primary gate', async () => {
  const f = await fixture()
  const worker = createChatDatabaseMaintenanceWorker(f.storage, f.layout, 1)
  cleanups.push(() => worker.close())
  const record = await worker.run('timeout-at-startup', new AbortController().signal)
  expect(record).toMatchObject({
    status: 'cancelled',
    integrityVerified: true,
    cancellationRequested: true,
    didVacuum: false,
  })
  expect(
    (
      await f.storage.call('commit', f.session.id, 'after-timeout', 'user', [
        { type: 'text', text: 'verified writes resume' },
      ])
    ).message.content,
  ).toEqual([{ type: 'text', text: 'verified writes resume' }])
})

test('an uncommitted maintenance intent remains unknown until explicit reconciliation safely finishes it', async () => {
  const f = await fixture()
  const db = new Database(f.layout.database, { strict: true })
  const revision = db.query<{ schema_version: number }, []>('PRAGMA schema_version').get()!.schema_version
  db.close()
  const records = createChatDatabaseVacuumRecords(f.layout.sessions)
  records.write({
    schemaVersion: 1,
    operationId: 'interrupted-before-vacuum',
    stage: 'checkpoint',
    status: 'running',
    beforeBytes: (await stat(f.layout.database)).size,
    afterBytes: null,
    reclaimedBytes: 0,
    schemaRevision: revision,
    didVacuum: false,
    integrityVerified: false,
    cancellationRequested: false,
    updatedAt: Date.now(),
    error: null,
  })
  const worker = createChatDatabaseMaintenanceWorker(f.storage, f.layout)
  cleanups.push(() => worker.close())
  expect(await worker.run('interrupted-before-vacuum', new AbortController().signal)).toMatchObject({
    status: 'unknown',
    integrityVerified: true,
    didVacuum: false,
  })
  const completed = await worker.run('interrupted-before-vacuum', new AbortController().signal)
  expect(completed).toMatchObject({ status: 'completed', integrityVerified: true, didVacuum: true })
  expect(completed.reclaimedBytes).toBeGreaterThan(3 * 1024 * 1024)
})

test('cancellation during VACUUM stays pending until its actual completed result is verified', async () => {
  const f = await fixture()
  const db = new Database(f.layout.database, { strict: true })
  db.exec('INSERT INTO vacuum_fixture VALUES(2,randomblob(33554432)); PRAGMA wal_checkpoint(TRUNCATE);')
  db.close()
  const worker = createChatDatabaseMaintenanceWorker(f.storage, f.layout)
  cleanups.push(() => worker.close())
  const task = worker.run('cancel-during-vacuum', new AbortController().signal)
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (worker.progress('cancel-during-vacuum')?.stage === 'vacuum') break
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
  }
  expect(worker.progress('cancel-during-vacuum')?.stage).toBe('vacuum')
  worker.cancel('cancel-during-vacuum', { actorId: 'device', idempotencyKey: 'cancel-during-stage' })
  expect(worker.isRunning('cancel-during-vacuum')).toBe(true)
  expect(worker.progress('cancel-during-vacuum')?.cancellationRequested).toBe(true)
  const result = await task
  expect(result).toMatchObject({
    status: 'completed',
    didVacuum: true,
    integrityVerified: true,
    cancellationRequested: true,
  })
  const verify = new Database(f.layout.database)
  expect(
    verify.query<{ size: number }, []>('SELECT length(data) AS size FROM vacuum_fixture WHERE id=2').get()?.size,
  ).toBe(33554432)
  verify.close()
})

test('frequent authenticated job polling does not hold SQLite statements across a checkpoint or VACUUM', async () => {
  const f = await fixture()
  const fixed = await f.preview()
  const db = new Database(f.layout.database, { strict: true })
  db.exec('INSERT INTO vacuum_fixture VALUES(2,randomblob(8388608)); PRAGMA wal_checkpoint(TRUNCATE);')
  db.close()
  const worker = createChatDatabaseMaintenanceWorker(f.storage, f.layout)
  cleanups.push(() => worker.close())
  const task = worker.run('poll-while-vacuum', new AbortController().signal)
  for (let attempt = 0; attempt < 1000 && worker.isRunning('poll-while-vacuum'); attempt++) {
    await f.storage.call('chatDatabaseOperationRead', fixed.operationId)
    await f.storage.call('deviceByHash', 'authenticated-poll')
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
  }
  expect(await task).toMatchObject({ status: 'completed', integrityVerified: true, didVacuum: true, error: null })
})
