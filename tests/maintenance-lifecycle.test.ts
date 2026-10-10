import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Storage, createPathLayout, ensurePathLayout, createChatDatabaseFileScanner, type StoragePort } from '@hbar/storage'
import { SettingsService, createChatDatabaseCommands, createChatDatabaseStatisticsService,
  createChatDatabaseMaintenanceService, createChatDatabaseArtifactReferenceService,
  createChatDatabaseDatabaseService, createChatDatabaseScheduler } from '@hbar/kernel/maintenance'

test('preparing the Maintenance application performs no storage calls, recovery, scheduling or Worker work', async () => {
  let calls = 0
  const storage: StoragePort = {
    call: () => { calls++; return Promise.reject(new Error('Candidate attempted production access')) },
    close: async () => {},
  }
  const layout = createPathLayout(join(tmpdir(), 'unopened-maintenance-candidate'), join(tmpdir(), 'unopened-maintenance-cache'))
  const settings = new SettingsService(storage)
  const statistics = createChatDatabaseStatisticsService(storage, settings, createChatDatabaseFileScanner(layout))
  const artifacts = createChatDatabaseArtifactReferenceService(storage, layout.settings, { recover: false })
  const database = createChatDatabaseDatabaseService(storage, layout, { idle: async () => true, maintain: action => action() })
  const service = createChatDatabaseMaintenanceService(storage, settings, statistics,
    { protection: async () => null, removeSession: input => storage.call('chatDatabaseDeleteSession', input), deleted: () => {} },
    undefined, database, { recover: false })
  const scheduler = createChatDatabaseScheduler(storage, settings, statistics, service, { start: false })
  const commands = createChatDatabaseCommands(statistics, service, artifacts, scheduler)
  expect(commands.list().items.length).toBeGreaterThan(10)
  expect(service.currentOperationId()).toBeNull()
  await Promise.resolve()
  await scheduler.close(); await service.close(); await artifacts.close(); await statistics.close(); commands.dispose()
  expect(calls).toBe(0)
})

test('a job keeps its lifecycle ownership while blocked and releases it only after its real journal terminal state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-maintenance-lifecycle-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
  await ensurePathLayout(layout)
  const storage = new Storage(layout.database, layout)
  await storage.call('ready')
  const settings = new SettingsService(storage)
  const statistics = createChatDatabaseStatisticsService(storage, settings, createChatDatabaseFileScanner(layout))
  let release = () => {}, entered = () => {}, finished = () => {}
  const started = new Promise<void>(resolve => { entered = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  const ended = new Promise<void>(resolve => { finished = resolve })
  let held: string | null = null, terminal: string | undefined
  const ownerId = (): string | null => held
  const service = createChatDatabaseMaintenanceService(storage, settings, statistics,
    { protection: async () => 'active' as const, removeSession: input => storage.call('chatDatabaseDeleteSession', input), deleted: () => {} },
    undefined, undefined, { recover: false,
      started: async operation => { held = operation.operationId; entered(); await gate },
      finished: async id => { terminal = (await storage.call('chatDatabaseOperationRead', id)).status; held = null; finished() },
    })
  try {
    const workspace = await storage.call('createWorkspace', root, 'lifecycle')
    await storage.call('createSession', workspace.id)
    const operation = await service.preview({ kind: 'sessions', scope: { kind: 'global' } }, { actorId: 'device', idempotencyKey: 'preview' })
    await started
    expect(service.currentOperationId()).toBe(operation.operationId)
    expect(ownerId()).toBe(operation.operationId)
    expect((await service.read(operation.operationId)).status).toBe('accepted')
    release(); await ended
    expect(terminal).toBe('completed')
    expect(ownerId()).toBeNull()
    const page = await service.page({ previewId: operation.operationId })
    expect(page.items[0]?.skipReason).toBe('active')
  } finally {
    release(); await service.close(); await statistics.close(); await storage.close(); await rm(root, { recursive: true, force: true })
  }
})
