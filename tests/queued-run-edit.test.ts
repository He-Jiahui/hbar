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
  const root = await mkdtemp(join(tmpdir(), 'hbar-queued-run-edit-'))
  const store = new Storage(join(root, 'data.sqlite'))
  resources.push({ root, store })
  await store.call('ready')
  const workspace = await store.call('createWorkspace', root, 'test')
  const session = await store.call('createSession', workspace.id)
  return { root, store, workspace, session }
}
async function expectCode(operation: Promise<unknown>, code: string) {
  try {
    await operation
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toMatchObject({ code })
  }
}

test('full queued text edits atomically while preserving Run context and original admission', async () => {
  const { store, session } = await fixture()
  const original = {
    text: '原文 '.repeat(130),
    images: [],
    files: [],
    thinking: 'high' as const,
    approval: 'ask' as const,
    mode: 'plan' as const,
    source: 'user' as const,
  }
  const run = await store.call('enqueue', session.id, 'same-request', original, 'test-model')
  const next = await store.call('enqueue', session.id, 'second', { text: 'second', images: [] }, 'test-model')
  const firstPage = await store.call('queuedUserRuns', { sessionId: session.id, limit: 1 })
  expect(firstPage.items[0]?.truncated).toBe(true)
  const editable = await store.call('queuedRunEditable', { sessionId: session.id, operationId: run.id })
  expect(editable.text).toBe(original.text)
  expect(editable.text.length).toBeGreaterThan(firstPage.items[0]!.textPreview.length)
  const request = { sessionId: session.id, operationId: run.id, expectedRevision: editable.revision, text: '修改后 🌌' }
  const mutation = { actorId: 'device', idempotencyKey: 'edit-one', request }
  const first = await store.call('editQueuedRunText', mutation)
  expect(first.event.type).toBe('run.inputEdited')
  expect(first.receipt.revision).toBe(first.event.seq)
  expect((await store.call('run', run.id)).input).toEqual({ ...original, text: request.text })
  expect((await store.call('run', run.id)).modelId).toBe('test-model')
  expect((await store.call('queuedRunEditable', { sessionId: session.id, operationId: run.id })).revision).toBe(
    first.event.seq,
  )
  expect(await store.call('queuedRunEditTextReceipt', 'device', 'edit-one', session.id)).toEqual(first.receipt)
  expect((await store.call('editQueuedRunText', mutation)).receipt).toEqual(first.receipt)
  expect((await store.call('enqueue', session.id, 'same-request', original, 'test-model')).id).toBe(run.id)
  await expectCode(
    store.call('enqueue', session.id, 'same-request', { ...original, text: request.text }, 'test-model'),
    'IDEMPOTENCY_CONFLICT',
  )
  await expectCode(
    store.call('queuedUserRuns', { sessionId: session.id, cursor: firstPage.nextCursor!, limit: 1 }),
    'ACTIVITY_CHANGED',
  )
  await expectCode(
    store.call('editQueuedRunText', { ...mutation, request: { ...request, text: 'different' } }),
    'IDEMPOTENCY_CONFLICT',
  )
  await expectCode(store.call('editQueuedRunText', { ...mutation, idempotencyKey: 'stale' }), 'COMMAND_CONFLICT')
  const page = await store.call('queuedUserRuns', { sessionId: session.id })
  expect(page.items.map((item) => item.operationId)).toEqual([run.id, next.id])
  expect(page.items[0]?.textPreview).toBe(request.text)
})

test('edit is restricted to exact still-queued user item; claim reads edited text', async () => {
  const { store, workspace, session } = await fixture()
  const run = await store.call('enqueue', session.id, 'user', { text: 'before', images: [] }, 'test')
  const goal = await store.call('enqueue', session.id, 'goal', { text: 'goal', images: [], source: 'goal' }, 'test')
  const foreign = await store.call('createSession', workspace.id)
  const editable = await store.call('queuedRunEditable', { sessionId: session.id, operationId: run.id })
  const request = { sessionId: session.id, operationId: run.id, expectedRevision: editable.revision, text: 'after' }
  await expectCode(store.call('queuedRunEditable', { sessionId: foreign.id, operationId: run.id }), 'NOT_FOUND')
  await expectCode(store.call('queuedRunEditable', { sessionId: session.id, operationId: goal.id }), 'FORBIDDEN')
  await expectCode(
    store.call('editQueuedRunText', {
      actorId: 'device',
      idempotencyKey: 'goal',
      request: { ...request, operationId: goal.id },
    }),
    'FORBIDDEN',
  )
  await expectCode(
    store.call('editQueuedRunText', {
      actorId: 'device',
      idempotencyKey: 'foreign',
      request: { ...request, sessionId: foreign.id },
    }),
    'NOT_FOUND',
  )
  await store.call('editQueuedRunText', { actorId: 'device', idempotencyKey: 'early', request })
  expect((await store.call('claim', session.id))?.input.text).toBe('after')
  await expectCode(
    store.call('editQueuedRunText', { actorId: 'device', idempotencyKey: 'late', request }),
    'COMMAND_CONFLICT',
  )
  expect(await store.call('cancelRequested', run.id)).toBe(false)
})

test('orphaned edit journal restores text, content revision, and exact receipt', async () => {
  const { root, store, session } = await fixture()
  const run = await store.call('enqueue', session.id, 'original', { text: 'before', images: [] }, 'test')
  const editable = await store.call('queuedRunEditable', { sessionId: session.id, operationId: run.id })
  const mutation = {
    actorId: 'device',
    idempotencyKey: 'recover',
    request: { sessionId: session.id, operationId: run.id, expectedRevision: editable.revision, text: 'after' },
  }
  const { receipt } = await store.call('editQueuedRunText', mutation)
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
      db.query('UPDATE runs SET input=? WHERE id=?').run(JSON.stringify(run.input), run.id)
      db.query('UPDATE sessions SET seq=? WHERE id=?').run(editable.revision, session.id)
    })()
  } finally {
    db.close()
  }
  const reopened = new Storage(join(root, 'data.sqlite'))
  resources.push({ root, store: reopened })
  await reopened.call('ready')
  expect((await reopened.call('run', run.id)).input.text).toBe('after')
  expect((await reopened.call('queuedRunEditable', { sessionId: session.id, operationId: run.id })).revision).toBe(
    receipt.revision,
  )
  expect(await reopened.call('queuedRunEditTextReceipt', 'device', 'recover', session.id)).toEqual(receipt)
  expect((await reopened.call('editQueuedRunText', mutation)).receipt).toEqual(receipt)
  expect((await reopened.call('enqueue', session.id, 'original', run.input, 'test')).id).toBe(run.id)
})

test('paired Client reads full text, edits, and reconciles by original key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-queued-edit-host-'))
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
    const run = await kernel.storage.call('enqueue', session.id, 'waiting', { text: 'before', images: [] }, 'test')
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'queue edit test')
    const commands = createRunCommandClient(client)
    const editable = await commands.execute('queuedRun.getEditable', { sessionId: session.id, operationId: run.id })
    expect(editable.text).toBe('before')
    const idempotencyKey = crypto.randomUUID()
    const request = { sessionId: session.id, operationId: run.id, expectedRevision: editable.revision, text: 'after' }
    const receipt = await commands.execute('queuedRun.editText', request, { idempotencyKey })
    expect(await commands.getQueuedEditTextReceipt(session.id, idempotencyKey)).toEqual(receipt)
    expect(await commands.execute('queuedRun.editText', request, { idempotencyKey })).toEqual(receipt)
    expect((await kernel.storage.call('run', run.id)).input.text).toBe('after')
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
