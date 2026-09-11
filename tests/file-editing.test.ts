import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { HbarClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-file-editing-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    demo: true,
    workspace: root,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'file editing test')
  return { root, client }
}

test('file editing returns revisions and rejects stale saves', async () => {
  const { client, root } = await fixture()
  await Bun.write(join(root, 'editable.ts'), 'export const value = 1\n')
  const bootstrap = await client.call('system.bootstrap', {})
  const workspaceId = bootstrap.workspaces[0]!.id
  const opened = await client.call('file.read', { workspaceId, path: 'editable.ts' })
  expect(opened.text).toBe('export const value = 1\n')
  expect(opened.revision).toMatch(/^[a-f0-9]{64}$/)
  await Bun.write(join(root, 'editable.ts'), 'export const value = 2\n')
  try {
    await client.call('file.write', {
      workspaceId,
      path: 'editable.ts',
      text: 'export const value = 3\n',
      expectedRevision: opened.revision,
    })
    throw new Error('stale file write unexpectedly succeeded')
  } catch (error) {
    expect(error).toBeInstanceOf(HbarError)
    expect((error as HbarError).code).toBe('FILE_CONFLICT')
  }
  const saved = await client.call('file.write', { workspaceId, path: 'editable.ts', text: 'export const value = 3\n' })
  expect(saved.text).toBe('export const value = 3\n')
  expect(saved.revision).not.toBe(opened.revision)
})
