import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { HbarClient, createRunCommandClient } from '@hbar/client'
import { startServer } from '../apps/host/src/server'

const resources: { root: string; store: Storage }[] = []
afterEach(async () => {
  for (const { root, store } of resources.splice(0)) {
    await store.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-queued-user-runs-'))
  const store = new Storage(join(root, 'data.sqlite'))
  resources.push({ root, store })
  await store.call('ready')
  const workspace = await store.call('createWorkspace', root, 'test')
  const session = await store.call('createSession', workspace.id)
  return { store, workspace, session }
}

async function expectCode(operation: Promise<unknown>, code: string) {
  try {
    await operation
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toMatchObject({ code })
  }
}

test('bounded queued user pages follow actual claim order and do not disclose full prompts', async () => {
  const { store, session } = await fixture()
  const userIds: string[] = []
  const longText = '💡'.repeat(250)
  for (let index = 0; index < 105; index++) {
    const run = await store.call(
      'enqueue',
      session.id,
      `user-${index}`,
      { text: index === 0 ? longText : `message ${index}`, images: [], source: 'user' },
      'test',
    )
    userIds.push(run.id)
  }
  await store.call('enqueue', session.id, 'goal', { text: 'private goal', images: [], source: 'goal' }, 'test')
  let page = await store.call('queuedUserRuns', { sessionId: session.id, limit: 7 })
  expect(page.totalQueued).toBe(105)
  expect(page.items[0]).toMatchObject({ operationId: userIds[0], textPreview: '💡'.repeat(240), truncated: true })
  const collected = page.items.map((item) => item.operationId)
  while (page.nextCursor) {
    page = await store.call('queuedUserRuns', { sessionId: session.id, limit: 7, cursor: page.nextCursor })
    collected.push(...page.items.map((item) => item.operationId))
  }
  expect(collected).toEqual(userIds)
  expect(JSON.stringify(page)).not.toContain('private goal')
  const first = await store.call('queuedUserRuns', { sessionId: session.id, limit: 20 })
  expect(JSON.stringify(first)).not.toContain(longText)
  expect(new TextEncoder().encode(JSON.stringify(first)).byteLength).toBeLessThan(10_000)
  expect((await store.call('run', userIds[0]!)).status).toBe('queued')
})

test('claim invalidates a page even before a run status event advances the session sequence', async () => {
  const { store, session } = await fixture()
  await store.call('enqueue', session.id, 'one', { text: 'one', images: [] }, 'test')
  await store.call('enqueue', session.id, 'two', { text: 'two', images: [] }, 'test')
  const first = await store.call('queuedUserRuns', { sessionId: session.id, limit: 1 })
  if (!first.nextCursor) throw new Error('Expected a next page')
  const sequence = first.sessionSeq
  await store.call('claim', session.id)
  expect((await store.call('session', session.id)).seq).toBe(sequence)
  await expectCode(
    store.call('queuedUserRuns', { sessionId: session.id, cursor: first.nextCursor }),
    'ACTIVITY_CHANGED',
  )
  expect((await store.call('queuedUserRuns', { sessionId: session.id })).totalQueued).toBe(1)
})

test('foreign, malformed and stale queue cursors fail closed', async () => {
  const { store, workspace, session } = await fixture()
  const other = await store.call('createSession', workspace.id)
  const firstRun = await store.call('enqueue', session.id, 'one', { text: 'one', images: [] }, 'test')
  const foreign = await store.call('enqueue', other.id, 'other', { text: 'other', images: [] }, 'test')
  const page = await store.call('queuedUserRuns', { sessionId: session.id })
  await expectCode(store.call('queuedUserRuns', { sessionId: 'missing' }), 'NOT_FOUND')
  for (const limit of [0, 21, 1.5])
    await expectCode(store.call('queuedUserRuns', { sessionId: session.id, limit }), 'INVALID_INPUT')
  await expectCode(
    store.call('queuedUserRuns', {
      sessionId: session.id,
      cursor: { afterOperationId: foreign.id, sessionSeq: page.sessionSeq, totalQueued: page.totalQueued },
    }),
    'INVALID_CURSOR',
  )
  await store.call('enqueue', session.id, 'two', { text: 'two', images: [] }, 'test')
  await expectCode(
    store.call('queuedUserRuns', {
      sessionId: session.id,
      cursor: { afterOperationId: firstRun.id, sessionSeq: page.sessionSeq, totalQueued: page.totalQueued },
    }),
    'ACTIVITY_CHANGED',
  )
})

test('paired Client can query the durable queue without mutating it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-queued-command-'))
  const kernel = await Kernel.create({
    home: join(root, 'home'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
    const run = await kernel.storage.call(
      'enqueue',
      session.id,
      'unstarted',
      { text: 'queued text', images: [], source: 'user' },
      'test',
    )
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'queue test')
    const commands = createRunCommandClient(client)
    const before = (await kernel.storage.call('session', session.id)).seq
    const page = await commands.execute('session.queuedUserRuns', { sessionId: session.id })
    expect(page).toMatchObject({
      sessionId: session.id,
      totalQueued: 1,
      items: [{ operationId: run.id, textPreview: 'queued text' }],
    })
    expect((await kernel.storage.call('session', session.id)).seq).toBe(before)
    expect((await kernel.storage.call('run', run.id)).status).toBe('queued')
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
