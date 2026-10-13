import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import { StorageNodeRegistryPort } from '@hbar/storage/node-registry'
import { NodeStateStorage } from '@hbar/storage/node-state'
import { LocalExecution } from '@hbar/local-tools'
import { nodeFloorSchema, nodeWorkspaceMethods, NODE_LIMITS } from '@hbar/contracts/node'
import {
  WorkspaceNodeService,
  WorkspaceNodeProtocol,
  createNodeIdentity,
  nodeIdFromPublicKey,
  nodeProtectedPaths,
  type NodeExecutionBackend,
} from '@hbar/node-core'
import { NodeRegistryService, ConversationNodeConnections, WorkspaceNodeClient } from '@hbar/node-link'

async function until(check: () => Promise<boolean>): Promise<void> {
  const end = Date.now() + 10_000
  while (!(await check())) {
    if (Date.now() > end) throw new Error('Node link did not reach its expected state')
    await Bun.sleep(10)
  }
}
async function fixture(
  run: (context: {
    registry: NodeRegistryService
    connections: ConversationNodeConnections
    client: WorkspaceNodeClient
    node: WorkspaceNodeService
    url: string
    workspace: string
    disconnected: () => number
    disconnectCodes: string[]
    capabilitiesRead: () => number
  }) => Promise<void>,
  behavior: { blackholePings?: boolean; wrongEvaluator?: boolean; capabilityDelayMs?: number } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-websocket-')),
    workspace = join(root, 'workspace'),
    data = join(root, 'node')
  await mkdir(workspace)
  await mkdir(data)
  const storage = new Storage(join(root, 'host.sqlite')),
    state = new NodeStateStorage(join(data, 'node.sqlite'))
  await storage.call('ready')
  await state.call('ready', {})
  const registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage))
  const identity = createNodeIdentity()
  await state.call(
    'floor.set',
    nodeFloorSchema.parse({ roots: [{ rootId: 'engine', name: 'engine', path: workspace, access: 'write' }] }),
  )
  const backend: NodeExecutionBackend = {
    name: 'none',
    filesystem: false,
    network: false,
    processTree: true,
    exec: async () => {
      throw new Error('No command backend in this fixture')
    },
  }
  let service: WorkspaceNodeService | undefined
  const node = await WorkspaceNodeService.open(
    nodeIdFromPublicKey(identity.publicKey),
    data,
    state,
    new LocalExecution([data], undefined, undefined, {
      get: () => (service ? nodeProtectedPaths(service.policy, data) : [data]),
    }),
    backend,
  )
  service = node
  const protocol = new WorkspaceNodeProtocol(node)
  const connections = new ConversationNodeConnections(registry, {
    observe: async (_nodeId, method) => {
      if (method !== 'observe.sessions.list') throw new Error('Unsupported fixture observation')
      return { items: [], nextCursor: null }
    },
    heartbeatMs: 30,
    heartbeatTimeoutMs: 500,
  })
  const server = Bun.serve<{ id: string }>({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request, host) {
      if (new URL(request.url).pathname !== '/node') return new Response(null, { status: 404 })
      return host.upgrade(request, { data: { id: crypto.randomUUID() } })
        ? undefined
        : new Response(null, { status: 426 })
    },
    websocket: {
      maxPayloadLength: NODE_LIMITS.frameBytes,
      open(socket) {
        try {
          connections.open(socket.data.id, 'loopback', {
            send(text) {
              if (socket.readyState !== 1 || socket.getBufferedAmount() > 4 * NODE_LIMITS.frameBytes) return false
              return socket.send(text) !== 0
            },
            close(code, reason) {
              socket.close(code, reason)
            },
          })
        } catch {
          socket.close(4001, 'Node admission failed')
        }
      },
      message(socket, text) {
        void connections
          .receive(socket.data.id, typeof text === 'string' ? text : text.toString())
          .catch(() => connections.closeConnection(socket.data.id, 4002, 'Node frame failed'))
      },
      close(socket) {
        connections.closeConnection(socket.data.id)
      },
    },
  })
  let disconnected = 0
  const disconnectCodes: string[] = []
  let capabilitiesRead = 0
  const client = new WorkspaceNodeClient({
    identity,
    handle: async (method, input, signal) => {
      if (method === 'node.ping' && behavior.blackholePings)
        return new Promise((resolve) => signal.addEventListener('abort', () => resolve(input), { once: true }))
      const result = await protocol.invoke(method, input, signal)
      if (method === 'node.capabilities') {
        capabilitiesRead++
        if (behavior.capabilityDelayMs) await Bun.sleep(behavior.capabilityDelayMs)
      }
      if (method === 'node.capabilities' && behavior.wrongEvaluator)
        return { ...nodeWorkspaceMethods['node.capabilities'].output.parse(result), evaluator: '1'.repeat(64) }
      return result
    },
    onDisconnected: (error) => {
      disconnected++
      disconnectCodes.push(error.code)
      protocol.resetTransfers()
      node.linkLost()
    },
    onJoined: async (joined) => {
      await state.call('config.set', { key: 'link', value: { publicKey: joined.publicKey } })
      node.linkRestored()
    },
    heartbeatTimeoutMs: 1_000,
  })
  try {
    await run({
      registry,
      connections,
      client,
      node,
      url: server.url.href,
      workspace,
      disconnected: () => disconnected,
      disconnectCodes,
      capabilitiesRead: () => capabilitiesRead,
    })
  } finally {
    client.close()
    connections.dispose()
    await protocol.dispose()
    await server.stop(true)
    await node.dispose()
    registry.dispose()
    await storage.close()
    await state.close()
    await rm(root, { recursive: true, force: true })
  }
}
const authority = {
  sessionId: 'session',
  runId: 'run',
  callId: 'call',
  sandbox: null,
  admission: { kind: 'allow' as const },
}
test('real node WebSocket exchanges signed identities, verified capabilities, scoped files and read-only observations', async () => {
  await fixture(async ({ registry, connections, client, node, url, workspace }) => {
    const invitation = await registry.invite('build-box')
    const joined = await client.connect({ url, fingerprint: invitation.fingerprint, code: invitation.code })
    expect(joined.nodeId).toBe(node.id)
    await until(async () => !!(await connections.list())[0]?.online)
    await writeFile(join(workspace, 'file.txt'), 'node-owned')
    const bytes = await connections.call(node.id, 'fs.readBytes', { rootId: 'engine', path: 'file.txt', authority })
    expect(Buffer.from(bytes.data, 'base64').toString()).toBe('node-owned')
    const write = await connections.call(node.id, 'fs.write', {
      rootId: 'engine',
      path: 'file.txt',
      authority,
      operationId: 'run:write',
      offset: 0,
      totalBytes: 7,
      final: true,
      data: Buffer.from('updated').toString('base64'),
    })
    expect(write.state).toBe('settled')
    expect(await readFile(join(workspace, 'file.txt'), 'utf8')).toBe('updated')
    expect(await client.observe('observe.sessions.list', {})).toEqual({ items: [], nextCursor: null })
    const denied = await connections.call(node.id, 'exec.start', {
      ...authority,
      rootId: 'engine',
      cwd: '.',
      operationId: 'run:process',
      command: 'echo forbidden',
      timeoutMs: 1_000,
    })
    expect(denied).toMatchObject({ state: 'settled', result: { details: { executionStarted: false } } })
    expect(nodeWorkspaceMethods['fs.readBytes'].output.safeParse(bytes).success).toBe(true)
  })
}, 20_000)
test('node revocation closes its actual socket and immediately removes execution routing authority', async () => {
  await fixture(async ({ registry, connections, client, node, url, disconnected }) => {
    const invitation = await registry.invite('box')
    await client.connect({ url, fingerprint: invitation.fingerprint, code: invitation.code })
    await until(async () => !!(await connections.list())[0]?.online)
    await registry.revoke(node.id)
    await until(async () => disconnected() === 1)
    expect((await connections.list())[0]?.online).toBe(false)
    const error = await connections.call(node.id, 'node.capabilities', {}).catch((error: unknown) => error)
    expect(error).toMatchObject({ code: 'NODE_OFFLINE' })
    const reconnect = await client
      .connect({ url, fingerprint: invitation.fingerprint, pinnedPublicKey: registry.identity.publicKey })
      .catch((error: unknown) => error)
    expect(reconnect).toMatchObject({ code: 'NODE_REVOKED' })
  })
}, 20_000)
test('a saved pinned identity reconnects without a code and receives current floor changes', async () => {
  await fixture(async ({ registry, connections, client, node, url, disconnected }) => {
    const invitation = await registry.invite('box')
    const joined = await client.connect({ url, fingerprint: invitation.fingerprint, code: invitation.code })
    client.close()
    await until(async () => disconnected() === 1)
    await until(async () => !(await connections.list())[0]?.online)
    await client.connect({ url, fingerprint: invitation.fingerprint, pinnedPublicKey: joined.publicKey })
    await until(async () => !!(await connections.list())[0]?.online)
    await node.setPolicy({ ...node.policy, process: false })
    client.notify('node.floorChanged', { revision: Date.now() })
    await until(async () => (await connections.list())[0]?.capabilities?.floor.process === false)
    expect((await connections.list())[0]?.online).toBe(true)
  })
}, 20_000)

test('a real heartbeat failure closes the link instead of leaving stale online routing', async () => {
  await fixture(
    async ({ registry, connections, client, node, url, disconnected }) => {
      const invitation = await registry.invite('box')
      await client.connect({ url, fingerprint: invitation.fingerprint, code: invitation.code })
      await until(async () => !!(await connections.list())[0]?.online)
      await until(async () => disconnected() === 1)
      expect((await connections.list())[0]?.online).toBe(false)
      const operation = await connections
        .call(node.id, 'exec.receipt', { operationId: 'run:unknown' })
        .catch((error: unknown) => error)
      expect(operation).toMatchObject({ code: 'NODE_OFFLINE' })
    },
    { blackholePings: true },
  )
}, 20_000)

test('an evaluator mismatch closes the real connection before any workspace operation can be routed', async () => {
  await fixture(
    async ({ registry, connections, client, node, url, disconnected, disconnectCodes }) => {
      const invitation = await registry.invite('box')
      const dial = await client.connect({ url, fingerprint: invitation.fingerprint, code: invitation.code }).then(
        () => null,
        (error: unknown) => error,
      )
      if (dial !== null) expect(dial).toMatchObject({ code: 'NODE_EVALUATOR_MISMATCH' })
      await until(async () => disconnected() === 1)
      expect(disconnectCodes).toEqual(['NODE_EVALUATOR_MISMATCH'])
      expect((await connections.list())[0]?.online).toBe(false)
      const operation = await connections
        .call(node.id, 'fs.readBytes', { rootId: 'engine', path: 'file.txt', authority })
        .catch((error: unknown) => error)
      expect(operation).toMatchObject({ code: 'NODE_OFFLINE' })
    },
    { wrongEvaluator: true },
  )
}, 20_000)

test('a floor change during capability refresh triggers another bounded refresh and converges to the latest floor', async () => {
  const behavior = { capabilityDelayMs: 0 }
  await fixture(async ({ registry, connections, client, node, url, capabilitiesRead }) => {
    const invitation = await registry.invite('box')
    await client.connect({ url, fingerprint: invitation.fingerprint, code: invitation.code })
    await until(async () => !!(await connections.list())[0]?.online)
    const initial = capabilitiesRead()
    behavior.capabilityDelayMs = 100
    await node.setPolicy({ ...node.policy, process: false })
    client.notify('node.floorChanged', { revision: Date.now() })
    await until(async () => capabilitiesRead() > initial)
    await node.setPolicy({ ...node.policy, process: true })
    client.notify('node.floorChanged', { revision: Date.now() })
    await until(
      async () =>
        capabilitiesRead() >= initial + 2 && (await connections.list())[0]?.capabilities?.floor.process === true,
    )
    expect((await connections.list())[0]?.online).toBe(true)
  }, behavior)
}, 20_000)
