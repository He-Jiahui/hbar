import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { HbarClient, createChatDatabaseCommandClient, createSettingsCommandClient } from '@hbar/client'
import { startServer } from '../apps/host/src/server'

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
