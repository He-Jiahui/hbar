import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createSystemCommandClient, HbarClient } from '@hbar/client'
import { systemCommands } from '@hbar/contracts/commands/system'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

test('system commands expose bounded diagnostics, path operations, devices, and pairing through one catalog', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-system-'))
  const kernel = await Kernel.create({
    home: join(root, 'current'),
    pointerFile: join(root, 'paths.json'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let restartAccepted = false
  let restartRequests = 0
  const host = await startServer(kernel, {
    port: 0,
    restart() {
      restartRequests++
      return restartAccepted
    },
  })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'system test')
  const commands = createSystemCommandClient(client)

  const catalog = await client.call('command.catalog', { category: 'system.extensions', limit: 100 })
  for (const id of Object.keys(systemCommands))
    expect(catalog.items.some((item) => item.metadata.id === id)).toBeTrue()

  const diagnose = await commands.execute('system.diagnose', {})
  expect(diagnose).toMatchObject({
    host: { instanceId: kernel.instanceId, demo: true },
    recoveredRuns: kernel.recovered,
    streams: 0,
  })
  expect(diagnose.tools).toContain('read_file')
  expect(diagnose.database).toBeObject()

  const current = await commands.execute('system.paths.get', {})
  expect(current.dataRoot).toBe(resolve(root, 'current'))
  expect(current.restartRequired).toBeFalse()
  const nextData = join(root, 'next-data')
  const nextCache = join(root, 'next-cache')
  expect(await commands.execute('system.paths.validate', { dataRoot: nextData, cacheRoot: nextCache })).toEqual({
    dataRoot: resolve(nextData),
    cacheRoot: resolve(nextCache),
    valid: true,
  })
  expect(await commands.execute('system.paths.set', { dataRoot: nextData, cacheRoot: nextCache })).toMatchObject({
    dataRoot: resolve(nextData),
    cacheRoot: resolve(nextCache),
    restartRequired: true,
  })
  expect(await commands.execute('system.restart', {})).toEqual({ accepted: false, restartRequired: true })
  restartAccepted = true
  expect(await commands.execute('system.restart', {})).toEqual({ accepted: true, restartRequired: false })
  expect(restartRequests).toBe(2)

  const second = await host.auth.createDevice('second system device')
  expect((await commands.execute('device.list', {})).map((device) => device.id)).toContain(second.device.id)
  expect(await commands.execute('device.revoke', { id: second.device.id })).toEqual({ revoked: true })
  expect(await commands.execute('device.revoke', { id: second.device.id })).toEqual({ revoked: false })
  expect((await commands.execute('device.list', {})).map((device) => device.id)).not.toContain(second.device.id)

  const pairing = await commands.execute('pairing.create', {})
  expect(pairing.code).toHaveLength(8)
  expect(pairing.expiresAt).toBeGreaterThan(Date.now())
})
