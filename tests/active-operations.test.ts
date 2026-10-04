import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { HbarClient, createRunCommandClient } from '@hbar/client'
import { startServer } from '../apps/host/src/server'

const resources: { root: string; store: Storage }[] = []
async function expectCode(operation: Promise<unknown>, code: string) {
  let caught: unknown
  try {
    await operation
  } catch (error) {
    caught = error
  }
  expect(caught).toMatchObject({ code })
}
afterEach(async () => {
  for (const { root, store } of resources.splice(0)) {
    await store.close()
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-active-operations-'))
  const store = new Storage(join(root, 'data.sqlite'))
  resources.push({ root, store })
  await store.call('ready')
  const workspace = await store.call('createWorkspace', root, 'test')
  const session = await store.call('createSession', workspace.id)
  const enqueue = (index: number, sessionId = session.id, text = 'private prompt') =>
    store.call('enqueue', sessionId, `request-${index}`, { text, images: [] }, 'test')
  return { store, workspace, session, enqueue }
}

test('activity pages find an older running operation hidden by the 40-run timeline window', async () => {
  const { store, session, enqueue } = await fixture()
  const oldPrompt = `Old run identity: ${'older work '.repeat(30)} PRIVATE_PROMPT_TAIL`
  const original = await enqueue(0, session.id, oldPrompt)
  await store.call('claim', session.id)
  const expected = [original.id]
  for (let index = 1; index < 105; index++) expected.push((await enqueue(index)).id)
  const snapshot = await store.call('snapshot', session.id)
  expect(snapshot.runs).toHaveLength(40)
  expect(snapshot.runs.some((run) => run.id === original.id)).toBe(false)
  let page = await store.call('activeOperations', { sessionId: session.id })
  expect(page.items).toHaveLength(40)
  expect(page.totalActive).toBe(105)
  expect(page.items.find((item) => item.operationId === original.id)?.status).toBe('running')
  const oldRun = page.items.find((item) => item.operationId === original.id)
  expect(oldRun?.intentPreview).toStartWith('Old run identity:')
  expect(oldRun?.intentPreview).toEndWith('…')
  expect(JSON.stringify(page)).not.toContain(oldPrompt)
  expect(JSON.stringify(page)).not.toContain('PRIVATE_PROMPT_TAIL')
  const ids = page.items.map((item) => item.operationId)
  while (page.nextCursor) {
    page = await store.call('activeOperations', { sessionId: session.id, cursor: page.nextCursor })
    expect(page.items.length).toBeLessThanOrEqual(40)
    expect(page.totalActive).toBe(105)
    ids.push(...page.items.map((item) => item.operationId))
  }
  expect(new Set(ids).size).toBe(105)
  expect(ids.toSorted()).toEqual(expected.toSorted())
  expect(
    page.items.every(
      (item) =>
        Object.keys(item).toSorted().join(',') === 'createdAt,intentPreview,operationId,startedAt,status',
    ),
  ).toBe(true)
  const durations: number[] = []
  for (let sample = 0; sample < 20; sample++) {
    const started = performance.now()
    const bounded = await store.call('activeOperations', { sessionId: session.id, limit: 100 })
    durations.push(performance.now() - started)
    expect(bounded.items).toHaveLength(100)
    expect(new TextEncoder().encode(JSON.stringify(bounded)).byteLength).toBeLessThan(20_000)
  }
  durations.sort((a, b) => a - b)
  console.info('Activity read: 105 active operations, 100-row page, 20 samples', {
    p95Ms: durations[18],
    maxMs: durations[19],
  })
})

test('cancellation remains active until settlement and revision changes invalidate old pages', async () => {
  const { store, session, enqueue } = await fixture()
  const run = await enqueue(0)
  await store.call('claim', session.id)
  await enqueue(1)
  const first = await store.call('activeOperations', { sessionId: session.id, limit: 1 })
  if (!first.nextCursor) throw new Error('Expected next activity page')
  await store.call('requestCancel', run.id)
  await expectCode(
    store.call('activeOperations', { sessionId: session.id, cursor: first.nextCursor }),
    'ACTIVITY_CHANGED',
  )
  const pending = await store.call('activeOperations', { sessionId: session.id })
  expect(pending.items.find((item) => item.operationId === run.id)?.status).toBe('cancelRequested')
  expect(pending.totalActive).toBe(2)
  await store.call('setRun', run.id, 'cancelled')
  expect((await store.call('activeOperations', { sessionId: session.id })).totalActive).toBe(1)
  const remaining = await store.call('claim', session.id)
  if (!remaining) throw new Error('Expected remaining operation')
  await store.call('setRun', remaining.id, 'waiting_approval')
  expect((await store.call('activeOperations', { sessionId: session.id })).items[0]?.status).toBe('waiting_approval')
  await store.call('setRun', remaining.id, 'completed')
  expect(await store.call('activeOperations', { sessionId: session.id })).toMatchObject({
    totalActive: 0,
    items: [],
    nextCursor: null,
  })
})

test('invalid bounds, foreign cursors, stale revisions and missing sessions never masquerade as idle', async () => {
  const { store, workspace, session, enqueue } = await fixture()
  await enqueue(0)
  const other = await store.call('createSession', workspace.id)
  const foreign = await enqueue(1, other.id)
  const first = await store.call('activeOperations', { sessionId: session.id })
  await expectCode(store.call('activeOperations', { sessionId: 'missing' }), 'NOT_FOUND')
  for (const limit of [0, 101, 1.5])
    await expectCode(store.call('activeOperations', { sessionId: session.id, limit }), 'INVALID_INPUT')
  await expectCode(
    store.call('activeOperations', {
      sessionId: session.id,
      cursor: { afterOperationId: foreign.id, sessionSeq: first.sessionSeq },
    }),
    'INVALID_CURSOR',
  )
  await enqueue(2)
  await expectCode(
    store.call('activeOperations', {
      sessionId: session.id,
      cursor: { afterOperationId: first.items[0]!.operationId, sessionSeq: first.sessionSeq },
    }),
    'ACTIVITY_CHANGED',
  )
})

test('the authenticated command and Client expose bounded activity without replaying or mutating runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-active-command-'))
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
      { text: 'never execute', images: [] },
      'test',
    )
    host = await startServer(kernel, { port: 0 })
    const endpoint = `http://127.0.0.1:${host.server.port}`
    const unauthenticated = new HbarClient(endpoint)
    try {
      await expectCode(unauthenticated.connect(), 'UNAUTHORIZED')
    } finally {
      unauthenticated.disconnect()
    }
    client = new HbarClient(endpoint)
    await client.pair(host.pairing.code, 'activity test')
    const commands = createRunCommandClient(client)
    const before = (await kernel.storage.call('session', session.id)).seq
    const page = await commands.execute('session.activeOperations', { sessionId: session.id, limit: 1 })
    expect(page).toMatchObject({
      sessionId: session.id,
      totalActive: 1,
      nextCursor: null,
      items: [{ operationId: run.id, status: 'queued' }],
    })
    await expectCode(commands.execute('session.activeOperations', { sessionId: 'missing' }), 'NOT_FOUND')
    expect((await kernel.storage.call('session', session.id)).seq).toBe(before)
    expect((await kernel.storage.call('run', run.id)).status).toBe('queued')
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('active-operation intent previews are bounded, Unicode-safe, blank-safe, and session-scoped', async () => {
  const { store, workspace, session, enqueue } = await fixture()
  const otherSession = await store.call('createSession', workspace.id)
  const unicodePrompt = `Inspect 🧭 ${'界😀'.repeat(100)} PRIVATE_UNICODE_TAIL`
  const own = await enqueue(0, session.id, unicodePrompt)
  const blank = await enqueue(1, session.id, ' \n\t ')
  const foreign = await enqueue(2, otherSession.id, 'Foreign session intent must stay private')

  const page = await store.call('activeOperations', { sessionId: session.id })
  const ownItem = page.items.find((item) => item.operationId === own.id)
  const blankItem = page.items.find((item) => item.operationId === blank.id)
  const preview = ownItem?.intentPreview

  expect(preview).toBe(`${Array.from(unicodePrompt.trim().replace(/\s+/gu, ' ')).slice(0, 159).join('')}…`)
  expect(Array.from(preview ?? '')).toHaveLength(160)
  expect(blankItem?.intentPreview).toBeNull()
  expect(JSON.stringify(page)).not.toContain('PRIVATE_UNICODE_TAIL')
  expect(JSON.stringify(page)).not.toContain('Foreign session intent must stay private')
  expect(page.items.some((item) => item.operationId === foreign.id)).toBe(false)
})
