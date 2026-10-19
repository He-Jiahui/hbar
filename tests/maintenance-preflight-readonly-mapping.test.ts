import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdtemp, open, readFile, realpath, rename, rm, stat, truncate } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HbarError } from '@hbar/contracts'
import {
  createMaintenanceWorkerPreflight,
  createPathLayout,
  ensurePathLayout,
  STORAGE_SCHEMA_VERSION,
} from '@hbar/storage'

async function fixture() {
  const parent = await realpath(tmpdir())
  const root = await mkdtemp(join(parent, 'hbar-mapped-preflight-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  await ensurePathLayout(layout)
  const database = new Database(layout.database)
  let latePage: number
  try {
    database.exec('PRAGMA page_size=4096; PRAGMA journal_mode=DELETE')
    database.exec('CREATE TABLE front (id INTEGER PRIMARY KEY, value BLOB)')
    database.query('INSERT INTO front VALUES (?, zeroblob(?))').run(1, 2_097_152)
    database.exec("CREATE TABLE late_receipt (value TEXT); INSERT INTO late_receipt VALUES ('kept')")
    database.exec('PRAGMA user_version=' + STORAGE_SCHEMA_VERSION)
    const row = database
      .query<{ rootpage: number }, [string]>('SELECT rootpage FROM sqlite_schema WHERE name=?')
      .get('late_receipt')
    if (!row || row.rootpage <= 512) throw new Error('Late-page integrity fixture was not constructed')
    latePage = row.rootpage
  } finally {
    database.close()
  }
  return { parent, root, layout, latePage }
}

async function assertOwned(parent: string, root: string) {
  const actual = await realpath(root)
  if (dirname(actual) !== parent || !basename(actual).startsWith('hbar-mapped-preflight-'))
    throw new Error('Unowned readonly mapping fixture')
}

async function digest(path: string) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
}

for (const corrupt of [false, true]) {
  test(
    'readonly Maintenance Worker reads sequentially, checks late pages and releases files: corrupt=' + corrupt,
    async () => {
      const { parent, root, layout, latePage } = await fixture()
      let probe: ReturnType<typeof createMaintenanceWorkerPreflight> | undefined
      const failures: unknown[] = []
      try {
        if (corrupt) {
          const file = await open(layout.database, 'r+')
          try {
            await file.write(Uint8Array.of(255), 0, 1, (latePage - 1) * 4096)
          } finally {
            await file.close()
          }
        }
        const before = await digest(layout.database)
        probe = createMaintenanceWorkerPreflight(
          layout,
          fileURLToPath(new URL('../packages/storage/src/maintenance-worker.ts', import.meta.url)),
        )
        if (corrupt) {
          const failure: unknown = await probe.ready.catch((error: unknown) => error)
          if (!(failure instanceof HbarError)) throw new Error('Late-page corruption did not reject readonly readiness')
          expect(['STORAGE_INTEGRITY_UNKNOWN', 'MAINTENANCE_PREFLIGHT_FAILED']).toContain(failure.code)
        } else await probe.ready
        await probe.close()
        probe = undefined
        expect(await digest(layout.database)).toBe(before)
        await assertOwned(parent, root)
        const moved = layout.database + '.closed'
        await rename(layout.database, moved)
        await rename(moved, layout.database)
        if (!corrupt) {
          const database = new Database(layout.database, { readonly: true, strict: true })
          try {
            expect(database.query('SELECT value FROM late_receipt').get()).toEqual({ value: 'kept' })
          } finally {
            database.close()
          }
        }
        // Windows must be able to shrink this private fixture after the Worker and its mapping have exited.
        await truncate(layout.database, 0)
        expect((await stat(layout.database)).size).toBe(0)
      } catch (error) {
        failures.push(error)
      } finally {
        try {
          await probe?.close()
        } catch (error) {
          failures.push(error)
        }
      }
      if (failures.length) throw new AggregateError(failures, 'Readonly mapping evidence retained at ' + root)
      await assertOwned(parent, root)
      await rm(root, { recursive: true, force: true })
    },
  )
}
