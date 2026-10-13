import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { NODE_LIMITS, nodeObservationMethods } from '@hbar/contracts/node'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import { Storage } from '@hbar/storage'
import { StorageNodeRegistryPort } from '@hbar/storage/node-registry'
import { ManagedProcess, RuntimeArtifactStore } from '@hbar/runtime'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import { nodeIdFromPublicKey, createNodeIdentity, WorkspaceNodeService, WorkspaceNodeProtocol } from '@hbar/node-core'
import { WorkspaceNodeClient } from '@hbar/node-link'
import { NodeStateStorage } from '@hbar/storage/node-state'
import { LocalExecution } from '@hbar/local-tools'
import { nodeFloorSchema } from '@hbar/contracts/node'
import { hostRuntimeBuildUnits } from '../apps/host/src/runtime-build'
import { RuntimeNodeLinkRelay, type RuntimeNodeLinkEndpoint } from '../apps/host/src/runtime-node-link-relay'
import { RUNTIME_NODE_LINK_CONTROLS } from '../apps/host/src/runtime-node-link-contract'

async function until(check: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Managed node link did not converge')
    await Bun.sleep(15)
  }
}
async function fixture(
  run: (context: {
    managed: ManagedProcess
    relay: RuntimeNodeLinkRelay
    storage: Storage
    path: string
    client: WorkspaceNodeClient
    node: WorkspaceNodeService
    url: string
    workspace: string
    active(): boolean
  }) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-managed-node-link-')),
    path = join(root, 'host.sqlite')
  const storage = new Storage(path)
  await storage.call('ready')
  const unit = hostRuntimeBuildUnits().find((unit) => unit.descriptor.id === 'node-link')
  if (!unit) throw new Error('Node link unit missing from source/package catalog')
  const artifacts = new RuntimeArtifactStore(join(root, 'artifacts'), process.cwd())
  const artifact = await artifacts.build(unit)
  expect(artifact.inputs.some((path) => path.endsWith('packages/kernel/src/index.ts'))).toBe(false)
  let endpoint: RuntimeNodeLinkEndpoint | null = null,
    active: RuntimeOwner | null = null
  const relay = new RuntimeNodeLinkRelay({
    current: () => {
      if (!endpoint || managed.snapshot().phase !== 'serving')
        throw new HbarError('NODE_LINK_UNAVAILABLE', 'Owner is not serving')
      return endpoint
    },
    authorized: (owner) => active?.incarnation === owner.incarnation,
    state: new StorageNodeRegistryPort(storage),
    observations: {
      node: (id) => storage.call('node', id),
      list: (nodeId, after, limit) => storage.call('nodeSessionsPage', { nodeId, limit, ...(after ? { after } : {}) }),
      session: (id) => storage.call('findSession', id),
      workspace: (id) => storage.call('findWorkspace', id),
      snapshot: (id, before, limit) => storage.call('snapshot', id, before, limit),
      events: (id, after, limit) => storage.call('events', id, after, limit),
    },
  })
  let detach: (() => void) | undefined
  const managed = new ManagedProcess({
    descriptor: unit.descriptor,
    artifactId: artifact.id,
    modulePath: await artifacts.modulePath(artifact.id),
    generation: 1,
    parent: { unitId: 'base', generation: 1, incarnation: 'base-node-link-test' },
    controlMethods: RUNTIME_NODE_LINK_CONTROLS,
    processTree: createRuntimeProcessTreePort(),
    jitter: 0,
    onPeer: (peer, owner) => {
      endpoint = { peer, owner }
      detach = relay.attach(peer, owner)
    },
    onActivating: (owner) => {
      active = owner
    },
    onFault: async (owner) => {
      if (active?.incarnation === owner.incarnation) active = null
      relay.exited(owner)
    },
    onExit: async (owner) => {
      relay.exited(owner)
      detach?.()
      detach = undefined
    },
  })
  const workspace = join(root, 'workspace'),
    data = join(root, 'node')
  await mkdir(workspace)
  await mkdir(data)
  const identity = createNodeIdentity(),
    state = new NodeStateStorage(join(data, 'node.sqlite'))
  await state.call('ready', {})
  await state.call(
    'floor.set',
    nodeFloorSchema.parse({ roots: [{ rootId: 'engine', name: 'Engine', path: workspace, access: 'write' }] }),
  )
  const node = await WorkspaceNodeService.open(
    nodeIdFromPublicKey(identity.publicKey),
    data,
    state,
    new LocalExecution([data]),
    {
      name: 'none',
      filesystem: false,
      network: false,
      processTree: true,
      exec: async () => {
        throw new Error('No raw process backend in link fixture')
      },
    },
  )
  const protocol = new WorkspaceNodeProtocol(node)
  const client = new WorkspaceNodeClient({
    identity,
    handle: (method, input, signal) => protocol.invoke(method, input, signal),
  })
  const server = Bun.serve<{ id: string }>({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request, server) {
      return new URL(request.url).pathname === '/node' && server.upgrade(request, { data: { id: crypto.randomUUID() } })
        ? undefined
        : new Response(null, { status: 404 })
    },
    websocket: {
      maxPayloadLength: NODE_LIMITS.frameBytes,
      open(socket) {
        void relay
          .open(socket.data.id, 'loopback', {
            send: (text) =>
              socket.readyState === 1 &&
              socket.getBufferedAmount() < 4 * NODE_LIMITS.frameBytes &&
              socket.send(text) !== 0,
            close: (code, reason) => socket.close(code, reason),
          })
          .catch(() => socket.close(4000, 'Owner unavailable'))
      },
      message: (socket, payload) => {
        void relay
          .receive(socket.data.id, typeof payload === 'string' ? payload : payload.toString())
          .catch(() => relay.closeConnection(socket.data.id))
      },
      close: (socket) => relay.closeConnection(socket.data.id),
    },
  })
  try {
    await managed.prepare()
    await run({
      managed,
      relay,
      storage,
      path,
      client,
      node,
      workspace,
      url: server.url.href,
      active: () => active !== null,
    })
  } finally {
    client.close()
    await server.stop(true)
    await protocol.dispose()
    await node.dispose()
    await state.close()
    await managed.dispose()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
}
async function failure(work: Promise<unknown>): Promise<unknown> {
  return work.catch((error: unknown) => error)
}

test('managed link prepares without identity writes and serves dedicated node/observation methods after activation', async () => {
  await fixture(async ({ managed, relay, path, storage, client, node, workspace, url }) => {
    const database = new Database(path, { readonly: true })
    try {
      expect(database.query('SELECT COUNT(*) AS count FROM node_conversation_identity').get()).toEqual({ count: 0 })
    } finally {
      database.close()
    }
    expect(await failure(relay.invite('too-early'))).toMatchObject({ code: 'NODE_LINK_UNAVAILABLE' })
    await managed.activate()
    const invite = await relay.invite('build-box')
    await client.connect({ url, fingerprint: invite.fingerprint, code: invite.code })
    await until(async () => (await relay.list()).items[0]?.online === true)
    await writeFile(join(workspace, 'file.txt'), 'B data')
    expect(
      await relay.call(node.id, 'fs.readBytes', {
        rootId: 'engine',
        path: 'file.txt',
        authority: { sessionId: 'session', runId: 'run', callId: 'read', sandbox: null, admission: { kind: 'allow' } },
      }),
    ).toMatchObject({ data: Buffer.from('B data').toString('base64') })
    const remote = await storage.call('createNodeWorkspace', { nodeId: node.id, rootId: 'engine' })
    const session = await storage.call('createSession', remote.id)
    await storage.call(
      'commit',
      session.id,
      'run',
      'assistant',
      [{ type: 'text', text: 'A conversation' }],
      'message',
      { secret: 'private-provider-metadata' },
    )
    const observed = await client.observe('observe.sessions.snapshot', { sessionId: session.id })
    expect(nodeObservationMethods['observe.sessions.snapshot'].output.parse(observed).messages[0]?.content).toEqual([
      { type: 'text', text: 'A conversation' },
    ])
    expect(JSON.stringify(observed)).not.toContain('private-provider-metadata')
    expect(
      await failure(managed.call('storage.call', {}, nodeObservationMethods['observe.sessions.list'].output)),
    ).toMatchObject({ code: 'IPC_METHOD_UNAVAILABLE' })
    await relay.revoke('build-box')
    await until(async () => !client.isOnline)
    expect((await relay.list()).items[0]).toMatchObject({ online: false })
  })
}, 45_000)

test('link owner crash closes its old sockets, recovers a fresh incarnation and keeps the pinned A identity', async () => {
  await fixture(async ({ managed, relay, client, node, url, active }) => {
    await managed.activate()
    const invite = await relay.invite('recovering-box')
    const joined = await client.connect({ url, fingerprint: invite.fingerprint, code: invite.code })
    await until(async () => (await relay.list()).items[0]?.online === true)
    const prior = managed.snapshot()
    if (prior.pid === null) throw new Error('Managed owner has no PID')
    process.kill(prior.pid)
    await until(async () => !client.isOnline)
    await until(
      async () =>
        managed.snapshot().incarnation !== prior.incarnation && managed.snapshot().phase === 'serving' && active(),
    )
    expect((await relay.list()).items[0]).toMatchObject({ online: false, nodeId: node.id })
    await client.connect({ url, fingerprint: invite.fingerprint, pinnedPublicKey: joined.publicKey })
    await until(async () => (await relay.list()).items[0]?.online === true)
    expect((await relay.list()).items[0]?.nodeId).toBe(joined.nodeId)
  })
}, 45_000)
