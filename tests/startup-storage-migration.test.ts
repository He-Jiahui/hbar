import { expect, test } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import { startupStorageMigrationRequired } from '../apps/host/src/startup-storage-migration'

test('verified current schema admits the managed writer without an installation recovery', async () => {
  let strictChecks = 0
  let migrationChecks = 0
  const required = await startupStorageMigrationRequired(async (allowMigration) => {
    if (allowMigration) migrationChecks++
    else strictChecks++
  }, new AbortController().signal)
  expect({ required, strictChecks, migrationChecks }).toEqual({ required: false, strictChecks: 1, migrationChecks: 0 })
})

test('a typed older-schema rejection still requires the complete migration-admitting check', async () => {
  const admitted: boolean[] = []
  const required = await startupStorageMigrationRequired(async (allowMigration) => {
    admitted.push(allowMigration)
    if (!allowMigration) throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Supported older schema')
  }, new AbortController().signal)
  expect(required).toBe(true)
  expect(admitted).toEqual([false, true])
})

test('integrity and unconfirmed-exit errors never admit the migration writer', async () => {
  for (const code of ['STORAGE_INTEGRITY_UNKNOWN', 'MAINTENANCE_PREFLIGHT_EXIT_UNCONFIRMED']) {
    const failure = new HbarError(code, 'Readonly evidence is not qualified')
    let checks = 0
    await expect(
      startupStorageMigrationRequired(async () => {
        checks++
        throw failure
      }, new AbortController().signal),
    ).rejects.toBe(failure)
    expect(checks).toBe(1)
  }
})

test('an untyped code-shaped rejection cannot grant migration permission', async () => {
  const failure = Object.assign(new Error('Untyped rejection'), { code: 'RUNTIME_RESTART_REQUIRED' })
  let checks = 0
  await expect(
    startupStorageMigrationRequired(async () => {
      checks++
      throw failure
    }, new AbortController().signal),
  ).rejects.toBe(failure)
  expect(checks).toBe(1)
})

test('cancellation during the strict check prevents the migration fallback', async () => {
  const abort = new AbortController()
  const cancellation = new Error('Host stopped')
  let checks = 0
  await expect(
    startupStorageMigrationRequired(async () => {
      checks++
      abort.abort(cancellation)
      throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Supported older schema')
    }, abort.signal),
  ).rejects.toBe(cancellation)
  expect(checks).toBe(1)
})

test('failed migration-admitting integrity does not release a migration writer', async () => {
  const failure = new HbarError('STORAGE_INTEGRITY_UNKNOWN', 'Older schema has corruption')
  let checks = 0
  await expect(
    startupStorageMigrationRequired(async (allowMigration) => {
      checks++
      if (!allowMigration) throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Supported older schema')
      throw failure
    }, new AbortController().signal),
  ).rejects.toBe(failure)
  expect(checks).toBe(2)
})
