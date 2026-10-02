import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'

const roots: string[] = []
const stores: Storage[] = []
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-search-'))
  roots.push(root)
  const database = join(root, 'hbar.sqlite')
  const store = new Storage(database)
  stores.push(store)
  await store.call('ready')
  const workspace = await store.call('createWorkspace', root, 'Project')
  return { root, database, store, workspace }
}

async function finishIndex(store: Storage, maxSteps = 100) {
  for (let step = 0; step < maxSteps; step++) if ((await store.call('searchIndexStep')).complete) return
  throw new Error('Search index did not complete within the fixture bound')
}

test('searches committed user/assistant text across workspaces, not titles or private blocks', async () => {
  const { root, store, workspace } = await fixture()
  const secondWorkspace = await store.call('createWorkspace', join(root, 'second'), 'Other project')
  const first = await store.call('createSession', workspace.id, 'title-only-needle')
  const second = await store.call('createSession', secondWorkspace.id, 'Second')
  await store.call('commit', first.id, 'run-one', 'user', [
    { type: 'text', text: '中文 hello SearchWord conclusion' },
    { type: 'thinking', text: 'secret-thinking-token' },
  ])
  await store.call('commit', first.id, 'run-one', 'assistant', [{ type: 'text', text: 'Another searchword answer' }])
  await store.call('commit', second.id, 'run-two', 'assistant', [{ type: 'text', text: 'searchword in project two' }])
  await store.call('commit', second.id, 'run-two', 'assistant', [
    { type: 'text', text: '甲乙丙 punctuation foo.bar and three """ quotes' },
  ])
  await store.call('commit', second.id, 'run-two', 'tool', [{ type: 'text', text: 'tool-only-token' }])
  await finishIndex(store)

  const result = await store.call('searchSessions', { query: 'SEARCHWORD' })
  expect(result.incompleteReason).toBeNull()
  expect(result.truncated).toBe(false)
  expect(result.items.map((item) => item.sessionId).sort()).toEqual([first.id, second.id].sort())
  const firstHit = result.items.find((item) => item.sessionId === first.id)!
  expect(firstHit.matchCount).toBe(2)
  expect(firstHit.matches).toHaveLength(2)
  expect(firstHit.matches.every((match) => match.snippet.hit.toLowerCase() === 'searchword')).toBe(true)
  expect((await store.call('searchSessions', { query: 'title-only-needle' })).items).toEqual([])
  expect((await store.call('searchSessions', { query: 'secret-thinking-token' })).items).toEqual([])
  expect((await store.call('searchSessions', { query: 'tool-only-token' })).items).toEqual([])
  expect((await store.call('searchSessions', { query: '中文' })).items[0]?.sessionId).toBe(first.id)
  expect((await store.call('searchSessions', { query: '甲乙丙' })).items[0]?.sessionId).toBe(second.id)
  expect((await store.call('searchSessions', { query: 'foo.bar' })).items[0]?.sessionId).toBe(second.id)
  expect((await store.call('searchSessions', { query: '"""' })).items[0]?.sessionId).toBe(second.id)

  await store.call('updateSession', first.id, { archived: true })
  expect((await store.call('searchSessions', { query: 'searchword' })).items.map((item) => item.sessionId)).toEqual([
    second.id,
  ])
  expect((await store.call('recentSessions', {})).items.map((item) => item.sessionId)).not.toContain(first.id)
  await store.call('updateSession', first.id, { archived: false })
  expect((await store.call('searchSessions', { query: 'searchword' })).items).toHaveLength(2)
})

test('one-character scans stop at the candidate cap and mark counts/results incomplete', async () => {
  const { database, store, workspace } = await fixture()
  const session = await store.call('createSession', workspace.id, 'large fixture')
  await store.close()
  const db = new Database(database)
  db.transaction(() => {
    for (let index = 0; index < 4001; index++) {
      db.query(
        'INSERT INTO session_search_documents(messageId,sessionId,role,seq,segmentIndex,body,normalizedBody) VALUES(?,?,?,?,?,?,?)',
      ).run(`synthetic-${index}`, session.id, 'user', index + 1, 0, 'x', 'x')
      const row = db.query('SELECT last_insert_rowid() AS id').get() as { id: number }
      db.query('INSERT INTO session_search_fts(rowid,normalizedBody) VALUES(?,?)').run(row.id, 'x')
    }
  })()
  db.close()
  const reopened = new Storage(database)
  stores.push(reopened)
  expect((await reopened.call('searchIndexStep')).complete).toBe(true)
  const result = await reopened.call('searchSessions', { query: 'x' })
  expect(result.incompleteReason).toBe('scan_cap')
  expect(result.items[0]).toMatchObject({
    sessionId: session.id,
    matchCount: 999,
    matchCountCapped: true,
  })
})

test('overlapped text segments find boundary phrases and Fork copies get their own searchable identity', async () => {
  const { store, workspace } = await fixture()
  const parent = await store.call('createSession', workspace.id, 'Parent')
  await store.call('commit', parent.id, 'run', 'assistant', [
    { type: 'text', text: `${'x'.repeat(4093)}boundary-phrase${'y'.repeat(5000)}` },
  ])
  const child = await store.call('fork', parent.id)
  await finishIndex(store)
  const result = await store.call('searchSessions', { query: 'boundary-phrase' })
  expect(result.incompleteReason).toBeNull()
  expect(result.items.map((item) => item.sessionId).sort()).toEqual([parent.id, child.id].sort())
  expect(result.items.every((item) => item.matchCount === 1)).toBe(true)
})

test('old version-8 projection backfills incrementally and never reports false empty while indexing', async () => {
  const { database, store, workspace } = await fixture()
  const session = await store.call('createSession', workspace.id, 'old')
  for (let index = 0; index < 20; index++)
    await store.call('commit', session.id, `run-${index}`, 'user', [{ type: 'text', text: `legacy-match-${index}` }])
  await store.close()
  const db = new Database(database)
  db.exec(`
    DROP TABLE session_search_fts;
    DROP TABLE session_search_documents;
    DROP TABLE session_search_queue;
    DROP TABLE session_search_indexed;
    DROP TABLE session_search_progress;
    DROP INDEX sessions_recent_search;
    PRAGMA user_version=8;
  `)
  db.close()
  const reopened = new Storage(database)
  stores.push(reopened)
  expect((await reopened.call('ready')).version).toBe(11)
  expect((await reopened.call('searchIndexStep')).complete).toBe(false)
  await finishIndex(reopened)
  expect((await reopened.call('searchSessions', { query: 'legacy-match-19' })).items[0]?.sessionId).toBe(session.id)
})

test('a deleted SQLite projection rebuilds search from canonical session JSONL', async () => {
  const { database, store, workspace } = await fixture()
  const session = await store.call('createSession', workspace.id, 'recoverable')
  await store.call('commit', session.id, 'run', 'assistant', [{ type: 'text', text: 'canonical-search-text' }])
  await finishIndex(store)
  await store.close()
  await rm(database, { force: true })
  await rm(`${database}-wal`, { force: true })
  await rm(`${database}-shm`, { force: true })
  const reopened = new Storage(database)
  stores.push(reopened)
  await reopened.call('ready')
  await finishIndex(reopened)
  expect((await reopened.call('searchSessions', { query: 'canonical-search' })).items[0]?.sessionId).toBe(session.id)
})
