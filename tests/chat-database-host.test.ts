import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { lstat, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { HbarClient, createChatDatabaseCommandClient, createSettingsCommandClient } from '@hbar/client'
import { startServer } from '../apps/host/src/server'
import type { ChatDatabaseOperation } from '@hbar/contracts/commands/chat-database'

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
