import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdtemp, open, readFile, realpath, rename, rm, stat, truncate } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { HbarError, type DiagnosticEvent } from '@hbar/contracts'
import { Storage, createPathLayout, ensurePathLayout, STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { buildHostBundle } from '../scripts/build-host-bundle'

async function digest(path: string) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
}

async function fixture() {
  const parent = await realpath(tmpdir())
  const root = await mkdtemp(join(parent, 'hbar-storage-preflight-map-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  await ensurePathLayout(layout)
  const seed = new Storage(layout.database, layout)
  try {
    await seed.call('ready')
    await seed.call('setSetting', 'preflight-preserved', 'original')
  } finally {
    await seed.close()
  }
  const database = new Database(layout.database)
  let latePage: number
  try {
    database.exec('PRAGMA journal_mode=DELETE')
    database.exec('CREATE TABLE preflight_front (id INTEGER PRIMARY KEY, value BLOB)')
    database.query('INSERT INTO preflight_front VALUES (?, zeroblob(?))').run(1, 2_097_152)
    database.exec("CREATE TABLE preflight_late (value TEXT); INSERT INTO preflight_late VALUES ('kept')")
    const row = database
      .query<{ rootpage: number }, [string]>('SELECT rootpage FROM sqlite_schema WHERE name=?')
      .get('preflight_late')
    if (!row || row.rootpage <= 512) throw new Error('Late-page storage integrity fixture was not constructed')
    latePage = row.rootpage
  } finally {
    database.close()
  }
  return { parent, root, layout, latePage }
}

async function assertOwned(parent: string, root: string) {
  const actual = await realpath(root)
  if (dirname(actual) !== parent || !basename(actual).startsWith('hbar-storage-preflight-map-'))
    throw new Error('Unowned Storage preflight fixture')
}

for (const mode of ['source', 'emitted']) {
  for (const corrupt of [false, true]) {
    test(
      'real Storage preflight checks late pages, rejects writes and releases its mapping: ' +
        mode +
        ', corrupt=' +
        corrupt,
      async () => {
        const { parent, root, layout, latePage } = await fixture()
        let probe: Storage | undefined
        const events: DiagnosticEvent[] = []
        const failures: unknown[] = []
        const rounds = corrupt ? 1 : 2
        try {
          // Native assets belong to this OS process, beyond an individual Bun Worker's lifetime.
          // Preserve the emitted bundle in owned TEMP until the supervising process exits.
          const bundle = mode === 'emitted' ? await mkdtemp(join(parent, 'hbar-storage-preflight-bundle-')) : undefined
          const workerPath = bundle ? join(bundle, 'storage-worker.js') : undefined
          if (workerPath)
            await buildHostBundle(
              resolve(import.meta.dir, '../packages/storage/src/worker.ts'),
              'storage-worker.js',
              dirname(workerPath),
            )
          if (bundle) console.log(JSON.stringify({ type: 'storage-preflight-emitted-bundle', path: bundle }))
          if (corrupt) {
            const file = await open(layout.database, 'r+')
            try {
              await file.write(Uint8Array.of(255), 0, 1, (latePage - 1) * 4096)
            } finally {
              await file.close()
            }
          }
          const before = await digest(layout.database)
          for (let round = 0; round < rounds; round++) {
            probe = new Storage(layout.database, layout, {
              preflight: true,
              ...(workerPath ? { workerPath } : {}),
              diagnostics: {
                emit: (event) => {
                  events.push(event)
                },
              },
              diagnosticsFullCoverage: true,
            })
            if (corrupt) {
              const failure: unknown = await probe.call('ready').catch((error: unknown) => error)
              expect(failure).toBeInstanceOf(HbarError)
            } else {
              expect(await probe.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
              expect(
                await probe.call('setSetting', 'preflight-preserved', 'overwritten').catch((error: unknown) => error),
              ).toMatchObject({ code: 'RUNTIME_PREPARING' })
            }
            await probe.close()
            probe = undefined
          }
          expect(events.filter((event) => event.event === 'sqlite.preflight_started')).toHaveLength(rounds)
          expect(events.filter((event) => event.event === 'sqlite.preflight_completed')).toHaveLength(
            corrupt ? 0 : rounds,
          )
          for (const phase of ['preflight.read', 'preflight.check']) {
            for (const name of ['sqlite.startup_phase_wall_completed', 'sqlite.startup_phase_process_cpu_completed']) {
              const observed = events.filter((event) => event.event === name && event.phase === phase)
              expect(observed).toHaveLength(rounds)
              expect(observed[0]?.outcome).toBe(corrupt && phase === 'preflight.check' ? 'failure' : 'success')
              expect(Number.isFinite(observed[0]?.durationMs)).toBe(true)
              expect(observed[0]?.durationMs).toBeGreaterThanOrEqual(0)
            }
          }
          expect(await digest(layout.database)).toBe(before)
          await assertOwned(parent, root)
          const moved = layout.database + '.closed'
          await rename(layout.database, moved)
          await rename(moved, layout.database)
          if (!corrupt) {
            const database = new Database(layout.database, { readonly: true, strict: true })
            try {
              expect(database.query('SELECT value FROM preflight_late').get()).toEqual({ value: 'kept' })
              expect(database.query("SELECT value FROM path_metadata WHERE key='preflight-preserved'").get()).toEqual({
                value: 'original',
              })
            } finally {
              database.close()
            }
          }
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
        if (failures.length) throw new AggregateError(failures, 'Storage preflight evidence retained at ' + root)
        await assertOwned(parent, root)
        await rm(root, { recursive: true, force: true })
      },
    )
  }
}
