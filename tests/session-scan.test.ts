import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { HbarError, type Session } from '@hbar/contracts'
import { readSessionPages } from '@hbar/plugin-sdk'
import { assertStoragePreflightMethod } from '@hbar/storage'
import type { SessionScanInput, SessionScanPage } from '@hbar/contracts/session-scan'
import { createSessionScanner } from '../packages/storage/src/session-scan'

function fixture() {
  const db = new Database(':memory:')
  db.run(`CREATE TABLE sessions(id TEXT PRIMARY KEY,workspaceId TEXT,title TEXT,archived INTEGER,
    parentId TEXT,createdAt INTEGER,updatedAt INTEGER,seq INTEGER)`)
  const insert = db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)')
  const seed = (id: string, archived = false) => insert.run(id, 'workspace', '界'.repeat(160), +archived, null, 1, 1, 0)
  const scan = createSessionScanner(db)
  return {
    db,
    scan,
    seed,
    close() {
      insert.finalize()
      db.close()
    },
  }
}

test('candidate restoration admits paged reads while retaining its write boundary', () => {
  expect(() => assertStoragePreflightMethod('sessionScanPage')).not.toThrow()
  expect(() => assertStoragePreflightMethod('createSession')).toThrow('Candidate construction cannot write')
})

test('finite primary-key pages cover more than 2000 sessions, including archived, without activity-order gaps', async () => {
  const f = fixture()
  try {
    f.db.transaction(() => {
      for (let i = 0; i < 2105; i++) f.seed(String(i).padStart(5, '0'), i % 2 === 0)
    })()
    const seen: Session[] = []
    let pages = 0
    for await (const page of readSessionPages({ scanPage: async (input) => f.scan(input) })) {
      expect(page.items.length).toBeLessThanOrEqual(64)
      expect(new TextEncoder().encode(JSON.stringify(page)).byteLength).toBeLessThan(65_536)
      seen.push(...page.items)
      if (++pages === 1) {
        f.db.run('UPDATE sessions SET updatedAt=999 WHERE id>?', ['00064'])
        f.seed('later')
        f.db.run('DELETE FROM sessions WHERE id=?', ['00128'])
      }
    }
    expect(seen).toHaveLength(2104)
    expect(new Set(seen.map((s) => s.id)).size).toBe(2104)
    expect(seen[0]?.archived).toBe(true)
    expect(seen.at(-1)?.id).toBe('02104')
    expect(f.scan({ after: '02104' }).items.map((s) => s.id)).toEqual(['later'])
    const plan = f.db
      .query<{ detail: string }, [string, string, number]>(
        'EXPLAIN QUERY PLAN SELECT id,workspaceId,title,archived,parentId,createdAt,updatedAt,seq FROM sessions WHERE id>? AND id<=? ORDER BY id LIMIT ?',
      )
      .all('', 'later', 65)
    expect(plan.some((item) => /USING INDEX sqlite_autoindex_sessions/.test(item.detail))).toBe(true)
    expect(plan.some((item) => /TEMP B-TREE/.test(item.detail))).toBe(false)
  } finally {
    f.close()
  }
})

test('empty and boundary pages terminate, invalid limits fail, and deletion cannot restart a scan', async () => {
  const f = fixture()
  try {
    expect(f.scan({})).toEqual({ items: [], through: null, nextCursor: null })
    for (const limit of [0, 129, 1.5]) expect(() => f.scan({ limit })).toThrow()
    f.seed('a')
    f.seed('b')
    f.seed('c')
    const first = f.scan({ limit: 1 })
    expect(first).toMatchObject({ nextCursor: 'a', through: 'c' })
    f.db.run('DELETE FROM sessions WHERE id=?', ['c'])
    expect(f.scan({ after: 'a', through: 'c', limit: 1 })).toMatchObject({ nextCursor: null, through: 'c' })
    expect(f.scan({ after: 'z', through: 'c' }).items).toHaveLength(0)
    const controller = new AbortController()
    controller.abort(new HbarError('CANCELLED', 'Stop discovery'))
    await expect(
      readSessionPages({ scanPage: async (input) => f.scan(input) }, controller.signal).next(),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
  } finally {
    f.close()
  }
})

test('adapters cannot change the horizon, repeat identities, exceed page size or omit pagination', async () => {
  await expect(readSessionPages({}).next()).rejects.toMatchObject({ code: 'SESSION_SCAN_UNAVAILABLE' })
  const f = fixture()
  try {
    for (let i = 0; i < 66; i++) f.seed(String(i).padStart(3, '0'))
    for (const damage of [
      (page: SessionScanPage) => ({ ...page, nextCursor: 'bad' }),
      (page: SessionScanPage) => ({ ...page, items: [...page.items, ...page.items] }),
      (page: SessionScanPage) => ({ ...page, items: [...page.items].reverse() }),
      (page: SessionScanPage) => ({ ...page, through: null }),
    ]) {
      const iterator = readSessionPages({ scanPage: async (input) => damage(f.scan(input)) })
      await expect(iterator.next()).rejects.toBeDefined()
    }
    let reads = 0
    const port = {
      async scanPage(input: SessionScanInput) {
        const page = f.scan(input)
        return ++reads === 2 ? { ...page, through: 'other' } : page
      },
    }
    const iterator = readSessionPages(port)
    expect((await iterator.next()).done).toBe(false)
    await expect(iterator.next()).rejects.toMatchObject({ code: 'SESSION_SCAN_CURSOR' })
  } finally {
    f.close()
  }
})
