import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConnectionCommands, HbarClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

test('client connection commands cover pairing, disconnect, connect, reconnect, and read-only status', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-connection-commands-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  const commands = createConnectionCommands(client)
  cleanups.push(async () => {
    commands.dispose()
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })

  expect(await commands.execute('connection.status', {})).toEqual({ status: 'disconnected', host: null })
  await expect(commands.execute('connection.connect', {})).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  expect(await commands.execute('connection.status', {})).toEqual({ status: 'pairing', host: null })

  const paired = await commands.execute('pairing.accept', { code: host.pairing.code, name: 'connection command' })
  expect(paired).toMatchObject({ status: 'connected', host: { instanceId: kernel.instanceId } })
  await expect(
    commands.execute('pairing.accept', { code: host.pairing.code, name: 'duplicate' }),
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' })

  expect(await commands.execute('connection.disconnect', {})).toEqual({ status: 'disconnected', host: null })
  expect(await commands.execute('connection.connect', {})).toMatchObject({
    status: 'connected',
    host: { instanceId: kernel.instanceId },
  })
  expect(await commands.execute('connection.reconnect', {})).toMatchObject({
    status: 'connected',
    host: { instanceId: kernel.instanceId },
  })
})
