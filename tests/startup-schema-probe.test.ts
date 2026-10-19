import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, open, readFile, realpath, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { HbarError, type DiagnosticEvent } from '@hbar/contracts'
import {
  createMaintenanceWorkerPreflight,
  createPathLayout,
  ensurePathLayout,
  Storage,
  STORAGE_SCHEMA_VERSION,
} from '@hbar/storage'

const workerPath = join(process.cwd(), 'packages/storage/src/startup-schema-worker.ts')

async function fixture(seed: boolean) {
  const parent = await realpath(tmpdir())
  const root = await mkdtemp(join(parent, 'hbar-startup-schema-probe-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  await ensurePathLayout(layout)
  if (seed) {
    const storage = new Storage(layout.database, layout)
    try {
      await storage.call('ready')
      await storage.call('setSetting', 'startup-schema-preserved', 'original')
    } finally {
      await storage.close()
    }
    const database = new Database(layout.database)
    try {
      database.exec('PRAGMA journal_mode=DELETE')
    } finally {
      database.close()
    }
  }
  return { parent, root, layout }
}

async function digest(path: string) {
  return existsSync(path)
    ? createHash('sha256')
        .update(await readFile(path))
        .digest('hex')
    : null
}

async function removeOwned(value: Awaited<ReturnType<typeof fixture>>, failures: unknown[]) {
  if (failures.length) throw new AggregateError(failures, 'Schema probe evidence retained at ' + value.root)
  const actual = await realpath(value.root)
  if (dirname(actual) !== value.parent || !basename(actual).startsWith('hbar-startup-schema-probe-'))
    throw new Error('Unowned schema probe fixture')
  await rm(value.root, { recursive: true, force: true })
}

for (const schema of ['current', 'older', 'future', 'missing'] as const) {
  test('closed readonly schema decision preserves bytes and gates migration: ' + schema, async () => {
    const value = await fixture(schema !== 'missing')
    const failures: unknown[] = []
    let probe: ReturnType<typeof createMaintenanceWorkerPreflight> | undefined
    let fallback: ReturnType<typeof createMaintenanceWorkerPreflight> | undefined
    try {
      if (schema === 'older' || schema === 'future') {
        const database = new Database(value.layout.database)
        try {
          database.exec('PRAGMA user_version=' + (schema === 'older' ? 23 : STORAGE_SCHEMA_VERSION + 1))
        } finally {
          database.close()
        }
      }
      const before = await digest(value.layout.database)
      probe = createMaintenanceWorkerPreflight(value.layout, workerPath)
      if (schema === 'older' || schema === 'future') {
        const failure: unknown = await probe.ready.catch((error: unknown) => error)
        expect(failure).toBeInstanceOf(HbarError)
        expect(failure).toMatchObject({ code: 'RUNTIME_RESTART_REQUIRED' })
        await probe.close()
        fallback = createMaintenanceWorkerPreflight(
          value.layout,
          join(process.cwd(), 'packages/storage/src/maintenance-worker.ts'),
          { allowMigration: true },
        )
        if (schema === 'older') await fallback.ready
        else await expect(fallback.ready).rejects.toMatchObject({ code: 'RUNTIME_RESTART_REQUIRED' })
        await fallback.close()
      } else await probe.ready
      await probe.close()
      expect(await digest(value.layout.database)).toBe(before)
      if (before === null) expect(existsSync(value.layout.database)).toBe(false)
      else {
        const moved = value.layout.database + '.closed'
        await rename(value.layout.database, moved)
        await rename(moved, value.layout.database)
      }
    } catch (error) {
      failures.push(error)
    } finally {
      for (const current of [probe, fallback]) {
        try {
          await current?.close()
        } catch (error) {
          failures.push(error)
        }
      }
    }
    await removeOwned(value, failures)
  })
}

test('schema admission does not admit a corrupt late page to the actual Storage writer preflight', async () => {
  const value = await fixture(true)
  const failures: unknown[] = []
  let probe: ReturnType<typeof createMaintenanceWorkerPreflight> | undefined
  let storage: Storage | undefined
  const events: DiagnosticEvent[] = []
  try {
    const database = new Database(value.layout.database)
    let latePage: number
    try {
      database.exec('CREATE TABLE startup_schema_front (value BLOB)')
      database.query('INSERT INTO startup_schema_front VALUES (zeroblob(?))').run(2_097_152)
      database.exec("CREATE TABLE startup_schema_late (value TEXT); INSERT INTO startup_schema_late VALUES ('kept')")
      const row = database
        .query<{ rootpage: number }, []>("SELECT rootpage FROM sqlite_schema WHERE name='startup_schema_late'")
        .get()
      if (!row || row.rootpage <= 512) throw new Error('Late-page schema fixture was not constructed')
      latePage = row.rootpage
    } finally {
      database.close()
    }
    const file = await open(value.layout.database, 'r+')
    try {
      await file.write(Uint8Array.of(255), 0, 1, (latePage - 1) * 4096)
    } finally {
      await file.close()
    }
    const before = await digest(value.layout.database)
    probe = createMaintenanceWorkerPreflight(value.layout, workerPath)
    await probe.ready
    await probe.close()
    storage = new Storage(value.layout.database, value.layout, {
      preflight: true,
      diagnostics: {
        emit: (event) => {
          events.push(event)
        },
      },
      diagnosticsFullCoverage: true,
    })
    const failure: unknown = await storage.call('ready').catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(HbarError)
    await storage.close()
    expect(events.filter((event) => event.event === 'sqlite.preflight_started')).toHaveLength(1)
    expect(events.filter((event) => event.event === 'sqlite.preflight_completed')).toHaveLength(0)
    expect(events.filter((event) => event.event === 'sqlite.recovery_started')).toHaveLength(0)
    expect(await digest(value.layout.database)).toBe(before)
    const moved = value.layout.database + '.closed'
    await rename(value.layout.database, moved)
    await rename(moved, value.layout.database)
  } catch (error) {
    failures.push(error)
  } finally {
    for (const current of [probe, storage]) {
      try {
        await current?.close()
      } catch (error) {
        failures.push(error)
      }
    }
  }
  await removeOwned(value, failures)
})
