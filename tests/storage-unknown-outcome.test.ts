import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdtemp, readFile, readdir, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { HbarError, diagnosticEventSchema, sessionEventSchema, type DiagnosticEvent } from '@hbar/contracts'
import {
  StableStoragePort,
  Storage,
  createPathLayout,
  ensurePathLayout,
  type ManagedStorageWriter,
  type StorageFatalEvent,
  type StorageMethods,
} from '@hbar/storage'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'

const rootPrefix = 'hbar-storage-unknown-outcome-'
const errorOf = (value: Promise<unknown>) =>
  value.then(
    () => null,
    (error: unknown) => error,
  )

function errorCode(value: unknown): string {
  if (value && typeof value === 'object' && 'code' in value && typeof value.code === 'string') return value.code
  return 'UNCLASSIFIED_ERROR'
}

interface FixtureContext {
  readonly root: string
  readonly layout: ReturnType<typeof createPathLayout>
  openStorage(diagnostics: DiagnosticEvent[], fatals: StorageFatalEvent[]): Promise<Storage>
  openDatabase(): Database
  close(resource: Storage | Database): Promise<void>
}

async function withFixture<T>(run: (context: FixtureContext) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), rootPrefix))
  const resolvedRoot = await realpath(root)
  const expectedParent = await realpath(tmpdir())
  if (
    dirname(resolvedRoot).toLowerCase() !== expectedParent.toLowerCase() ||
    !basename(resolvedRoot).startsWith(rootPrefix)
  )
    throw new Error('Storage unknown-outcome fixture root failed its ownership fence')
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
  await ensurePathLayout(layout)
  const resources: Array<{ readonly label: string; readonly resource: Storage | Database }> = []
  const closed = new WeakSet<object>()
  const close = async (resource: Storage | Database) => {
    if (closed.has(resource)) return
    if (resource instanceof Storage) await resource.close()
    else resource.close()
    closed.add(resource)
  }
  let primaryError: unknown
  let result: T | undefined
  const cleanupErrors: Array<{ readonly label: string; readonly code: string }> = []
  try {
    result = await run({
      root,
      layout,
      async openStorage(diagnostics, fatals) {
        const storage = new Storage(layout.database, layout, {
          requestTimeoutMs: 4_000,
          closeTimeoutMs: 2_000,
          diagnostics: { emit: (event) => diagnostics.push(diagnosticEventSchema.parse(event)) },
          diagnosticsEnabled: true,
          diagnosticsFullCoverage: true,
          instanceId: `unknown-${randomUUID()}`,
        })
        resources.push({ label: 'storage', resource: storage })
        storage.onFatal((event) => fatals.push(event))
        await storage.call('ready')
        return storage
      },
      openDatabase() {
        const database = new Database(layout.database, { create: false, strict: true })
        resources.push({ label: 'database', resource: database })
        return database
      },
      close,
    })
  } catch (error: unknown) {
    primaryError = error
  } finally {
    for (const { label, resource } of [...resources].reverse()) {
      try {
        await close(resource)
      } catch (error: unknown) {
        cleanupErrors.push({ label, code: errorCode(error) })
      }
    }
    if (!cleanupErrors.length) {
      try {
        const actualRoot = await realpath(root)
        const actualParent = await realpath(dirname(actualRoot))
        if (actualParent.toLowerCase() !== expectedParent.toLowerCase() || !basename(actualRoot).startsWith(rootPrefix))
          cleanupErrors.push({ label: 'owned-root', code: 'OWNERSHIP_GUARD_FAILED' })
        else await rm(actualRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      } catch (error: unknown) {
        cleanupErrors.push({ label: 'owned-root', code: errorCode(error) })
      }
    }
  }
  if (primaryError !== undefined && cleanupErrors.length)
    throw new AggregateError(
      [primaryError, ...cleanupErrors.map(({ label, code }) => new Error(`${label}:${code}`))],
      'Storage unknown-outcome fixture and cleanup failed',
      { cause: primaryError },
    )
  if (primaryError !== undefined) throw primaryError
  if (cleanupErrors.length)
    throw new AggregateError(
      cleanupErrors.map(({ label, code }) => new Error(`${label}:${code}`)),
      'Fixture cleanup failed',
    )
  return result as T
}

async function sessionLogEvents(root: string, sessionId: string) {
  const matches: string[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && entry.name === `${sessionId}.jsonl`) matches.push(path)
    }
  }
  await visit(join(root, 'data', 'sessions'))
  const files = await Promise.all(
    matches.map(async (path) => ({
      path,
      events: (await readFile(path, 'utf8'))
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => sessionEventSchema.parse(JSON.parse(line) as unknown)),
    })),
  )
  return files
}

test('canonical append plus failed health invalidation returns unknown, fences queued writes and recovers one sequence', async () => {
  await withFixture(async ({ root, layout, openStorage, openDatabase, close }) => {
    const diagnostics: DiagnosticEvent[] = []
    const fatals: StorageFatalEvent[] = []
    const storage = await openStorage(diagnostics, fatals)
    const workspace = await storage.call('createWorkspace', join(root, 'workspace'), 'unknown outcome fixture')
    const session = await storage.call('createSession', workspace.id, 'before')

    const noOp = await storage.call('updateSession', session.id, {
      title: 'before',
      expectedTitle: 'before',
    })
    expect(noOp.event).toBeNull()
    expect(fatals).toHaveLength(0)

    const setup = openDatabase()
    setup.exec(`
      CREATE TRIGGER fail_session_updated_projection
      BEFORE INSERT ON events WHEN NEW.type='session.updated'
      BEGIN SELECT RAISE(ABORT, 'fixture projection failure'); END;
      CREATE TRIGGER fail_event_reference_health
      BEFORE UPDATE ON chat_database_event_reference_health
      BEGIN SELECT RAISE(ABORT, 'fixture event health failure'); END;
    `)
    await close(setup)

    const first = errorOf(
      storage.call('updateSession', session.id, {
        title: 'after-recovery',
        expectedTitle: 'before',
      }),
    )
    const blockedMarker = `must-not-run-${randomUUID()}`
    const queued = errorOf(storage.call('append', session.id, 'unknownOutcome.mustNotRun', { marker: blockedMarker }))
    const [primaryResult, queuedResult] = await Promise.all([first, queued])

    expect(errorCode(primaryResult)).toBe('STORAGE_RESULT_UNKNOWN')
    expect(queuedResult).not.toBeNull()
    expect(['STORAGE_RESULT_UNKNOWN', 'STORAGE_CLOSED']).toContain(errorCode(queuedResult))
    expect(fatals).toHaveLength(1)
    expect(fatals[0]).toMatchObject({
      kind: 'outcome-unknown',
      code: 'STORAGE_RESULT_UNKNOWN',
      method: 'updateSession',
    })
    expect(
      diagnostics.some((event) => event.event === 'sqlite.request_outcome_unknown' && event.method === 'updateSession'),
    ).toBe(true)
    expect(
      diagnostics.some(
        (event) =>
          event.event === 'sqlite.request_error_caught' &&
          event.method === 'updateSession' &&
          event.outcome === 'unknown' &&
          event.errorCode === 'SQLITE_CONSTRAINT_TRIGGER',
      ),
    ).toBe(true)
    expect(
      diagnostics.some(
        (event) =>
          event.event === 'sqlite.request_reconciliation_failed' && event.errorCode === 'SQLITE_CONSTRAINT_TRIGGER',
      ),
    ).toBe(true)
    expect(JSON.stringify(diagnostics)).not.toContain('fixture projection failure')
    expect(JSON.stringify(diagnostics)).not.toContain('fixture event health failure')

    // close() confirms the poisoned Worker exited before another writer opens.
    await close(storage)
    const removeTriggers = openDatabase()
    removeTriggers.exec('DROP TRIGGER fail_session_updated_projection; DROP TRIGGER fail_event_reference_health;')
    await close(removeTriggers)

    const recoveryDiagnostics: DiagnosticEvent[] = []
    const recoveryFatals: StorageFatalEvent[] = []
    const recovered = await openStorage(recoveryDiagnostics, recoveryFatals)
    const recoveredEvents = await recovered.call('events', session.id, 0, 100)
    const updated = recoveredEvents.filter((event) => event.type === 'session.updated')
    const canonical = (await sessionLogEvents(root, session.id)).flatMap((file) => file.events)
    expect(updated).toHaveLength(1)
    expect(updated[0]?.seq).toBe(2)
    expect(new Set(recoveredEvents.map((event) => event.seq)).size).toBe(recoveredEvents.length)
    expect((await recovered.call('session', session.id)).title).toBe('after-recovery')
    expect(canonical.filter((event) => event.type === 'session.updated')).toHaveLength(1)
    expect(canonical.some((event) => (JSON.stringify(event.data) ?? '').includes(blockedMarker))).toBe(false)

    const next = await recovered.call('append', session.id, 'unknownOutcome.afterRecovery', { marker: randomUUID() })
    expect(next.seq).toBe(3)
    const finalEvents = await recovered.call('events', session.id, 0, 100)
    expect(new Set(finalEvents.map((event) => event.seq)).size).toBe(finalEvents.length)
    expect(recoveryFatals).toHaveLength(0)
    expect((await sessionLogEvents(root, session.id)).flatMap((file) => file.events).map((event) => event.seq)).toEqual(
      [1, 2, 3],
    )
    expect(await stat(layout.database)).toBeDefined()
  })
}, 20_000)

test('draft journal cleanup failure preserves unknown outcome and same-key reconciliation remains idempotent', async () => {
  await withFixture(async ({ openStorage, openDatabase, close }) => {
    const diagnostics: DiagnosticEvent[] = []
    const fatals: StorageFatalEvent[] = []
    const storage = await openStorage(diagnostics, fatals)
    let draftBackfillDone = false
    for (let page = 0; page < 1_000 && !draftBackfillDone; page++) {
      draftBackfillDone = (await storage.call('chatDatabaseDraftBackfill', 100)).done
    }
    expect(draftBackfillDone).toBe(true)
    let usageBackfillComplete = false
    for (let page = 0; page < 1_000 && !usageBackfillComplete; page++) {
      usageBackfillComplete = (await storage.call('chatDatabaseUsageBackfill', 250)).complete
    }
    expect(usageBackfillComplete).toBe(true)
    await storage.call('chatDatabaseLegacySettingsComplete', true)
    const setup = openDatabase()
    setup.exec(`
      CREATE TRIGGER fail_draft_receipt
      BEFORE INSERT ON entity_command_receipts WHEN NEW.commandId='chatDatabase.draft.sync'
      BEGIN SELECT RAISE(ABORT, 'fixture draft receipt failure'); END;
      CREATE TRIGGER fail_draft_reference_health
      BEFORE UPDATE ON chat_database_reference_health
      BEGIN SELECT RAISE(ABORT, 'fixture draft health failure'); END;
    `)
    await close(setup)

    const input = {
      owner: {
        id: `draft-${randomUUID()}`,
        kind: 'session' as const,
        artifactIds: [],
        pendingArtifactIds: [],
        clientRevision: 0,
      },
      expectedRevision: 0,
    }
    const identity = { actorId: 'offline-fixture', idempotencyKey: `draft-key-${randomUUID()}` }
    const result = await errorOf(storage.call('chatDatabaseDraftSync', input, identity))
    expect(errorCode(result)).toBe('STORAGE_RESULT_UNKNOWN')
    expect(fatals).toHaveLength(1)
    expect(fatals[0]).toMatchObject({
      kind: 'outcome-unknown',
      code: 'STORAGE_RESULT_UNKNOWN',
      method: 'chatDatabaseDraftSync',
    })
    expect(
      diagnostics.some(
        (event) =>
          event.event === 'sqlite.request_reconciliation_failed' && event.errorCode === 'SQLITE_CONSTRAINT_TRIGGER',
      ),
    ).toBe(true)
    expect(JSON.stringify(diagnostics)).not.toContain('fixture draft receipt failure')
    expect(JSON.stringify(diagnostics)).not.toContain('fixture draft health failure')

    await close(storage)
    const removeTriggers = openDatabase()
    removeTriggers.exec('DROP TRIGGER fail_draft_receipt; DROP TRIGGER fail_draft_reference_health;')
    await close(removeTriggers)

    const reopened = await openStorage([], [])
    let recoveredDraftBackfillDone = false
    for (let page = 0; page < 1_000 && !recoveredDraftBackfillDone; page++) {
      recoveredDraftBackfillDone = (await reopened.call('chatDatabaseDraftBackfill', 100)).done
    }
    expect(recoveredDraftBackfillDone).toBe(true)
    const firstKnown = await reopened.call('chatDatabaseDraftSync', input, identity)
    const repeated = await reopened.call('chatDatabaseDraftSync', input, identity)
    expect(repeated).toEqual(firstKnown)
    expect(firstKnown.revision).toBe(1)
    expect(await reopened.call('chatDatabaseReferenceHealth')).toMatchObject({ drafts: true })
  })
}, 20_000)

test('StableStoragePort fences and notifies before dispatching queued writes after an unknown result', async () => {
  const rejectActive: Array<(error: Error) => void> = []
  const calls: string[] = []
  const writer: ManagedStorageWriter = {
    owner: { unitId: 'fixture.unknown-writer', generation: 1, incarnation: randomUUID() },
    call<K extends keyof StorageMethods>(
      method: K,
      _args: Parameters<StorageMethods[K]>,
      _authority?: ExecutionOwnership,
    ): Promise<ReturnType<StorageMethods[K]>> {
      calls.push(String(method))
      if (calls.length <= 64)
        return new Promise<never>((_resolve, reject) => {
          rejectActive.push(reject)
        })
      return Promise.reject(new HbarError('FIXTURE_UNEXPECTED_DISPATCH', 'Unexpected write dispatch'))
    },
    retire: async () => undefined,
  }
  const stable = new StableStoragePort(2_000)
  stable.install(writer)
  const fatalEvents: StorageFatalEvent[] = []
  stable.onFatal((event) => fatalEvents.push(event))
  const active = errorOf(stable.call('append', 'session', 'fixture.first', {}))
  await Bun.sleep(0)
  const activeCalls = Array.from({ length: 63 }, (_, index) =>
    errorOf(stable.call('append', 'session', `fixture.active.${index}`, {})),
  )
  await Bun.sleep(0)
  const queued = errorOf(stable.call('append', 'session', 'fixture.queued', {}))
  await Bun.sleep(0)
  expect(calls).toHaveLength(64)
  for (const reject of rejectActive) reject(new HbarError('STORAGE_RESULT_UNKNOWN', 'fixture unknown outcome'))
  const outcomes = await Promise.all([active, queued, ...activeCalls])
  expect(outcomes.every((outcome) => outcome !== null)).toBe(true)
  expect(calls).toHaveLength(64)
  expect(stable.snapshot()).toMatchObject({ phase: 'fenced', reasonCode: 'STORAGE_RESULT_UNKNOWN', queued: 0 })
  expect(fatalEvents).toHaveLength(1)
  expect(fatalEvents[0]).toMatchObject({ kind: 'outcome-unknown', code: 'STORAGE_RESULT_UNKNOWN' })
})

test('startup repairs one incomplete final JSONL record without reusing its next sequence', async () => {
  await withFixture(async ({ root, layout, openStorage, close }) => {
    const storage = await openStorage([], [])
    const workspace = await storage.call('createWorkspace', join(root, 'workspace'), 'torn tail fixture')
    const session = await storage.call('createSession', workspace.id, 'torn tail session')
    const before = await sessionLogEvents(root, session.id)
    const log = before[0]?.path
    if (!log) throw new Error('Session canonical log was not created')
    await close(storage)
    const initialSize = (await stat(log)).size
    await appendFile(log, '{"eventId":"incomplete-tail"', 'utf8')
    expect((await stat(log)).size).toBeGreaterThan(initialSize)

    const recovered = await openStorage([], [])
    expect((await stat(log)).size).toBe(initialSize)
    const recoveredEvents = await recovered.call('events', session.id, 0, 20)
    expect(recoveredEvents.map((event) => event.seq)).toEqual([1])
    const appended = await recovered.call('append', session.id, 'unknownOutcome.afterTornTail', {
      marker: randomUUID(),
    })
    expect(appended.seq).toBe(2)
    const finalEvents = await recovered.call('events', session.id, 0, 20)
    expect(finalEvents.map((event) => event.seq)).toEqual([1, 2])
    expect(
      new Set((await sessionLogEvents(root, session.id)).flatMap((file) => file.events.map((event) => event.seq))).size,
    ).toBe(2)
    expect(layout.sessions).toContain(join(root, 'data', 'sessions'))
  })
}, 20_000)
