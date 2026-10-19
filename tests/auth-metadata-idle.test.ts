import { afterEach, expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HbarError } from '@hbar/contracts'
import type { CommandInvocation } from '@hbar/commands/protocol'
import { HbarClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { Storage, type StoragePort } from '@hbar/storage'
import { Auth } from '../apps/host/src/auth'
import { startServer } from '../apps/host/src/server'
import { isRecoveryControl, isRuntimeMetadataRead, isStableRpc } from '../apps/host/src/stable-rpc'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-auth-metadata-'))
  const storage = new Storage(join(root, 'state.sqlite'))
  cleanups.push(async () => {
    await storage.close()
    await rm(root, { recursive: true, force: true })
  })
  await storage.call('ready')
  let calls = 0
  let failure: HbarError | null = null
  const port: StoragePort = {
    call: (method, ...args) => {
      calls++
      return failure ? Promise.reject(failure) : storage.call(method, ...args)
    },
    close: async () => {},
  }
  return {
    auth: new Auth(port),
    storage,
    calls: () => calls,
    fail: () => {
      failure = new HbarError('STORAGE_RESULT_UNKNOWN', 'Exact writer is unavailable')
    },
  }
}

test('metadata checks preserve the exact verified connection without admitting or waking Storage', async () => {
  const h = await fixture()
  const paired = await h.auth.createDevice('metadata reader')
  expect(() => h.auth.authenticateMetadata(paired.token, paired.device.id)).toThrow('verified')
  await h.auth.authenticate(paired.token)
  const before = h.calls()
  for (let read = 0; read < 100; read++)
    expect(h.auth.authenticateMetadata(paired.token, paired.device.id).id).toBe(paired.device.id)
  expect(h.calls()).toBe(before)
  await h.auth.authenticate(paired.token)
  expect(h.calls()).toBe(before + 1)
  h.fail()
  for (let read = 0; read < 100; read++)
    expect(h.auth.authenticateMetadata(paired.token, paired.device.id).id).toBe(paired.device.id)
  for (const [token, id] of [
    ['unknown', paired.device.id],
    [paired.token, 'foreign'],
    [undefined, paired.device.id],
    [paired.token, undefined],
    ['x'.repeat(513), paired.device.id],
  ])
    expect(() => h.auth.authenticateMetadata(token, id)).toThrow()
  expect(h.calls()).toBe(before + 1)
  await expect(h.auth.authenticate(paired.token)).rejects.toHaveProperty('code', 'STORAGE_RESULT_UNKNOWN')
  expect(h.calls()).toBe(before + 2)
  h.auth.invalidateDevice(paired.device.id)
  expect(() => h.auth.authenticateMetadata(paired.token, paired.device.id)).toThrow('verified')
})

test('an explicit fresh revocation removes cached metadata authority and re-pairing cannot adopt the old token', async () => {
  const h = await fixture()
  const paired = await h.auth.createDevice('revocable metadata reader')
  await h.auth.authenticate(paired.token)
  await h.storage.call('revokeDevice', paired.device.id)
  const denied = await h.auth.authenticate(paired.token).catch((error: unknown) => error)
  expect(denied).toMatchObject({ code: 'UNAUTHORIZED' })
  const calls = h.calls()
  expect(() => h.auth.authenticateMetadata(paired.token, paired.device.id)).toThrow()
  const successor = await h.auth.createDevice('replacement metadata reader')
  expect(() => h.auth.authenticateMetadata(successor.token, paired.device.id)).toThrow()
  expect(() => h.auth.authenticateMetadata(successor.token, successor.device.id)).toThrow()
  await h.auth.authenticate(successor.token)
  expect(h.auth.authenticateMetadata(successor.token, successor.device.id).id).toBe(successor.device.id)
  expect(() => h.auth.authenticateMetadata(paired.token, successor.device.id)).toThrow()
  expect(h.calls()).toBe(calls + 2)
})

test('trusted internal metadata retains its exact identity while normal recovery controls still revalidate', async () => {
  const h = await fixture()
  const internal = await h.auth.createInternalDevice('internal metadata source')
  const before = h.calls()
  expect(h.auth.authenticateMetadata(internal.token, internal.device.id).id).toBe(internal.device.id)
  expect(() => h.auth.authenticateMetadata(internal.token, 'foreign')).toThrow()
  expect(h.calls()).toBe(before)
  const paired = await h.auth.createDevice('control reader')
  await h.auth.authenticate(paired.token)
  const verified = h.calls()
  expect((await h.auth.authenticateStatus(paired.token, paired.device.id)).id).toBe(paired.device.id)
  expect(h.calls()).toBe(verified + 1)
})

test('only pure runtime metadata uses the cached identity route', () => {
  const invocation = (commandId: string, input: unknown): CommandInvocation => ({
    protocol: 1,
    commandVersion: 1,
    requestId: crypto.randomUUID(),
    commandId,
    input,
  })
  for (const [method, params] of [
    ['system.runtime.watch', {}],
    ['system.runtime.unwatch', {}],
    ['command.execute', invocation('system.runtime.get', {})],
    ['command.execute', invocation('system.runtime.reload.get', { operationId: 'exact' })],
  ]) {
    expect(isRuntimeMetadataRead(String(method), params)).toBe(true)
    expect(isStableRpc(String(method), params)).toBe(true)
    expect(isRecoveryControl(String(method), params)).toBe(true)
  }
  for (const [method, params] of [
    ['system.hello', {}],
    ['system.bootstrap', {}],
    ['session.create', {}],
    ['command.execute', invocation('system.runtime.reload', {})],
    ['command.execute', invocation('system.runtime.reload.cancel', { operationId: 'exact' })],
    ['command.execute', invocation('chatDatabase.cancel', {})],
    ['command.execute', invocation('goal.get', {})],
    ['command.execute', null],
  ])
    expect(isRuntimeMetadataRead(String(method), params)).toBe(false)
})

test('the actual WebSocket metadata route avoids database authentication while business still revalidates and revocation denies it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-auth-metadata-wire-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    pointerFile: join(root, 'system', 'paths.json'),
    demo: true,
    noLocalExec: true,
    workspace: root,
    secrets: new MemorySecrets(),
  })
  cleanups.push(async () => {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  const host = await startServer(kernel, { port: 0 })
  cleanups.push(() => host.close())
  const storageCalls = spyOn(kernel.storage, 'call')
  cleanups.push(async () => {
    storageCalls.mockRestore()
  })
  const paired = await host.auth.createDevice('metadata connection')
  const client = new HbarClient('http://127.0.0.1:' + String(host.server.port), paired.token)
  cleanups.push(async () => {
    client.disconnect()
  })
  await client.connect()
  const count = () => storageCalls.mock.calls.filter((args) => args[0] === 'deviceByHash').length
  const before = count()
  for (let read = 0; read < 30; read++) {
    expect(await client.call('system.runtime.unwatch', {})).toBe(null)
    await expect(client.call('system.runtime.watch', {})).rejects.toHaveProperty('code', 'RUNTIME_RESTART_REQUIRED')
  }
  expect(count()).toBe(before)
  await client.call('system.bootstrap', {})
  expect(count()).toBeGreaterThan(before)
  host.auth.invalidateDevice(paired.device.id)
  await expect(client.call('system.runtime.unwatch', {})).rejects.toHaveProperty('code', 'UNAUTHORIZED')
})
