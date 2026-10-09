import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage, createPathLayout, ensurePathLayout } from '@hbar/storage'
import { SettingsService, resolveChatDatabasePolicy } from '@hbar/kernel'
import { encodePath, type SchemaPath } from '@hbar/schema-core'
import { DEFAULT_CHAT_DATABASE_POLICY, chatDatabaseCommands } from '@hbar/contracts/commands/chat-database'

const fixtures: { root: string; storage: Storage }[] = []
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await fixture.storage.close()
    await rm(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-chat-database-policy-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
  await ensurePathLayout(layout)
  const storage = new Storage(layout.database, layout)
  fixtures.push({ root, storage })
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'workspace')
  const session = await storage.call('createSession', workspace.id, 'session')
  return { storage, service: new SettingsService(storage), workspace, session }
}
const path = (name: string): SchemaPath => [{ kind: 'field', name: `chatDatabase.${name}` }]

test('cleanup policy inherits global to workspace to session and restores the saved parent value', async () => {
  const { service, workspace, session } = await fixture()
  expect(resolveChatDatabasePolicy((await service.get({ kind: 'global' })).resolution)).toEqual(
    DEFAULT_CHAT_DATABASE_POLICY,
  )
  const apply = async (
    scope: Parameters<SettingsService['get']>[0],
    name: string,
    value: unknown,
    idempotencyKey: string,
  ) => {
    const before = await service.get(scope)
    return service.apply({
      schemaVersion: 1,
      scope,
      changes: [{ op: 'set', path: path(name), value }],
      baselineRevisions: before.revisions,
      actorId: 'device',
      idempotencyKey,
    })
  }
  await apply({ kind: 'global' }, 'retentionDays', 30, 'global')
  await apply({ kind: 'workspace', targetId: workspace.id }, 'retentionDays', 60, 'workspace')
  const scope = { kind: 'session' as const, targetId: session.id }
  expect(resolveChatDatabasePolicy((await service.get(scope)).resolution).retentionDays).toBe(60)
  await apply(scope, 'retentionDays', 120, 'session')
  const before = await service.get(scope)
  await service.apply({
    schemaVersion: 1,
    scope,
    changes: [{ op: 'unset', path: path('retentionDays') }],
    baselineRevisions: before.revisions,
    actorId: 'device',
    idempotencyKey: 'inherit',
  })
  const after = await service.get(scope)
  expect(resolveChatDatabasePolicy(after.resolution).retentionDays).toBe(60)
  expect(after.resolution.reports[encodePath(path('retentionDays'))]?.localPresence).toBe(false)
})

test('invalid timezone, empty weekdays, out-of-range days and non-global cache changes never persist', async () => {
  const { service, session } = await fixture()
  for (const [name, value] of [
    ['timezone', 'No/SuchTimezone'],
    ['timezone', '+03:00'],
    ['scheduleWeekdays', []],
    ['retentionDays', 0],
    ['retentionDays', 36_501],
  ]) {
    const scope = { kind: 'global' as const }
    const before = await service.get(scope)
    const rejected = await service
      .apply({
        schemaVersion: 1,
        scope,
        changes: [{ op: 'set', path: path(String(name)), value }],
        baselineRevisions: before.revisions,
        actorId: 'device',
        idempotencyKey: `invalid-${String(name)}-${String(value)}`,
      })
      .then(
        () => null,
        (reason: unknown) => reason,
      )
    expect(rejected).toBeInstanceOf(Error)
    expect((await service.get(scope)).revisions).toEqual(before.revisions)
  }
  const scope = { kind: 'session' as const, targetId: session.id }
  const before = await service.get(scope)
  const rejected = await service
    .apply({
      schemaVersion: 1,
      scope,
      changes: [{ op: 'set', path: path('cacheRetentionDays'), value: 1 }],
      baselineRevisions: before.revisions,
      actorId: 'device',
      idempotencyKey: 'invalid-scope',
    })
    .then(
      () => null,
      (reason: unknown) => reason,
    )
  expect(rejected).toBeInstanceOf(Error)
})

test('statistics wire inputs reject malformed scope and unexpected fields', () => {
  const input = chatDatabaseCommands['chatDatabase.statistics'].input
  expect(input.safeParse({ scope: { kind: 'session' } }).success).toBe(false)
  expect(input.safeParse({ scope: { kind: 'global' }, sql: 'SELECT *' }).success).toBe(false)
  expect(input.parse({ scope: { kind: 'global' } })).toEqual({ scope: { kind: 'global' }, refresh: false })
})
