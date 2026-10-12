import { expect, test } from 'bun:test'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import {
  nodeFloorSchema,
  nodeObservationMethods,
  nodeObservedSnapshotSchema,
  type NodeObservationMethod,
} from '@hbar/contracts/node'
import {
  nodeConsoleChallengeSchema,
  nodeConsoleAuthenticatedRequestSchema,
  nodeConsolePairSigningText,
  nodeConsoleRequestSigningText,
} from '@hbar/contracts/node-console'
import { createNodeIdentity } from '@hbar/node-core'
import { NodeStateStorage } from '@hbar/storage/node-state'
import { NodeConsoleAuthenticator } from '../apps/node/src/console-auth'
import { NodeConsoleService, type NodeConsoleObservationPort } from '../apps/node/src/console-service'
import { startNodeControlServer } from '../apps/node/src/control-server'

function pairKey() {
  const pair = generateKeyPairSync('ed25519')
  const der = pair.publicKey.export({ format: 'der', type: 'spki' })
  return { privateKey: pair.privateKey, publicKey: Buffer.from(der).subarray(-32).toString('base64url') }
}
function post(url: string, value: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(value),
  })
}
function session(id: string, workspaceId: string) {
  return {
    id,
    workspaceId,
    title: id,
    archived: false,
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    seq: 1,
  }
}
function observation(): NodeConsoleObservationPort {
  // The three overloads preserve method-specific output types for this fixture.
  function observe(
    method: 'observe.sessions.list',
    input: z.input<(typeof nodeObservationMethods)['observe.sessions.list']['input']>,
    signal?: AbortSignal,
  ): Promise<z.output<(typeof nodeObservationMethods)['observe.sessions.list']['output']>>
  // eslint-disable-next-line no-redeclare
  function observe(
    method: 'observe.sessions.snapshot',
    input: z.input<(typeof nodeObservationMethods)['observe.sessions.snapshot']['input']>,
    signal?: AbortSignal,
  ): Promise<z.output<(typeof nodeObservationMethods)['observe.sessions.snapshot']['output']>>
  // eslint-disable-next-line no-redeclare
  function observe(
    method: 'observe.sessions.follow',
    input: z.input<(typeof nodeObservationMethods)['observe.sessions.follow']['input']>,
    signal?: AbortSignal,
  ): Promise<z.output<(typeof nodeObservationMethods)['observe.sessions.follow']['output']>>
  // eslint-disable-next-line no-redeclare
  async function observe(
    method: NodeObservationMethod,
    input: unknown,
  ): Promise<
    | z.output<(typeof nodeObservationMethods)['observe.sessions.list']['output']>
    | z.output<(typeof nodeObservationMethods)['observe.sessions.snapshot']['output']>
    | z.output<(typeof nodeObservationMethods)['observe.sessions.follow']['output']>
  > {
    switch (method) {
      case 'observe.sessions.list': {
        const request = nodeObservationMethods[method].input.parse(input)
        const sessions = [
          session('conversation-docs', 'workspace-docs'),
          session('conversation-engine', 'workspace-engine'),
          session('conversation-engine-2', 'workspace-engine'),
        ]
        const start = request.cursor ? sessions.findIndex((item) => item.id === request.cursor) + 1 : 0
        const items = sessions.slice(start, start + 1).map((item) => ({
          ...item,
          rootId: item.id.endsWith('docs') ? 'docs' : 'engine',
        }))
        return nodeObservationMethods[method].output.parse({
          items,
          nextCursor: start + items.length < sessions.length ? (items.at(-1)?.id ?? null) : null,
        })
      }
      case 'observe.sessions.snapshot': {
        const request = z.object({ sessionId: z.string() }).parse(input)
        const docs = request.sessionId.endsWith('docs')
        return nodeObservationMethods[method].output.parse(
          nodeObservedSnapshotSchema.parse({
            session: {
              ...session(request.sessionId, docs ? 'workspace-docs' : 'workspace-engine'),
              rootId: docs ? 'docs' : 'engine',
            },
            messages: [
              {
                id: 'message-' + request.sessionId,
                sessionId: request.sessionId,
                runId: 'run',
                role: 'assistant',
                content: [{ type: 'text', text: 'read-only conversation body' }],
                truncated: false,
                seq: 1,
                createdAt: 1,
              },
            ],
            runs: [],
            approvals: [],
            activityTruncated: false,
            userInputs: [],
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
            cursor: 1,
            hasOlder: false,
            streams: [],
          }),
        )
      }
      case 'observe.sessions.follow':
        return nodeObservationMethods[method].output.parse({ events: [], cursor: 1, reset: false })
    }
  }
  return { observe }
}
async function startFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'hbar-node-console-auth-'))
  const state = new NodeStateStorage(join(directory, 'node.sqlite'))
  await state.call('ready', {})
  await state.call(
    'floor.set',
    nodeFloorSchema.parse({
      roots: [
        { rootId: 'engine', name: 'Engine', path: join(directory, 'engine'), access: 'write' },
        { rootId: 'docs', name: 'Docs', path: join(directory, 'docs'), access: 'read' },
      ],
    }),
  )
  const service = new NodeConsoleService(state, createNodeIdentity(), directory, undefined, undefined, observation())
  const control = await startNodeControlServer(directory, service)
  return { directory, state, service, control, url: (path: string) => new URL(path, control.connection.url).href }
}
async function createInvite(service: NodeConsoleService, role: 'operator' | 'observer', roots: string[]) {
  return z
    .object({ inviteId: z.string(), code: z.string(), expiresAt: z.number() })
    .parse(await service.invoke('node.pairing.create', { name: 'Phone', role, roots }))
}
async function pair(url: string, code: string, role: 'operator' | 'observer') {
  const key = pairKey()
  const challengeResponse = await post(url, { purpose: 'pair' })
  const challengePayload: unknown = await challengeResponse.json()
  if (!challengeResponse.ok) throw new Error(JSON.stringify(challengePayload))
  const challenge = nodeConsoleChallengeSchema.parse(challengePayload)
  const base = { nonce: challenge.nonce, code, name: role + ' device', publicKey: key.publicKey }
  const signature = sign(null, Buffer.from(nodeConsolePairSigningText(base)), key.privateKey).toString('base64url')
  const response = await post(new URL('/pair', url).href, { ...base, signature })
  const payload: unknown = await response.json()
  return { key, response, payload }
}
async function authenticatedRequest(
  url: string,
  key: ReturnType<typeof pairKey>,
  deviceId: string,
  method: string,
  input: z.output<typeof nodeConsoleAuthenticatedRequestSchema>['input'],
) {
  const challengeResponse = await post(new URL('/challenge', url).href, { purpose: 'request', deviceId })
  const challengePayload: unknown = await challengeResponse.json()
  if (!challengeResponse.ok) throw new Error(JSON.stringify(challengePayload))
  const challenge = nodeConsoleChallengeSchema.parse(challengePayload)
  const base = { nonce: challenge.nonce, deviceId, method, input }
  const signature = sign(null, Buffer.from(nodeConsoleRequestSigningText(base)), key.privateKey).toString('base64url')
  const response = await post(new URL('/rpc', url).href, { ...base, signature })
  return { response, payload: (await response.json()) as unknown, base, signature }
}

test('B console challenges are one-use, source-bound, short-lived and capped', () => {
  const auth = new NodeConsoleAuthenticator()
  const issued = auth.issue({ purpose: 'pair' }, 'source', 10_000)
  expect(auth.consume(issued.nonce, 'pair', 'other', null, 10_001)).toBe(false)
  expect(auth.consume(issued.nonce, 'pair', 'source', null, 10_001)).toBe(false)
  const fresh = auth.issue({ purpose: 'pair' }, 'source', 10_000)
  expect(auth.consume(fresh.nonce, 'pair', 'source', null, fresh.expiresAt)).toBe(false)
  for (let index = 0; index < 12; index++) auth.issue({ purpose: 'pair' }, 'limited', 20_000)
  expect(() => auth.issue({ purpose: 'pair' }, 'limited', 20_000)).toThrow('rate limit')
  for (let index = 0; index < 120; index++)
    auth.issue({ purpose: 'request', deviceId: 'paired-device' }, 'limited', 20_000)
  expect(() => auth.issue({ purpose: 'request', deviceId: 'paired-device' }, 'limited', 20_000)).toThrow('rate limit')
})

test('B console pairs Ed25519 devices independently and enforces observer root read scope', async () => {
  const fixture = await startFixture()
  try {
    const invite = await createInvite(fixture.service, 'observer', ['engine'])
    const joined = await pair(fixture.url('/challenge'), invite.code, 'observer')
    expect(joined.response.ok).toBe(true)
    const paired = z
      .object({
        result: z.object({
          device: z.object({ deviceId: z.string(), role: z.literal('observer'), roots: z.array(z.string()) }),
        }),
      })
      .parse(joined.payload)
    const deviceId = paired.result.device.deviceId
    expect(paired.result.device.roots).toEqual(['engine'])

    const list = await authenticatedRequest(fixture.url('/rpc'), joined.key, deviceId, 'observe.sessions.list', {})
    expect(list.response.ok).toBe(true)
    expect(list.payload).toMatchObject({
      result: {
        items: [
          { id: 'conversation-engine', rootId: 'engine' },
          { id: 'conversation-engine-2', rootId: 'engine' },
        ],
        nextCursor: null,
      },
    })
    const firstPage = await authenticatedRequest(fixture.url('/rpc'), joined.key, deviceId, 'observe.sessions.list', {
      limit: 1,
    })
    const cursorPayload = z.object({ result: z.object({ nextCursor: z.string() }) }).parse(firstPage.payload)
    expect(cursorPayload.result.nextCursor).not.toMatch(/^conversation-/)
    const nextPage = await authenticatedRequest(fixture.url('/rpc'), joined.key, deviceId, 'observe.sessions.list', {
      limit: 1,
      cursor: cursorPayload.result.nextCursor,
    })
    expect(nextPage.payload).toMatchObject({
      result: { items: [{ id: 'conversation-engine-2', rootId: 'engine' }], nextCursor: null },
    })
    const docsInvite = await createInvite(fixture.service, 'observer', ['docs'])
    const docsDevice = await pair(fixture.url('/challenge'), docsInvite.code, 'observer')
    const docsPaired = z
      .object({ result: z.object({ device: z.object({ deviceId: z.string() }) }) })
      .parse(docsDevice.payload)
    const crossScopeCursor = await authenticatedRequest(
      fixture.url('/rpc'),
      docsDevice.key,
      docsPaired.result.device.deviceId,
      'observe.sessions.list',
      { cursor: cursorPayload.result.nextCursor },
    )
    expect(crossScopeCursor.response.status).toBe(403)
    const snapshot = await authenticatedRequest(
      fixture.url('/rpc'),
      joined.key,
      deviceId,
      'observe.sessions.snapshot',
      {
        sessionId: 'conversation-engine',
        limit: 1,
      },
    )
    expect(snapshot.response.ok).toBe(true)
    expect(JSON.stringify(snapshot.payload)).toContain('read-only conversation body')
    const deniedSnapshot = await authenticatedRequest(
      fixture.url('/rpc'),
      joined.key,
      deviceId,
      'observe.sessions.snapshot',
      {
        sessionId: 'conversation-docs',
        limit: 1,
      },
    )
    expect(deniedSnapshot.response.status).toBe(403)
    const deniedWrite = await authenticatedRequest(fixture.url('/rpc'), joined.key, deviceId, 'node.policy.set', {
      roots: [],
      process: false,
    })
    expect(deniedWrite.response.status).toBe(403)

    const replay = await post(fixture.url('/rpc'), { ...snapshot.base, signature: snapshot.signature })
    expect(replay.status).toBe(401)
    const tampered = await authenticatedRequest(fixture.url('/rpc'), joined.key, deviceId, 'observe.sessions.list', {
      limit: 1,
    })
    const nonceChallenge = nodeConsoleChallengeSchema.parse(
      await (await post(fixture.url('/challenge'), { purpose: 'request', deviceId })).json(),
    )
    const altered = { ...tampered.base, nonce: nonceChallenge.nonce, input: { limit: 2 } }
    const alteredResponse = await post(new URL('/rpc', fixture.url('/rpc')).href, {
      ...altered,
      signature: tampered.signature,
    })
    expect(alteredResponse.status).toBe(401)
  } finally {
    await fixture.control.close()
    await fixture.state.close()
    await rm(fixture.directory, { recursive: true, force: true })
  }
})

test('B console device revocation is immediate and non-loopback binding fails without TLS and hostname', async () => {
  const fixture = await startFixture()
  try {
    const invite = await createInvite(fixture.service, 'operator', [])
    const joined = await pair(fixture.url('/challenge'), invite.code, 'operator')
    const device = z.object({ result: z.object({ device: z.object({ deviceId: z.string() }) }) }).parse(joined.payload)
    const deviceId = device.result.device.deviceId
    const challenge = nodeConsoleChallengeSchema.parse(
      await (await post(fixture.url('/challenge'), { purpose: 'request', deviceId })).json(),
    )
    const base = { nonce: challenge.nonce, deviceId, method: 'node.devices.list', input: {} }
    const signature = sign(null, Buffer.from(nodeConsoleRequestSigningText(base)), joined.key.privateKey).toString(
      'base64url',
    )
    await fixture.service.invoke('node.device.revoke', { deviceId })
    const request = await post(fixture.url('/rpc'), { ...base, signature })
    expect(request.status).toBe(403)
    const revokedChallenge = await post(fixture.url('/challenge'), { purpose: 'request', deviceId })
    expect(revokedChallenge.status).toBe(403)
    await expect(startNodeControlServer(fixture.directory, fixture.service, '0.0.0.0:0')).rejects.toMatchObject({
      code: 'NODE_CONTROL_TLS_REQUIRED',
    })
  } finally {
    await fixture.control.close()
    await fixture.state.close()
    await rm(fixture.directory, { recursive: true, force: true })
  }
})

test('paired device signatures cover the request body', () => {
  const key = pairKey()
  const first = nodeConsoleRequestSigningText({ nonce: 'nonce', deviceId: 'device', method: 'node.status', input: {} })
  const changed = nodeConsoleRequestSigningText({
    nonce: 'nonce',
    deviceId: 'device',
    method: 'node.status',
    input: { changed: true },
  })
  expect(first).not.toBe(changed)
  expect(createHash('sha256').update(first).digest('hex')).not.toBe(createHash('sha256').update(changed).digest('hex'))
  expect(key.publicKey).toHaveLength(43)
})
