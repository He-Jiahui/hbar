import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { diagnosticEventSchema } from '@hbar/contracts'
import { createDiagnosticScope } from '@hbar/kernel/diagnostic-scope'
import { Storage } from '@hbar/storage'

const diagnosticTempPrefix = 'hbar-storage-diagnostics-'

async function makeDatabaseRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), diagnosticTempPrefix))
  const resolved = await realpath(root)
  const parent = await realpath(dirname(resolved))
  const expectedParent = await realpath(tmpdir())
  expect(parent).toBe(expectedParent)
  expect(resolved.startsWith(`${join(expectedParent, diagnosticTempPrefix)}`)).toBe(true)
  return resolved
}

async function cleanupDatabaseRoot(root: string): Promise<void> {
  const resolved = await realpath(root).catch(() => resolve(root))
  const parent = dirname(resolved)
  const expectedParent = await realpath(tmpdir())
  if (parent !== expectedParent || !resolved.startsWith(`${join(expectedParent, diagnosticTempPrefix)}`))
    throw new Error(`Refusing to remove unexpected diagnostics fixture: ${resolved}`)
  await rm(resolved, { recursive: true, force: true })
}

async function observePhase<T>(
  phase: string,
  events: readonly ReturnType<typeof diagnosticEventSchema.parse>[],
  operation: () => Promise<T>,
): Promise<T> {
  let pending = true
  const timer = setTimeout(() => {
    if (!pending) return
    console.error(JSON.stringify({ phase, events: events.slice(-6) }))
  }, 3000)
  try {
    return await operation()
  } finally {
    pending = false
    clearTimeout(timer)
  }
}

async function closeFixture(
  storage: Storage,
  root: string,
  events: readonly ReturnType<typeof diagnosticEventSchema.parse>[],
  phase: string,
): Promise<void> {
  try {
    await observePhase(phase, events, () => storage.close())
  } catch {
    // Do not remove a fixture while its worker may still hold the SQLite file.
    console.error(JSON.stringify({ phase, cleanup: 'skipped', code: 'STORAGE_CLOSE_FAILED' }))
    throw new Error('STORAGE_CLOSE_FAILED')
  }
  await cleanupDatabaseRoot(root)
}

function expectDispatchWorkerSettlement(
  events: readonly ReturnType<typeof diagnosticEventSchema.parse>[],
  storageRequestId: number,
  method: string,
  scope: Partial<{ rpcId: string; requestId: string; sessionId: string; runId: string }>,
  outcome: 'success' | 'failure',
): void {
  const dispatch = events.find(
    (event) => event.event === 'storage.request_dispatched' && event.storageRequestId === storageRequestId,
  )
  const workerStart = events.find(
    (event) => event.event === 'sqlite.request_started' && event.storageRequestId === storageRequestId,
  )
  const workerSettlement = events.find(
    (event) =>
      event.storageRequestId === storageRequestId &&
      event.event === (outcome === 'success' ? 'sqlite.request_completed' : 'sqlite.request_failed'),
  )
  const roundtrip = events.find(
    (event) =>
      event.storageRequestId === storageRequestId &&
      event.event === (outcome === 'success' ? 'storage.request_completed' : 'storage.request_failed'),
  )
  for (const event of [dispatch, workerStart, workerSettlement, roundtrip]) expect(event).toBeDefined()
  if (!dispatch || !workerStart || !workerSettlement || !roundtrip)
    throw new Error('STORAGE_DIAGNOSTIC_LIFECYCLE_MISSING')
  expect(dispatch).toMatchObject({ ...scope, phase: 'dispatch', outcome: 'unknown', method })
  expect(workerStart).toMatchObject({ ...scope, phase: 'execute', outcome: 'unknown', method })
  expect(workerSettlement).toMatchObject({ ...scope, phase: 'execute', outcome, method })
  expect(roundtrip).toMatchObject({ ...scope, phase: 'roundtrip', outcome, method })
  const dispatchIndex = events.indexOf(dispatch)
  const workerStartIndex = events.indexOf(workerStart)
  const workerSettlementIndex = events.indexOf(workerSettlement)
  const roundtripIndex = events.indexOf(roundtrip)
  expect(dispatchIndex).toBeLessThan(workerStartIndex)
  expect(workerStartIndex).toBeLessThan(workerSettlementIndex)
  expect(workerSettlementIndex).toBeLessThan(roundtripIndex)
}

test('forwards real SQLite worker diagnostics with scoped request identity and runtime facts', async () => {
  const root = await makeDatabaseRoot()
  const database = join(root, 'state.sqlite')
  const scope = createDiagnosticScope()
  const events: ReturnType<typeof diagnosticEventSchema.parse>[] = []
  const storage = new Storage(database, undefined, {
    diagnostics: { emit: (event) => events.push(diagnosticEventSchema.parse(event)) },
    diagnosticScope: scope,
    diagnosticsEnabled: true,
    diagnosticsFullCoverage: true,
    instanceId: 'storage-fixture-instance',
  })

  try {
    expect((await storage.call('ready')).version).toBeGreaterThan(0)
    const workspace = await scope.run(
      { rpcId: 'rpc-workspace-create', sessionId: 'session-alpha', runId: 'run-create' },
      () => storage.call('createWorkspace', join(root, 'workspace-canary'), 'Diagnostics fixture'),
    )

    const [page, list] = await Promise.all([
      scope.run({ rpcId: 'rpc-page', requestId: 'request-page', sessionId: 'session-alpha', runId: 'run-page' }, () =>
        storage.call('workspacePage', { limit: 20 }),
      ),
      scope.run({ rpcId: 'rpc-list', requestId: 'request-list', sessionId: 'session-beta', runId: 'run-list' }, () =>
        storage.call('workspaces'),
      ),
    ])
    expect(page.items.some((item) => item.id === workspace.id)).toBe(true)
    expect(list.some((item) => item.id === workspace.id)).toBe(true)

    const startup = events.find((event) => event.event === 'sqlite.configured')
    expect(startup).toBeDefined()
    if (!startup) throw new Error('SQLITE_CONFIGURED_DIAGNOSTIC_MISSING')
    expect(startup.component).toBe('sqlite')
    expect(startup.instanceId).toBe('storage-fixture-instance')
    expect(/^\d+\.\d+(?:\.\d+)?$/.test(startup.sqliteVersion ?? '')).toBe(true)
    expect(/^\d+\.\d+\.\d+$/.test(startup.runtimeVersion ?? '')).toBe(true)
    expect(startup.journalMode).toBe('wal')
    expect(startup.synchronous).toBe(2)
    expect(startup.busyTimeoutMs).toBe(5000)
    expect(startup.foreignKeys).toBe(true)
    expect(typeof startup.pageSize === 'number' && startup.pageSize > 0).toBe(true)
    expect(typeof startup.userVersion === 'number' && startup.userVersion >= 0).toBe(true)
    expect(typeof startup.databaseSchemaVersion === 'number' && startup.databaseSchemaVersion >= 0).toBe(true)
    expect(events.some((event) => event.event === 'sqlite.ready' && event.workerState === 'ready')).toBe(true)

    const completed = events.filter((event) => event.event === 'storage.request_completed')
    const pageEvent = completed.find((event) => event.rpcId === 'rpc-page')
    const listEvent = completed.find((event) => event.rpcId === 'rpc-list')
    expect(pageEvent).toMatchObject({ requestId: 'request-page', sessionId: 'session-alpha', runId: 'run-page' })
    expect(listEvent).toMatchObject({ requestId: 'request-list', sessionId: 'session-beta', runId: 'run-list' })
    const pageRequestId = pageEvent?.storageRequestId
    const listRequestId = listEvent?.storageRequestId
    expect(typeof pageRequestId).toBe('number')
    expect(typeof listRequestId).toBe('number')
    if (typeof pageRequestId !== 'number' || typeof listRequestId !== 'number')
      throw new Error('STORAGE_REQUEST_DIAGNOSTIC_ID_MISSING')
    expect(pageRequestId).not.toBe(listRequestId)

    const workerCompleted = events.filter((event) => event.event === 'sqlite.request_completed')
    const workerPageEvent = workerCompleted.find((event) => event.storageRequestId === pageRequestId)
    const workerListEvent = workerCompleted.find((event) => event.storageRequestId === listRequestId)
    expect(workerPageEvent).toMatchObject({
      rpcId: 'rpc-page',
      requestId: 'request-page',
      sessionId: 'session-alpha',
      runId: 'run-page',
    })
    expect(workerListEvent).toMatchObject({
      rpcId: 'rpc-list',
      requestId: 'request-list',
      sessionId: 'session-beta',
      runId: 'run-list',
    })
    expectDispatchWorkerSettlement(
      events,
      pageRequestId,
      'workspacePage',
      {
        rpcId: 'rpc-page',
        requestId: 'request-page',
        sessionId: 'session-alpha',
        runId: 'run-page',
      },
      'success',
    )
    expectDispatchWorkerSettlement(
      events,
      listRequestId,
      'workspaces',
      {
        rpcId: 'rpc-list',
        requestId: 'request-list',
        sessionId: 'session-beta',
        runId: 'run-list',
      },
      'success',
    )

    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain(database)
    expect(serialized).not.toContain('workspace-canary')
    expect(serialized).not.toContain('Diagnostics fixture')
  } finally {
    await storage.close()
    await cleanupDatabaseRoot(root)
  }
})

test('bounds pending storage requests while keeping close outside the admission cap', async () => {
  const root = await makeDatabaseRoot()
  const events: ReturnType<typeof diagnosticEventSchema.parse>[] = []
  const storage = new Storage(join(root, 'state.sqlite'), undefined, {
    maxPendingRequests: 1,
    diagnostics: { emit: (event) => events.push(diagnosticEventSchema.parse(event)) },
    diagnosticsEnabled: true,
    diagnosticsFullCoverage: true,
  })

  try {
    const first = storage.call('ready')
    await expect(storage.call('ready')).rejects.toMatchObject({ code: 'OVERLOADED' })
    expect(events.some((event) => event.event === 'storage.admission_rejected' && event.outcome === 'skipped')).toBe(
      true,
    )
    expect(events.some((event) => event.level === 'fatal' || event.event === 'storage.worker_exit')).toBe(false)
    expect((await first).version).toBeGreaterThan(0)
    expect((await storage.call('ready')).version).toBeGreaterThan(0)
    const accepted = storage.call('ready')
    const closing = storage.close()
    expect((await accepted).version).toBeGreaterThan(0)
    await closing
  } finally {
    await storage.close()
    await cleanupDatabaseRoot(root)
  }
})

test('records a safe SQLite constraint failure without exposing SQL or payloads', async () => {
  const root = await makeDatabaseRoot()
  const database = join(root, 'state.sqlite')
  const events: ReturnType<typeof diagnosticEventSchema.parse>[] = []
  const storage = new Storage(database, undefined, {
    diagnostics: { emit: (event) => events.push(diagnosticEventSchema.parse(event)) },
    diagnosticsEnabled: true,
    diagnosticsFullCoverage: true,
  })
  const tokenCanary = 'token-canary-must-not-be-logged'
  const device = (id: string) => ({ id, name: `device-${id}`, createdAt: 1, lastSeenAt: 1 })
  let phase = 'first_putDevice'

  try {
    await observePhase(phase, events, () => storage.call('putDevice', device('device-a'), tokenCanary))
    phase = 'duplicate_putDevice'
    // Bun's rejects matcher can enter a nested event-loop wait from the prior
    // Worker reply. Explicit await preserves the same failure assertion while
    // allowing the next Worker message to be delivered (oven-sh/bun#37189).
    let constraintFailure: unknown
    try {
      await observePhase(phase, events, () => storage.call('putDevice', device('device-b'), tokenCanary))
    } catch (error: unknown) {
      constraintFailure = error
    }
    expect(constraintFailure).toMatchObject({ code: 'STORAGE_ERROR' })
    expect(events.some((event) => event.event === 'storage.request_failed' && event.outcome === 'failure')).toBe(true)
    expect(
      events.some(
        (event) =>
          event.event === 'sqlite.request_failed' &&
          event.outcome === 'failure' &&
          (event.errorCode === 'SQLITE_CONSTRAINT_UNIQUE' || event.errorCode === 'SQLITE_CONSTRAINT'),
      ),
    ).toBe(true)
    const failedRoundtrip = events.find(
      (event) => event.event === 'storage.request_failed' && event.method === 'putDevice',
    )
    expect(failedRoundtrip?.storageRequestId).toBeDefined()
    if (failedRoundtrip?.storageRequestId === undefined) throw new Error('STORAGE_FAILURE_DIAGNOSTIC_ID_MISSING')
    expectDispatchWorkerSettlement(events, failedRoundtrip.storageRequestId, 'putDevice', {}, 'failure')
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain(tokenCanary)
    expect(serialized).not.toContain(database)
    expect(serialized).not.toContain('UNIQUE constraint failed')
  } finally {
    phase = 'close'
    await closeFixture(storage, root, events, phase)
  }
})

test('keeps storage usable when the diagnostic sink throws', async () => {
  const root = await makeDatabaseRoot()
  const events: ReturnType<typeof diagnosticEventSchema.parse>[] = []
  const storage = new Storage(join(root, 'state.sqlite'), undefined, {
    diagnostics: {
      emit: () => {
        throw new Error('diagnostic sink failure')
      },
    },
    diagnosticsEnabled: true,
    diagnosticsFullCoverage: true,
  })
  let phase = 'throwing_ready'
  try {
    expect((await observePhase(phase, events, () => storage.call('ready'))).version).toBeGreaterThan(0)
    phase = 'throwing_workspaces'
    expect((await observePhase(phase, events, () => storage.call('workspaces'))).length).toBe(0)
  } finally {
    phase = 'throwing_close'
    await closeFixture(storage, root, events, phase)
  }
})
