import { test, expect } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage, STORAGE_SCHEMA_VERSION } from '@hbar/storage'

for (const previous of ['file-changes', 'runtime-recovery'] as const) {
  test(`migration 25 preserves data and completes the ${previous} version 24 layout`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-runtime-migration-'))
    const path = join(root, 'test.sqlite')
    let storage = new Storage(path)
    try {
      await storage.call('ready')
      const workspace = await storage.call('createWorkspace', root, 'retained')
      const session = await storage.call('createSession', workspace.id, 'retained')
      await storage.close()
      const database = new Database(path)
      try {
        if (previous === 'file-changes')
          database.exec(
            'DROP TABLE runtime_execution_ownership; DROP TABLE runtime_recovery; DROP TABLE runtime_recovery_chains;',
          )
        else database.exec('DROP TABLE run_file_changes; DROP TABLE run_file_change_state;')
        database.exec(
          'DROP INDEX node_run_worktrees_session; DROP TABLE node_run_worktrees; DROP INDEX node_execution_intents_run_call; DROP TABLE node_execution_intents; ALTER TABLE approvals DROP COLUMN executionTarget;',
        )
        database.exec('PRAGMA user_version=24')
        expect(database.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version).toBe(24)
        expect(
          database
            .query<{ name: string }, []>(
              "SELECT name FROM sqlite_master WHERE type='table' AND name='node_execution_intents'",
            )
            .get(),
        ).toBeNull()
        expect(
          database
            .query<{ name: string }, []>(
              "SELECT name FROM sqlite_master WHERE type='table' AND name='node_run_worktrees'",
            )
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
      } finally {
        database.close()
      }
      storage = new Storage(path)
      expect(await storage.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
      expect((await storage.call('session', session.id)).title).toBe('retained')
      await storage.close()
      const upgraded = new Database(path, { readonly: true })
      try {
        const tables = upgraded
          .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table'")
          .all()
          .map((row) => row.name)
        for (const name of [
          'runtime_execution_ownership',
          'runtime_recovery',
          'runtime_recovery_chains',
          'run_file_changes',
          'run_file_change_state',
        ])
          expect(tables).toContain(name)
        expect(upgraded.query('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' })
      } finally {
        upgraded.close()
      }
      storage = new Storage(path, undefined, { preflight: true })
      expect(await storage.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
    } finally {
      await storage.close()
      await rm(root, { recursive: true, force: true })
    }
  })
}
