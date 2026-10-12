import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { NODE_LIMITS } from '@hbar/contracts/node'
import { nodeSavedLinkSchema } from '@hbar/contracts/node-link-state'
import { nodeStateMethods, type NodeStatePort } from '@hbar/contracts/node-state'
import { validateNodeIdentity } from '@hbar/node-core'
import { Storage } from '@hbar/storage'
import { StorageNodeRegistryPort } from '@hbar/storage/node-registry'
import { NodeRegistryService, ConversationNodeConnections } from '@hbar/node-link'
import { runNode, runNodeCommand, WorkspaceNodeLink } from '@hbar/node'

async function until(check: () => Promise<boolean>, timeoutMs = 20_000): Promise<void> {
  const end = Date.now() + timeoutMs
  while (!(await check())) {
    if (Date.now() > end) throw new Error('Outbound node did not converge')
    await Bun.sleep(15)
  }
}
async function fixture(
  run: (context: {
    home: string
    workspace: string
    connections: ConversationNodeConnections
    registry: NodeRegistryService
    url: string
    restartListener(): Promise<void>
  }) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-outbound-'))
  const home = join(root, 'node'),
    workspace = join(root, 'workspace')
  await mkdir(workspace)
  const storage = new Storage(join(root, 'host.sqlite'))
  await storage.call('ready')
  const registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage))
  const connections = new ConversationNodeConnections(registry, {
    observe: async () => {
      throw new HbarError('FORBIDDEN', 'No observation scope in this fixture')
    },
  })
  const listen = (port: number) =>
    Bun.serve<{ id: string }>({
      hostname: '127.0.0.1',
      port,
      fetch(request, server) {
        if (new URL(request.url).pathname !== '/node') return new Response(null, { status: 404 })
        return server.upgrade(request, { data: { id: crypto.randomUUID() } })
          ? undefined
          : new Response(null, { status: 426 })
      },
      websocket: {
        maxPayloadLength: NODE_LIMITS.frameBytes,
        open(socket) {
          try {
            connections.open(socket.data.id, 'loopback', {
              send: (text) =>
                socket.readyState === 1 &&
                socket.getBufferedAmount() <= 4 * NODE_LIMITS.frameBytes &&
                socket.send(text) !== 0,
              close: (code, reason) => socket.close(code, reason),
            })
          } catch {
            socket.close(4001, 'Node link refused')
          }
        },
        message(socket, payload) {
          void connections
            .receive(socket.data.id, typeof payload === 'string' ? payload : payload.toString())
            .catch(() => connections.closeConnection(socket.data.id))
        },
        close: (socket) => connections.closeConnection(socket.data.id),
      },
    })
  let server = listen(0)
  try {
    await runNodeCommand(['share', workspace, '--id', 'engine', '--access', 'write', '--home', home], () => {})
    await run({
      home,
      workspace,
      connections,
      registry,
      url: server.url.href,
      restartListener: async () => {
        const port = server.port
        await server.stop(true)
        if (port === undefined) throw new Error('Listener has no port')
        server = listen(port)
      },
    })
  } finally {
    await connections.dispose()
    await server.stop(true)
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
}

test('workspace startup pins a verified identity, reconnects after loss/restart and unlinks the live connection', async () => {
  await fixture(async ({ home, workspace, connections, registry, url, restartListener }) => {
    const invite = await registry.invite('build-box')
    let runtime: Awaited<ReturnType<typeof runNode>> | undefined
    try {
      runtime = await runNode(
        ['--home', home, '--join', url, '--code', invite.code, '--fingerprint', invite.fingerprint],
        { registerSignals: false },
      )
      const current = runtime
      await until(
        async () => current.link.connection.phase === 'online' && (await connections.list())[0]?.online === true,
      )
      const saved = nodeSavedLinkSchema.parse(await current.state.call('config.get', { key: 'link' }))
      expect(saved).toMatchObject({ name: 'build-box', nodeId: current.node.id, fingerprint: invite.fingerprint })
      expect(Object.keys(saved)).not.toContain('code')
      await writeFile(join(workspace, 'file.txt'), 'owned by B')
      expect(
        await connections.call(current.node.id, 'fs.readBytes', {
          rootId: 'engine',
          path: 'file.txt',
          authority: {
            sessionId: 'session',
            runId: 'run',
            callId: 'read',
            sandbox: null,
            admission: { kind: 'allow' },
          },
          offset: 0,
          limit: 100,
        }),
      ).toMatchObject({ data: Buffer.from('owned by B').toString('base64') })
      await restartListener()
      await until(async () => current.link.connection.phase === 'retrying')
      expect(current.link.connection.nextAttemptAt).not.toBeNull()
      await until(
        async () => current.link.connection.phase === 'online' && (await connections.list())[0]?.online === true,
      )
      await runNodeCommand(['policy', 'set', 'network=true', '--home', home], () => {})
      await until(async () => (await connections.list())[0]?.capabilities?.floor.network === true)
      await current.close()
      runtime = await runNode(['--home', home], { registerSignals: false })
      const resumed = runtime
      await until(
        async () => resumed.link.connection.phase === 'online' && (await connections.list())[0]?.online === true,
      )
      expect(resumed.node.id).toBe(saved.nodeId)
      expect(await registry.list()).toHaveLength(1)
      await runNodeCommand(['unlink', '--home', home], () => {})
      await until(async () => (await connections.list())[0]?.online === false)
      expect(resumed.link.connection).toEqual({ phase: 'unlinked', reasonCode: null, nextAttemptAt: null })
      expect(await resumed.state.call('config.get', { key: 'link' })).toBeNull()
      await resumed.close()
      runtime = await runNode(['--home', home], { registerSignals: false })
      expect(runtime.link.linked).toBe(false)
      expect(runtime.link.connection.phase).toBe('unlinked')
    } finally {
      await runtime?.close()
    }
  })
}, 60_000)

test('wrong pinned fingerprint blocks first join without saving an identity or consuming the invitation', async () => {
  await fixture(async ({ home, registry, url }) => {
    const invite = await registry.invite('wrong-pin')
    const runtime = await runNode(
      ['--home', home, '--join', url, '--code', invite.code, '--fingerprint', 'SHA256:' + '0'.repeat(43)],
      { registerSignals: false },
    )
    try {
      await until(async () => runtime.link.connection.phase === 'blocked')
      expect(runtime.link.connection).toMatchObject({ reasonCode: 'NODE_HOST_KEY_CHANGED', nextAttemptAt: null })
      expect(runtime.link.linked).toBe(false)
      expect(await runtime.state.call('config.get', { key: 'link' })).toBeNull()
      expect(await registry.list()).toHaveLength(0)
    } finally {
      await runtime.close()
    }
  })
}, 30_000)

test('revocation stops workspace reconnect attempts and keeps the pin for local inspection', async () => {
  await fixture(async ({ home, registry, url, connections }) => {
    const invite = await registry.invite('revoked-box')
    const runtime = await runNode(
      ['--home', home, '--join', url, '--code', invite.code, '--fingerprint', invite.fingerprint],
      { registerSignals: false },
    )
    try {
      await until(
        async () => runtime.link.connection.phase === 'online' && (await connections.list())[0]?.online === true,
      )
      await registry.revoke(runtime.node.id)
      await until(async () => runtime.link.connection.phase === 'blocked')
      expect(runtime.link.connection).toMatchObject({ reasonCode: 'NODE_REVOKED', nextAttemptAt: null })
      expect(runtime.link.linked).toBe(true)
      expect(await runtime.state.call('config.get', { key: 'link' })).not.toBeNull()
    } finally {
      await runtime.close()
    }
  })
}, 30_000)

test('unlink during a delayed identity save fences the old handshake and clears its eventual write', async () => {
  await fixture(async ({ home, registry, url, connections }) => {
    const invite = await registry.invite('delayed-box')
    const runtime = await runNode(['--home', home], { registerSignals: false })
    let releaseSave: (() => void) | undefined
    let saving = false
    const gate = new Promise<void>((resolve) => {
      releaseSave = resolve
    })
    const state: NodeStatePort = {
      async call(method, input) {
        if (method === 'config.set') {
          const value = nodeStateMethods['config.set'].input.parse(input)
          if (value.key === 'link' && value.value !== null) {
            saving = true
            await gate
          }
        }
        return runtime.state.call(method, input)
      },
      close: async () => {},
    }
    const link = new WorkspaceNodeLink(
      state,
      validateNodeIdentity(await runtime.state.call('config.get', { key: 'identity' })),
      runtime.node,
    )
    try {
      await link.start({ url, code: invite.code, fingerprint: invite.fingerprint })
      await until(async () => saving)
      const unlink = link.unlink()
      releaseSave?.()
      await unlink
      await until(async () => (await connections.list())[0]?.online === false)
      expect(link.connection.phase).toBe('unlinked')
      expect(link.linked).toBe(false)
      expect(await runtime.state.call('config.get', { key: 'link' })).toBeNull()
    } finally {
      releaseSave?.()
      await link.close()
      await runtime.close()
    }
  })
}, 30_000)
