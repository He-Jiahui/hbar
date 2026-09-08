import { afterEach, expect, test } from 'bun:test'
import { appendFile, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { Storage, createPathLayout, ensurePathLayout, writePathPointer } from '@hbar/storage'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

async function layoutFixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-layout-'))
  roots.push(root)
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'system', 'paths.json'))
  await ensurePathLayout(layout)
  return { root, layout }
}

test('path layout creates durable and disposable roots and writes the system pointer atomically', async () => {
  const { layout } = await layoutFixture()
  await writePathPointer(layout)
  for (const path of [
    layout.settings,
    layout.sessions,
    join(layout.skills, 'global'),
    join(layout.plugins, 'global'),
    join(layout.plugins, 'projects'),
    layout.diagnostics,
    layout.databases,
    layout.artifacts,
    ...Object.values(layout.cache),
  ])
    expect((await stat(path)).isDirectory()).toBe(true)
  expect(JSON.parse(await readFile(layout.pointerFile, 'utf8'))).toEqual({
    version: 1,
    dataRoot: layout.dataRoot,
    cacheRoot: layout.cacheRoot,
  })
})

test('session JSONL rebuilds a missing SQLite projection and cache deletion does not affect it', async () => {
  const { root, layout } = await layoutFixture()
  let storage = new Storage(layout.database, layout)
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'fixture')
  const session = await storage.call('createSession', workspace.id, 'recoverable')
  await storage.call('commit', session.id, 'run-1', 'user', [{ type: 'text', text: 'canonical' }])
  const before = await storage.call('events', session.id, 0)
  await storage.close()

  await rm(layout.cacheRoot, { recursive: true, force: true })
  await rm(layout.database, { force: true })
  await rm(`${layout.database}-wal`, { force: true })
  await rm(`${layout.database}-shm`, { force: true })
  storage = new Storage(layout.database, layout)
  await storage.call('ready')
  const snapshot = await storage.call('snapshot', session.id)
  expect(snapshot.session.title).toBe('recoverable')
  expect(snapshot.messages[0]?.content[0]).toMatchObject({ type: 'text', text: 'canonical' })
  expect(await storage.call('events', session.id, 0)).toEqual(before)
  await storage.close()
})

test('startup truncates an incomplete final JSONL record and diagnoses the repair', async () => {
  const { layout } = await layoutFixture()
  let storage = new Storage(layout.database, layout)
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', layout.dataRoot, 'fixture')
  const session = await storage.call('createSession', workspace.id)
  const log = (await files(layout.sessions)).find((path) => path.endsWith(`${session.id}.jsonl`))!
  await storage.close()
  const size = Bun.file(log).size
  await appendFile(log, '{"eventId":"unfinished"', 'utf8')
  storage = new Storage(layout.database, layout)
  await storage.call('ready')
  expect(Bun.file(log).size).toBe(size)
  expect((await files(layout.diagnostics)).some((path) => path.endsWith('.jsonl'))).toBe(true)
  await storage.close()
})

test('startup rejects an indexed event whose canonical JSONL file is missing', async () => {
  const { layout } = await layoutFixture()
  let storage = new Storage(layout.database, layout)
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', layout.dataRoot, 'fixture')
  await storage.call('createSession', workspace.id)
  await storage.close()
  const db = new Database(layout.database)
  const row = db.query('SELECT logPath FROM session_event_index LIMIT 1').get() as { logPath: string }
  db.close()
  await rm(join(layout.sessions, row.logPath), { force: true })
  storage = new Storage(layout.database, layout)
  await expect(storage.call('ready')).rejects.toThrow('SESSION_LOG_CORRUPTED')
  await storage.close()
})

async function files(root: string): Promise<string[]> {
  const output: string[] = []
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) await visit(child)
      else output.push(child)
    }
  }
  await visit(root)
  return output
}
