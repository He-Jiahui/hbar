import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nodeInfoSchema } from '@hbar/contracts/node-info'
import { createNodeIdentity } from '@hbar/node-core'
import { NodeStateStorage } from '@hbar/storage/node-state'
import { NodeConsoleService } from '../apps/node/src/console-service'
import { startNodeControlServer } from '../apps/node/src/control-server'
import { nodeConsoleStaticResponse } from '../apps/node/src/console-static'

test('B exposes exact public discovery and its standalone assets without private state or file escapes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hbar-node-console-surface-'))
  const assets = join(directory, 'web')
  await mkdir(join(assets, 'assets'), { recursive: true })
  await writeFile(join(assets, 'index.html'), '<main id="root">node entry</main>')
  await writeFile(join(assets, 'assets', 'entry.js'), 'console.log("node-entry");')
  const outside = join(directory, 'private.txt')
  await writeFile(outside, 'private-node-state')
  const state = new NodeStateStorage(join(directory, 'node.sqlite'))
  await state.call('ready', {})
  const service = new NodeConsoleService(state, createNodeIdentity(), directory)
  const server = await startNodeControlServer(directory, service, undefined, { staticRoot: assets })
  const origin = new URL(server.connection.url).origin
  try {
    const infoResponse = await fetch(`${origin}/node-info`)
    expect(infoResponse.ok).toBe(true)
    const info = nodeInfoSchema.parse(await infoResponse.json())
    expect(info).toMatchObject({ role: 'workspace', protocol: 1, rpcPath: '/rpc', consolePath: '/node-console' })
    expect(Object.keys(info).sort()).toEqual(['consolePath', 'fingerprint', 'nodeId', 'protocol', 'role', 'rpcPath'])
    expect(await (await fetch(`${origin}/node-console`)).text()).toContain('id="root"')
    expect(await (await fetch(`${origin}/assets/entry.js`)).text()).toContain('node-entry')
    expect((await fetch(`${origin}/absent.js`)).status).toBe(404)
    const forbiddenOrigin = await fetch(`${origin}/node-info`, { headers: { origin: 'https://untrusted.example' } })
    expect(forbiddenOrigin.status).toBe(403)
    await symlink(outside, join(assets, 'outside.txt'), 'file')
    expect((await fetch(`${origin}/outside.txt`)).status).toBe(404)
    expect((await nodeConsoleStaticResponse(new Request(`${origin}/%2e%2e%5cprivate.txt`), assets)).status).toBe(404)
    expect(await readFile(outside, 'utf8')).toBe('private-node-state')
    expect((await fetch(`${origin}/node-console`, { method: 'HEAD' })).status).toBe(200)
  } finally {
    await server.close()
    await state.close()
    await rm(directory, { recursive: true, force: true })
  }
})
