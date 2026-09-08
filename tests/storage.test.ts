import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'

const resources: { root: string; store: Storage }[] = []
afterEach(async () => {
  for (const { root, store } of resources.splice(0)) {
    await store.close()
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-storage-'))
  const store = new Storage(join(root, 'test.sqlite'))
  resources.push({ root, store })
  await store.call('ready')
  const workspace = await store.call('createWorkspace', root, 'test')
  const session = await store.call('createSession', workspace.id)
  return { root, store, session }
}
test('committed messages, events, and pagination share a monotonic cursor', async () => {
  const { store, session } = await fixture()
  for (let i = 0; i < 75; i++)
    await store.call('commit', session.id, 'run', 'user', [{ type: 'text', text: `message ${i}` }])
  const snapshot = await store.call('snapshot', session.id, undefined, 60)
  expect(snapshot.cursor).toBe(76)
  expect(snapshot.messages).toHaveLength(60)
  expect(snapshot.hasOlder).toBe(true)
  const older = await store.call('snapshot', session.id, snapshot.messages[0]!.seq, 60)
  expect(older.messages).toHaveLength(15)
  expect(older.hasOlder).toBe(false)
  expect((await store.call('events', session.id, 0)).map((e) => e.seq)).toEqual(
    Array.from({ length: 76 }, (_, i) => i + 1),
  )
})
test('idempotent commands enqueue one durable run and claim only one at a time', async () => {
  const { store, session } = await fixture()
  const input = { text: 'same', images: [] }
  const a = await store.call('enqueue', session.id, 'request', input, 'test')
  const b = await store.call('enqueue', session.id, 'request', input, 'test')
  expect(a.id).toBe(b.id)
  await store.call('enqueue', session.id, 'request-2', input, 'test')
  expect((await store.call('claim', session.id))?.id).toBe(a.id)
  expect(await store.call('claim', session.id)).toBeNull()
  await store.call('setRun', a.id, 'completed')
  expect((await store.call('claim', session.id))?.id).not.toBe(a.id)
})
test('recovery preserves an unknown tool outcome without replaying it', async () => {
  const { store, session } = await fixture()
  const run = await store.call('enqueue', session.id, 'request', { text: 'write', images: [] }, 'test')
  await store.call('claim', session.id)
  await store.call('toolStart', session.id, run.id, 'call', 'write_file', { path: 'output.txt' })
  expect(await store.call('recover')).toBe(1)
  expect((await store.call('run', run.id)).status).toBe('interrupted')
  expect((await store.call('snapshot', session.id)).messages[0]?.content[0]).toMatchObject({
    type: 'tool_result',
    isError: true,
    callId: 'call',
  })
  expect(await store.call('recover')).toBe(0)
})
