import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { HbarClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'

async function removeFixture(root: string) {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-image-artifact-host-'))
    throw new Error('Refusing cleanup outside this exact image fixture')
  await rm(target, { recursive: true, force: true })
}

test('paired Host image GET validates exact bytes and denies missing, wrong and revoked credentials without Runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-image-artifact-host-'))
  let kernel: Kernel | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  const clients: HbarClient[] = []
  try {
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
    })
    // An occupied port fails to bind; this test never attaches to or terminates another Host.
    host = await startServer(kernel, { port: 45122 })
    const address = `http://127.0.0.1:${host.server.port}`
    const paired = new HbarClient(address)
    clients.push(paired)
    await paired.pair(host.pairing.code, 'Image artifact isolated test')
    const png = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6DYkAAAAASUVORK5CYII=',
        'base64',
      ),
    )
    const ref = await paired.upload(new File([png], 'fixture.png', { type: 'image/png' }))
    expect(await paired.readImageArtifact(ref)).toEqual({ artifactId: ref.id, mime: 'image/png', bytes: png })
    const anonymous = new HbarClient(address)
    const invalid = new HbarClient(address, 'invalid-fixture-token')
    clients.push(anonymous, invalid)
    await expect(anonymous.readImageArtifact(ref)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(invalid.readImageArtifact(ref)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    const second = await host.auth.createDevice('Read-only before WebSocket')
    const httpOnly = new HbarClient(address, second.token)
    clients.push(httpOnly)
    expect(httpOnly.connectionStatus()).toBe('disconnected')
    expect((await httpOnly.readImageArtifact(ref)).bytes).toEqual(png)
    await paired.call('device.revoke', { id: second.device.id })
    await expect(httpOnly.readImageArtifact(ref)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect((await paired.readImageArtifact(ref)).bytes).toEqual(png)
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing isolated workspace')
    const session = await kernel.createSession(workspace.id, 'Read-only image fixture')
    expect((await kernel.snapshot(session.id)).runs).toHaveLength(0)
    paired.disconnect()
    await expect(paired.readImageArtifact(ref)).rejects.toMatchObject({ code: 'DISCONNECTED' })
    await paired.connect()
    expect((await paired.readImageArtifact(ref)).bytes).toEqual(png)
  } finally {
    for (const client of clients) client.disconnect()
    await host?.close()
    await kernel?.close()
    await removeFixture(root)
  }
}, 20_000)
