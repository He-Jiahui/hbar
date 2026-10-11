import { test, expect } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'

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
          database.exec('DROP TABLE runtime_execution_ownership; DROP TABLE runtime_recovery; DROP TABLE runtime_recovery_chains;')
        else database.exec('DROP TABLE run_file_changes; DROP TABLE run_file_change_state;')
        database.exec('PRAGMA user_version=24')
      } finally { database.close() }
      storage = new Storage(path)
      expect(await storage.call('ready')).toEqual({ version: 25 })
      expect((await storage.call('session', session.id)).title).toBe('retained')
      await storage.close()
      const upgraded = new Database(path, { readonly: true })
      try {
        const tables = upgraded.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name)
        for (const name of ['runtime_execution_ownership', 'runtime_recovery', 'runtime_recovery_chains', 'run_file_changes', 'run_file_change_state'])
          expect(tables).toContain(name)
        expect(upgraded.query('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' })
      } finally { upgraded.close() }
      storage = new Storage(path, undefined, { preflight: true })
      expect(await storage.call('ready')).toEqual({ version: 25 })
    } finally {
      await storage.close()
      await rm(root, { recursive: true, force: true })
    }
  })
}
