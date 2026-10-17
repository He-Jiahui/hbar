import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HbarClient, createSettingsCommandClient } from '@hbar/client'
import { desktopStartupSchema, DESKTOP_STARTUP_MODE_SETTING } from '@hbar/contracts/desktop'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'

const settingPath = [{ kind: 'field' as const, name: DESKTOP_STARTUP_MODE_SETTING }]

test('desktop startup is authenticated and follows persisted global settings across Host restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-desktop-startup-'))
  const home = join(root, 'data')
  let kernel = await Kernel.create({ home, workspace: root, demo: true, secrets: new MemorySecrets() })
  let host = await startServer(kernel, { port: 0 })
  let client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  try {
    const url = `http://127.0.0.1:${host.server.port}`
    expect((await fetch(`${url}/api/desktop/startup`)).status).toBe(401)
    const paired = await host.auth.pair(host.pairing.code, 'native startup fixture', '127.0.0.1')
    const token = paired.token
    client = new HbarClient(url, token)
    await client.connect()
    const read = async (base: string, language: string) => {
      const response = await fetch(`${base}/api/desktop/startup`, {
        headers: { Authorization: `Bearer ${token}`, 'Accept-Language': language },
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      return desktopStartupSchema.parse(await response.json())
    }
    expect(await read(url, 'zh-CN')).toMatchObject({ startupMode: 'client', labels: { openClient: '打开客户端' } })
    const settings = createSettingsCommandClient(client)
    const initial = await settings.execute('settings.get', { scope: { kind: 'global' } })
    await expect(
      settings.execute(
        'settings.set',
        {
          schemaVersion: initial.schemaVersion,
          scope: { kind: 'global' },
          baselineRevisions: initial.revisions,
          path: settingPath,
          value: 'unknown',
        },
        { idempotencyKey: 'invalid-startup' },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_VALUE' })
    const workspace = (await kernel.storage.call('workspaces'))[0]!
    const scoped = await settings.execute('settings.get', { scope: { kind: 'workspace', targetId: workspace.id } })
    await expect(
      settings.execute(
        'settings.set',
        {
          schemaVersion: scoped.schemaVersion,
          scope: scoped.scope,
          baselineRevisions: scoped.revisions,
          path: settingPath,
          value: 'background',
        },
        { idempotencyKey: 'scoped-startup' },
      ),
    ).rejects.toMatchObject({ code: 'LAYER_FORBIDDEN' })
    await settings.execute(
      'settings.set',
      {
        schemaVersion: initial.schemaVersion,
        scope: { kind: 'global' },
        baselineRevisions: initial.revisions,
        path: settingPath,
        value: 'background',
      },
      { idempotencyKey: 'native-startup-background' },
    )
    expect(await read(url, 'en-US')).toMatchObject({ startupMode: 'background', labels: { openClient: 'Open client' } })
    client.disconnect()
    await host.close()
    await kernel.close()
    kernel = await Kernel.create({ home, demo: true, secrets: new MemorySecrets() })
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    expect(await read(`http://127.0.0.1:${host.server.port}`, 'zh-CN')).toMatchObject({ startupMode: 'background' })
    const observer = await host.auth.createDevice('observer startup', { role: 'observer' })
    const denied = await fetch(`http://127.0.0.1:${host.server.port}/api/desktop/startup`, {
      headers: { Authorization: `Bearer ${observer.token}` },
    })
    expect(denied.status).toBe(400)
    expect(await denied.json()).toMatchObject({ code: 'FORBIDDEN' })
    expect(
      (
        await fetch(`http://127.0.0.1:${host.server.port}/api/desktop/startup`, {
          headers: { Authorization: `Bearer ${token}`, Origin: 'https://untrusted.example' },
        })
      ).status,
    ).toBe(403)
  } finally {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
