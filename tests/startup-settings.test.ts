import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readStartupSettingsLayer, STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { resolveStartupWebConfiguration, resolveStartupDesktopMode } from '@hbar/kernel/controller'
import { removeOwnedTestDirectory } from './owned-temp-directory'

test('fresh startup inherits a local 4317 listener without creating storage files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-startup-settings-'))
  try {
    const layer = await readStartupSettingsLayer(join(root, 'absent.sqlite'))
    expect(layer).toBeNull()
    expect(resolveStartupWebConfiguration(layer)).toEqual({ access: 'local', port: 4317 })
    expect(resolveStartupDesktopMode(layer)).toBe('client')
    expect(await readdir(root)).toEqual([])
  } finally {
    await removeOwnedTestDirectory(root, 'hbar-startup-settings-')
  }
})

test('startup reads the committed global WAL layer without a writer, checkpoint or migration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-startup-settings-'))
  const path = join(root, 'settings.sqlite')
  const database = new Database(path, { strict: true })
  try {
    database.exec(`PRAGMA journal_mode=WAL;
      PRAGMA user_version=3;
      CREATE TABLE settings_layers(id TEXT PRIMARY KEY, kind TEXT, targetId TEXT, schemaVersion INTEGER, revision INTEGER, valuesJson TEXT);`)
    const values = { 'f:backend.webAccess': 'lan', 'f:backend.webPort': 46377, 'f:desktop.startupMode': 'background' }
    database
      .query('INSERT INTO settings_layers VALUES (?, ?, ?, ?, ?, ?)')
      .run('settings:global', 'global', null, 1, 7, JSON.stringify(values))
    const before = await Promise.all([readFile(path), readFile(path + '-wal')])
    const layer = await readStartupSettingsLayer(path)
    expect(layer).toMatchObject({ revision: 7, values })
    expect(resolveStartupWebConfiguration(layer)).toEqual({ access: 'lan', port: 46377 })
    expect(resolveStartupDesktopMode(layer)).toBe('background')
    expect(await readFile(path)).toEqual(before[0])
    expect(await readFile(path + '-wal')).toEqual(before[1])
    expect(database.query('PRAGMA user_version').get()).toEqual({ user_version: 3 })
  } finally {
    database.close()
    await removeOwnedTestDirectory(root, 'hbar-startup-settings-')
  }
})

test('legacy schemas remain untouched and future or damaged startup state fails explicitly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-startup-settings-'))
  const path = join(root, 'settings.sqlite')
  const database = new Database(path, { strict: true })
  try {
    database.exec('PRAGMA user_version=2')
    expect(await readStartupSettingsLayer(path)).toBeNull()
    expect(database.query('PRAGMA user_version').get()).toEqual({ user_version: 2 })
    database.exec(`PRAGMA user_version=${STORAGE_SCHEMA_VERSION + 1}`)
    await expect(readStartupSettingsLayer(path)).rejects.toMatchObject({ code: 'STARTUP_SETTINGS_INVALID' })
    expect(database.query('PRAGMA user_version').get()).toEqual({ user_version: STORAGE_SCHEMA_VERSION + 1 })
    database.exec('PRAGMA user_version=3')
    await expect(readStartupSettingsLayer(path)).rejects.toMatchObject({ code: 'STARTUP_SETTINGS_INVALID' })
  } finally {
    database.close()
    await removeOwnedTestDirectory(root, 'hbar-startup-settings-')
  }
})

test('oversized and malformed global layers cannot become silent listener defaults', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-startup-settings-'))
  const path = join(root, 'settings.sqlite')
  const database = new Database(path, { strict: true })
  try {
    database.exec(`PRAGMA user_version=3;
      CREATE TABLE settings_layers(id TEXT PRIMARY KEY, kind TEXT, targetId TEXT, schemaVersion INTEGER, revision INTEGER, valuesJson TEXT);`)
    const insert = database.query('INSERT OR REPLACE INTO settings_layers VALUES (?, ?, ?, ?, ?, ?)')
    for (const [kind, value] of [
      ['global', '{broken'],
      ['workspace', '{}'],
      ['global', JSON.stringify({ large: 'x'.repeat(1_048_576) })],
    ] as const) {
      insert.run('settings:global', kind, null, 1, 1, value)
      await expect(readStartupSettingsLayer(path)).rejects.toMatchObject({ code: 'STARTUP_SETTINGS_INVALID' })
    }
    expect(() =>
      resolveStartupWebConfiguration({
        id: 'settings:global',
        kind: 'global',
        targetId: null,
        schemaVersion: 2,
        revision: 1,
        values: {},
      }),
    ).toThrow('requires migration')
    expect(() =>
      resolveStartupWebConfiguration({
        id: 'settings:global',
        kind: 'global',
        targetId: null,
        schemaVersion: 1,
        revision: 1,
        values: { 'f:backend.webPort': 70000 },
      }),
    ).toThrow()
  } finally {
    database.close()
    await removeOwnedTestDirectory(root, 'hbar-startup-settings-')
  }
})

test('startup read cancellation and deadline join the read-only Worker before settling', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-startup-settings-'))
  const workerPath = join(root, 'waiting-worker.ts')
  try {
    await writeFile(workerPath, 'setInterval(() => {}, 1000)')
    const controller = new AbortController()
    const reading = readStartupSettingsLayer(join(root, 'absent.sqlite'), { workerPath, signal: controller.signal })
    controller.abort()
    await expect(reading).rejects.toMatchObject({ code: 'CANCELLED' })
    await expect(
      readStartupSettingsLayer(join(root, 'absent.sqlite'), { workerPath, timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' })
    await expect(readStartupSettingsLayer('unused', { timeoutMs: Infinity })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
  } finally {
    await removeOwnedTestDirectory(root, 'hbar-startup-settings-')
  }
})
