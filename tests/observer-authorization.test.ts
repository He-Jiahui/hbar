import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { HbarClient, createSystemCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { Storage } from '@hbar/storage'
import { Database } from 'bun:sqlite'
import { z } from 'zod'
import { startServer } from '../apps/host/src/server'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { createPathLayout } from '@hbar/storage'
import type { WireNotification } from '@hbar/contracts'
import { DEVICE_ACCESS_SQL, createDeviceStorage } from '../packages/storage/src/device-access'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-observer-'))
  const path = join(root, 'workspace')
  await mkdir(path)
  const kernel = await Kernel.create({
    home: join(root, 'home'),
    workspace: path,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const url = `http://127.0.0.1:${host.server.port}`
  const operator = new HbarClient(url, (await host.auth.createDevice('operator')).token)
  await operator.connect()
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('No fixture workspace')
  const session = await kernel.createSession(workspace.id)
  const clients = [operator]
  cleanups.push(async () => {
    for (const client of clients) client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  const observer = async (workspaceIds: string[] | null = null) => {
    const paired = await host.auth.createDevice('observer', { role: 'observer', workspaceIds })
    const client = new HbarClient(url, paired.token)
    clients.push(client)
    await client.connect()
    return { client, paired }
  }
  return { root, kernel, host, operator, workspace, session, observer, url, clients }
}
async function failure(action: Promise<unknown>): Promise<unknown> {
  try {
    await action
  } catch (error) {
    return error
  }
  throw new Error('Expected denial')
}

test('observer follows and queries a session while every write and approval entry is refused', async () => {
  const f = await fixture()
  const { client, paired } = await f.observer()
  expect(f.operator.connectionHost()?.deviceAccess).toEqual({ role: 'operator', workspaceIds: null })
  expect(client.connectionHost()?.deviceAccess).toEqual({ role: 'observer', workspaceIds: null })
  expect((await client.call('system.bootstrap', {})).host.deviceAccess).toEqual({ role: 'observer', workspaceIds: null })
  expect((await client.call('session.snapshot', { sessionId: f.session.id })).session.id).toBe(f.session.id)
  expect(await client.call('session.follow', { sessionId: f.session.id, cursor: 0 })).toMatchObject({ reset: false })
  expect(
    (await createWorkspaceSessionCommandClient(client).execute('session.get', { sessionId: f.session.id }))?.id,
  ).toBe(f.session.id)
  for (const action of [
    () =>
      client.call('run.start', {
        sessionId: f.session.id,
        requestId: 'forbidden',
        input: { text: 'no', images: [] },
        modelId: 'local-fixture',
      }),
    () => client.call('approval.resolve', { approvalId: 'approval', decision: 'allowed' }),
    () => client.call('terminal.open', { workspaceId: f.workspace.id }),
    () =>
      createWorkspaceSessionCommandClient(client).execute('session.rename', {
        sessionId: f.session.id,
        title: 'forbidden',
      }),
    () => createSystemCommandClient(client).execute('pairing.create', {}),
  ])
    expect(await failure(action())).toMatchObject({ code: 'FORBIDDEN' })
  const upload = await fetch(f.url + '/api/artifacts', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + paired.token },
    body: 'no',
  })
  expect(await upload.json()).toMatchObject({ code: 'FORBIDDEN' })
  expect((await f.kernel.storage.call('session', f.session.id)).title).not.toBe('forbidden')
  expect((await f.kernel.snapshot(f.session.id)).runs.length).toBe(0)
})

test('workspace-scoped observers cannot read, follow or bootstrap another workspace', async () => {
  const f = await fixture()
  const otherPath = join(f.root, 'other')
  await mkdir(otherPath)
  const other = await f.kernel.createWorkspace(otherPath)
  const foreign = await f.kernel.createSession(other.id, 'private')
  const { client } = await f.observer([f.workspace.id])
  const commands = createWorkspaceSessionCommandClient(client)
  expect((await commands.execute('workspace.list', {})).items.map((item) => item.id)).toEqual([f.workspace.id])
  expect((await client.call('workspace.list', {})).items.map((item) => item.id)).toEqual([f.workspace.id])
  for (const action of [
    () => client.call('session.snapshot', { sessionId: foreign.id }),
    () => client.call('session.follow', { sessionId: foreign.id, cursor: 0 }),
    () => commands.execute('workspace.get', { workspaceId: other.id }),
    () => commands.execute('session.list', { workspaceId: other.id }),
    () => client.call('session.summaries', { sessionIds: [f.session.id, foreign.id] }),
    () => createSystemCommandClient(client).execute('device.list', {}),
  ])
    expect(await failure(action())).toMatchObject({ code: 'FORBIDDEN' })
  const bootstrap = await client.call('system.bootstrap', {})
  expect(bootstrap.host.deviceAccess).toEqual({ role: 'observer', workspaceIds: [f.workspace.id] })
  expect(bootstrap.workspaces.map((item) => item.id)).toEqual([f.workspace.id])
  expect(bootstrap.sessions.some((item) => item.id === foreign.id)).toBe(false)
  expect(bootstrap.plugins).toEqual([])
})

test('operator issues an observer invitation and device access survives storage reopening', async () => {
  const f = await fixture()
  const invitation = await createSystemCommandClient(f.operator).execute('pairing.create', {
    role: 'observer',
    workspaceIds: [f.workspace.id],
  })
  const response = await fetch(f.url + '/auth/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: invitation.code, name: 'new observer' }),
  })
  const json: unknown = await response.json()
  const result = z.object({ token: z.string() }).parse(json)
  const paired = await f.host.auth.authenticate(result.token)
  expect(paired).toMatchObject({ role: 'observer', workspaceIds: [f.workspace.id] })
  expect((await f.kernel.storage.call('devices')).find((item) => item.id === paired.id)).toMatchObject({
    role: 'observer',
  })
  const client = new HbarClient(f.url, result.token)
  f.clients.push(client)
  await client.connect()
  expect(await failure(client.call('approval.resolve', { approvalId: 'missing', decision: 'allowed' }))).toMatchObject({
    code: 'FORBIDDEN',
  })
})

test('migration 26 preserves legacy operator devices and new observer scopes atomically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-device-migration-'))
  const path = join(root, 'state.sqlite')
  let storage = new Storage(path)
  try {
    await storage.call('ready')
    await storage.call('putDevice', { id: 'legacy', name: 'legacy', createdAt: 1, lastSeenAt: 1 }, 'legacy-hash')
    await storage.close()
    const old = new Database(path)
    try {
      old.exec('DROP TABLE node_execution_intents; DROP TABLE node_workspace_locations; DROP TABLE workspace_nodes; DROP TABLE node_conversation_identity; DROP TABLE device_access; PRAGMA user_version=25;')
    } finally {
      old.close()
    }
    storage = new Storage(path)
    await storage.call('ready')
    expect(await storage.call('deviceByHash', 'legacy-hash')).toMatchObject({ role: 'operator', workspaceIds: null })
    await storage.call(
      'putDevice',
      { id: 'new', name: 'new', createdAt: 1, lastSeenAt: 1, role: 'observer', workspaceIds: ['workspace'] },
      'observer-hash',
    )
    await storage.close()
    storage = new Storage(path)
    await storage.call('ready')
    expect(await storage.call('deviceByHash', 'observer-hash')).toMatchObject({
      role: 'observer',
      workspaceIds: ['workspace'],
    })
    await storage.call('revokeDevice', 'new')
    expect(await storage.call('deviceByHash', 'observer-hash')).toBeNull()
  } finally {
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('device registration rolls back identity and role together if canonical registration fails', () => {
  const db = new Database(':memory:')
  try {
    db.exec(
      'PRAGMA foreign_keys=ON; CREATE TABLE devices(id TEXT PRIMARY KEY,name TEXT NOT NULL,tokenHash TEXT NOT NULL UNIQUE,createdAt INTEGER NOT NULL,lastSeenAt INTEGER NOT NULL);',
    )
    db.exec(DEVICE_ACCESS_SQL)
    const storage = createDeviceStorage(db, () => {
      throw new Error('canonical registration failed')
    })
    expect(() =>
      storage.put(
        { id: 'rollback', name: 'rollback', createdAt: 1, lastSeenAt: 1, role: 'observer', workspaceIds: [] },
        'hash',
      ),
    ).toThrow('canonical registration failed')
    expect(db.query('SELECT id FROM devices').all()).toEqual([])
    expect(db.query('SELECT deviceId FROM device_access').all()).toEqual([])
    expect(db.query('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' })
  } finally {
    db.close()
  }
})

test('moving a followed session out of scope revokes its push stream before later message content', async () => {
  const f = await fixture()
  const otherPath = join(f.root, 'other')
  await mkdir(otherPath)
  const other = await f.kernel.createWorkspace(otherPath)
  const { client } = await f.observer([f.workspace.id])
  const events: WireNotification[] = []
  const remove = client.onEvent((event) => events.push(event))
  try {
    await client.call('session.follow', { sessionId: f.session.id, cursor: 0 })
    await f.kernel.moveSession(f.session.id, other.id)
    await f.kernel.submit(f.session.id, 'private-run', { text: 'private content', images: [] }, 'local-fixture')
    await f.kernel.waitForIdle()
    await client.call('workspace.list', {}) // ordered request/reply barrier after publication
    expect(events.filter((event) => event.method === 'session.event' || event.method === 'stream.update')).toEqual([])
    expect(await failure(client.call('session.snapshot', { sessionId: f.session.id }))).toMatchObject({
      code: 'FORBIDDEN',
    })
  } finally {
    remove()
  }
})

test('the managed Controller cannot bypass observer admission for legacy RPC or typed commands', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-managed-observer-'))
  const runtime = await ProcessHostRuntime.create({
    layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
    sourceRoot: process.cwd(),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
  const paired = await host.auth.createDevice('observer', { role: 'observer' })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`, paired.token)
  try {
    await client.connect()
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('No managed workspace')
    const session = await runtime.storage.call('createSession', workspace.id, 'managed observer')
    expect((await client.call('session.snapshot', { sessionId: session.id })).session.id).toBe(session.id)
    expect(
      await failure(
        createWorkspaceSessionCommandClient(client).execute('session.rename', {
          sessionId: session.id,
          title: 'forbidden',
        }),
      ),
    ).toMatchObject({ code: 'FORBIDDEN' })
    expect(
      await failure(
        client.call('run.start', {
          sessionId: session.id,
          requestId: 'forbidden',
          input: { text: 'no', images: [] },
          modelId: 'local-fixture',
        }),
      ),
    ).toMatchObject({ code: 'FORBIDDEN' })
    expect((await runtime.storage.call('session', session.id)).title).toBe('managed observer')
  } finally {
    client.disconnect()
    await host.close()
    await runtime.close()
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)
