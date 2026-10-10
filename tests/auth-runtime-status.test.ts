import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HbarError } from '@hbar/contracts'
import { Storage, type StoragePort } from '@hbar/storage'
import { Auth } from '../apps/host/src/auth'

const resources: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of resources.splice(0)) await cleanup() })
test('only previously verified connection identities may read runtime status during storage failure, and revocation invalidates that identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-auth-status-'))
  const storage = new Storage(join(root, 'state.sqlite'))
  resources.push(async () => { await storage.close(); await rm(root, { recursive: true, force: true }) })
  await storage.call('ready')
  let error: HbarError | null = null
  const port: StoragePort = { call: (method, ...args) => error ? Promise.reject(error) : storage.call(method, ...args), close: async () => {} }
  const auth = new Auth(port)
  const paired = await auth.createDevice('runtime status test')
  await auth.authenticate(paired.token)
  error = new HbarError('STORAGE_RESULT_UNKNOWN', 'Writer outcomes need reconciliation')
  expect((await auth.authenticateStatus(paired.token, paired.device.id)).id).toBe(paired.device.id)
  expect(await auth.authenticate(paired.token).catch((failure: unknown) => failure)).toMatchObject({ code: 'STORAGE_RESULT_UNKNOWN' })
  expect(await auth.authenticateStatus('unknown-token', paired.device.id).catch((failure: unknown) => failure)).toMatchObject({ code: 'STORAGE_RESULT_UNKNOWN' })
  expect(await auth.authenticateStatus(paired.token, 'foreign-device').catch((failure: unknown) => failure)).toMatchObject({ code: 'STORAGE_RESULT_UNKNOWN' })
  error = new HbarError('UNAUTHORIZED', 'Explicit revocation')
  expect(await auth.authenticateStatus(paired.token, paired.device.id).catch((failure: unknown) => failure)).toMatchObject({ code: 'UNAUTHORIZED' })
  error = new HbarError('STORAGE_RESULT_UNKNOWN', 'Writer outcomes need reconciliation')
  auth.invalidateDevice(paired.device.id)
  expect(await auth.authenticateStatus(paired.token, paired.device.id).catch((failure: unknown) => failure)).toMatchObject({ code: 'STORAGE_RESULT_UNKNOWN' })
})
