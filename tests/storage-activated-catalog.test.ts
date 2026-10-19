// SOURCE-ONLY DRAFT. Not executed; no Worker/activation or physical lifetime proof.
import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { buildActivatedStorageCatalog, storageSourceDatabaseId } from '../packages/storage/src/activated-catalog'

test('single actual Worker path owns both domains with a stable source revision', () => {
  const input = {
    sourceMode: 'single-worker-single-path',
    path: 'owned/fixture/hbar.sqlite',
    preflight: false,
    readySchemaVersion: 32,
    expectedSchemaVersion: 32,
  }
  const first = buildActivatedStorageCatalog(input)
  const reopened = buildActivatedStorageCatalog(input)
  expect(first).toEqual(reopened)
  expect(first.databases).toHaveLength(1)
  const database = first.databases[0]
  if (!database) throw new Error('Activated single-path storage catalog has no database')
  expect(database.databaseId).toBe(createHash('sha256').update(input.path).digest('hex'))
  expect(storageSourceDatabaseId(input.path)).toBe(database.databaseId)
  expect(database.owners).toEqual(['schedule', 'search'])
  expect(JSON.stringify(first)).not.toContain(input.path)
  expect(buildActivatedStorageCatalog({ ...input, path: 'owned/other/hbar.sqlite' }).revision).not.toBe(first.revision)
})

test('catalog rejects unready schema, preflight, memory and unsupported coverage', () => {
  const input = {
    sourceMode: 'single-worker-single-path',
    path: 'owned/fixture/hbar.sqlite',
    preflight: false,
    readySchemaVersion: 32,
    expectedSchemaVersion: 32,
  }
  expect(() => buildActivatedStorageCatalog({ ...input, readySchemaVersion: 31 })).toThrow()
  expect(() => buildActivatedStorageCatalog({ ...input, preflight: true })).toThrow()
  expect(() => buildActivatedStorageCatalog({ ...input, path: ':memory:' })).toThrow()
  expect(() => buildActivatedStorageCatalog({ ...input, sourceMode: 'partitioned' })).toThrow()
})
