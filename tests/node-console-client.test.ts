import { expect, test } from 'bun:test'
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
import { createNodeIdentity } from '@hbar/node-core'
import { NodeStateStorage } from '@hbar/storage/node-state'
import {
  createNodeConsoleClient,
  createNodeConsoleDeviceKey,
  pairNodeConsoleDevice,
  pairNodeConsoleDeviceWithSigner,
  type NodeConsoleFetch,
} from '@hbar/client/node-console'
import { NodeConsoleService, type NodeConsoleObservationPort } from '../apps/node/src/console-service'
import { startNodeControlServer } from '../apps/node/src/control-server'

function session(id: string, workspaceId: string) {
  return { id, workspaceId, title: id, archived: false, parentId: null, createdAt: 1, updatedAt: 1, seq: 1 }
}

function observation(): NodeConsoleObservationPort {
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
      case 'observe.sessions.list':
        nodeObservationMethods[method].input.parse(input)
        return nodeObservationMethods[method].output.parse({
          items: [
            { ...session('docs-session', 'docs-workspace'), rootId: 'docs' },
            { ...session('source-session', 'source-workspace'), rootId: 'source' },
          ],
          nextCursor: null,
        })
      case 'observe.sessions.snapshot': {
        const request = nodeObservationMethods[method].input.parse(input)
        return nodeObservationMethods[method].output.parse(
          nodeObservedSnapshotSchema.parse({
            session: { ...session(request.sessionId, 'docs-workspace'), rootId: 'docs' },
            messages: [],
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
        nodeObservationMethods[method].input.parse(input)
        return nodeObservationMethods[method].output.parse({ events: [], cursor: 1, reset: false })
    }
  }
  return { observe }
}

test('B-local client pairs its own Ed25519 device and enforces observer scope over HTTP', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hbar-node-console-client-'))
  const state = new NodeStateStorage(join(directory, 'node.sqlite'))
  const service = new NodeConsoleService(state, createNodeIdentity(), directory, undefined, undefined, observation())
  const control = await startNodeControlServer(directory, service)
  try {
    await state.call('ready', {})
    await state.call(
      'floor.set',
      nodeFloorSchema.parse({
        roots: [
          { rootId: 'docs', name: 'Documentation', path: join(directory, 'docs'), access: 'read' },
          { rootId: 'source', name: 'Source', path: join(directory, 'source'), access: 'write' },
        ],
      }),
    )
    const invite = (await service.invoke('node.pairing.create', {
      name: 'Browser observer',
      role: 'observer',
      roots: ['docs'],
    })) as { code: string }
    const paired = await pairNodeConsoleDevice({
      url: control.connection.url,
      code: invite.code,
      name: 'Browser observer',
    })
    expect(paired.device.role).toBe('observer')
    const client = createNodeConsoleClient({ url: control.connection.url, credentials: paired.credentials })
    const sessions = await client.call('observe.sessions.list', { limit: 50 })
    expect(sessions.items.map((item) => item.id)).toEqual(['docs-session'])
    expect(sessions.nextCursor).toBeNull()
    await expect(client.call('node.policy.get', {})).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const cliInvite = (await service.invoke('node.pairing.create', {
      name: 'CLI observer',
      role: 'observer',
      roots: ['docs'],
    })) as { code: string }
    const key = await createNodeConsoleDeviceKey()
    const cliPaired = await pairNodeConsoleDeviceWithSigner({
      url: control.connection.url,
      code: cliInvite.code,
      name: 'CLI observer',
      signer: key.signer,
    })
    expect(cliPaired.device.role).toBe('observer')
    const cliClient = createNodeConsoleClient({
      url: control.connection.url,
      credentials: {
        deviceId: cliPaired.device.deviceId,
        publicKey: key.signer.publicKey,
        signer: key.signer,
      },
    })
    expect((await cliClient.call('observe.sessions.list', { limit: 50 })).items).toHaveLength(1)
  } finally {
    await control.close()
    await state.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('B request FIFO rejects overflow, removes a cancelled queued request, and counts queue time against deadline', async () => {
  const key = await createNodeConsoleDeviceKey()
  let challengeCount = 0
  let entered!: () => void
  const firstChallengeEntered = new Promise<void>((resolve) => {
    entered = resolve
  })
  let releaseFirst: (response: Response) => void = () => {
    throw new Error('The first challenge request did not start')
  }
  const fetcher: NodeConsoleFetch = async () => {
    challengeCount++
    if (challengeCount === 1) {
      entered()
      return await new Promise<Response>((resolve) => {
        releaseFirst = resolve
      })
    }
    throw new Error('A queued request must not reach transport before the active request releases')
  }
  const client = createNodeConsoleClient({
    url: 'http://127.0.0.1:1/rpc',
    credentials: { deviceId: 'fixture-device', publicKey: key.signer.publicKey, signer: key.signer },
    fetch: fetcher,
    maxQueuedRequests: 1,
    requestTimeoutMs: 1_500,
  })
  const active = client.call('node.audit', { after: 0, limit: 10 })
  void active.catch(() => undefined)
  await firstChallengeEntered
  const queuedController = new AbortController()
  const queued = client.call('node.audit', { after: 0, limit: 10 }, { signal: queuedController.signal })
  await expect(client.call('node.audit', { after: 0, limit: 10 })).rejects.toMatchObject({ code: 'NODE_BUSY' })
  queuedController.abort(new DOMException('queued request cancelled', 'AbortError'))
  await expect(queued).rejects.toMatchObject({ name: 'AbortError' })
  expect(challengeCount).toBe(1)

  const deadlineCall = client.call('node.audit', { after: 0, limit: 10 })
  await expect(deadlineCall).rejects.toMatchObject({ name: 'TimeoutError' })
  releaseFirst(Response.json({ nonce: 'n'.repeat(43) }))
  expect(challengeCount).toBe(1)
})
