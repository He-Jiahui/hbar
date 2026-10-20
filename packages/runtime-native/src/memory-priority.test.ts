import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { z } from 'zod'
import { currentThreadMemoryPriority, setCurrentThreadMemoryPriority } from './memory-priority-native'
import { withReadMostlyMemoryPriority } from '@hbar/runtime-native/memory-priority'

test.skipIf(process.platform !== 'win32')(
  'current Windows thread memory priority restores after success, failure and nested scans',
  () => {
    expect(process.platform).toBe('win32')
    const initial = currentThreadMemoryPriority()
    expect(initial).toBeGreaterThanOrEqual(1)
    expect(initial).toBeLessThanOrEqual(5)
    expect(withReadMostlyMemoryPriority(() => currentThreadMemoryPriority())).toBe(Math.min(initial, 2))
    expect(currentThreadMemoryPriority()).toBe(initial)
    const sentinel = new Error('scan failed without changing error identity')
    let failure: unknown
    try {
      withReadMostlyMemoryPriority(() => {
        throw sentinel
      })
    } catch (error) {
      failure = error
    }
    expect(failure).toBe(sentinel)
    expect(currentThreadMemoryPriority()).toBe(initial)
    withReadMostlyMemoryPriority(() => {
      const outer = currentThreadMemoryPriority()
      expect(withReadMostlyMemoryPriority(() => currentThreadMemoryPriority())).toBe(outer)
      expect(currentThreadMemoryPriority()).toBe(outer)
    })
    expect(currentThreadMemoryPriority()).toBe(initial)
    try {
      setCurrentThreadMemoryPriority(1)
      expect(withReadMostlyMemoryPriority(() => currentThreadMemoryPriority())).toBe(1)
      expect(currentThreadMemoryPriority()).toBe(1)
    } finally {
      setCurrentThreadMemoryPriority(initial)
    }
    expect(currentThreadMemoryPriority()).toBe(initial)
    expect(() => withReadMostlyMemoryPriority(() => Promise.resolve(1))).toThrow('synchronous')
    expect(currentThreadMemoryPriority()).toBe(initial)
    expect(() => setCurrentThreadMemoryPriority(0)).toThrow('Invalid')
    expect(() => setCurrentThreadMemoryPriority(6)).toThrow('Invalid')
    expect(currentThreadMemoryPriority()).toBe(initial)
  },
)

test.skipIf(process.platform !== 'win32')(
  'readonly SQLite full checks keep data and thread priority intact, including a rejected write',
  () => {
    const temp = process.env.TEMP
    if (!temp) throw new Error('Owned TEMP required')
    const fixture = mkdtempSync(join(temp, 'priority-sqlite-'))
    if (!resolve(fixture).startsWith(resolve(temp) + sep)) throw new Error('Fixture outside owned TEMP')
    const path = join(fixture, 'fixture.sqlite')
    const writer = new Database(path)
    try {
      writer.exec('CREATE TABLE payload(id INTEGER PRIMARY KEY, value BLOB NOT NULL)')
      writer.exec(
        'WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<128) INSERT INTO payload SELECT x, zeroblob(4096) FROM n',
      )
    } finally {
      writer.close()
    }
    const before = createHash('sha256').update(readFileSync(path)).digest('hex')
    const original = currentThreadMemoryPriority()
    const db = new Database(path, { readonly: true, strict: true })
    try {
      db.exec('PRAGMA query_only=ON')
      for (let round = 0; round < 2; round++) {
        withReadMostlyMemoryPriority(() => {
          expect(currentThreadMemoryPriority()).toBe(Math.min(original, 2))
          expect(db.query('PRAGMA quick_check(1)').get()).toEqual({ quick_check: 'ok' })
          expect(db.query('SELECT count(*) AS n FROM payload').get()).toEqual({ n: 128 })
        })
        expect(currentThreadMemoryPriority()).toBe(original)
      }
      expect(() => withReadMostlyMemoryPriority(() => db.exec('DELETE FROM payload'))).toThrow()
      expect(currentThreadMemoryPriority()).toBe(original)
    } finally {
      db.close()
    }
    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(before)
    expect(currentThreadMemoryPriority()).toBe(original)
    rmSync(fixture, { recursive: true })
  },
)

test.skipIf(process.platform !== 'win32')(
  'Bun Worker restores its own thread priority and leaves the parent thread unchanged',
  async () => {
    const original = currentThreadMemoryPriority()
    const worker = new Worker(new URL('./fixtures/memory-priority-worker.ts', import.meta.url).href)
    const result = await new Promise<unknown>((accept, reject) => {
      worker.onmessage = (event: MessageEvent<unknown>) => accept(event.data)
      worker.onerror = (event: ErrorEvent) => reject(new Error(event.message))
    })
    const observed = z
      .object({
        before: z.number().int().min(1).max(5),
        inside: z.number().int().min(1).max(2),
        after: z.number().int().min(1).max(5),
      })
      .parse(result)
    expect(observed.inside).toBe(Math.min(observed.before, 2))
    expect(observed.after).toBe(observed.before)
    expect(currentThreadMemoryPriority()).toBe(original)
  },
)
