import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import { StorageNodeRegistryPort } from '@hbar/storage/node-registry'
import { NodeStateStorage } from '@hbar/storage/node-state'
import { LocalExecution } from '@hbar/local-tools'
import { NODE_LIMITS, nodeFloorSchema } from '@hbar/contracts/node'
import {
  WorkspaceNodeService,
  WorkspaceNodeProtocol,
  createNodeIdentity,
  nodeIdFromPublicKey,
  nodeProtectedPaths,
  type NodeExecutionBackend,
} from '@hbar/node-core'
import {
  NodeRegistryService,
  ConversationNodeConnections,
  WorkspaceNodeClient,
  type NodeExecutionPort,
} from '@hbar/node-link'

export interface NodeExecutionLinkFixture {
  readonly workspace: string
  readonly localWorkspace: string
  readonly homeA: string
  readonly homeB: string
  readonly node: WorkspaceNodeService
  readonly port: NodeExecutionPort
  readonly client: WorkspaceNodeClient
  readonly state: NodeStateStorage
  readonly registry: NodeRegistryService
  readonly requests: Array<{ method: string; input: unknown }>
}
export async function withNodeExecutionLink(
  run: (fixture: NodeExecutionLinkFixture) => Promise<void>,
  behavior: {
    backend?: NodeExecutionBackend
    transform?(method: string, input: unknown, output: unknown): unknown
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-execution-link-'))
  const homeA = join(root, 'a'),
    homeB = join(root, 'b')
  await mkdir(homeA)
  await mkdir(homeB)
  const localWorkspace = join(homeA, 'workspace'),
    workspacePath = join(homeB, 'workspace'),
    dataPath = join(homeB, 'data')
  await mkdir(localWorkspace)
  await mkdir(workspacePath)
  await mkdir(dataPath)
  const workspace = await realpath(workspacePath),
    data = await realpath(dataPath)
  const storage = new Storage(join(homeA, 'host.sqlite')),
    state = new NodeStateStorage(join(data, 'node.sqlite'))
  await storage.call('ready')
  await state.call('ready', {})
  await state.call(
    'floor.set',
    nodeFloorSchema.parse({ roots: [{ rootId: 'engine', name: 'engine', path: workspace, access: 'write' }] }),
  )
  const registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage)),
    identity = createNodeIdentity()
  const backend: NodeExecutionBackend = behavior.backend ?? {
    name: 'none',
    filesystem: false,
    network: false,
    processTree: true,
    exec: async () => {
      throw new Error('This fixture has no OS confinement backend')
    },
  }
  let current: WorkspaceNodeService | undefined
  const node = await WorkspaceNodeService.open(
    nodeIdFromPublicKey(identity.publicKey),
    data,
    state,
    new LocalExecution([data], undefined, undefined, {
      get: () => (current ? nodeProtectedPaths(current.policy, data) : [data]),
    }),
    backend,
  )
  current = node
  const protocol = new WorkspaceNodeProtocol(node)
  const connections = new ConversationNodeConnections(registry, {
    observe: async () => ({ items: [], nextCursor: null }),
    heartbeatMs: 1_000,
    heartbeatTimeoutMs: 2_000,
  })
  const server = Bun.serve<{ id: string }>({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request, host) =>
      new URL(request.url).pathname === '/node' && host.upgrade(request, { data: { id: crypto.randomUUID() } })
        ? undefined
        : new Response(null, { status: 404 }),
    websocket: {
      maxPayloadLength: NODE_LIMITS.frameBytes,
      open: (socket) =>
        connections.open(socket.data.id, 'loopback', {
          send: (text) =>
            socket.readyState === 1 &&
            socket.getBufferedAmount() <= 4 * NODE_LIMITS.frameBytes &&
            socket.send(text) !== 0,
          close: (code, reason) => socket.close(code, reason),
        }),
      message: (socket, text) => {
        void connections
          .receive(socket.data.id, typeof text === 'string' ? text : text.toString())
          .catch(() => connections.closeConnection(socket.data.id, 4002, 'Fixture frame failed'))
      },
      close: (socket) => connections.closeConnection(socket.data.id),
    },
  })
  const requests: NodeExecutionLinkFixture['requests'] = []
  const client = new WorkspaceNodeClient({
    identity,
    handle: async (method, input, signal) => {
      requests.push({ method, input: structuredClone(input) })
      const output = await protocol.invoke(method, input, signal)
      return behavior.transform ? behavior.transform(method, input, output) : output
    },
    onJoined: async (joined) => {
      await state.call('config.set', { key: 'link', value: { publicKey: joined.publicKey } })
      node.linkRestored()
    },
    onDisconnected: () => {
      protocol.resetTransfers()
      node.linkLost()
    },
  })
  const unlisten = node.onPolicyChanged(() => client.notify('node.rootsChanged', { revision: Date.now() }))
  try {
    const invitation = await registry.invite('execution-box')
    await client.connect({ url: server.url.href, fingerprint: invitation.fingerprint, code: invitation.code })
    const end = Date.now() + 10_000
    while (!(await connections.list()).some((value) => value.nodeId === node.id && value.online)) {
      if (Date.now() > end) throw new Error('Fixture workspace node did not become online')
      await Bun.sleep(10)
    }
    const port: NodeExecutionPort = {
      call: (nodeId, method, input, signal) => connections.call(nodeId, method, input, signal),
    }
    await run({ workspace, localWorkspace, homeA, homeB, node, port, client, state, registry, requests })
  } finally {
    unlisten()
    client.close()
    connections.dispose()
    protocol.dispose()
    await server.stop(true)
    await node.dispose()
    registry.dispose()
    await storage.close()
    await state.close()
    await rm(root, { recursive: true, force: true })
  }
}
