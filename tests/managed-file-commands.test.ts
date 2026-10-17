import { expect, test } from 'bun:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createFileCommandClient } from '@hbar/client'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'

test('managed file commands create an absent baseline through the real execution owner and converge without rewriting', async () => {
  const prefix = 'hbar-managed-file-commands-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const runtime = await ProcessHostRuntime.create({
    layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
    sourceRoot: process.cwd(),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
  const device = await host.auth.createDevice('file command regression')
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token)
  try {
    await client.connect()
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Managed file fixture has no workspace')
    const commands = createFileCommandClient(client)
    const input = {
      workspaceId: workspace.id,
      path: 'new/proof.txt',
      text: 'Managed compare-and-create',
      expectedSha256: null,
    }
    const created = await commands.execute('file.write', input)
    expect(created.created).toBe(true)
    expect(created.beforeSha256).toBeNull()
    expect(await readFile(join(root, input.path), 'utf8')).toBe(input.text)
    expect((await commands.execute('file.read', { workspaceId: workspace.id, path: input.path })).sha256).toBe(
      created.afterSha256,
    )
    const converged = await commands.execute('file.write', input)
    expect(converged.created).toBe(false)
    expect(converged.afterSha256).toBe(created.afterSha256)
  } finally {
    client.disconnect()
    await host.close()
    await runtime.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)
