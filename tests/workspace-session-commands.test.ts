import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets, createWorkspaceSessionCommands } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workspace-commands-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  const close = async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
  }
  cleanups.push(async () => {
    await close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'workspace command test')
  return { root, kernel, workspace, client, commands: createWorkspaceSessionCommandClient(client), close }
}

test('workspace and session commands share the Host catalog and bounded directory queries', async () => {
  const { root, kernel, workspace, client, commands } = await fixture()
  const catalog = await client.call('command.catalog', { category: 'workspace.session', limit: 30 })
  expect(catalog.items.map((item) => item.metadata.id)).toEqual([
    'session.archive',
    'session.create',
    'session.export',
    'session.fork',
    'session.forkFromMessage',
    'session.get',
    'session.list',
    'session.rename',
    'workspace.create',
    'workspace.get',
    'workspace.list',
  ])
  expect((await commands.execute('workspace.list', { limit: 10 })).items).toEqual([workspace])
  expect(await commands.execute('workspace.get', { workspaceId: workspace.id })).toEqual(workspace)

  const secondPath = join(root, 'second-workspace')
  await mkdir(secondPath)
  const second = await commands.execute('workspace.create', { path: secondPath })
  expect((await commands.execute('workspace.create', { path: secondPath })).id).toBe(second.id)

  const input = { workspaceId: workspace.id, title: 'Command session' }
  const [created, duplicate] = await Promise.all([
    commands.execute('session.create', input, { idempotencyKey: 'create-one' }),
    commands.execute('session.create', input, { idempotencyKey: 'create-one' }),
  ])
  expect(duplicate.id).toBe(created.id)
  let conflict: unknown
  try {
    await commands.execute('session.create', { ...input, title: 'Different' }, { idempotencyKey: 'create-one' })
  } catch (error) {
    conflict = error
  }
  expect(conflict).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  expect((await commands.execute('session.get', { sessionId: created.id }))?.id).toBe(created.id)
  expect((await commands.execute('session.list', { workspaceId: workspace.id, title: input.title })).items).toEqual([
    created,
  ])

  const renamed = await commands.execute('session.rename', { sessionId: created.id, title: 'Renamed' })
  expect(renamed.title).toBe('Renamed')
  const archived = await commands.execute('session.archive', { sessionId: created.id, archived: true })
  expect(archived.archived).toBe(true)
  expect((await commands.execute('session.list', { workspaceId: workspace.id })).items).toEqual([])
  expect((await commands.execute('session.list', { workspaceId: workspace.id, includeArchived: true })).items).toEqual([
    archived,
  ])

  await kernel.append(created.id, 'test.one', { index: 1 })
  await kernel.append(created.id, 'test.two', { index: 2 })
  const first = await commands.execute('session.export', { sessionId: created.id, limit: 2 })
  expect(first.events).toHaveLength(2)
  expect(first.nextCursor).toBe(first.cursor)
  const rest = await commands.execute('session.export', {
    sessionId: created.id,
    after: first.nextCursor!,
    limit: 500,
  })
  expect(rest.events.length).toBeGreaterThan(0)
  expect(rest.nextCursor).toBeNull()
})

test('session create and fork receipts survive Kernel restart for the same actor', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workspace-command-recovery-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const commands = createWorkspaceSessionCommands(kernel)
  const created = await commands.execute(
    'session.create',
    { workspaceId: workspace.id, title: 'Persistent command' },
    { actorId: 'persistent-device', idempotencyKey: 'persistent-create' },
  )
  const forked = await commands.execute(
    'session.fork',
    { sessionId: created.id },
    { actorId: 'persistent-device', idempotencyKey: 'persistent-fork' },
  )
  commands.dispose()
  await kernel.close()

  const reopened = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const recovered = createWorkspaceSessionCommands(reopened)
  cleanups.push(async () => {
    recovered.dispose()
    await reopened.close()
    await rm(root, { recursive: true, force: true })
  })
  expect(
    await recovered.execute(
      'session.create',
      { workspaceId: workspace.id, title: 'Persistent command' },
      { actorId: 'persistent-device', idempotencyKey: 'persistent-create' },
    ),
  ).toEqual(created)
  expect(
    await recovered.execute(
      'session.fork',
      { sessionId: created.id },
      { actorId: 'persistent-device', idempotencyKey: 'persistent-fork' },
    ),
  ).toEqual(forked)
  expect((await reopened.directoryQueries.execute('session.list', { workspaceId: workspace.id })).items).toHaveLength(2)
})
