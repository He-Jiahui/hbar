import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { HbarClient, createSystemCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { desktopPairingResponseSchema, desktopTrayActionsSchema } from '@hbar/contracts/desktop'
import { startServer } from '../apps/host/src/server'
import { projectDesktopPairing } from '../apps/host/src/desktop-tray'
import { removeOwnedTestDirectory } from './owned-temp-directory'

test('native tray pairing uses authenticated system commands, explicit roles, one-use codes and Origin protection', async () => {
  const prefix = 'hbar-desktop-tray-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const url = `http://127.0.0.1:${host.server.port}`
  const operator = await host.auth.createDevice('tray operator')
  const admin = await host.auth.createDevice('tray admin')
  const client = new HbarClient(url, admin.token)
  const headers = { Authorization: `Bearer ${operator.token}`, 'Content-Type': 'application/json' }
  try {
    expect((await fetch(`${url}/api/desktop/tray`)).status).toBe(401)
    expect((await fetch(`${url}/api/desktop/pairing`, { method: 'POST', body: '{}' })).status).toBe(401)
    for (const language of ['zh-CN', 'en-US']) {
      const response = await fetch(`${url}/api/desktop/tray`, { headers: { ...headers, 'Accept-Language': language } })
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      const copy = desktopTrayActionsSchema.parse(await response.json())
      expect(copy.copyAddress).toBe(language === 'zh-CN' ? '复制网页地址' : 'Copy web address')
    }
    const post = (input: unknown, extra: Record<string, string> = {}) =>
      fetch(`${url}/api/desktop/pairing`, {
        method: 'POST',
        headers: { ...headers, ...extra },
        body: JSON.stringify(input),
      })
    expect((await post({ role: 'operator' }, { Origin: 'https://untrusted.example' })).status).toBe(403)
    for (const input of [
      {},
      { role: 'admin' },
      { role: 'operator', workspaceIds: [] },
      { role: 'observer', actorId: admin.device.id },
    ])
      expect((await post(input)).status).toBe(400)
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Tray fixture workspace is absent')
    for (const access of [{ role: 'observer' as const }, { role: 'operator' as const, workspaceIds: [workspace.id] }]) {
      const denied = await host.auth.createDevice('restricted tray', access)
      for (const path of ['/api/desktop/tray', '/api/desktop/pairing']) {
        const response = await fetch(`${url}${path}`, {
          method: path.endsWith('/pairing') ? 'POST' : 'GET',
          headers: { ...headers, Authorization: `Bearer ${denied.token}` },
          ...(path.endsWith('/pairing') ? { body: JSON.stringify({ role: 'operator' }) } : {}),
        })
        expect(response.status).toBe(400)
        expect(await response.json()).toMatchObject({ code: 'FORBIDDEN' })
      }
    }
    for (const role of ['observer', 'operator'] as const) {
      const response = await post({ role }, { 'Accept-Language': role === 'observer' ? 'zh-CN' : 'en-US' })
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      const receipt = desktopPairingResponseSchema.parse(await response.json())
      expect(receipt.expiresAt).toBeGreaterThan(Date.now())
      expect(receipt.message).toContain(receipt.code)
      expect(receipt.message).toContain(url)
      expect(receipt.message).toContain(role === 'observer' ? '只读访问所有工作区' : 'operate all workspaces')
      expect(receipt.message).not.toContain(operator.token)
      const paired = await fetch(`${url}/auth/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: receipt.code, name: 'tray browser' }),
      })
      expect(paired.status).toBe(200)
      const device = z
        .object({ device: z.object({ role: z.string(), workspaceIds: z.null() }) })
        .parse(await paired.json())
      expect(device.device.role).toBe(role)
      const duplicate = await fetch(`${url}/auth/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: receipt.code, name: 'duplicate tray browser' }),
      })
      expect(duplicate.status).not.toBe(200)
    }
    await client.connect()
    await createSystemCommandClient(client).execute('device.revoke', { id: operator.device.id })
    expect((await fetch(`${url}/api/desktop/tray`, { headers })).status).toBe(401)
    expect((await post({ role: 'operator' })).status).toBe(401)
  } finally {
    client.disconnect()
    await host.close()
    await kernel.close()
    await removeOwnedTestDirectory(root, prefix)
  }
})

test('tray pairing content has a bounded address list and explicit empty state in both languages', () => {
  const pairing = { code: '12345678', expiresAt: Date.now() + 300_000 }
  for (const language of ['zh-CN', 'en-US']) {
    for (const count of [0, 1, 8, 16, 17]) {
      const addresses = Array.from({ length: count }, (_, index) => `http://10.0.0.${index + 1}:4317`)
      const result = projectDesktopPairing(pairing, 'observer', addresses, language)
      expect(result.message).toContain(pairing.code)
      expect(result.message.length).toBeLessThan(6000)
      if (count === 0) expect(result.message).toContain(language === 'zh-CN' ? '暂不可用' : 'unavailable')
      else expect(result.message).toContain(addresses[Math.min(count, 16) - 1] ?? '')
      if (count > 16) expect(result.message).not.toContain(addresses[16] ?? '')
    }
    const address = 'http://127.0.0.1:4317'
    const result = projectDesktopPairing(pairing, 'operator', [address, address], language)
    expect(result.message.split(address).length).toBe(2)
  }
  const copy = desktopTrayActionsSchema.parse({
    copyAddress: '字'.repeat(120),
    pairOperator: 'Operator',
    pairObserver: 'Observer',
    dialogTitle: 'Title',
    acknowledge: 'Close',
    addressCopied: 'Copied',
    copyFailed: 'Failed',
    pairingFailed: 'Failed',
  })
  expect(copy.copyAddress.length).toBe(120)
  expect(desktopTrayActionsSchema.safeParse({ ...copy, copyAddress: '字'.repeat(121) }).success).toBe(false)
  expect(desktopTrayActionsSchema.safeParse({ ...copy, acknowledge: '' }).success).toBe(false)
})
