import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HbarClient, createSettingsCommandClient } from '@hbar/client'
import { BACKEND_UNATTENDED_VALUE_KEY } from '@hbar/contracts/backend'
import { AUTONOMY_DECISION_MODE_SETTING } from '@hbar/contracts/autonomy'
import { desktopBackgroundResponseSchema, desktopStartupSchema } from '@hbar/contracts/desktop'
import { encodePath } from '@hbar/schema-core'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'

test('native background entry enables and persists the existing Host through authenticated settings', async () => {
  const prefix = 'hbar-desktop-background-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const home = join(root, 'data')
  let kernel = await Kernel.create({ home, workspace: root, demo: true, secrets: new MemorySecrets() })
  let host = await startServer(kernel, { port: 0 })
  const device = await host.auth.createDevice('native background fixture')
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token)
  try {
    await client.connect()
    const settings = createSettingsCommandClient(client)
    const get = () => settings.execute('settings.get', { scope: { kind: 'global' } })
    const before = await get()
    await settings.execute(
      'settings.set',
      {
        schemaVersion: before.schemaVersion,
        scope: before.scope,
        baselineRevisions: before.revisions,
        path: [{ kind: 'field', name: AUTONOMY_DECISION_MODE_SETTING }],
        value: 'recommended',
      },
      { idempotencyKey: 'native-background-policy' },
    )
    const url = `http://127.0.0.1:${host.server.port}`
    const instanceId = host.info().instanceId
    const post = (token?: string, input: unknown = { unattended: true }, origin?: string) =>
      fetch(`${url}/api/desktop/background`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(origin ? { Origin: origin } : {}),
        },
        body: JSON.stringify(input),
      })
    expect((await post()).status).toBe(401)
    expect((await post(device.token, { unattended: true }, 'https://untrusted.example')).status).toBe(403)
    for (const input of [{}, { unattended: false }, { unattended: true, actorId: device.device.id }])
      expect((await post(device.token, input)).status).toBe(400)
    const workspace = (await kernel.storage.call('workspaces'))[0]!
    for (const access of [{ role: 'observer' as const }, { role: 'operator' as const, workspaceIds: [workspace.id] }]) {
      const restricted = await host.auth.createDevice('restricted background fixture', access)
      const denied = await post(restricted.token)
      expect(denied.status).toBe(400)
      expect(await denied.json()).toMatchObject({ code: 'FORBIDDEN' })
    }
    expect((await get()).resolution.reports[BACKEND_UNATTENDED_VALUE_KEY]?.effectiveValue).toBe(false)
    const enabled = await post(device.token)
    expect(enabled.status).toBe(200)
    expect(enabled.headers.get('cache-control')).toBe('no-store')
    expect(desktopBackgroundResponseSchema.parse(await enabled.json())).toEqual({ unattended: true })
    const after = await get()
    expect(after.resolution.reports[BACKEND_UNATTENDED_VALUE_KEY]?.effectiveValue).toBe(true)
    const modeKey = encodePath([{ kind: 'field', name: AUTONOMY_DECISION_MODE_SETTING }])
    expect(after.resolution.reports[modeKey]?.effectiveValue).toBe('recommended')
    expect((await post(device.token)).status).toBe(200)
    expect((await get()).revisions).toEqual(after.revisions)
    const startup = await fetch(`${url}/api/desktop/startup`, { headers: { Authorization: `Bearer ${device.token}` } })
    expect(desktopStartupSchema.parse(await startup.json()).startupMode).toBe('client')
    expect(host.info().instanceId).toBe(instanceId)
    client.disconnect()
    await host.close()
    await kernel.close()
    kernel = await Kernel.create({ home, demo: true, secrets: new MemorySecrets() })
    host = await startServer(kernel, { port: 0 })
    const reopened = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token)
    try {
      await reopened.connect()
      const persisted = await createSettingsCommandClient(reopened).execute('settings.get', {
        scope: { kind: 'global' },
      })
      expect(persisted.resolution.reports[BACKEND_UNATTENDED_VALUE_KEY]?.effectiveValue).toBe(true)
      expect(persisted.resolution.reports[modeKey]?.effectiveValue).toBe('recommended')
    } finally {
      reopened.disconnect()
    }
  } finally {
    client.disconnect()
    await host.close()
    await kernel.close()
    await removeOwnedTestDirectory(root, prefix)
  }
})
