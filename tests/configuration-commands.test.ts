import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConfigurationCommandClient, createModelCommandClient, HbarClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

test('configuration commands share provider, permission, and session mode facts without exposing credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-configuration-'))
  const secrets = new MemorySecrets()
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets,
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'configuration test')
  const commands = createConfigurationCommandClient(client)

  expect(await commands.execute('permission.get', {})).toEqual({ mode: 'ask' })
  expect(await commands.execute('permission.set', { mode: 'allow' })).toEqual({ mode: 'allow' })
  expect(await commands.execute('permission.get', {})).toEqual({ mode: 'allow' })

  expect(await commands.execute('mode.get', { sessionId: session.id })).toEqual({ mode: 'default' })
  expect(await commands.execute('mode.set', { sessionId: session.id, mode: 'plan' })).toEqual({ mode: 'plan' })
  expect(await commands.execute('mode.set', { sessionId: session.id, mode: 'plan' })).toEqual({ mode: 'plan' })
  expect(
    (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'mode.changed'),
  ).toHaveLength(1)

  const apiKey = 'configuration-secret'
  const saved = await commands.execute('provider.save', {
    provider: {
      id: 'command-provider',
      name: 'Command provider',
      protocol: 'openai-responses',
      baseUrl: 'https://example.invalid/v1',
      model: 'command-model',
      reasoning: true,
    },
    apiKey,
  })
  expect(saved).toMatchObject({
    id: 'command-provider',
    providerId: 'command-provider',
    modelId: 'command-model',
    hasKey: true,
  })
  expect(JSON.stringify(saved)).not.toContain(apiKey)
  expect(await secrets.get('command-provider')).toBe(apiKey)
  expect((await createModelCommandClient(client).execute('model.list', {})).some((model) => model.id === saved.id)).toBeTrue()

  expect(await commands.execute('provider.delete', { id: 'command-provider' })).toEqual({ deleted: true })
  expect(await commands.execute('provider.delete', { id: 'command-provider' })).toEqual({ deleted: false })
  expect(await secrets.get('command-provider')).toBeNull()
  expect((await createModelCommandClient(client).execute('model.list', {})).some((model) => model.id === saved.id)).toBeFalse()
})
