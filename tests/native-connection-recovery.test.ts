import { expect, test } from 'bun:test'
import { HbarClient, type ConnectionStatus } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startNativeConnectionRecovery } from '../apps/web/src/native-connection-recovery'

function fixture(read: Parameters<typeof startNativeConnectionRecovery>[1]) {
  let status: ConnectionStatus = 'disconnected'
  let connects = 0
  let tokens = 0
  const listeners = new Set<(status: ConnectionStatus) => void>()
  const port = {
    baseUrl: 'http://127.0.0.1:4317',
    connectionStatus: () => status,
    onStatus(listener: (status: ConnectionStatus) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    provideAuthentication() {
      tokens++
      return true
    },
    connect() {
      connects++
      status = 'connected'
      for (const listener of listeners) listener(status)
      return Promise.resolve()
    },
  }
  const stop = startNativeConnectionRecovery(port, read)
  return { stop, tokens: () => tokens, connects: () => connects, listeners: () => listeners.size }
}
test('a disconnected native client refreshes its local credentials and reconnects once', async () => {
  let reads = 0
  const f = fixture(() => {
    reads++
    return Promise.resolve({ url: 'http://127.0.0.1:4317', token: 'new-native-token', instanceId: 'new-host' })
  })
  try {
    await Bun.sleep(350)
    expect(f.tokens()).toBe(1)
    expect(f.connects()).toBe(1)
    await Bun.sleep(350)
    expect(reads).toBe(1)
  } finally {
    f.stop()
  }
  expect(f.listeners()).toBe(0)
})
test('a late native read after disposal cannot change credentials or reconnect', async () => {
  const gate = Promise.withResolvers<{ url: string; token: string; instanceId: string }>()
  const f = fixture(() => gate.promise)
  await Bun.sleep(300)
  f.stop()
  gate.resolve({ url: 'http://127.0.0.1:4317', token: 'new-token', instanceId: 'new-host' })
  await Bun.sleep(0)
  expect(f.tokens()).toBe(0)
  expect(f.connects()).toBe(0)
})
test('native credentials for another origin cannot be applied to the current client', async () => {
  const f = fixture(() =>
    Promise.resolve({ url: 'http://127.0.0.1:4318', token: 'other-token', instanceId: 'other-host' }),
  )
  try {
    await Bun.sleep(300)
    expect(f.tokens()).toBe(0)
    expect(f.connects()).toBe(0)
  } finally {
    f.stop()
  }
})
test('credential replacement validates bounds and invalidates the old transport once', () => {
  const client = new HbarClient('http://127.0.0.1:4317', 'original')
  let statuses = 0
  const off = client.onStatus(() => {
    statuses++
  })
  try {
    expect(() => client.provideAuthentication('')).toThrow()
    expect(() => client.provideAuthentication('x'.repeat(4097))).toThrow()
    expect(client.provideAuthentication('original')).toBe(false)
    expect(client.provideAuthentication('rotated')).toBe(true)
    expect(client.provideAuthentication('rotated')).toBe(false)
    expect(statuses).toBe(1)
  } finally {
    off()
    client.disconnect()
  }
})
test('a real Host accepts refreshed authentication after the old connection is closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-native-auth-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const old = await host.auth.createDevice('old native fixture')
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`, old.token)
  let stop = () => {}
  try {
    await client.connect()
    const replacement = await host.auth.createDevice('new native fixture')
    client.disconnect()
    stop = startNativeConnectionRecovery(client, () =>
      Promise.resolve({ url: client.baseUrl, token: replacement.token, instanceId: kernel.instanceId }),
    )
    const deadline = Date.now() + 3000
    while (client.connectionStatus() !== 'connected' && Date.now() < deadline) await Bun.sleep(10)
    expect(client.connectionStatus()).toBe('connected')
    expect(client.connectionHost()?.instanceId).toBe(kernel.instanceId)
  } finally {
    stop()
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
