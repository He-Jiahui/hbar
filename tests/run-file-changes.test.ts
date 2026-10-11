import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { HbarClient, createFileCommandClient } from '@hbar/client'
import { startServer } from '../apps/host/src/server'
import type { ToolFileChange } from '@hbar/contracts/run-file-changes'
import { toolFileChangeSchema } from '@hbar/contracts/run-file-changes'
import { restoreFileVersions, FileMutationQueue } from '../plugins/local-tools/src/file-mutations'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-run-changes-'))
  const store = new Storage(join(root, 'test.sqlite'))
  cleanups.push(async () => {
    await store.close()
    await rm(root, { recursive: true, force: true })
  })
  await store.call('ready')
  const workspace = await store.call('createWorkspace', root, 'test')
  const session = await store.call('createSession', workspace.id)
  const run = await store.call('enqueue', session.id, 'files', { text: 'edit', images: [] }, 'mock')
  await store.call('claim', session.id)
  const record = async (files: ToolFileChange[]) =>
    store.call('commit', session.id, run.id, 'tool', [
      {
        type: 'tool_result',
        callId: crypto.randomUUID(),
        name: 'write_file',
        text: 'written',
        isError: false,
        fileChanges: { root, files },
      },
    ])
  return { root, store, workspace, session, run, record }
}
test('net file summaries retain the first baseline, merge repeated edits, and omit restored files', async () => {
  const { store, session, run, record } = await fixture()
  await record([{ path: 'a.txt', before: 'old\n', after: 'middle\nmore\n' }])
  await record([
    { path: 'a.txt', before: 'middle\nmore\n', after: 'final\n' },
    { path: 'b.txt', before: null, after: 'new\n' },
  ])
  await record([{ path: 'temporary.txt', before: null, after: 'temporary' }])
  await record([{ path: 'temporary.txt', before: 'temporary', after: null }])
  expect((await store.call('run', run.id)).fileChanges).toBeUndefined()
  await store.call('setRun', run.id, 'completed')
  const result = await store.call('runFileChanges', session.id, run.id)
  expect(result.summary).toMatchObject({
    totalFiles: 2,
    addedLines: 2,
    removedLines: 1,
    canUndo: true,
    incomplete: false,
  })
  expect(result.items.map((item) => item.path)).toEqual(['a.txt', 'b.txt'])
  const diff = await store.call('runFileChangeDiff', session.id, run.id, 'a.txt', 0)
  expect(diff.items.map((item) => [item.kind, item.text])).toEqual([
    ['removed', 'old'],
    ['added', 'final'],
  ])
  expect((await store.call('snapshot', session.id)).runs[0]?.fileChanges ?? null).toEqual(result.summary)
})
test('failures and cancellation retain successful partial edits while unrelated sessions are rejected', async () => {
  const { store, workspace, session, run, record } = await fixture()
  await record([
    { path: 'created-empty.txt', before: null, after: '' },
    { path: 'existing-empty.txt', before: '', after: 'text' },
  ])
  await store.call('setRun', run.id, 'failed', 'later command failed')
  const page = await store.call('runFileChanges', session.id, run.id)
  expect(page.summary?.totalFiles).toBe(2)
  expect(page.items.map((item) => item.kind)).toEqual(['created', 'modified'])
  const other = await store.call('createSession', workspace.id)
  let failure: unknown
  try {
    await store.call('runFileChanges', other.id, run.id)
  } catch (error) {
    failure = error
  }
  expect(failure).toMatchObject({ code: 'STALE_TARGET' })
})
test('discontinuous versions disable undo and file and diff paging stay bounded', async () => {
  const { store, session, run, record } = await fixture()
  await record([{ path: 'a.txt', before: 'one', after: 'two' }])
  await record([{ path: 'a.txt', before: 'external edit', after: 'three' }])
  for (let start = 0; start < 55; start += 16)
    await record(
      Array.from({ length: Math.min(16, 55 - start) }, (_, index) => ({
        path: `b-${String(start + index).padStart(3, '0')}.txt`,
        before: null,
        after: 'new',
      })),
    )
  await record([
    { path: 'long.txt', before: null, after: Array.from({ length: 205 }, (_, i) => `line ${i}`).join('\n') },
  ])
  await store.call('setRun', run.id, 'cancelled')
  const first = await store.call('runFileChanges', session.id, run.id)
  expect(first.summary?.canUndo).toBe(false)
  expect(first.summary?.preview).toHaveLength(3)
  expect(first.items).toHaveLength(50)
  const next = await store.call('runFileChanges', session.id, run.id, first.nextCursor ?? undefined)
  expect(next.items).toHaveLength(7)
  expect(next.nextCursor).toBeNull()
  expect(new Set([...first.items, ...next.items].map((item) => item.path)).size).toBe(57)
  const diff = await store.call('runFileChangeDiff', session.id, run.id, 'long.txt', 0)
  expect(diff.items).toHaveLength(200)
  expect(diff.hasMore).toBe(true)
  expect((await store.call('runFileChangeDiff', session.id, run.id, 'long.txt', 200)).items).toHaveLength(5)
})
test('journal file capacity is explicit and prevents a partial undo', async () => {
  const { store, session, run, record } = await fixture()
  for (let start = 0; start < 257; start += 16)
    await record(
      Array.from({ length: Math.min(16, 257 - start) }, (_, index) => ({
        path: `f-${String(start + index).padStart(3, '0')}`,
        before: null,
        after: 'x',
      })),
    )
  await store.call('setRun', run.id, 'completed')
  expect((await store.call('runFileChanges', session.id, run.id)).summary).toMatchObject({
    totalFiles: 256,
    incomplete: true,
    canUndo: false,
  })
})
test('file change schemas reject escaping paths and distinguish missing and empty versions', () => {
  for (const path of ['../file', '/absolute', 'C:/absolute', 'a\\b', 'a/../b', './b'])
    expect(toolFileChangeSchema.safeParse({ path, before: null, after: '' }).success).toBe(false)
  expect(toolFileChangeSchema.parse({ path: 'nested/empty.txt', before: null, after: '' }).before).toBeNull()
})
test('JSONL recovery rebuilds file versions and a durable undo marker without replaying writes', async () => {
  const { root, store, session, run, record } = await fixture()
  await record([{ path: 'a.txt', before: 'old', after: 'new' }])
  await store.call('setRun', run.id, 'completed')
  await store.call('undoRunFileChanges', session.id, run.id)
  const original = await store.call('run', run.id)
  await store.close()
  await rm(join(root, 'test.sqlite'))
  const reopened = new Storage(join(root, 'test.sqlite'))
  cleanups.push(() => reopened.close())
  await reopened.call('ready')
  expect((await reopened.call('run', run.id)).fileChanges).toEqual(original.fileChanges)
  expect((await reopened.call('runFileChangeVersions', session.id, run.id))[0]).toMatchObject({
    path: 'a.txt',
    before: 'old',
    after: 'new',
  })
  expect(await Bun.file(join(root, 'a.txt')).exists()).toBe(false)
})
test('a no-op edit produces an empty summary and unchanged lines have bounded diff context', async () => {
  const { store, session, run, record } = await fixture()
  await record([{ path: 'same', before: 'same', after: 'same' }])
  await store.call('setRun', run.id, 'completed')
  expect((await store.call('runFileChanges', session.id, run.id)).summary).toMatchObject({
    totalFiles: 0,
    canUndo: false,
  })
})
test('guarded restore checks every file before mutation and rolls back a write failure', async () => {
  const files = new Map([
    ['a', 'new a'],
    ['b', 'external'],
  ])
  const changes = [
    { path: 'a', before: 'old a', after: 'new a' },
    { path: 'b', before: 'old b', after: 'new b' },
  ]
  const port = {
    read: async (path: string) => files.get(path) ?? null,
    put: async (path: string, text: string | null) => {
      if (path === 'b') throw new Error('disk failed')
      if (text === null) files.delete(path)
      else files.set(path, text)
    },
  }
  await expect(restoreFileVersions(changes, port, AbortSignal.timeout(5000))).rejects.toMatchObject({
    code: 'FILE_CONFLICT',
  })
  expect(files.get('a')).toBe('new a')
  files.set('b', 'new b')
  await expect(restoreFileVersions(changes, port, AbortSignal.timeout(5000))).rejects.toThrow('disk failed')
  expect([...files]).toEqual([
    ['a', 'new a'],
    ['b', 'new b'],
  ])
})
test('file mutation gates serialize overlapping batches and release failed operations', async () => {
  const queue = new FileMutationQueue()
  const order: number[] = []
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const first = queue.run(['a', 'b'], async () => {
    order.push(1)
    await gate
    order.push(2)
  })
  const second = queue
    .run(['b'], async () => {
      order.push(3)
      throw new Error('failed')
    })
    .catch((error: unknown) => error)
  await Bun.sleep(5)
  expect(order).toEqual([1])
  release()
  await first
  expect(await second).toMatchObject({ message: 'failed' })
  await queue.run(['a', 'b'], async () => {
    order.push(4)
  })
  expect(order).toEqual([1, 2, 3, 4])
})
test('real approved tools persist summaries, Host review survives reconnect, and undo restores only that Run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-run-file-host-'))
  const kernel = await Kernel.create({
    home: join(root, '.hbar-data'),
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
  await client.pair(host.pairing.code, 'file summary test')
  await kernel.setPermissionMode('allow')
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  await writeFile(join(root, 'unrelated.txt'), 'user content')
  const run = await kernel.submit(
    session.id,
    'write',
    { text: '/tool write_file {"path":"new.txt","text":"hello\\n"}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect((await kernel.snapshot(session.id)).runs[0]?.fileChanges).toMatchObject({
    totalFiles: 1,
    addedLines: 1,
    removedLines: 0,
  })
  const commands = createFileCommandClient(client)
  const review = await commands.execute('run.fileChanges', { sessionId: session.id, runId: run.id })
  expect(review.items[0]?.path).toBe('new.txt')
  await writeFile(join(root, 'new.txt'), 'later user edit')
  let conflict: unknown
  try {
    await commands.execute('run.undoFileChanges', { sessionId: session.id, runId: run.id })
  } catch (error) {
    conflict = error
  }
  expect(conflict).toMatchObject({ code: 'FILE_CONFLICT' })
  expect(await readFile(join(root, 'new.txt'), 'utf8')).toBe('later user edit')
  await writeFile(join(root, 'new.txt'), 'hello\n')
  const undone = await commands.execute('run.undoFileChanges', { sessionId: session.id, runId: run.id })
  expect(undone.summary?.undoneAt).toBeNumber()
  expect(await Bun.file(join(root, 'new.txt')).exists()).toBe(false)
  expect(await readFile(join(root, 'unrelated.txt'), 'utf8')).toBe('user content')
  expect((await commands.execute('run.undoFileChanges', { sessionId: session.id, runId: run.id })).summary).toEqual(
    undone.summary,
  )
  expect(
    (await commands.execute('run.fileChangeDiff', { sessionId: session.id, runId: run.id, path: 'new.txt' })).items[0],
  ).toMatchObject({ kind: 'added', text: 'hello' })
})
