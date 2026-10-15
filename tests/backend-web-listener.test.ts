import { expect, test } from 'bun:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { openSync, closeSync } from 'node:fs'
import { createServer } from 'node:net'
import { networkInterfaces, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { HbarClient, createSettingsCommandClient, createSystemCommandClient } from '@hbar/client'
import { startServer } from '../apps/host/src/server'
import { INTERNAL_HOST_ROLE } from '../apps/cli/src/host-process'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function availablePort(): Promise<number> {
  return new Promise((accept, reject) => {
    const listener = createServer()
    listener.once('error', reject)
    listener.listen({ port: 0, host: '127.0.0.1' }, () => {
      const address = listener.address()
      if (!address || typeof address === 'string') {
        listener.close(() => reject(new Error('Port reservation failed')))
        return
      }
      listener.close((error) => (error ? reject(error) : accept(address.port)))
    })
  })
}

async function until<Value>(read: () => Promise<Value>, timeoutMs = 60_000): Promise<Value> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      return await read()
    } catch (error) {
      if (Date.now() >= deadline) throw error
      await Bun.sleep(100)
    }
  }
}

async function stop(child: ReturnType<typeof Bun.spawn>) {
  if (child.exitCode === null) {
    if (process.platform === 'win32') {
      const stopping = Bun.spawn(['taskkill.exe', '/PID', String(child.pid), '/T', '/F'], {
        stdout: 'ignore',
        stderr: 'ignore',
        windowsHide: true,
      })
      await stopping.exited
    } else child.kill('SIGTERM')
  }
  await child.exited
}

test('a real Host binds persisted web settings before runtime startup and retains pairing on LAN', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-backend-listener-'))
  const home = join(root, 'data')
  const log = openSync(join(root, 'host.log'), 'a')
  const children: ReturnType<typeof Bun.spawn>[] = []
  const clients: HbarClient[] = []
  const port = await availablePort()
  const kernel = await Kernel.create({ home, workspace: root, demo: true, secrets: new MemorySecrets() })
  const temporary = await startServer(kernel, { port: 0 })
  let setupClosed = false
  const launch = (extra: readonly string[] = [], data = home) => {
    const command = process.env.HBAR_TEST_HOST_EXECUTABLE
      ? [resolve(process.env.HBAR_TEST_HOST_EXECUTABLE), INTERNAL_HOST_ROLE]
      : [process.execPath, resolve('apps/host/src/main.ts')]
    const child = Bun.spawn(
      [...command, '--supervisor', '--desktop', '--home', data, '--workspace', root, '--demo', ...extra],
      {
        stdin: 'ignore',
        stdout: log,
        stderr: log,
        windowsHide: true,
        env: { ...process.env, HBAR_RUNTIME_WATCH: '0' },
      },
    )
    children.push(child)
    return child
  }
  try {
    const token = (await temporary.auth.createDevice('listener setup')).token
    const client = new HbarClient(`http://127.0.0.1:${temporary.server.port}`, token)
    clients.push(client)
    await client.connect()
    const settings = createSettingsCommandClient(client)
    const initial = await settings.execute('settings.get', { scope: { kind: 'global' } })
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Listener fixture has no workspace')
    const scoped = await settings.execute('settings.get', { scope: { kind: 'workspace', targetId: workspace.id } })
    for (const [name, value] of [
      ['backend.webAccess', 'lan'],
      ['backend.webPort', port],
    ] as const) {
      await expect(
        settings.execute(
          'settings.set',
          {
            scope: scoped.scope,
            schemaVersion: scoped.schemaVersion,
            baselineRevisions: scoped.revisions,
            path: [{ kind: 'field', name }],
            value,
          },
          { idempotencyKey: `scoped-${name}` },
        ),
      ).rejects.toMatchObject({ code: 'LAYER_FORBIDDEN' })
    }
    for (const value of [0, 65536, 1.5]) {
      await expect(
        settings.execute(
          'settings.set',
          {
            scope: initial.scope,
            schemaVersion: initial.schemaVersion,
            baselineRevisions: initial.revisions,
            path: [{ kind: 'field', name: 'backend.webPort' }],
            value,
          },
          { idempotencyKey: `invalid-port-${value}` },
        ),
      ).rejects.toMatchObject({ code: 'INVALID_VALUE' })
    }
    await settings.execute(
      'settings.apply',
      {
        scope: initial.scope,
        schemaVersion: initial.schemaVersion,
        baselineRevisions: initial.revisions,
        changes: [
          { op: 'set', path: [{ kind: 'field', name: 'backend.webAccess' }], value: 'lan' },
          { op: 'set', path: [{ kind: 'field', name: 'backend.webPort' }], value: port },
        ],
      },
      { idempotencyKey: 'backend-listener-settings' },
    )
    client.disconnect()
    await temporary.close()
    await kernel.close()
    setupClosed = true
    const owner = launch()
    const connectionSchema = z.object({
      url: z.string().url(),
      token: z.string(),
      pid: z.number(),
      supervisorPid: z.number(),
      instanceId: z.string(),
    })
    const connection = await until(async () => {
      if (owner.exitCode !== null) throw new Error(`Owned Host exited with ${owner.exitCode}`)
      const value = connectionSchema.parse(
        JSON.parse(await readFile(join(home, 'settings', 'connection.json'), 'utf8')),
      )
      expect((await fetch(`${value.url}/healthz`)).status).toBe(200)
      return value
    })
    expect(connection.url).toBe(`http://127.0.0.1:${port}`)
    expect(connection.supervisorPid).toBe(owner.pid)
    const operator = new HbarClient(connection.url, connection.token)
    clients.push(operator)
    const info = await operator.connect()
    expect(info.addresses).toContain(connection.url)
    expect(info.addresses.every((address) => new URL(address).port === String(port))).toBe(true)
    const lan = Object.values(networkInterfaces())
      .flatMap((items) => items ?? [])
      .find((item) => item.family === 'IPv4' && !item.internal)
    if (lan) {
      const address = `http://${lan.address}:${port}`
      const anonymous = new HbarClient(address)
      clients.push(anonymous)
      await expect(anonymous.connect()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      const paired = await createSystemCommandClient(operator).execute('pairing.create', {
        role: 'observer',
        workspaceIds: null,
      })
      const response = await fetch(`${address}/auth/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: paired.code, name: 'LAN fixture' }),
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    }
    const conflict = launch(['--port', String(port)], join(root, 'conflicting-data'))
    await until(async () =>
      expect(await readFile(join(root, 'host.log'), 'utf8')).toContain('Host startup failed (EADDRINUSE)'),
    )
    expect((await fetch(`${connection.url}/healthz`)).status).toBe(200)
    await stop(conflict)
    expect((await operator.call('system.bootstrap', {})).host.instanceId).toBe(connection.instanceId)
  } finally {
    for (const client of clients) client.disconnect()
    for (const child of children.reverse()) await stop(child)
    if (!setupClosed) {
      await temporary.close()
      await kernel.close()
    }
    closeSync(log)
    await removeOwnedTestDirectory(root, 'hbar-backend-listener-')
  }
}, 120_000)
