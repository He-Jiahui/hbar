import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createSettingsCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { encodePath } from '@hbar/schema-core'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-settings-commands-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id, 'settings commands')
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'settings command test')
  return { client, workspace, session }
}

const field = (name: string) => [{ kind: 'field' as const, name }]

test('typed settings commands share catalog, layered CAS and actor-scoped idempotency', async () => {
  const { client, workspace, session } = await fixture()
  const commands = createSettingsCommandClient(client)
  const sessionScope = { kind: 'session' as const, targetId: session.id }
  const workspaceScope = { kind: 'workspace' as const, targetId: workspace.id }
  const model = field('provider.model')
  const modelKey = encodePath(model)

  const catalog = await client.call('command.catalog', { category: 'settings.providers', limit: 20 })
  expect(catalog.items.map((item) => item.metadata.id)).toEqual([
    'settings.apply',
    'settings.get',
    'settings.set',
    'settings.unset',
  ])
  expect(await client.call('command.describe', { commandId: 'settings.apply' })).toMatchObject({
    metadata: { id: 'settings.apply', execution: 'host', stateEffect: 'persistent' },
  })

  const before = await commands.execute('settings.get', { scope: sessionScope, path: model })
  expect(Object.keys(before.resolution.reports)).toEqual([modelKey])
  expect(before.resolution.reports[modelKey]).toMatchObject({ effectiveValue: null, localPresence: false })

  const input = {
    schemaVersion: 1,
    scope: sessionScope,
    path: model,
    value: 'local-fixture',
    baselineRevisions: before.revisions,
  }
  const first = await commands.execute('settings.set', input, { idempotencyKey: 'set-model' })
  expect(first).toMatchObject({
    layerId: `settings:session:${session.id}`,
    revision: 1,
  })
  expect(first.resolution.reports[modelKey]).toMatchObject({
    effectiveValue: 'local-fixture',
    localPresence: true,
    applyMode: 'nextRun',
    applyState: 'pending',
  })
  expect(await commands.execute('settings.set', input, { idempotencyKey: 'set-model' })).toEqual(first)
  await expect(
    commands.execute('settings.set', { ...input, value: 'different' }, { idempotencyKey: 'set-model' }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })

  const workspaceBefore = await commands.execute('settings.get', { scope: workspaceScope })
  const batch = await commands.execute(
    'settings.apply',
    {
      schemaVersion: 1,
      scope: workspaceScope,
      changes: [
        { op: 'set', path: model, value: 'local-fixture' },
        { op: 'set', path: field('provider.thinkingLevel'), value: 'high' },
      ],
      baselineRevisions: workspaceBefore.revisions,
    },
    { idempotencyKey: 'workspace-batch' },
  )
  expect(batch).toMatchObject({ layerId: `settings:workspace:${workspace.id}`, revision: 1 })

  const afterSet = await commands.execute('settings.get', { scope: sessionScope })
  const unset = await commands.execute(
    'settings.unset',
    { schemaVersion: 1, scope: sessionScope, path: model, baselineRevisions: afterSet.revisions },
    { idempotencyKey: 'unset-model' },
  )
  expect(unset.resolution.reports[modelKey]).toMatchObject({
    effectiveValue: 'local-fixture',
    localPresence: false,
    inherited: true,
  })

  const forbidden = field('session.defaultBudget')
  const current = await commands.execute('settings.get', { scope: sessionScope })
  await expect(
    commands.execute(
      'settings.set',
      { schemaVersion: 1, scope: sessionScope, path: forbidden, value: 100, baselineRevisions: current.revisions },
      { idempotencyKey: 'forbidden-layer' },
    ),
  ).rejects.toMatchObject({ code: 'LAYER_FORBIDDEN' })
})
