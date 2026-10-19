import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { Storage, STORAGE_SCHEMA_VERSION, createPathLayout, ensurePathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'

for (const schema of ['current', 'older'] as const) {
  test(
    'real startup preserves receipts with only required recovery: ' + schema + ' schema',
    async () => {
      const parent = await realpath(tmpdir())
      const root = await mkdtemp(join(parent, 'hbar-startup-single-recovery-'))
      if (dirname(await realpath(root)) !== parent || !basename(root).startsWith('hbar-startup-single-recovery-'))
        throw new Error('Unowned startup fixture')
      const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
      let seed: Storage | undefined
      let runtime: ProcessHostRuntime | undefined
      const failures: unknown[] = []
      let recoveriesStarted = 0
      let recoveriesCompleted = 0
      try {
        await ensurePathLayout(layout)
        seed = new Storage(layout.database, layout)
        await seed.call('ready')
        await seed.call('setSetting', 'startup-preserved-receipt', 'committed-before-restart')
        const workspace = await seed.call('createWorkspace', root, 'Startup recovery')
        const session = await seed.call('createSession', workspace.id)
        await seed.call(
          'commit',
          session.id,
          'startup-receipt',
          'user',
          [{ type: 'text', text: 'Preserved startup context' }],
          'startup-message',
        )
        await seed.close()
        seed = undefined
        if (schema === 'older') {
          const database = new Database(layout.database)
          try {
            // Same supported schema23 fixture used by the unchanged Worker preflight regression.
            database.exec(
              'DROP INDEX IF EXISTS node_run_workspace_mounts_session; DROP TABLE IF EXISTS node_run_workspace_mounts; DROP INDEX node_run_worktrees_session; DROP TABLE node_run_worktrees; DROP INDEX node_execution_intents_run_call; DROP TABLE node_execution_intents; ALTER TABLE approvals DROP COLUMN executionTarget; PRAGMA user_version=23',
            )
          } finally {
            database.close()
          }
        }
        runtime = await ProcessHostRuntime.create({
          layout,
          sourceRoot: process.cwd(),
          workspace: root,
          demo: true,
          noLocalExec: true,
          secrets: new MemorySecrets(),
          diagnosticFullCoverage: true,
          diagnostics: {
            emit(event) {
              if (event.event === 'sqlite.recovery_started') recoveriesStarted++
              if (event.event === 'sqlite.recovery_completed') recoveriesCompleted++
            },
          },
        })
        expect(runtime.snapshot().ready).toBe(true)
        expect(await runtime.storage.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
        expect(await runtime.storage.call('getSetting', 'startup-preserved-receipt')).toBe('committed-before-restart')
        expect(await runtime.storage.call('session', session.id)).toMatchObject({
          id: session.id,
          workspaceId: workspace.id,
        })
        expect(recoveriesStarted).toBe(schema === 'current' ? 1 : 2)
        expect(recoveriesCompleted).toBe(recoveriesStarted)
      } catch (error) {
        failures.push(error)
      } finally {
        try {
          await runtime?.close()
        } catch (error) {
          failures.push(error)
        }
        try {
          await seed?.close()
        } catch (error) {
          failures.push(error)
        }
      }
      if (failures.length === 0) await rm(root, { recursive: true, force: true })
      else throw new AggregateError(failures, 'Startup recovery fixture failed; evidence retained at ' + root)
    },
    120_000,
  )
}
