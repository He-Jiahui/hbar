import { expect, test } from 'bun:test'
import { Database, constants } from 'bun:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { setReadMostlyFileIoPriority } from '@hbar/runtime-native/memory-priority'
import { currentThreadMemoryPriority } from './memory-priority-native'

function fileHandle(db: Database): bigint {
  const bytes = new Uint8Array(8)
  expect(db.fileControl(constants.SQLITE_FCNTL_WIN32_GET_HANDLE, bytes)).toBe(0)
  return new DataView(bytes.buffer).getBigUint64(0, true)
}

test.skipIf(process.platform !== 'win32')(
  'native per-file I/O hints retain SQLite handle ownership and readonly contents',
  () => {
    const temp = process.env.TEMP
    if (!temp) throw new Error('Owned TEMP required')
    const fixture = mkdtempSync(join(temp, 'file-io-priority-'))
    if (!resolve(fixture).startsWith(resolve(temp) + sep)) throw new Error('Fixture outside owned TEMP')
    const owner = randomUUID()
    const marker = join(fixture, 'owner.txt')
    writeFileSync(marker, owner, { flag: 'wx' })
    const path = join(fixture, 'fixture.sqlite')
    const writer = new Database(path, { create: true, strict: true })
    try {
      writer.run('CREATE TABLE payload(id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT')
      writer.run("INSERT INTO payload VALUES(1, 'owned')")
    } finally {
      writer.close(true)
    }
    const before = createHash('sha256').update(readFileSync(path)).digest('hex')
    const priority = currentThreadMemoryPriority()
    const first = new Database(path, { readonly: true, strict: true })
    const second = new Database(path, { readonly: true, strict: true })
    try {
      const firstHandle = fileHandle(first)
      const secondHandle = fileHandle(second)
      expect(firstHandle).not.toBe(secondHandle)
      setReadMostlyFileIoPriority(firstHandle)
      setReadMostlyFileIoPriority(secondHandle)
      setReadMostlyFileIoPriority(firstHandle)
      for (const db of [first, second]) {
        expect(db.query('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' })
        expect(db.query('SELECT value FROM payload').get()).toEqual({ value: 'owned' })
        expect(() => db.run('DELETE FROM payload')).toThrow()
      }
      expect(currentThreadMemoryPriority()).toBe(priority)
    } finally {
      second.close(true)
      first.close(true)
    }
    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(before)
    expect(readFileSync(marker, 'utf8')).toBe(owner)
    rmSync(fixture, { recursive: true })
  },
)

test('borrowed file hints reject null, pseudo and truncated handles', () => {
  expect(() => setReadMostlyFileIoPriority(0n)).toThrow('Invalid')
  expect(() => setReadMostlyFileIoPriority(-1n)).toThrow('Invalid')
  expect(() => setReadMostlyFileIoPriority(0xffffffffffffffffn)).toThrow('Invalid')
  expect(() => setReadMostlyFileIoPriority(1n << 64n)).toThrow('Invalid')
})
