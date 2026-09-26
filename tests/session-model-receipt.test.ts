import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createModelCommandClient, createSystemCommandClient } from '@hbar/client'
import { CommandError } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { modelCommands } from '@hbar/contracts/commands/models'
import { Kernel, MemorySecrets, SettingsService } from '@hbar/kernel'

const path = (name: string) => [{ kind: 'field' as const, name }]
const open = (root: string) =>
  Kernel.create({ home: join(root, 'data'), workspace: root, demo: true, secrets: new MemorySecrets() })

test('Settings receipt reads only the captured actor and exact scope chain, survives restart, and never applies a missing write', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-model-receipt-service-'))
  let kernel = await open(root)
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Fixture workspace is missing')
    const session = await kernel.createSession(workspace.id, 'Receipt source')
    const other = await kernel.createSession(workspace.id, 'Other source')
    let settings = new SettingsService(kernel.storage)
    const scope = { kind: 'session' as const, targetId: session.id }
    const before = await settings.get(scope)
    expect(await settings.getReceipt(scope, 'actor-a', 'missing')).toBeNull()
    expect(await settings.get(scope)).toEqual(before)
    const receipt = await settings.apply({
      schemaVersion: 1,
      scope,
      actorId: 'actor-a',
      idempotencyKey: 'original',
      baselineRevisions: before.revisions,
      changes: [{ op: 'set', path: path('provider.model'), value: 'historical/model' }],
    })
    const latest = await settings.get(scope)
    await settings.apply({
      schemaVersion: 1,
      scope,
      actorId: 'actor-a',
      idempotencyKey: 'later',
      baselineRevisions: latest.revisions,
      changes: [{ op: 'set', path: path('provider.model'), value: 'current/model' }],
    })
    expect(await settings.getReceipt(scope, 'actor-a', 'original')).toEqual(receipt)
    expect(await settings.getReceipt(scope, 'actor-b', 'original')).toBeNull()
    expect(await settings.getReceipt({ kind: 'session', targetId: other.id }, 'actor-a', 'original')).toBeNull()
    expect(await settings.getReceipt({ kind: 'workspace', targetId: workspace.id }, 'actor-a', 'original')).toBeNull()
    expect(await settings.getReceipt({ kind: 'global' }, 'actor-a', 'original')).toBeNull()
    await expect(settings.getReceipt(scope, '', 'original')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await kernel.close()
    kernel = await open(root)
    settings = new SettingsService(kernel.storage)
    expect(await settings.getReceipt(scope, 'actor-a', 'original')).toEqual(receipt)
    expect((await settings.get(scope)).revisions[`settings:session:${session.id}`]).toBe(2)
    expect(await settings.getReceipt(scope, 'actor-a', 'not-dispatched')).toBeNull()
    expect((await settings.get(scope)).revisions[`settings:session:${session.id}`]).toBe(2)
  } finally {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('paired Host observes the original lost model reply, isolates actor/scope and returns historical values after later writes', async () => {
  const { startServer } = await import('../apps/host/src/server')
  const root = await mkdtemp(join(tmpdir(), 'hbar-model-receipt-host-'))
  const kernel = await open(root)
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let first: HbarClient | undefined
  let second: HbarClient | undefined
  try {
    await kernel.saveProvider({
      id: 'fixture',
      name: 'Local fixture',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: 'one',
      models: [
        { id: 'one', thinkingLevels: ['off', 'low', 'high'], defaultThinkingLevel: 'low' },
        { id: 'two', thinkingLevels: ['off', 'low', 'high'], defaultThinkingLevel: 'high' },
      ],
    })
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Fixture workspace is missing')
    const session = await kernel.createSession(workspace.id, 'Model receipt')
    const other = await kernel.createSession(workspace.id, 'Other target')
    host = await startServer(kernel, { port: 0 })
    first = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    second = new HbarClient(first.baseUrl)
    await first.pair(host.pairing.code, 'Receipt owner')
    const pairing = await createSystemCommandClient(first).execute('pairing.create', {})
    await second.pair(pairing.code, 'Other actor')
    const commands = createModelCommandClient(first)
    const otherActor = createModelCommandClient(second)
    const before = await commands.execute('session.getModel', { sessionId: session.id })
    const query = { sessionId: session.id, idempotencyKey: 'lost-model' }
    expect(await commands.execute('session.getModelReceipt', query)).toBeNull()
    expect(await commands.execute('session.getModel', { sessionId: session.id })).toEqual(before)
    const originalClient = first
    const lostReply = createModelCommandClient({
      async call(method, input) {
        await originalClient.call(method, input)
        throw new HbarError('DISCONNECTED', 'Fixture drops the accepted response')
      },
    })
    await expect(
      lostReply.execute(
        'session.setModel',
        { sessionId: session.id, modelId: 'fixture/one', baselineRevisions: before.revisions },
        { idempotencyKey: query.idempotencyKey },
      ),
    ).rejects.toBeInstanceOf(CommandError)
    const original = await commands.execute('session.getModelReceipt', query)
    expect(original).toMatchObject({
      sessionId: session.id,
      idempotencyKey: query.idempotencyKey,
      modelId: 'fixture/one',
      thinkingLevel: null,
      revision: 1,
    })
    expect(await otherActor.execute('session.getModelReceipt', query)).toBeNull()
    expect(await commands.execute('session.getModelReceipt', { ...query, sessionId: other.id })).toBeNull()
    const current = await commands.execute('session.getModel', { sessionId: session.id })
    const high = await commands.execute(
      'session.setThinkingLevel',
      { sessionId: session.id, thinkingLevel: 'high', baselineRevisions: current.revisions },
      { idempotencyKey: 'high' },
    )
    expect(
      await commands.execute('session.getModelReceipt', { sessionId: session.id, idempotencyKey: 'high' }),
    ).toMatchObject({ thinkingLevel: 'high', revision: 2 })
    await commands.execute(
      'session.setModel',
      { sessionId: session.id, modelId: 'fixture/two', baselineRevisions: high.revisions },
      { idempotencyKey: 'later-model' },
    )
    expect(await commands.execute('session.getModelReceipt', query)).toEqual(original)
    expect((await commands.execute('session.getModel', { sessionId: session.id })).modelId).toBe('fixture/two')
    const receiptReadMs: number[] = []
    for (let index = 0; index < 20; index++) {
      const start = performance.now()
      expect(await commands.execute('session.getModelReceipt', query)).toEqual(original)
      receiptReadMs.push(performance.now() - start)
    }
    receiptReadMs.sort((a, b) => a - b)
    console.info('Historical model receipt query: 20 authenticated loopback reads, no write replay', {
      p95Ms: receiptReadMs[18],
      maxMs: receiptReadMs[19],
    })
    expect(
      await commands.execute('session.getModelReceipt', { sessionId: session.id, idempotencyKey: 'never-received' }),
    ).toBeNull()
    expect(
      (await commands.execute('session.getModel', { sessionId: session.id })).revisions[
        `settings:session:${session.id}`
      ],
    ).toBe(3)
    expect(modelCommands['session.getModelReceipt'].metadata).toMatchObject({
      kind: 'query',
      stateEffect: 'none',
      surfaces: ['api'],
      visibility: 'internal',
    })
    expect((await kernel.snapshot(session.id)).runs).toEqual([])
  } finally {
    first?.disconnect()
    second?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
