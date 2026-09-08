import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { HbarClient } from '@hbar/client'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-server-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    demo: true,
    workspace: root,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const url = `http://127.0.0.1:${host.server.port}`
  const client = new HbarClient(url)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'test browser')
  return { root, kernel, host, client, url }
}
test('paired SDK performs session flow and resumes event following without Tauri', async () => {
  const { client, kernel } = await fixture()
  const bootstrap = await client.call('system.bootstrap', {})
  const session = await client.call('session.create', { workspaceId: bootstrap.workspaces[0]!.id })
  await client.follow(session.id, 0)
  await client.call('run.start', {
    sessionId: session.id,
    requestId: 'network',
    input: { text: 'network run' },
    modelId: 'local-fixture',
  })
  await kernel.waitForIdle()
  const snapshot = await client.call('session.snapshot', { sessionId: session.id })
  expect(snapshot.messages).toHaveLength(2)
  expect(snapshot.runs[0]!.status).toBe('completed')
  const replay = await client.call('session.follow', { sessionId: session.id, cursor: 0 })
  expect(replay.events.at(-1)?.seq).toBe(snapshot.cursor)
  expect(replay.events.filter((e) => e.type === 'message.committed')).toHaveLength(2)
})
test('pairing codes are single-use and bad origins cannot pair or read attachments', async () => {
  const { host, url } = await fixture()
  const reused = await fetch(`${url}/auth/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: host.pairing.code, name: 'other' }),
  })
  expect(reused.status).toBe(401)
  const hostile = await fetch(`${url}/healthz`, { headers: { Origin: 'https://attacker.invalid' } })
  expect(hostile.status).toBe(403)
  const unauthenticated = await fetch(`${url}/api/artifacts/${'0'.repeat(64)}`)
  expect(unauthenticated.status).toBe(401)
})
test('revoking a paired device closes its authority', async () => {
  const { host, url, client } = await fixture()
  const second = await host.auth.createDevice('second device')
  const external = new HbarClient(url, second.token)
  await external.connect()
  await client.call('device.revoke', { id: second.device.id })
  await Bun.sleep(20)
  await expect(external.call('system.bootstrap', {})).rejects.toThrow()
  await expect(host.auth.authenticate(second.token)).rejects.toThrow('revoked')
  external.disconnect()
})
test('permission mode is exposed through the paired host and persists for future runs', async () => {
  const { client, kernel } = await fixture()
  expect((await client.call('permission.get', {})).mode).toBe('ask')
  expect((await client.call('permission.set', { mode: 'allow' })).mode).toBe('allow')
  expect((await client.call('permission.get', {})).mode).toBe('allow')
  expect(kernel.permissionMode()).toBe('allow')
})
