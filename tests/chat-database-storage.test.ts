import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage, createPathLayout, ensurePathLayout, createChatDatabaseFileScanner } from '@hbar/storage'
import { SettingsService, createChatDatabaseStatisticsService } from '@hbar/kernel'

const fixtures: {
  root: string
  storage: Storage
  statistics?: ReturnType<typeof createChatDatabaseStatisticsService>
}[] = []
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await fixture.statistics?.close()
    await fixture.storage.close()
    await rm(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-chat-database-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
  await ensurePathLayout(layout)
  const owner: { root: string; storage: Storage; statistics?: ReturnType<typeof createChatDatabaseStatisticsService> } =
    {
      root,
      storage: new Storage(layout.database, layout),
    }
  fixtures.push(owner)
  await owner.storage.call('ready')
  return { owner, layout }
}
async function backfill(storage: Storage, limit = 1): Promise<void> {
  for (let attempt = 0; attempt < 1000; attempt++) {
    if ((await storage.call('chatDatabaseUsageBackfill', limit)).complete) return
  }
  throw new Error('History backfill did not complete')
}

test('counts stored UTF-8 content once and keeps global, workspace and session history distinct', async () => {
  const { owner } = await fixture()
  const { storage } = owner
  const first = await storage.call('createWorkspace', join(owner.root, 'first'), 'first')
  const second = await storage.call('createWorkspace', join(owner.root, 'second'), 'second')
  const a = await storage.call('createSession', first.id, 'a')
  const b = await storage.call('createSession', second.id, 'b')
  const content = [{ type: 'text' as const, text: '你好，世界 🌍' }]
  await storage.call('commit', a.id, 'run-a', 'user', content, undefined, { raw: 'provider metadata' })
  await storage.call('commit', b.id, 'run-b', 'assistant', [{ type: 'text', text: 'another' }])
  const pending = await storage.call('chatDatabaseUsage', { kind: 'global' })
  expect(pending.complete).toBe(false)
  expect(pending.messageCount).toBe(2)
  await backfill(storage)
  const scoped = await storage.call('chatDatabaseUsage', { kind: 'workspace', targetId: first.id })
  expect(scoped).toMatchObject({
    complete: true,
    sessionCount: 1,
    messageCount: 1,
    contentBytes: new TextEncoder().encode(JSON.stringify(content)).byteLength,
  })
  expect(scoped.logicalBytes).toBeGreaterThan(scoped.contentBytes)
  expect(await storage.call('chatDatabaseUsage', { kind: 'session', targetId: a.id })).toMatchObject({
    messageCount: scoped.messageCount,
    contentBytes: scoped.contentBytes,
    logicalBytes: scoped.logicalBytes,
  })
  expect((await storage.call('chatDatabaseUsage', { kind: 'global' })).messageCount).toBe(2)
  const missing = await storage.call('chatDatabaseUsage', { kind: 'session', targetId: 'missing' }).then(
    () => null,
    (reason: unknown) => reason,
  )
  expect(missing).toMatchObject({ code: 'NOT_FOUND' })
})

test('renaming and archiving do not extend retention activity, while new Run activity does', async () => {
  const { owner } = await fixture()
  const workspace = await owner.storage.call('createWorkspace', owner.root, 'workspace')
  const session = await owner.storage.call('createSession', workspace.id, 'before')
  await owner.storage.call('commit', session.id, 'run', 'user', [{ type: 'text', text: 'content' }])
  await backfill(owner.storage)
  const before = await owner.storage.call('chatDatabaseUsage', { kind: 'session', targetId: session.id })
  await owner.storage.call('updateSession', session.id, { title: 'after', archived: true })
  const after = await owner.storage.call('chatDatabaseUsage', { kind: 'session', targetId: session.id })
  expect(after.lastActivityAt).toBe(before.lastActivityAt)
  expect(after.archivedCount).toBe(1)
  await new Promise<void>((resolve) => setTimeout(resolve, 5))
  await owner.storage.call('append', session.id, 'run.completed', {}, 'run')
  expect(
    (await owner.storage.call('chatDatabaseUsage', { kind: 'session', targetId: session.id })).lastActivityAt,
  ).toBeGreaterThan(before.lastActivityAt ?? 0)
})

test('interleaved writes and repeated bounded backfill never double count messages', async () => {
  const { owner } = await fixture()
  const workspace = await owner.storage.call('createWorkspace', owner.root, 'workspace')
  const session = await owner.storage.call('createSession', workspace.id, 'history')
  for (let index = 0; index < 12; index++) {
    await owner.storage.call('commit', session.id, `run-${index}`, 'user', [{ type: 'text', text: `${index}` }])
    await owner.storage.call('chatDatabaseUsageBackfill', 1)
  }
  await backfill(owner.storage)
  const before = await owner.storage.call('chatDatabaseUsage', { kind: 'global' })
  expect(before.messageCount).toBe(12)
  await backfill(owner.storage)
  expect(await owner.storage.call('chatDatabaseUsage', { kind: 'global' })).toEqual(before)
  const invalid = await owner.storage.call('chatDatabaseUsageBackfill', 501).then(
    () => null,
    (reason: unknown) => reason,
  )
  expect(invalid).toMatchObject({ code: 'INVALID_INPUT' })
})

test('shared attachments are deduplicated within each scope including tool results and event references', async () => {
  const { owner } = await fixture()
  const workspace = await owner.storage.call('createWorkspace', owner.root, 'workspace')
  const a = await owner.storage.call('createSession', workspace.id, 'a')
  const b = await owner.storage.call('createSession', workspace.id, 'b')
  const artifact = { id: 'a'.repeat(64), name: 'shared.png', mime: 'image/png', size: 17 }
  await owner.storage.call('putArtifact', artifact)
  await owner.storage.call('commit', a.id, 'a', 'user', [{ type: 'image', artifact }])
  await owner.storage.call('commit', b.id, 'b', 'tool', [
    {
      type: 'tool_result',
      callId: 'call',
      name: 'image-tool',
      text: 'image output',
      isError: false,
      details: { image: artifact },
      images: [artifact],
    },
  ])
  await backfill(owner.storage)
  expect(
    await owner.storage.call('chatDatabaseArtifactPage', { kind: 'workspace', targetId: workspace.id }, null),
  ).toEqual({ ids: [artifact.id], next: null })
  expect(await owner.storage.call('chatDatabaseArtifactPage', { kind: 'session', targetId: b.id }, null)).toEqual({
    ids: [artifact.id],
    next: null,
  })
})

test('migrates genuine version-22 history in small batches and restores identical counts after restart', async () => {
  const { owner, layout } = await fixture()
  const workspace = await owner.storage.call('createWorkspace', owner.root, 'workspace')
  const session = await owner.storage.call('createSession', workspace.id, 'legacy')
  await owner.storage.call('commit', session.id, 'old-run', 'user', [{ type: 'text', text: 'existing history' }])
  await backfill(owner.storage)
  const original = await owner.storage.call('chatDatabaseUsage', { kind: 'global' })
  await owner.storage.close()
  const db = new Database(layout.database)
  try {
    db.exec('PRAGMA foreign_keys=OFF')
    for (const kind of ['trigger', 'table']) {
      const entries = db
        .query<{ name: string }, [string]>(
          "SELECT name FROM sqlite_master WHERE type=? AND name GLOB 'chat_database_*'",
        )
        .all(kind)
      for (const entry of entries) db.exec(`DROP ${kind} "${entry.name.replaceAll('"', '""')}"`)
    }
    db.exec(
      'DROP INDEX IF EXISTS node_run_workspace_mounts_session; DROP TABLE IF EXISTS node_run_workspace_mounts; DROP INDEX node_run_worktrees_session; DROP TABLE node_run_worktrees; DROP INDEX node_execution_intents_run_call; DROP TABLE node_execution_intents; ALTER TABLE approvals DROP COLUMN executionTarget;',
    )
    db.exec('PRAGMA user_version=22')
  } finally {
    db.close()
  }
  owner.storage = new Storage(layout.database, layout)
  await owner.storage.call('ready')
  expect((await owner.storage.call('chatDatabaseUsage', { kind: 'global' })).complete).toBe(false)
  await backfill(owner.storage, 1)
  // Recreating projection tables may change SQLite's reusable pages without changing history counts.
  const migrated = await owner.storage.call('chatDatabaseUsage', { kind: 'global' })
  expect(migrated.freePageBytes).toBeGreaterThanOrEqual(0)
  expect(migrated).toEqual({
    ...original,
    freePageBytes: migrated.freePageBytes,
  })
  await owner.storage.close()
  owner.storage = new Storage(layout.database, layout)
  await owner.storage.call('ready')
  const restarted = await owner.storage.call('chatDatabaseUsage', { kind: 'global' })
  expect(restarted.freePageBytes).toBeGreaterThanOrEqual(0)
  expect(restarted).toEqual({
    ...original,
    freePageBytes: restarted.freePageBytes,
  })
})

test('attachment attribution stays paged at its 100-item boundary and excludes duplicate references', async () => {
  const { owner } = await fixture()
  const workspace = await owner.storage.call('createWorkspace', owner.root, 'workspace')
  const session = await owner.storage.call('createSession', workspace.id, 'attachment pages')
  const content = Array.from({ length: 101 }, (_, index) => ({
    type: 'file' as const,
    artifact: { id: index.toString(16).padStart(64, '0'), name: `${index}.txt`, mime: 'text/plain', size: 1 },
  }))
  await owner.storage.call('commit', session.id, 'files', 'user', [...content, content[0]!])
  await backfill(owner.storage)
  const scope = { kind: 'session' as const, targetId: session.id }
  const first = await owner.storage.call('chatDatabaseArtifactPage', scope, null, 100)
  expect(first.ids).toHaveLength(100)
  expect(first.next).not.toBeNull()
  const last = await owner.storage.call('chatDatabaseArtifactPage', scope, first.next, 100)
  expect(last.ids).toEqual([content[100]!.artifact.id])
  expect(last.next).toBeNull()
})

test('reports physical disk bytes and scoped attribution without traversing Windows junctions', async () => {
  const { owner, layout } = await fixture()
  const workspace = await owner.storage.call('createWorkspace', owner.root, 'workspace')
  const session = await owner.storage.call('createSession', workspace.id, 'disk')
  const artifact = { id: 'b'.repeat(64), name: 'image.png', mime: 'image/png', size: 17 }
  await owner.storage.call('putArtifact', artifact)
  await owner.storage.call('commit', session.id, 'run', 'user', [{ type: 'image', artifact }])
  await writeFile(join(layout.artifacts, artifact.id), Buffer.alloc(17))
  await writeFile(join(layout.cache.models, 'model-cache'), Buffer.alloc(11))
  await writeFile(join(layout.cache.locks, 'keep'), Buffer.alloc(7))
  const external = join(owner.root, 'external')
  await mkdir(external)
  await writeFile(join(external, 'user-data'), Buffer.alloc(1000))
  await symlink(external, join(layout.cache.tmp, 'external'), process.platform === 'win32' ? 'junction' : 'dir')
  const statistics = createChatDatabaseStatisticsService(
    owner.storage,
    new SettingsService(owner.storage),
    createChatDatabaseFileScanner(layout),
  )
  owner.statistics = statistics
  const global = await statistics.readComplete({ kind: 'global' })
  expect(global).toMatchObject({
    status: 'ready',
    complete: true,
    totalKind: 'physical',
    disk: { cacheBytes: 18, attachmentBytes: 17 },
  })
  expect(global.disk.databaseBytes).toBeGreaterThan(0)
  expect(global.disk.cacheCategories.find((category) => category.id === 'protected')).toEqual({
    id: 'protected',
    bytes: 7,
    clearable: false,
  })
  const scoped = await statistics.readComplete({ kind: 'session', targetId: session.id })
  expect(scoped).toMatchObject({ complete: true, totalKind: 'attributable', disk: { scopedAttachmentBytes: 17 } })
  expect(scoped.disk.scopedLogBytes).toBeGreaterThan(0)
  expect(scoped.totalBytes).toBe(scoped.history.logicalBytes + scoped.disk.scopedLogBytes + 17)
})

test('workspace attribution follows the current owner after a session moves, including historical log paths and attachment references', async () => {
  const { owner, layout } = await fixture()
  const first = await owner.storage.call('createWorkspace', join(owner.root, 'first'), 'first')
  const second = await owner.storage.call('createWorkspace', join(owner.root, 'second'), 'second')
  const session = await owner.storage.call('createSession', first.id, 'moving attribution')
  const artifact = { id: 'c'.repeat(64), name: 'shared.txt', mime: 'text/plain', size: 17 }
  await writeFile(join(layout.artifacts, artifact.id), 'attachment bytes!')
  await owner.storage.call('putArtifact', artifact)
  await owner.storage.call('commit', session.id, 'fixture', 'user', [{ type: 'file', artifact }])
  await owner.storage.call('moveSession', session.id, second.id)
  owner.statistics = createChatDatabaseStatisticsService(
    owner.storage,
    new SettingsService(owner.storage),
    createChatDatabaseFileScanner(layout),
  )
  const oldScope = await owner.statistics.readComplete({ kind: 'workspace', targetId: first.id })
  const newScope = await owner.statistics.readComplete({ kind: 'workspace', targetId: second.id })
  expect(oldScope).toMatchObject({
    history: { sessionCount: 0 },
    disk: { scopedLogBytes: 0, scopedAttachmentBytes: 0 },
  })
  expect(newScope.history.sessionCount).toBe(1)
  expect(newScope.disk.scopedLogBytes).toBe(newScope.disk.logBytes)
  expect(newScope.disk.scopedAttachmentBytes).toBe(17)
})
