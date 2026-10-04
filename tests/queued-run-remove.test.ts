import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
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
  const root = await mkdtemp(join(tmpdir(), 'hbar-queued-run-remove-'))
  const store = new Storage(join(root, 'data.sqlite'))
  resources.push({ root, store })
  await store.call('ready')
  const workspace = await store.call('createWorkspace', root, 'test')
  const session = await store.call('createSession', workspace.id)
  const enqueue = (requestId: string, source: 'user' | 'goal' = 'user') =>
    store.call('enqueue', session.id, requestId, { text: requestId, images: [], source }, 'test')
  return { root, store, workspace, session, enqueue }
}
async function expectCode(operation: Promise<unknown>, code: string) {
  try {
    await operation
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toMatchObject({ code })
  }
}

test('remove settles only the exact still-queued user item and replay uses one event', async () => {
  const { store, session, enqueue } = await fixture()
  const target = await enqueue('target')
  const other = await enqueue('other')
  const page = await store.call('queuedUserRuns', { sessionId: session.id })
  const revision = page.items.find((item) => item.operationId === target.id)?.revision
  if (revision === undefined) throw new Error('Missing target revision')
  const request = { sessionId: session.id, operationId: target.id, expectedRevision: revision }
  const mutation = { actorId: 'device-one', idempotencyKey: 'remove-target', request }
  const before = (await store.call('session', session.id)).seq
  const first = await store.call('removeQueuedRun', mutation)
  expect(first.receipt).toMatchObject({
    commandId: 'queuedRun.remove',
    sessionId: session.id,
    operationId: target.id,
    status: 'cancelled',
    sessionSeq: before + 1,
  })
  expect(first.event.type).toBe('run.settled')
  expect((await store.call('run', target.id)).status).toBe('cancelled')
  expect((await store.call('run', other.id)).status).toBe('queued')
  expect((await store.call('queuedUserRuns', { sessionId: session.id })).items.map((item) => item.operationId)).toEqual(
    [other.id],
  )
  const replay = await store.call('removeQueuedRun', mutation)
  expect(replay.receipt).toEqual(first.receipt)
  expect(replay.event.eventId).toBe(first.event.eventId)
  expect((await store.call('session', session.id)).seq).toBe(before + 1)
  expect(await store.call('queuedRunRemoveReceipt', 'device-one', 'remove-target', session.id)).toEqual(first.receipt)
  await expectCode(
    store.call('removeQueuedRun', { ...mutation, request: { ...request, operationId: other.id } }),
    'IDEMPOTENCY_CONFLICT',
  )
  await expectCode(
    store.call('removeQueuedRun', { ...mutation, actorId: 'device-two', idempotencyKey: 'other-key' }),
    'COMMAND_CONFLICT',
  )
})

test('claim and remove are mutually exclusive; neither a started run nor a goal item is stopped', async () => {
  const { store, workspace, session, enqueue } = await fixture()
  const target = await enqueue('target')
  const goal = await enqueue('goal', 'goal')
  const foreign = await store.call('createSession', workspace.id)
  const page = await store.call('queuedUserRuns', { sessionId: session.id })
  const revision = page.items[0]?.revision
  if (revision === undefined) throw new Error('Missing target revision')
  const claimed = await store.call('claim', session.id)
  expect(claimed?.id).toBe(target.id)
  const request = { sessionId: session.id, operationId: target.id, expectedRevision: revision }
  await expectCode(
    store.call('removeQueuedRun', { actorId: 'device', idempotencyKey: 'late', request }),
    'COMMAND_CONFLICT',
  )
  expect((await store.call('run', target.id)).status).toBe('running')
  expect(await store.call('cancelRequested', target.id)).toBe(false)
  await expectCode(
    store.call('removeQueuedRun', {
      actorId: 'device',
      idempotencyKey: 'goal',
      request: { ...request, operationId: goal.id },
    }),
    'FORBIDDEN',
  )
  await expectCode(
    store.call('removeQueuedRun', {
      actorId: 'device',
      idempotencyKey: 'foreign',
      request: { ...request, sessionId: foreign.id },
    }),
    'NOT_FOUND',
  )
  const stillQueued = await store.call('enqueue', foreign.id, 'foreign-user', { text: 'foreign', images: [] }, 'test')
  const foreignPage = await store.call('queuedUserRuns', { sessionId: foreign.id })
  const otherRevision = foreignPage.items[0]?.revision
  if (otherRevision === undefined) throw new Error('Missing foreign revision')
  await expectCode(
    store.call('removeQueuedRun', {
      actorId: 'device',
      idempotencyKey: 'stale',
      request: { sessionId: foreign.id, operationId: stillQueued.id, expectedRevision: otherRevision - 1 },
    }),
    'COMMAND_CONFLICT',
  )
})

test('orphaned JSONL settlement reconstructs the exact removal receipt on startup', async () => {
  const { root, store, session, enqueue } = await fixture()
  const target = await enqueue('target')
  const page = await store.call('queuedUserRuns', { sessionId: session.id })
  const revision = page.items[0]?.revision
  if (revision === undefined) throw new Error('Missing target revision')
  const mutation = {
    actorId: 'device',
    idempotencyKey: 'recover',
    request: { sessionId: session.id, operationId: target.id, expectedRevision: revision },
  }
  const { receipt } = await store.call('removeQueuedRun', mutation)
  await store.close()
  resources.splice(
    resources.findIndex((item) => item.store === store),
    1,
  )
  const db = new Database(join(root, 'data.sqlite'))
  try {
    db.transaction(() => {
      db.query('DELETE FROM entity_command_receipts WHERE actorId=? AND idempotencyKey=?').run('device', 'recover')
      db.query('DELETE FROM session_event_index WHERE eventId=?').run(receipt.eventId)
      db.query('DELETE FROM events WHERE eventId=?').run(receipt.eventId)
      db.query("UPDATE runs SET status='queued',endedAt=NULL,error=NULL,failure=NULL WHERE id=?").run(target.id)
      db.query('UPDATE sessions SET seq=? WHERE id=?').run(revision, session.id)
    })()
  } finally {
    db.close()
  }
  const reopened = new Storage(join(root, 'data.sqlite'))
  resources.push({ root, store: reopened })
  await reopened.call('ready')
  expect((await reopened.call('run', target.id)).status).toBe('cancelled')
  expect(await reopened.call('queuedRunRemoveReceipt', 'device', 'recover', session.id)).toEqual(receipt)
  expect((await reopened.call('removeQueuedRun', mutation)).receipt).toEqual(receipt)
})

test('paired Client can remove a queued item and resolve a lost response by receipt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-queued-remove-host-'))
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
    const run = await kernel.storage.call('enqueue', session.id, 'waiting', { text: 'delete me', images: [] }, 'test')
    const page = await kernel.storage.call('queuedUserRuns', { sessionId: session.id })
    const revision = page.items[0]?.revision
    if (revision === undefined) throw new Error('Missing target revision')
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'queue removal test')
    const commands = createRunCommandClient(client)
    const idempotencyKey = crypto.randomUUID()
    const request = { sessionId: session.id, operationId: run.id, expectedRevision: revision }
    const receipt = await commands.execute('queuedRun.remove', request, { idempotencyKey })
    expect(receipt.status).toBe('cancelled')
    expect(await commands.getQueuedRemoveReceipt(session.id, idempotencyKey)).toEqual(receipt)
    expect(await commands.execute('queuedRun.remove', request, { idempotencyKey })).toEqual(receipt)
    expect((await kernel.storage.call('run', run.id)).status).toBe('cancelled')
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
