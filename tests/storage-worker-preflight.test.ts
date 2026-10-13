import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  Storage,
  createPathLayout,
  ensurePathLayout,
  scanSessionLogs,
  STORAGE_SCHEMA_VERSION,
  createMaintenanceWorkerPreflight,
} from '@hbar/storage'

async function removeOwned(root: string) {
  const path = relative(resolve(tmpdir()), resolve(root))
  if (path.startsWith('..') || !path.startsWith('hbar-worker-preflight-'))
    throw new Error('Worker fixture cleanup escaped its owned directory')
  await rm(resolve(root), { recursive: true, force: true })
}
async function hashFile(path: string) {
  if (!existsSync(path)) return null
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
}

test('actual Worker preflight constructs its full method table without a database file, and accepts readiness and disposal only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-worker-preflight-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  const probe = new Storage(layout.database, layout, { preflight: true })
  try {
    expect(await probe.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
    expect(
      await probe.call('setSetting', 'forbidden', 'must-not-write').catch((error: unknown) => error),
    ).toMatchObject({
      code: 'RUNTIME_PREPARING',
    })
    expect(existsSync(layout.database)).toBe(false)
    expect(await readdir(root)).toEqual([])
    await probe.close()
    expect(await readdir(root)).toEqual([])
  } finally {
    await probe.close()
    await removeOwned(root)
  }
})

test('a readonly actual Worker probe leaves the database, WAL and canonical receipts intact while the existing writer continues serving', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-worker-preflight-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  await ensurePathLayout(layout)
  const writer = new Storage(layout.database, layout)
  let probe: Storage | undefined
  try {
    await writer.call('ready')
    const workspace = await writer.call('createWorkspace', root, 'probe verification')
    const session = await writer.call('createSession', workspace.id)
    await writer.call(
      'commit',
      session.id,
      'preflight-receipt',
      'user',
      [{ type: 'text', text: 'Confirmed context' }],
      'preflight-committed-message',
    )
    const before = await Promise.all([hashFile(layout.database), hashFile(layout.database + '-wal')])
    const logs = scanSessionLogs(layout.sessions).events.map((event) => event.hash)
    probe = new Storage(layout.database, layout, { preflight: true })
    expect(await probe.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
    expect(
      await probe.call('setSetting', 'forbidden', 'must-not-write').catch((error: unknown) => error),
    ).toMatchObject({
      code: 'RUNTIME_PREPARING',
    })
    await probe.close()
    expect(await Promise.all([hashFile(layout.database), hashFile(layout.database + '-wal')])).toEqual(before)
    expect(scanSessionLogs(layout.sessions).events.map((event) => event.hash)).toEqual(logs)
    expect(await writer.call('getSetting', 'forbidden')).toBeNull()
    await writer.call('setSetting', 'writer-still-serving', 'still-serving')
    expect(await writer.call('getSetting', 'writer-still-serving')).toBe('still-serving')
  } finally {
    await probe?.close()
    await writer.close()
    await removeOwned(root)
  }
})

test('actual Maintenance Worker preparation closes its thread without creating a database, receipt or job', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-worker-preflight-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  const probe = createMaintenanceWorkerPreflight(
    layout,
    fileURLToPath(new URL('../packages/storage/src/maintenance-worker.ts', import.meta.url)),
  )
  try {
    await probe.ready
    await probe.close()
    expect(await readdir(root)).toEqual([])
  } finally {
    await probe.close()
    await removeOwned(root)
  }
})

test('cold startup can verify an older supported schema read-only, while hot replacement still requires the current schema', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-worker-preflight-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  await ensurePathLayout(layout)
  const installation = new Storage(layout.database, layout)
  await installation.call('ready')
  await installation.close()
  const database = new Database(layout.database)
  database.exec(
    'DROP INDEX node_run_worktrees_session; DROP TABLE node_run_worktrees; DROP INDEX node_execution_intents_run_call; DROP TABLE node_execution_intents; ALTER TABLE approvals DROP COLUMN executionTarget; PRAGMA user_version=23',
  )
  expect(database.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version).toBe(23)
  expect(
    database
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='node_execution_intents'",
      )
      .get(),
  ).toBeNull()
  expect(
    database
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' AND name='node_run_worktrees'")
      .get(),
  ).toBeNull()
  expect(
    database
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='node_execution_intents_run_call'",
      )
      .get(),
  ).toBeNull()
  expect(
    database
      .query<{ name: string }, []>('PRAGMA table_info(approvals)')
      .all()
      .some((column) => column.name === 'executionTarget'),
  ).toBe(false)
  database.close()
  const workerPath = fileURLToPath(new URL('../packages/storage/src/maintenance-worker.ts', import.meta.url))
  const before = await hashFile(layout.database)
  const strict = createMaintenanceWorkerPreflight(layout, workerPath)
  try {
    const incompatible = await strict.ready.catch((error: unknown) => error)
    expect(incompatible).toMatchObject({ code: 'RUNTIME_RESTART_REQUIRED' })
    await strict.close()
    const probe = createMaintenanceWorkerPreflight(layout, workerPath, { allowMigration: true })
    try {
      await probe.ready
      await probe.close()
    } finally {
      await probe.close()
    }
    expect(await hashFile(layout.database)).toBe(before)
    const migrated = new Storage(layout.database, layout)
    try {
      expect(await migrated.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
    } finally {
      await migrated.close()
    }
  } finally {
    await strict.close()
    await removeOwned(root)
  }
})

test('an actual Maintenance Worker constructor failure is reported and joined before preparation returns', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-worker-preflight-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  const source = join(root, 'worker.ts')
  await writeFile(source, "throw new Error('Injected maintenance constructor failure')\n")
  const probe = createMaintenanceWorkerPreflight(layout, source)
  try {
    expect(await probe.ready.catch((error: unknown) => error)).toMatchObject({ code: 'MAINTENANCE_WORKER_FAILED' })
    await probe.close()
    expect((await readdir(root)).sort()).toEqual(['worker.ts'])
  } finally {
    await probe.close()
    await removeOwned(root)
  }
})

test('an acknowledged Maintenance Worker that keeps its event loop alive cannot report readiness before actual exit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-worker-preflight-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  const source = join(root, 'worker.ts')
  await writeFile(
    source,
    `import { parentPort } from 'node:worker_threads'; parentPort.postMessage({ ok: true, prepared: true, schemaRevision: ${STORAGE_SCHEMA_VERSION} }); setInterval(() => {}, 1000)\n`,
  )
  const probe = createMaintenanceWorkerPreflight(layout, source)
  const started = Date.now()
  try {
    expect(await probe.ready.catch((error: unknown) => error)).toMatchObject({
      code: 'MAINTENANCE_PREFLIGHT_EXIT_UNCONFIRMED',
    })
    await probe.close()
    expect(Date.now() - started).toBeLessThan(10_000)
  } finally {
    await probe.close()
    await removeOwned(root)
  }
}, 40_000)
