import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdtemp, open, readFile, realpath, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { Storage, createPathLayout, ensurePathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'

test('real Host rejects current-schema late-page corruption before recovery or serving', async () => {
  const parent = await realpath(tmpdir())
  const root = await mkdtemp(join(parent, 'hbar-startup-schema-host-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  let runtime: ProcessHostRuntime | undefined
  const failures: unknown[] = []
  let preflights = 0
  let completedPreflights = 0
  let recoveries = 0
  try {
    await ensurePathLayout(layout)
    const seed = new Storage(layout.database, layout)
    try {
      await seed.call('ready')
    } finally {
      await seed.close()
    }
    const database = new Database(layout.database)
    let latePage: number
    try {
      database.exec('PRAGMA journal_mode=DELETE; CREATE TABLE startup_host_front (value BLOB)')
      database.query('INSERT INTO startup_host_front VALUES (zeroblob(?))').run(2_097_152)
      database.exec("CREATE TABLE startup_host_late (value TEXT); INSERT INTO startup_host_late VALUES ('kept')")
      const row = database
        .query<{ rootpage: number }, []>("SELECT rootpage FROM sqlite_schema WHERE name='startup_host_late'")
        .get()
      if (!row || row.rootpage <= 512) throw new Error('Late-page Host fixture was not constructed')
      latePage = row.rootpage
    } finally {
      database.close()
    }
    const file = await open(layout.database, 'r+')
    try {
      await file.write(Uint8Array.of(255), 0, 1, (latePage - 1) * 4096)
    } finally {
      await file.close()
    }
    const before = createHash('sha256')
      .update(await readFile(layout.database))
      .digest('hex')
    runtime = await ProcessHostRuntime.open({
      layout,
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      noLocalExec: true,
      secrets: new MemorySecrets(),
      diagnosticFullCoverage: true,
      diagnostics: {
        emit(event) {
          if (event.event === 'sqlite.preflight_started') preflights++
          if (event.event === 'sqlite.preflight_completed') completedPreflights++
          if (event.event === 'sqlite.recovery_started') recoveries++
        },
      },
    })
    const outcome: unknown = await runtime.ready(5_000).catch((error: unknown) => error)
    expect(outcome).toBeInstanceOf(Error)
    expect(runtime.snapshot().ready).toBe(false)
    await runtime.close()
    runtime = undefined
    expect(preflights).toBeGreaterThanOrEqual(1)
    expect(completedPreflights).toBe(0)
    expect(recoveries).toBe(0)
    expect(
      createHash('sha256')
        .update(await readFile(layout.database))
        .digest('hex'),
    ).toBe(before)
    const moved = layout.database + '.closed'
    await rename(layout.database, moved)
    await rename(moved, layout.database)
  } catch (error) {
    failures.push(error)
  } finally {
    try {
      await runtime?.close()
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Host schema evidence retained at ' + root)
  const actual = await realpath(root)
  if (dirname(actual) !== parent || !basename(actual).startsWith('hbar-startup-schema-host-'))
    throw new Error('Unowned Host schema fixture')
  await rm(root, { recursive: true, force: true })
}, 120_000)
