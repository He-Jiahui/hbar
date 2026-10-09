import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { lstat, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Kernel, MemorySecrets, SettingsService } from '@hbar/kernel'
import { HbarClient, createChatDatabaseCommandClient, createSettingsCommandClient } from '@hbar/client'
import { startServer } from '../apps/host/src/server'
import type { ChatDatabaseOperation } from '@hbar/contracts/commands/chat-database'

test('Host startup executes saved capacity rules, reclaims cache first and exposes the durable automatic task through Client SDK', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-chat-auto-host-'))
  const kernel = await Kernel.create({
    home: join(root, 'home'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    const settings = new SettingsService(kernel.storage)
    const saved = await settings.get({ kind: 'global' })
    await settings.apply({
      actorId: 'fixture',
      idempotencyKey: 'enable-quota',
      schemaVersion: 1,
      scope: { kind: 'global' },
      baselineRevisions: saved.revisions,
      changes: [
        { op: 'set', path: [{ kind: 'field', name: 'chatDatabase.autoEnabled' }], value: true },
        { op: 'set', path: [{ kind: 'field', name: 'chatDatabase.scheduleEnabled' }], value: false },
        { op: 'set', path: [{ kind: 'field', name: 'chatDatabase.capacityEnabled' }], value: true },
        { op: 'set', path: [{ kind: 'field', name: 'chatDatabase.capacityLimitMiB' }], value: 10 },
      ],
    })
    const workspace = await kernel.storage.call('createWorkspace', root, 'cache priority')
    const chat = await kernel.storage.call('createSession', workspace.id, 'retained after cache target')
    await kernel.storage.call('commit', chat.id, 'fixture', 'user', [{ type: 'text', text: 'retained content' }])
    await kernel.storage.call('updateSession', chat.id, { archived: true })
    while (!(await kernel.storage.call('chatDatabaseUsageBackfill', 250)).complete) {
      /* batch */
    }
    const db = new Database(kernel.options.layout.database, { strict: true })
    db.query('UPDATE chat_database_usage SET lastActivityAt=? WHERE sessionId=?').run(
      Date.now() - 100 * 86_400_000,
      chat.id,
    )
    db.close()
    const cache = join(kernel.options.layout.cache.markdown, 'capacity-preview.bin')
    await writeFile(cache, new Uint8Array(12 * 1_048_576))
    await utimes(cache, 0, 0)
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'automatic task monitor')
    const commands = createChatDatabaseCommandClient(client)
    let task = await commands.execute('chatDatabase.task', { scope: { kind: 'global' } })
    for (let attempt = 0; attempt < 500 && task.operation?.status !== 'completed'; attempt++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 5))
      task = await commands.execute('chatDatabase.task', { scope: { kind: 'global' } })
    }
    expect(task).toMatchObject({
      autoEnabled: true,
      scheduleEnabled: false,
      nextDueAt: null,
      operation: { status: 'completed', trigger: 'capacity', deletedCount: 1, reclaimedBytes: 12 * 1_048_576 },
    })
    expect(task.operation?.remainingBytes).toBeLessThanOrEqual(Math.floor(10 * 1_048_576 * 0.9))
    expect(await kernel.storage.call('findSession', chat.id)).not.toBeNull()
    expect(
      await lstat(cache).then(
        () => null,
        (reason: unknown) => reason,
      ),
    ).toMatchObject({ code: 'ENOENT' })
    expect((await commands.execute('chatDatabase.history', { scope: { kind: 'global' } })).items).toHaveLength(1)
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

test('paired Host commands reclaim only known cache bytes and preserve an attachment owned by an offline draft', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-chat-database-resources-host-'))
  const kernel = await Kernel.create({
    home: join(root, 'home'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'resource settings device')
    const commands = createChatDatabaseCommandClient(client)
    const cache = join(kernel.options.layout.cache.markdown, 'old-preview.html')
    await writeFile(cache, 'cache through public API')
    await utimes(cache, 0, 0)
    async function settled(initial: ChatDatabaseOperation) {
      let state = initial
      for (let attempt = 0; attempt < 300 && !['completed', 'failed', 'unknown'].includes(state.status); attempt++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 5))
        state = await commands.execute('chatDatabase.operation', { operationId: initial.operationId })
      }
      return state
    }
    const fixed = await settled(
      await commands.execute(
        'chatDatabase.preview',
        { scope: { kind: 'global' }, kind: 'cache' },
        { idempotencyKey: 'cache-preview' },
      ),
    )
    expect(fixed).toMatchObject({ status: 'completed', candidateCount: 1 })
    const done = await settled(
      await commands.execute(
        'chatDatabase.cleanup',
        { previewId: fixed.operationId },
        { idempotencyKey: 'cache-cleanup' },
      ),
    )
    expect(done).toMatchObject({ status: 'completed', deletedCount: 1, reclaimedBytes: 24 })
    expect(
      await lstat(cache).then(
        () => null,
        (reason: unknown) => reason,
      ),
    ).toMatchObject({ code: 'ENOENT' })
    const artifact = await client.upload(new File(['unsent attachment'], 'draft.txt'), undefined, {
      owner: { id: 'window-draft', kind: 'preSession', clientRevision: 0 },
    })
    await commands.execute(
      'chatDatabase.draft.sync',
      {
        expectedRevision: 0,
        owner: {
          id: 'window-draft',
          kind: 'preSession',
          clientRevision: 0,
          artifactIds: [artifact.id],
          pendingArtifactIds: [],
        },
      },
      { idempotencyKey: 'offline-draft' },
    )
    const attachmentPreview = await settled(
      await commands.execute(
        'chatDatabase.preview',
        { scope: { kind: 'global' }, kind: 'attachments' },
        { idempotencyKey: 'attachment-preview' },
      ),
    )
    const page = await commands.execute('chatDatabase.previewPage', { previewId: attachmentPreview.operationId })
    expect(page.items.find((item) => item.id === artifact.id)).toMatchObject({
      eligible: false,
      skipReason: 'referenced',
    })
    const db = new Database(kernel.options.layout.database, { strict: true })
    db.exec(
      'CREATE TABLE host_vacuum_fixture(data BLOB); INSERT INTO host_vacuum_fixture VALUES(randomblob(2097152)); PRAGMA wal_checkpoint(TRUNCATE); DELETE FROM host_vacuum_fixture; PRAGMA wal_checkpoint(TRUNCATE);',
    )
    db.close()
    const databasePreview = await settled(
      await commands.execute(
        'chatDatabase.preview',
        { scope: { kind: 'global' }, kind: 'database' },
        { idempotencyKey: 'database-preview' },
      ),
    )
    expect(databasePreview).toMatchObject({ status: 'completed', candidateCount: 1 })
    const databaseCleanup = await settled(
      await commands.execute(
        'chatDatabase.cleanup',
        { previewId: databasePreview.operationId },
        { idempotencyKey: 'database-cleanup' },
      ),
    )
    expect(databaseCleanup).toMatchObject({ status: 'completed', processedCount: 1, deletedCount: 1 })
    expect(databaseCleanup.reclaimedBytes).toBeGreaterThan(1024 * 1024)
    expect(await commands.execute('chatDatabase.receipt', { idempotencyKey: 'database-cleanup' })).toMatchObject({
      operationId: databaseCleanup.operationId,
      status: 'completed',
    })
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

test('paired Client reads real scoped statistics and the saved cleanup policy through Host commands', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-chat-database-host-'))
  const kernel = await Kernel.create({
    home: join(root, 'home'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]!
    const session = await kernel.createSession(workspace.id, 'stored history')
    await kernel.storage.call('commit', session.id, 'fixture', 'user', [{ type: 'text', text: 'real statistics' }])
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'chat database test')
    const settings = createSettingsCommandClient(client)
    const snapshot = await settings.execute('settings.get', { scope: { kind: 'global' } })
    await settings.execute(
      'settings.apply',
      {
        schemaVersion: 1,
        scope: { kind: 'global' },
        baselineRevisions: snapshot.revisions,
        changes: [{ op: 'set', path: [{ kind: 'field', name: 'chatDatabase.retentionDays' }], value: 45 }],
      },
      { idempotencyKey: 'retention-45' },
    )
    const commands = createChatDatabaseCommandClient(client)
    const scope = { kind: 'session' as const, targetId: session.id }
    let report = await commands.execute('chatDatabase.statistics', { scope, refresh: true })
    for (let attempt = 0; attempt < 100 && !report.complete; attempt++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
      report = await commands.execute('chatDatabase.statistics', { scope })
    }
    expect(report).toMatchObject({
      scope,
      status: 'ready',
      complete: true,
      totalKind: 'attributable',
      history: { sessionCount: 1, messageCount: 1 },
      policy: { retentionDays: 45, autoEnabled: false },
    })
    expect(report.disk.databaseBytes).toBeGreaterThan(0)
    expect(report.disk.scopedLogBytes).toBeGreaterThan(0)
    const missing = await commands
      .execute('chatDatabase.statistics', { scope: { kind: 'session', targetId: 'missing' } })
      .then(
        () => null,
        (reason: unknown) => reason,
      )
    expect(missing).toMatchObject({ code: 'NOT_FOUND' })
    const catalog = await client.call('command.catalog', { category: 'system.storage' })
    expect(catalog.items.some((entry) => entry.metadata.id === 'chatDatabase.statistics')).toBe(true)
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

test('real Host accepts a fixed cleanup, survives Client disconnect, and reconciles its receipt after reconnect', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-chat-database-cleanup-host-'))
  const kernel = await Kernel.create({
    home: join(root, 'home'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]!
    const session = await kernel.createSession(workspace.id, 'delete through public commands')
    await kernel.storage.call('commit', session.id, 'fixture', 'user', [{ type: 'text', text: 'real cleanup data' }])
    await kernel.storage.call('updateSession', session.id, { archived: true })
    while (!(await kernel.storage.call('chatDatabaseUsageBackfill', 250)).complete) {
      /* make age fixtures independent of backfill */
    }
    const db = new Database(kernel.options.layout.database, { strict: true })
    db.query('UPDATE chat_database_usage SET lastActivityAt=? WHERE sessionId=?').run(
      Date.now() - 100 * 86_400_000,
      session.id,
    )
    db.close()
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'public cleanup device')
    const commands = createChatDatabaseCommandClient(client)
    const accepted = await commands.execute(
      'chatDatabase.preview',
      { scope: { kind: 'global' }, kind: 'sessions' },
      { idempotencyKey: 'preview-public' },
    )
    let fixed = accepted
    for (let attempt = 0; attempt < 200 && !['completed', 'failed'].includes(fixed.status); attempt++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 5))
      fixed = await commands.execute('chatDatabase.operation', { operationId: accepted.operationId })
    }
    expect(fixed).toMatchObject({ status: 'completed', candidateCount: 1 })
    expect(
      (await commands.execute('chatDatabase.previewPage', { previewId: fixed.operationId })).items.find(
        (item) => item.id === session.id,
      )?.eligible,
    ).toBe(true)
    const cleanup = await commands.execute(
      'chatDatabase.cleanup',
      { previewId: fixed.operationId },
      { idempotencyKey: 'cleanup-public' },
    )
    client.disconnect()
    await client.connect()
    let done = await commands.execute('chatDatabase.operation', { operationId: cleanup.operationId })
    for (let attempt = 0; attempt < 200 && !['completed', 'failed', 'unknown'].includes(done.status); attempt++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 5))
      done = await commands.execute('chatDatabase.operation', { operationId: cleanup.operationId })
    }
    expect(done).toMatchObject({ status: 'completed', deletedCount: 1 })
    expect(done.reclaimedBytes).toBeGreaterThan(0)
    expect(await commands.execute('chatDatabase.receipt', { idempotencyKey: 'cleanup-public' })).toEqual(done)
    expect(
      (
        await commands.execute(
          'chatDatabase.cleanup',
          { previewId: fixed.operationId },
          { idempotencyKey: 'cleanup-public' },
        )
      ).operationId,
    ).toBe(done.operationId)
    expect(await kernel.storage.call('findSession', session.id)).toBeNull()
    expect(
      (await commands.execute('chatDatabase.history', { scope: { kind: 'global' }, limit: 50 })).items.map(
        (item) => item.operationId,
      ),
    ).toContain(done.operationId)
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
