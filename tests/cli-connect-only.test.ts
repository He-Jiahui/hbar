import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, sep } from 'node:path'
import { PROTOCOL_VERSION } from '@hbar/contracts'
import { parseCli, HELP } from '../apps/cli/src/args.ts'
import { openAttachedRuntime, openCatalogClient, openRuntime } from '../apps/cli/src/runtime.ts'
import { resolvePathLayout } from '@hbar/storage'

interface FixtureOptions {
  healthStatus?: number
  ready?: boolean
  healthInstanceId?: string
  savedInstanceId?: string
  omitSavedInstanceId?: boolean
  rpcUnavailable?: boolean
  rpcInstanceId?: string
  rpcHang?: boolean
  rpcError?: { code: string; message: string }
  bootstrap?: unknown
}

async function fixture(options: FixtureOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-cli-connect-only-'))
  let rpcRequests = 0
  let socketCloses = 0
  const instanceId = options.healthInstanceId ?? 'fixture-host-instance'
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request, server) {
      const url = new URL(request.url)
      if (url.pathname === '/healthz')
        return Response.json({ ready: options.ready ?? true, instanceId }, { status: options.healthStatus ?? 200 })
      if (url.pathname === '/rpc') {
        rpcRequests += 1
        if (options.rpcUnavailable)
          return new Response('fixture Host stopped accepting WebSocket connections', { status: 503 })
        if (server.upgrade(request)) return undefined
        return new Response('WebSocket upgrade required', { status: 426 })
      }
      return new Response('not found', { status: 404 })
    },
    websocket: {
      message(socket, message) {
        let request: unknown
        try {
          request = JSON.parse(String(message)) as unknown
        } catch {
          return
        }
        if (!request || typeof request !== 'object' || !('id' in request) || typeof request.id !== 'number') return
        if (!('method' in request) || typeof request.method !== 'string') return
        if (options.rpcHang && request.method === 'system.hello') return
        if (options.rpcError && request.method === 'system.hello') {
          socket.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: request.id,
              error: { code: -32000, message: options.rpcError.message, data: options.rpcError.code },
            }),
          )
          return
        }
        const result =
          request.method === 'system.hello'
            ? {
                version: '0.1.0',
                protocol: PROTOCOL_VERSION,
                instanceId: options.rpcInstanceId ?? instanceId,
                platform: process.platform,
                addresses: [],
                activeRuns: 0,
                demo: false,
              }
            : request.method === 'system.bootstrap'
              ? (options.bootstrap ?? {})
              : {}
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }))
      },
      close() {
        socketCloses += 1
      },
    },
  })
  const dataRoot = join(root, 'data')
  const cacheRoot = join(root, 'cache')
  const layout = await resolvePathLayout({ dataRoot, cacheRoot })
  await mkdir(layout.settings, { recursive: true })
  await writeFile(
    layout.connectionFile,
    JSON.stringify({
      url: server.url.origin,
      token: 'fixture-token',
      ...(!options.omitSavedInstanceId ? { instanceId: options.savedInstanceId ?? instanceId } : {}),
    }),
  )
  return {
    root,
    dataRoot,
    cacheRoot,
    layout,
    server,
    get rpcRequests() {
      return rpcRequests
    },
    get socketCloses() {
      return socketCloses
    },
  }
}

async function removeFixture(root: string) {
  const actual = await realpath(root)
  const parent = await realpath(tmpdir())
  if (!actual.startsWith(`${parent}${sep}`) || !basename(actual).startsWith('hbar-cli-connect-only-'))
    throw new Error('Refusing to remove an unowned connect-only fixture')
  await rm(actual, { recursive: true, force: true })
}

async function waitForSocketClose(f: Awaited<ReturnType<typeof fixture>>) {
  const deadline = Date.now() + 1_000
  while (f.socketCloses === 0 && Date.now() < deadline) await Bun.sleep(10)
}

test('connect-only parses and documents the opt-in behavior', () => {
  const args = parseCli(['--connect-only', 'exec', 'system.diagnose'])
  expect(args.connectOnly).toBeTrue()
  expect(args.command).toBe('exec')
  expect(HELP).toContain('--connect-only')
  expect(parseCli(['exec', 'system.diagnose']).connectOnly).toBeFalse()
})

test('connect-only fails without a saved connection and never calls the Host fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-cli-connect-only-'))
  let fallbackCalls = 0
  try {
    const layout = await resolvePathLayout({ dataRoot: join(root, 'data'), cacheRoot: join(root, 'cache') })
    await expect(
      openCatalogClient({ dataRoot: layout.dataRoot, cacheRoot: layout.cacheRoot, connectOnly: true }, async () => {
        fallbackCalls += 1
      }),
    ).rejects.toThrow('no saved Host connection')
    expect(fallbackCalls).toBe(0)
    expect(await Bun.file(join(layout.diagnostics, 'host.log')).exists()).toBeFalse()
  } finally {
    await removeFixture(root)
  }
})

test('connect-only reports unhealthy and wrong-instance saved connections without fallback', async () => {
  for (const [options, message] of [
    [{ healthStatus: 503, ready: false }, 'HTTP 503'],
    [{ healthInstanceId: 'current-host', savedInstanceId: 'different-host' }, 'identity does not match'],
  ] as const) {
    const f = await fixture(options)
    let fallbackCalls = 0
    try {
      await expect(
        openCatalogClient({ dataRoot: f.dataRoot, cacheRoot: f.cacheRoot, connectOnly: true }, async () => {
          fallbackCalls += 1
        }),
      ).rejects.toThrow(message)
      expect(fallbackCalls).toBe(0)
      expect(await Bun.file(join(f.layout.diagnostics, 'host.log')).exists()).toBeFalse()
      expect(f.rpcRequests).toBe(0)
    } finally {
      await f.server.stop(true)
      await removeFixture(f.root)
    }
  }
})

test('connect-only does not start a fallback if the Host disappears after health preflight', async () => {
  const f = await fixture({ rpcUnavailable: true })
  let fallbackCalls = 0
  try {
    await expect(
      openCatalogClient({ dataRoot: f.dataRoot, cacheRoot: f.cacheRoot, connectOnly: true }, async () => {
        fallbackCalls += 1
      }),
    ).rejects.toThrow('Host WebSocket handshake failed')
    expect(f.rpcRequests).toBe(1)
    expect(fallbackCalls).toBe(0)
    expect(await Bun.file(join(f.layout.diagnostics, 'host.log')).exists()).toBeFalse()
  } finally {
    await f.server.stop(true)
    await removeFixture(f.root)
  }
})

test('connect-only rejects a different WebSocket Host identity after a successful health preflight', async () => {
  const f = await fixture({ rpcInstanceId: 'replacement-host-instance' })
  let fallbackCalls = 0
  try {
    await expect(
      openCatalogClient({ dataRoot: f.dataRoot, cacheRoot: f.cacheRoot, connectOnly: true }, async () => {
        fallbackCalls += 1
      }),
    ).rejects.toThrow('Host instance identity changed after health check')
    expect(f.rpcRequests).toBe(1)
    expect(fallbackCalls).toBe(0)
    expect(await Bun.file(join(f.layout.diagnostics, 'host.log')).exists()).toBeFalse()
  } finally {
    await f.server.stop(true)
    await removeFixture(f.root)
  }
})

test('connect-only binds a legacy connection to the probed Host instance and redacts RPC errors', async () => {
  const legacy = await fixture({ omitSavedInstanceId: true, rpcInstanceId: 'replacement-host-instance' })
  let fallbackCalls = 0
  try {
    await expect(
      openCatalogClient({ dataRoot: legacy.dataRoot, cacheRoot: legacy.cacheRoot, connectOnly: true }, async () => {
        fallbackCalls += 1
      }),
    ).rejects.toThrow('Host instance identity changed after health check')
    expect(fallbackCalls).toBe(0)
    expect(legacy.rpcRequests).toBe(1)
  } finally {
    await legacy.server.stop(true)
    await removeFixture(legacy.root)
  }

  const auth = await fixture({
    rpcError: { code: 'UNAUTHORIZED', message: 'FIXTURE_SECRET_RPC_ERROR_MARKER' },
  })
  try {
    const failure = await openCatalogClient(
      { dataRoot: auth.dataRoot, cacheRoot: auth.cacheRoot, connectOnly: true },
      async () => {
        fallbackCalls += 1
      },
    ).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect(failure).toMatchObject({ code: 'HOST_AUTHENTICATION_FAILED' })
    expect(failure instanceof Error ? failure.message : String(failure)).toContain('authentication was rejected')
    expect(failure instanceof Error ? failure.message : String(failure)).not.toContain(
      'FIXTURE_SECRET_RPC_ERROR_MARKER',
    )
    expect(fallbackCalls).toBe(0)
  } finally {
    await auth.server.stop(true)
    await removeFixture(auth.root)
  }
})

test('connect-only reports a bounded WebSocket deadline as a safe typed failure', async () => {
  const f = await fixture({ rpcHang: true })
  let fallbackCalls = 0
  try {
    const failure = await openCatalogClient(
      { dataRoot: f.dataRoot, cacheRoot: f.cacheRoot, connectOnly: true },
      async () => {
        fallbackCalls += 1
      },
    ).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect(failure).toMatchObject({ code: 'HOST_HANDSHAKE_TIMEOUT' })
    expect(failure instanceof Error ? failure.message : String(failure)).toContain('timed out')
    expect(fallbackCalls).toBe(0)
  } finally {
    await f.server.stop(true)
    await removeFixture(f.root)
  }
})

test('connect-only connects to an existing healthy Host WebSocket', async () => {
  const f = await fixture()
  let fallbackCalls = 0
  let client: Awaited<ReturnType<typeof openCatalogClient>>['client'] | undefined
  try {
    const opened = await openCatalogClient(
      { dataRoot: f.dataRoot, cacheRoot: f.cacheRoot, connectOnly: true },
      async () => {
        fallbackCalls += 1
      },
    )
    client = opened.client
    expect(client.connectionHost()?.instanceId).toBe('fixture-host-instance')
    expect(fallbackCalls).toBe(0)
  } finally {
    client?.disconnect()
    await f.server.stop(true)
    await removeFixture(f.root)
  }
})

test('connect-only closes an attached socket when implicit workspace or session selection fails', async () => {
  const noWorkspace = await fixture({ bootstrap: { workspaces: [], sessions: [] } })
  let fallbackCalls = 0
  try {
    await expect(
      openRuntime(
        {
          dataRoot: noWorkspace.dataRoot,
          cacheRoot: noWorkspace.cacheRoot,
          project: 'unregistered',
          connectOnly: true,
        },
        async () => {
          fallbackCalls += 1
        },
      ),
    ).rejects.toThrow('Project not found on the attached Host')
    expect(fallbackCalls).toBe(0)
    await waitForSocketClose(noWorkspace)
    expect(noWorkspace.socketCloses).toBe(1)
  } finally {
    await noWorkspace.server.stop(true)
    await removeFixture(noWorkspace.root)
  }

  const noSession = await fixture({
    bootstrap: {
      workspaces: [{ id: 'workspace-fixture', path: process.cwd(), name: 'Fixture' }],
      sessions: [],
    },
  })
  try {
    await expect(
      openAttachedRuntime(noSession.server.url.origin, 'fixture-token', { connectOnly: true }),
    ).rejects.toThrow('Session not found in this project')
    await waitForSocketClose(noSession)
    expect(noSession.socketCloses).toBe(1)
  } finally {
    await noSession.server.stop(true)
    await removeFixture(noSession.root)
  }
})
