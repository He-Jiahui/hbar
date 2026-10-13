import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import { StorageNodeRegistryPort } from '@hbar/storage/node-registry'
import {
  NodeRegistryService,
  NodeRpcPeer,
  ConversationNodeHandshake,
  WorkspaceNodeHandshake,
  encodeNodeFrame,
  decodeNodeFrame,
  nodeWebSocketURL,
} from '@hbar/node-link'
import { createNodeIdentity, nodeFingerprint } from '@hbar/node-core'
import {
  nodeWorkspaceMethods,
  nodeObservationMethods,
  nodeChallengeSchema,
  nodeNotificationSchemas,
  NODE_LIMITS,
} from '@hbar/contracts/node'
import { nodeRpcFrameSchema } from '@hbar/contracts/node-wire'
import type { NodeIdentity } from '@hbar/node-core'
import { HbarError } from '@hbar/contracts'
import { z } from 'zod'

async function fixture(
  run: (registry: NodeRegistryService, identity: NodeIdentity, now: { value: number }) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-handshake-'))
  const storage = new Storage(join(root, 'host.sqlite'))
  let registry: NodeRegistryService | undefined
  try {
    await storage.call('ready')
    const now = { value: 100_000 }
    registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage), () => now.value)
    await run(registry, createNodeIdentity(), now)
  } finally {
    registry?.dispose()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
}
async function handshake(registry: NodeRegistryService, identity: NodeIdentity, code?: string) {
  const client = new WorkspaceNodeHandshake({
    identity,
    fingerprint: nodeFingerprint(registry.identity.publicKey),
    ...(code ? { code } : {}),
  })
  const server = new ConversationNodeHandshake(registry, 'source')
  const challenge = await server.receive(encodeNodeFrame(client.hello()))
  const proof = client.receive(encodeNodeFrame(challenge))
  if (!proof.reply) throw new Error('Client did not prove its identity')
  const joined = await server.receive(encodeNodeFrame(proof.reply))
  const result = client.receive(encodeNodeFrame(joined))
  return { client, server, result, proof, challenge }
}
async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
    return null
  } catch (error) {
    return error
  }
}
test('signed handshake binds both identities, challenges and direction; registered reconnection needs no bearer', async () => {
  await fixture(async (registry, identity) => {
    const invitation = await registry.invite('build-box')
    const initial = await handshake(registry, identity, invitation.code)
    expect(initial.result.joined).toMatchObject({ publicKey: registry.identity.publicKey, name: 'build-box' })
    expect(initial.server.node?.publicKey).toBe(identity.publicKey)
    const next = await handshake(registry, identity)
    expect(next.result.joined?.nodeId).toBe(initial.result.joined?.nodeId)
    expect(JSON.stringify(next.proof)).not.toContain('pairingCode')
    expect(JSON.stringify(next.proof)).not.toContain('privateKey')
  })
})

test('a fresh signed retry recovers a committed registration after its joined acknowledgement was lost', async () => {
  await fixture(async (registry, identity, now) => {
    const invitation = await registry.invite('ack-lost-box')
    const client = new WorkspaceNodeHandshake({
      identity,
      fingerprint: invitation.fingerprint,
      code: invitation.code,
    })
    const server = new ConversationNodeHandshake(registry, 'source')
    const challenge = await server.receive(encodeNodeFrame(client.hello()))
    const proof = client.receive(encodeNodeFrame(challenge))
    if (!proof.reply) throw new Error('Client did not prove its identity')
    await server.receive(encodeNodeFrame(proof.reply))
    const registered = server.node
    expect(registered?.name).toBe('ack-lost-box')

    // A committed the registration, but B never received the final frame or saved its pin.
    now.value = invitation.expiresAt + 1
    const retry = await handshake(registry, identity, invitation.code)
    expect(retry.result.joined?.nodeId).toBe(registered?.nodeId)
    expect(await registry.list()).toHaveLength(1)
    expect(await failure(handshake(registry, createNodeIdentity(), invitation.code))).toMatchObject({
      code: 'NODE_PAIRING_FAILED',
    })

    await registry.revoke('ack-lost-box')
    const replacement = await registry.invite('replacement-box')
    expect(await failure(handshake(registry, identity, replacement.code))).toMatchObject({ code: 'NODE_REVOKED' })
    expect((await handshake(registry, createNodeIdentity(), replacement.code)).result.joined?.name).toBe(
      'replacement-box',
    )
  })
})
test('the workspace refuses changed conversation identity before disclosing the invitation', async () => {
  await fixture(async (registry, identity) => {
    const invitation = await registry.invite('box')
    const client = new WorkspaceNodeHandshake({
      identity,
      code: invitation.code,
      fingerprint: nodeFingerprint(createNodeIdentity().publicKey),
    })
    const server = new ConversationNodeHandshake(registry, 'source')
    const challenge = await server.receive(encodeNodeFrame(client.hello()))
    expect(() => client.receive(encodeNodeFrame(challenge))).toThrow('pinned identity')
    expect(await registry.list()).toEqual([])
  })
})
test('a captured proof cannot register a different challenge or authenticate a revoked identity', async () => {
  await fixture(async (registry, identity) => {
    const invitation = await registry.invite('box')
    const joined = await handshake(registry, identity, invitation.code)
    const server = new ConversationNodeHandshake(registry, 'source')
    await server.receive(encodeNodeFrame(joined.client.hello()))
    await expect(server.receive(encodeNodeFrame(joined.proof.reply))).rejects.toMatchObject({
      code: 'NODE_AUTH_INVALID',
    })
    await registry.revoke('box')
    expect(await failure(handshake(registry, identity))).toMatchObject({ code: 'NODE_REVOKED' })
  })
})
test('handshake expiration and unregistered keys fail without any operator or storage method dispatch', async () => {
  await fixture(async (registry, identity, now) => {
    expect(await failure(handshake(registry, identity))).toMatchObject({ code: 'NODE_UNRECOGNIZED' })
    const expired = new ConversationNodeHandshake(registry, 'source', () => now.value)
    const client = new WorkspaceNodeHandshake({ identity, fingerprint: nodeFingerprint(registry.identity.publicKey) })
    now.value += 10_000
    await expect(expired.receive(encodeNodeFrame(client.hello()))).rejects.toMatchObject({ code: 'NODE_AUTH_EXPIRED' })
    const wrong = new ConversationNodeHandshake(registry, 'source')
    await expect(
      wrong.receive(JSON.stringify({ jsonrpc: '2.0', id: 'probe', method: 'storage.call', params: {} })),
    ).rejects.toBeInstanceOf(Error)
  })
})
test('non-loopback node URLs require WSS and cannot carry reusable credentials', () => {
  expect(nodeWebSocketURL('https://a.example:4317')).toBe('wss://a.example:4317/node')
  expect(nodeWebSocketURL('http://127.0.0.1:4317')).toBe('ws://127.0.0.1:4317/node')
  expect(() => nodeWebSocketURL('http://192.168.1.4:4317')).toThrow('WSS')
  expect(() => nodeWebSocketURL('https://user:token@a.example')).toThrow('credentials')
  expect(() => nodeWebSocketURL('https://a.example/node?token=secret')).toThrow('credentials')
  expect(() => nodeWebSocketURL('https://a.example/rpc')).toThrow('/node')
})
test('network JSON rejects callbacks, exotic objects, excessive bytes, depth and malformed frames', () => {
  expect(() => encodeNodeFrame({ callback() {} })).toThrow('plain JSON')
  expect(() => encodeNodeFrame({ signal: new AbortController().signal })).toThrow('plain JSON')
  expect(() => encodeNodeFrame({ data: 'x'.repeat(NODE_LIMITS.frameBytes + 1) })).toThrow('bound')
  let nested: unknown = {}
  for (let depth = 0; depth < 65; depth++) nested = { nested }
  expect(() => encodeNodeFrame(nested)).toThrow('structure')
  expect(() => decodeNodeFrame('[')).toThrow()
  expect(
    nodeRpcFrameSchema.safeParse({ jsonrpc: '2.0', id: '1', method: 'node.ping', params: {}, callback: true }).success,
  ).toBe(false)
})
test('network catalogs cannot dispatch operator, secret or opposite-direction methods', async () => {
  const frames: string[] = [],
    handled: string[] = [],
    closes: number[] = []
  const peer = new NodeRpcPeer({
    remote: nodeObservationMethods,
    local: nodeWorkspaceMethods,
    transport: {
      send: (text) => {
        frames.push(text)
        return true
      },
      close: (code) => {
        closes.push(code)
      },
    },
    handle: async (method, input) => {
      handled.push(method)
      return input
    },
  })
  for (const method of ['models.secret', 'storage.call', 'command.execute', 'observe.sessions.snapshot']) {
    await peer.receive(encodeNodeFrame({ jsonrpc: '2.0', id: method, method, params: {} }))
    const reply = nodeRpcFrameSchema.parse(decodeNodeFrame(frames.at(-1) ?? ''))
    expect(reply).toMatchObject({ error: { data: { code: 'METHOD_NOT_FOUND' } } })
  }
  expect(handled).toEqual([])
  expect(closes).toEqual([])
  peer.close()
})
test('a validated call correlates output while malformed responses and connection loss cannot imply unstarted effects', async () => {
  const frames: string[] = []
  const peer = new NodeRpcPeer({
    remote: nodeWorkspaceMethods,
    local: nodeObservationMethods,
    transport: {
      send: (text) => {
        frames.push(text)
        return true
      },
      close() {},
    },
    handle: async () => {
      throw new HbarError('METHOD_NOT_FOUND', 'No observations in this fixture')
    },
  })
  const nonce = nodeChallengeSchema.parse('a'.repeat(43))
  const response = peer.call('node.ping', { nonce })
  const request = nodeRpcFrameSchema.parse(decodeNodeFrame(frames[0] ?? ''))
  if (!('id' in request)) throw new Error('Missing request identity')
  await peer.receive(encodeNodeFrame({ jsonrpc: '2.0', id: request.id, result: { nonce } }))
  expect(await response).toEqual({ nonce })
  const unfinished = peer.call('exec.receipt', { operationId: 'run:call' }).catch((error: unknown) => error)
  peer.close()
  expect(await unfinished).toMatchObject({ code: 'NODE_RESULT_UNKNOWN' })
  await expect(peer.call('node.ping', { nonce })).rejects.toMatchObject({ code: 'NODE_OFFLINE' })
})
test('outgoing requests and incoming handlers remain bounded under saturation and abort', async () => {
  const peer = new NodeRpcPeer({
    remote: nodeWorkspaceMethods,
    local: {},
    transport: { send: () => true, close() {} },
    handle: async () => ({}),
  })
  const requests = Array.from({ length: 32 }, (_, index) =>
    peer.call('exec.receipt', { operationId: 'run:' + index }).catch((error: unknown) => error),
  )
  await expect(peer.call('exec.receipt', { operationId: 'run:overflow' })).rejects.toMatchObject({ code: 'NODE_BUSY' })
  peer.close()
  expect((await Promise.all(requests)).every((result) => result instanceof HbarError)).toBe(true)
  const closes: number[] = []
  const hold = { 'test.hold': { input: z.strictObject({}), output: z.strictObject({}) } }
  const handlers = new NodeRpcPeer({
    remote: {},
    local: hold,
    transport: {
      send: () => true,
      close: (code) => {
        closes.push(code)
      },
    },
    handle: async (_method, _input, signal) =>
      new Promise((resolve) => signal.addEventListener('abort', () => resolve({}), { once: true })),
  })
  const running = Array.from({ length: 33 }, (_, index) =>
    handlers.receive(encodeNodeFrame({ jsonrpc: '2.0', id: String(index), method: 'test.hold', params: {} })),
  )
  await Promise.all(running)
  expect(closes).toEqual([1013])
})
test('node notification direction is explicit and unsupported notifications close the receiving peer', async () => {
  const closes: number[] = []
  const peer = new NodeRpcPeer({
    remote: nodeObservationMethods,
    local: nodeWorkspaceMethods,
    outgoingNotifications: nodeNotificationSchemas,
    transport: {
      send: () => true,
      close: (code) => {
        closes.push(code)
      },
    },
    handle: async () => ({}),
  })
  const streamId = crypto.randomUUID()
  expect(() => peer.notify('exec.output', { operationId: 'run:call', streamId, seq: 1, text: 'hello' })).not.toThrow()
  await peer.receive(
    encodeNodeFrame({
      jsonrpc: '2.0',
      method: 'exec.output',
      params: { operationId: 'run:call', streamId, seq: 1, text: 'from wrong direction' },
    }),
  )
  expect(closes).toEqual([4002])
})
