import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError, type Session } from '@hbar/contracts'
import { nodeFloorSchema, nodeCapabilitiesSchema, nodeObservationMethods, NODE_LIMITS } from '@hbar/contracts/node'
import { boundedNodeResult } from '@hbar/contracts/node-output'
import { Storage } from '@hbar/storage'
import { StorageNodeRegistryPort } from '@hbar/storage/node-registry'
import { NodeRegistryService, NodeObservationService, type NodeObservationSource } from '@hbar/node-link'
import { createNodeIdentity } from '@hbar/node-core'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'

async function fixture(
  run: (context: {
    storage: Storage
    registry: NodeRegistryService
    observer: NodeObservationService
    source: NodeObservationSource
    nodeId: string
    session: Session
    child: Session
    local: Session
    other: Session
  }) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-observation-'))
  const storage = new Storage(join(root, 'host.sqlite'))
  await storage.call('ready')
  const registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage))
  const register = async (name: string) => {
    const code = await registry.invite(name),
      identity = createNodeIdentity()
    const node = await registry.join(identity.publicKey, code.code, name)
    const {
      roots: _roots,
      protectedPaths: _paths,
      environmentAllowlist: _allowlist,
      ...floor
    } = nodeFloorSchema.parse({ roots: [] })
    await registry.touch(
      node.nodeId,
      nodeCapabilitiesSchema.parse({
        protocol: 1,
        nodeId: node.nodeId,
        platform: 'linux',
        evaluator: SANDBOX_EVALUATOR_FINGERPRINT,
        roots: [{ rootId: 'engine', name: 'Engine', nodePath: '/srv/' + name, access: 'write' }],
        sandbox: { backends: ['none'], filesystem: 'none', network: 'none' },
        floor,
      }),
    )
    return node.nodeId
  }
  try {
    const nodeId = await register('first'),
      otherId = await register('second')
    const a = await storage.call('createNodeWorkspace', { nodeId, rootId: 'engine' })
    const b = await storage.call('createNodeWorkspace', { nodeId: otherId, rootId: 'engine' })
    const c = await storage.call('createWorkspace', '/local', 'Local')
    const session = await storage.call('createSession', a.id, 'Parent'),
      child = await storage.call('createSession', a.id, 'Child', session.id)
    const other = await storage.call('createSession', b.id, 'Other'),
      local = await storage.call('createSession', c.id, 'Local')
    const source: NodeObservationSource = {
      node: (id) => storage.call('node', id),
      list: (nodeId, after, limit) => storage.call('nodeSessionsPage', { nodeId, limit, ...(after ? { after } : {}) }),
      session: (id) => storage.call('findSession', id),
      workspace: (id) => storage.call('findWorkspace', id),
      snapshot: (id, before, limit) => storage.call('snapshot', id, before, limit),
      events: (id, after, limit) => storage.call('events', id, after, limit),
    }
    await run({
      storage,
      registry,
      source,
      observer: new NodeObservationService(source),
      nodeId,
      session,
      child,
      local,
      other,
    })
  } finally {
    registry.dispose()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
}
async function codeOf(value: Promise<unknown>) {
  try {
    await value
    return null
  } catch (error) {
    return error instanceof HbarError ? error.code : 'unexpected'
  }
}
const signal = () => AbortSignal.timeout(5_000)

test('node observations are workspace-scoped, include bound children and cannot invoke operator methods', async () => {
  await fixture(async ({ observer, nodeId, session, child, local, other }) => {
    const page = nodeObservationMethods['observe.sessions.list'].output.parse(
      await observer.invoke(nodeId, 'observe.sessions.list', {}, signal()),
    )
    expect(page.items.map((item) => item.id).sort()).toEqual([session.id, child.id].sort())
    for (const sessionId of [local.id, other.id, 'missing']) {
      expect(await codeOf(observer.invoke(nodeId, 'observe.sessions.snapshot', { sessionId }, signal()))).toBe(
        'FORBIDDEN',
      )
      expect(
        await codeOf(observer.invoke(nodeId, 'observe.sessions.follow', { sessionId, afterSeq: 0 }, signal())),
      ).toBe('FORBIDDEN')
    }
    for (const method of [
      'session.message.send',
      'approval.resolve',
      'storage.call',
      'models.secret',
      'node.policy.set',
      'terminal.open',
    ])
      expect(await codeOf(observer.invoke(nodeId, method, {}, signal()))).toBe('METHOD_NOT_FOUND')
  })
})

test('message, run and event projections omit provider metadata, arbitrary tool details and unknown event payloads', async () => {
  await fixture(async ({ observer, storage, nodeId, session }) => {
    const run = await storage.call(
      'enqueue',
      session.id,
      'request',
      { text: 'hidden-run-input', images: [] },
      'private-model',
    )
    await storage.call(
      'commit',
      session.id,
      run.id,
      'assistant',
      [{ type: 'text', text: 'visible response' }],
      'assistant-message',
      { credential: 'provider-secret' },
    )
    await storage.call('commit', session.id, run.id, 'tool', [
      {
        type: 'tool_result',
        callId: 'call',
        name: 'shell',
        text: 'visible result',
        isError: false,
        details: { credential: 'tool-private-detail' },
      },
    ])
    await storage.call('append', session.id, 'custom.private', { credential: 'event-private-data' })
    const snapshot = nodeObservationMethods['observe.sessions.snapshot'].output.parse(
      await observer.invoke(nodeId, 'observe.sessions.snapshot', { sessionId: session.id }, signal()),
    )
    expect(snapshot.messages[0]?.content).toEqual([{ type: 'text', text: 'visible response' }])
    expect(snapshot.messages[1]?.content[0]).toMatchObject({ text: 'visible result' })
    expect(snapshot.runs[0]).toMatchObject({ id: run.id, status: 'queued' })
    const follow = nodeObservationMethods['observe.sessions.follow'].output.parse(
      await observer.invoke(nodeId, 'observe.sessions.follow', { sessionId: session.id, afterSeq: 0 }, signal()),
    )
    const encoded = JSON.stringify({ snapshot, follow })
    for (const privateValue of [
      'provider-secret',
      'tool-private-detail',
      'event-private-data',
      'hidden-run-input',
      'private-model',
      'providerData',
    ])
      expect(encoded.includes(privateValue)).toBe(false)
    expect(follow.events.find((event) => event.type === 'custom.private')?.data).toEqual({})
    expect(follow.cursor).toBe(snapshot.cursor)
    expect(follow.reset).toBe(false)
  })
})

test('moving a session or revoking its node during content loading fences the delayed response', async () => {
  await fixture(async ({ source, storage, registry, nodeId, session, local, child }) => {
    const moved = new NodeObservationService({
      ...source,
      snapshot: async (...args) => {
        const snapshot = await source.snapshot(...args)
        await storage.call('moveSession', session.id, local.workspaceId)
        return snapshot
      },
    })
    expect(await codeOf(moved.invoke(nodeId, 'observe.sessions.snapshot', { sessionId: session.id }, signal()))).toBe(
      'FORBIDDEN',
    )
    const revoked = new NodeObservationService({
      ...source,
      events: async (...args) => {
        const events = await source.events(...args)
        await registry.revoke(nodeId)
        return events
      },
    })
    expect(
      await codeOf(revoked.invoke(nodeId, 'observe.sessions.follow', { sessionId: child.id, afterSeq: 0 }, signal())),
    ).toBe('FORBIDDEN')
  })
})

test('observation pages clip long UTF-8 content explicitly and reject oversized pages before frame serialization', async () => {
  await fixture(async ({ observer, storage, nodeId, session }) => {
    for (let i = 0; i < 17; i++)
      await storage.call('commit', session.id, 'run', 'assistant', [{ type: 'text', text: '🙂'.repeat(20_000) }])
    expect(
      await codeOf(observer.invoke(nodeId, 'observe.sessions.snapshot', { sessionId: session.id }, signal())),
    ).toBe('NODE_QUERY_RESULT_LIMIT')
    const page = nodeObservationMethods['observe.sessions.snapshot'].output.parse(
      await observer.invoke(nodeId, 'observe.sessions.snapshot', { sessionId: session.id, limit: 1 }, signal()),
    )
    const block = page.messages[0]?.content[0]
    if (block?.type !== 'text') throw new Error('Missing projected text')
    expect(page.messages[0]?.truncated).toBe(true)
    expect(Buffer.byteLength(block.text)).toBe(NODE_LIMITS.outputBytes)
    expect(block.text).not.toContain('\ufffd')
  })
})

test('follow detects missing or expired cursors and refuses cross-session snapshot/event data', async () => {
  await fixture(async ({ observer, source, nodeId, session, local }) => {
    const future = nodeObservationMethods['observe.sessions.follow'].output.parse(
      await observer.invoke(nodeId, 'observe.sessions.follow', { sessionId: session.id, afterSeq: 999 }, signal()),
    )
    expect(future).toEqual({ events: [], cursor: session.seq, reset: true })
    const missing = new NodeObservationService({ ...source, events: async () => [] })
    expect(
      await missing.invoke(nodeId, 'observe.sessions.follow', { sessionId: session.id, afterSeq: 0 }, signal()),
    ).toEqual({ events: [], cursor: session.seq, reset: true })
    const cross = new NodeObservationService({
      ...source,
      snapshot: async (...args) => ({
        ...(await source.snapshot(...args)),
        streams: [
          { id: 'foreign', sessionId: local.id, runId: 'run', text: 'private', thinking: '', offset: 7, version: 1 },
        ],
      }),
    })
    expect(await codeOf(cross.invoke(nodeId, 'observe.sessions.snapshot', { sessionId: session.id }, signal()))).toBe(
      'NODE_OBSERVATION_INVALID',
    )
    const mixed = new NodeObservationService({ ...source, events: async () => source.events(local.id, 0, 1) })
    expect(
      await codeOf(mixed.invoke(nodeId, 'observe.sessions.follow', { sessionId: session.id, afterSeq: 0 }, signal())),
    ).toBe('NODE_OBSERVATION_INVALID')
  })
})

test('shared output budget rejects cycles, deep/class values and escaped strings as well as raw UTF-8 overflow', () => {
  const cyclic: { next?: unknown } = {}
  cyclic.next = cyclic
  for (const value of [
    cyclic,
    new AbortController(),
    { value: '\u0000'.repeat(200_000) },
    { values: new Array(70_000).fill(null) },
  ])
    expect(() => boundedNodeResult(value)).toThrow()
  expect(boundedNodeResult({ optional: undefined, text: 'small' })).toEqual({ text: 'small' })
})
