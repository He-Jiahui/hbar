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

test('searches committed dialogue and titles across workspaces while excluding private blocks', async () => {
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
  expect((await store.call('searchSessions', { query: 'title-only-needle', source: 'conversation' })).items).toEqual([])
  expect((await store.call('searchSessions', { query: 'title-only-needle' })).items[0]?.matches[0]).toMatchObject({
    source: 'title',
    messageId: null,
  })
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

test('title navigation identifies the latest assistant output beyond the newest history page', async () => {
  const { store, workspace } = await fixture()
  const session = await store.call('createSession', workspace.id, 'needle title')
  const output = await store.call('commit', session.id, 'title-history', 'assistant', [
    { type: 'text', text: 'Latest output' },
  ])
  for (let index = 0; index < 80; index++)
    await store.call('commit', session.id, 'title-history', 'user', [{ type: 'text', text: `Later input ${index}` }])
  const title = await store.call('searchSessions', { query: 'needle', source: 'title' })
  expect(title.items[0]?.matches[0]).toMatchObject({
    source: 'title',
    messageId: null,
    targetMessageId: output.message.id,
  })
  const newer = await store.call('commit', session.id, 'title-history', 'assistant', [
    { type: 'text', text: 'New latest output' },
  ])
  expect(
    (await store.call('searchSessions', { query: 'needle', source: 'title' })).items[0]?.matches[0]?.targetMessageId,
  ).toBe(newer.message.id)
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
  expect((await reopened.call('ready')).version).toBeGreaterThanOrEqual(19)
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

test('source scopes find titles, dialogue, changed files, patch content and declared commands with exact targets', async () => {
  const { store, workspace } = await fixture()
  const session = await store.call('createSession', workspace.id, 'needle title')
  const dialogue = await store.call('commit', session.id, 'source-run', 'user', [
    { type: 'text', text: 'needle dialogue' },
  ])
  const call = await store.call('commit', session.id, 'source-run', 'assistant', [
    {
      type: 'tool_call',
      callId: 'shell-call',
      name: 'shell',
      args: { command: 'echo needle', apiKey: 'private-argument-token' },
      presentation: { version: 1, kind: 'command', commandField: 'command' },
    },
    { type: 'tool_call', callId: 'edit-call', name: 'edit_file', args: { path: 'needle.ts' } },
    { type: 'thinking', text: 'private-thinking-token' },
  ])
  const result = await store.call('commit', session.id, 'source-run', 'tool', [
    {
      type: 'tool_result',
      callId: 'edit-call',
      name: 'edit_file',
      text: 'Edited needle.ts',
      isError: false,
      details: { path: 'src/needle.ts', before: 'const old = "needle removed"', after: 'const fresh = "needle added"' },
    },
    {
      type: 'tool_result',
      callId: 'failed-call',
      name: 'edit_file',
      text: 'failed',
      isError: true,
      details: { path: 'failed-private-file.ts', before: 'failed-patch-token', after: 'changed' },
    },
  ])
  await finishIndex(store)
  const all = await store.call('searchSessions', { query: 'needle', matchesPerSession: 10 })
  expect(new Set(all.items[0]?.matches.map((match) => match.source))).toEqual(
    new Set(['title', 'conversation', 'file', 'patch', 'tool']),
  )
  for (const source of ['title', 'conversation', 'file', 'patch', 'tool'] as const) {
    const matches = (
      await store.call('searchSessions', { query: 'needle', source, matchesPerSession: 10 })
    ).items.flatMap((item) => item.matches)
    expect(matches.length).toBeGreaterThan(0)
    expect(matches.every((match) => match.source === source)).toBe(true)
    if (source === 'conversation') expect(matches[0]?.targetMessageId).toBe(dialogue.message.id)
    if (source === 'file' || source === 'patch')
      expect(matches[0]).toMatchObject({
        messageId: result.message.id,
        targetMessageId: call.message.id,
        callId: 'edit-call',
        blockIndex: 1,
      })
    if (source === 'tool')
      expect(matches[0]).toMatchObject({ targetMessageId: call.message.id, callId: 'shell-call', blockIndex: 0 })
  }
  for (const query of ['private-argument-token', 'private-thinking-token', 'failed-private-file', 'failed-patch-token'])
    expect((await store.call('searchSessions', { query })).items).toEqual([])
  expect((await store.call('searchSessions', { query: 'needle removed', source: 'patch' })).items).toHaveLength(1)
  expect((await store.call('searchSessions', { query: 'needle added', source: 'patch' })).items).toHaveLength(1)
  await store.call('updateSession', session.id, { title: 'renamed title' })
  expect((await store.call('searchSessions', { query: 'needle', source: 'title' })).items).toEqual([])
  expect((await store.call('searchSessions', { query: 'renamed', source: 'title' })).items[0]?.sessionId).toBe(
    session.id,
  )
})

test('upgrades the old text-only projection without changing canonical messages', async () => {
  const { store, database, workspace } = await fixture()
  const session = await store.call('createSession', workspace.id, 'upgrade')
  await store.call('commit', session.id, 'upgrade-run', 'assistant', [
    { type: 'tool_call', callId: 'legacy-call', name: 'shell', args: { command: 'echo legacy-command-token' } },
  ])
  const before = await store.call('snapshot', session.id)
  await store.close()
  const db = new Database(database)
  db.exec(`DROP TABLE session_search_fts; DROP TABLE session_search_documents;
    CREATE TABLE session_search_documents(id INTEGER PRIMARY KEY,messageId TEXT NOT NULL,sessionId TEXT NOT NULL,
      role TEXT NOT NULL,seq INTEGER NOT NULL,segmentIndex INTEGER NOT NULL,body TEXT NOT NULL,normalizedBody TEXT NOT NULL,UNIQUE(messageId,segmentIndex));
    CREATE VIRTUAL TABLE session_search_fts USING fts5(normalizedBody,content='session_search_documents',content_rowid='id',tokenize='trigram');`)
  db.close()
  const reopened = new Storage(database)
  stores.push(reopened)
  await reopened.call('ready')
  await finishIndex(reopened)
  expect(
    (await reopened.call('searchSessions', { query: 'legacy-command-token', source: 'tool' })).items[0]?.sessionId,
  ).toBe(session.id)
  expect((await reopened.call('snapshot', session.id)).messages).toEqual(before.messages)
})
