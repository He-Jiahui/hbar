import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { HbarClient, createSessionSearchCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-search-host-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'Search fixture')
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  return { kernel, host, client, workspace, search: createSessionSearchCommandClient(client) }
}

test('paired public Client reads real indexed Host search and recent sessions without provider execution', async () => {
  const { kernel, client, workspace, search } = await fixture()
  const session = await kernel.storage.call('createSession', workspace.id, 'Search title')
  await kernel.storage.call('commit', session.id, 'fixture-run', 'user', [
    { type: 'text', text: 'Host needle in body' },
  ])
  const catalog = await client.call('command.catalog', { category: 'workspace.search', limit: 10 })
  expect(catalog.items.map((item) => item.metadata.id)).toEqual(['session.recent', 'session.search'])
  expect((await search.execute('session.recent', {})).items[0]).toMatchObject({
    sessionId: session.id,
    workspaceId: workspace.id,
    title: 'Search title',
  })
  expect(await search.execute('session.search', { query: 'needle' })).toMatchObject({
    incompleteReason: null,
    items: [
      {
        sessionId: session.id,
        workspaceId: workspace.id,
        matchCount: 1,
        matches: [{ role: 'user', snippet: { hit: 'needle' } }],
      },
    ],
  })
  expect((await search.execute('session.search', { query: 'Search title' })).items).toEqual([])
  await kernel.storage.call('applyWorkspaceOrganization', {
    actorId: 'search-fixture',
    idempotencyKey: 'hide-workspace',
    request: {
      expectedRevision: 0,
      change: { kind: 'setHidden', workspaceId: workspace.id, expectedHidden: false, hidden: true },
    },
  })
  await kernel.storage.call('applyWorkspaceDisplayNames', {
    actorId: 'search-fixture',
    idempotencyKey: 'rename-workspace',
    request: {
      expectedRevision: 0,
      workspaceId: workspace.id,
      expectedDisplayName: null,
      displayName: 'Visible search alias',
    },
  })
  expect((await search.execute('session.search', { query: 'needle' })).items[0]).toMatchObject({
    sessionId: session.id,
    workspaceName: 'Visible search alias',
  })
  await kernel.storage.call('updateSession', session.id, { title: 'Renamed after indexing' })
  expect((await search.execute('session.search', { query: 'needle' })).items[0]?.title).toBe('Renamed after indexing')
  await kernel.storage.call('updateSession', session.id, { archived: true })
  expect((await search.execute('session.search', { query: 'needle' })).items).toEqual([])
  expect((await search.execute('session.recent', {})).items).not.toContainEqual(
    expect.objectContaining({ sessionId: session.id }),
  )
})

test('uninitialized WebSocket cannot invoke session search', async () => {
  const { host } = await fixture()
  const unpaired = new WebSocket(`ws://127.0.0.1:${host.server.port}/rpc`)
  try {
    const denied = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Unauthenticated search request timed out')), 5000)
      unpaired.onopen = () =>
        unpaired.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'command.execute',
            params: {
              protocol: 1,
              requestId: 'unauthenticated-search',
              commandId: 'session.search',
              commandVersion: 1,
              input: { query: 'needle' },
            },
          }),
        )
      unpaired.onmessage = (event) => {
        clearTimeout(timer)
        try {
          const parsed = z
            .object({ error: z.object({ data: z.string() }) })
            .parse(JSON.parse(String(event.data)) as unknown)
          resolve(parsed.error.data)
        } catch (error) {
          reject(error)
        }
      }
      unpaired.onerror = () => {
        clearTimeout(timer)
        reject(new Error('Unauthenticated search fixture failed'))
      }
    })
    expect(denied).toBe('UNAUTHORIZED')
  } finally {
    unpaired.close()
  }
})

test('Host drains a larger queued index in bounded background steps without client polling', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-search-backfill-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | null = null
  cleanups.push(async () => {
    if (host) await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.storage.call('createSession', workspace.id, 'Backlog')
  for (let index = 0; index < 120; index++)
    await kernel.storage.call('commit', session.id, `fixture-${index}`, 'user', [
      { type: 'text', text: `background-index-${index}` },
    ])
  expect((await kernel.storage.call('searchIndexStatus')).complete).toBe(false)
  host = await startServer(kernel, { port: 0 })
  let complete = false
  for (let attempt = 0; attempt < 200; attempt++) {
    complete = (await kernel.storage.call('searchIndexStatus')).complete
    if (complete) break
    await Bun.sleep(20)
  }
  expect(complete).toBe(true)
  expect((await kernel.storage.call('searchSessions', { query: 'background-index-119' })).items[0]?.sessionId).toBe(
    session.id,
  )
})
