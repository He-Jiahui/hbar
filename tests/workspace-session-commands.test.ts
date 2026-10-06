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
  const catalog = await client.call('command.catalog', { category: 'workspace.session', limit: 50 })
  expect(catalog.items.map((item) => item.metadata.id)).toEqual([
    'schedule.create',
    'schedule.delete',
    'schedule.get',
    'schedule.list',
    'schedule.occurrences',
    'schedule.preview',
    'schedule.receipt',
    'schedule.update',
    'session.activity.global.list',
    'session.activity.list',
    'session.agentAncestors.get',
    'session.agentChildren.list',
    'session.archive',
    'session.create',
    'session.export',
    'session.fork',
    'session.forkableMessages',
    'session.forkFromMessage',
    'session.forkFromMessageReceipt',
    'session.get',
    'session.list',
    'session.rename',
    'session.sidebar.list',
    'workspace.activity.list',
    'workspace.create',
    'workspace.folders.browse',
    'workspace.folders.create',
    'workspace.folders.get',
    'workspace.folders.receipt',
    'workspace.folders.save',
    'workspace.get',
    'workspace.list',
    'workspace.sidebar.list',
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

test('authenticated Host exposes a multi-folder workspace and paginated server directory selection', async () => {
  const { root, commands } = await fixture()
  const paths = [join(root, 'frontend'), join(root, 'backend')]
  for (const path of paths) await mkdir(path)
  const folders = paths.map((path, index) => ({
    id: `folder-${index}`,
    alias: index === 0 ? 'frontend' : 'backend',
    path,
  }))
  const request = { folders }
  const result = await commands.execute('workspace.folders.create', request, { idempotencyKey: 'multi-root-create' })
  expect((await commands.execute('workspace.folders.get', { workspaceId: result.workspace.id })).folders).toEqual(
    folders,
  )
  const page = await commands.execute('workspace.folders.browse', { path: root })
  expect(page.items.map((item) => item.name)).toContain('frontend')
  expect(page.items.map((item) => item.name)).not.toContain('data')
  const update = {
    workspaceId: result.workspace.id,
    expectedRevision: result.snapshot.revision,
    folders: [...folders].reverse(),
  }
  const saved = await commands.execute('workspace.folders.save', update, { idempotencyKey: 'multi-root-save' })
  expect(saved.snapshot.folders[0]?.alias).toBe('backend')
  expect(
    (
      await commands.execute('workspace.folders.receipt', {
        idempotencyKey: 'multi-root-save',
        request: { operation: 'save', input: update },
      })
    )?.result,
  ).toEqual(saved)
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
