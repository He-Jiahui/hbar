import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CommandError } from '@hbar/commands'
import { createExtensionCommandClient, HbarClient } from '@hbar/client'
import { HbarError } from '@hbar/contracts'
import { extensionCommands } from '@hbar/contracts/commands/extensions'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function pluginPackage(root: string) {
  const source = join(root, 'extension-source')
  await mkdir(source)
  await writeFile(
    join(source, 'package.json'),
    JSON.stringify({
      name: 'command-extension',
      version: '1.0.0',
      type: 'module',
      hbar: { apiVersion: '^1.0.0', scope: 'global', host: './index.js' },
    }),
  )
  await writeFile(
    join(source, 'index.js'),
    "export default { manifest: { id: 'source', name: 'Command extension', version: '0.0.0', apiVersion: '^1.0.0', description: '', scope: 'host', permissions: [] }, apply() {} }",
  )
  return source
}

test('extension commands manage plugin lifecycle, diagnostics, lock data, and Host-owned skill discovery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-extension-commands-'))
  const home = join(root, 'data')
  const kernel = await Kernel.create({ home, workspace: root, demo: true, secrets: new MemorySecrets() })
  await mkdir(join(home, 'skills', 'global', 'review-helper'))
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'extension command test')
  const commands = createExtensionCommandClient(client)
  const catalog = await client.call('command.catalog', { category: 'system.extensions', limit: 100 })
  for (const id of Object.keys(extensionCommands))
    expect(catalog.items.some((item) => item.metadata.id === id)).toBeTrue()

  const source = await pluginPackage(root)
  const installed = await commands.execute('plugin.install', { path: source })
  expect(installed.find((plugin) => plugin.id === 'command-extension')).toMatchObject({ status: 'active' })
  expect(await commands.execute('plugin.inspect', { id: 'command-extension' })).toMatchObject({
    id: 'command-extension',
    installScope: 'global',
  })
  expect((await commands.execute('plugin.scan', {})).some((plugin) => plugin.id === 'command-extension')).toBeTrue()

  expect((await commands.execute('plugin.disable', { id: 'command-extension' })).find((item) => item.id === 'command-extension')).toMatchObject({ status: 'disabled' })
  expect((await commands.execute('plugin.enable', { id: 'command-extension' })).find((item) => item.id === 'command-extension')).toMatchObject({ status: 'active' })
  expect(
    (
      await commands.execute('plugin.set', {
        id: 'command-extension',
        enabled: true,
        config: { label: 'configured' },
      })
    ).find((item) => item.id === 'command-extension'),
  ).toMatchObject({ status: 'active', config: { label: 'configured' } })

  expect((await commands.execute('plugin.graph', {})).nodes.some((node) => node.id === 'command-extension')).toBeTrue()
  expect((await commands.execute('plugin.resolve', {})).enabled).toContain('command-extension')
  expect((await commands.execute('plugin.lock', {})).plugins['command-extension']).toBeObject()
  expect(await commands.execute('plugin.doctor', {})).toMatchObject({ ok: true })
  expect(await commands.execute('skill.list', {})).toContainEqual({
    id: 'review-helper',
    path: join(home, 'skills', 'global', 'review-helper'),
    scope: 'global',
  })

  await commands.execute('plugin.disable', { id: 'command-extension' })
  expect((await commands.execute('plugin.remove', { id: 'command-extension' })).some((item) => item.id === 'command-extension')).toBeFalse()
  expect(await commands.execute('plugin.inspect', { id: 'command-extension' })).toBeNull()
})

test('extension client reports lost mutation responses as unknown while preserving query failures', async () => {
  const client = createExtensionCommandClient({
    call: async () => {
      throw new HbarError('DISCONNECTED', 'lost')
    },
  })
  await expect(client.execute('plugin.install', { path: 'fixture' })).rejects.toEqual(
    new CommandError('RESULT_UNKNOWN', 'Plugin operation response was lost; query plugin.list before retrying'),
  )
  await expect(client.execute('plugin.list', {})).rejects.toMatchObject({ code: 'DISCONNECTED' })
})
