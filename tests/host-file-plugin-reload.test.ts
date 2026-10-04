import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createExtensionCommandClient, createFileCommandClient, HbarClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

test('file.find follows the remounted execution provider after plugin.set', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-host-file-plugin-reload-'))
  await writeFile(join(root, 'reload-target.txt'), 'file plugin reload', 'utf8')
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'file plugin reload test')

  const files = createFileCommandClient(client)
  const extensions = createExtensionCommandClient(client)
  expect(await files.execute('file.find', { workspaceId: workspace.id, query: 'reload-target' })).toMatchObject({
    paths: ['reload-target.txt'],
    truncated: false,
  })

  await extensions.execute('plugin.set', {
    id: 'goal.codex',
    enabled: true,
    config: { autoContinue: false },
  })

  expect(await files.execute('file.find', { workspaceId: workspace.id, query: 'reload-target' })).toMatchObject({
    paths: ['reload-target.txt'],
    truncated: false,
  })
  const listed = await files.execute('file.list', { workspaceId: workspace.id, path: '.' })
  expect(listed.items).toContainEqual({ name: 'reload-target.txt', path: 'reload-target.txt', directory: false })
  expect(await files.execute('file.read', { workspaceId: workspace.id, path: 'reload-target.txt' })).toMatchObject({
    path: 'reload-target.txt',
    text: 'file plugin reload',
  })
})
