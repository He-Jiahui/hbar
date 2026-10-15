import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  HbarClient,
  createModelCommandClient,
  createSettingsCommandClient,
  createSystemCommandClient,
} from '@hbar/client'
import { Kernel, MemorySecrets, SettingsService, createModelCommands } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-model-commands-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  await kernel.saveProvider({
    id: 'multi',
    name: 'Multi',
    protocol: 'mock',
    baseUrl: 'http://127.0.0.1',
    model: 'deep',
    models: [
      {
        id: 'fast',
        description: 'Quick revisions and short questions',
        thinkingLevels: ['off', 'low'],
        defaultThinkingLevel: 'low',
      },
      { id: 'deep', thinkingLevels: ['off', 'medium', 'high'], defaultThinkingLevel: 'high' },
    ],
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id, 'model commands')
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'model command test')
  return { client, kernel, session, host }
}

const field = (name: string) => [{ kind: 'field' as const, name }]

test('model commands use layered settings with capability validation and atomic switching', async () => {
  const { client, kernel, session } = await fixture()
  const commands = createModelCommandClient(client)
  const settings = createSettingsCommandClient(client)
  const catalog = await client.call('command.catalog', { category: 'model.configuration', limit: 20 })
  expect(catalog.items.map((item) => item.metadata.id)).toEqual([
    'model.list',
    'session.getContextUsage',
    'session.getModel',
    'session.setMaxMode',
    'session.setModel',
    'session.setThinkingLevel',
  ])
  const models = await commands.execute('model.list', {})
  expect(models.find((model) => model.id === 'multi/fast')).toMatchObject({ hasKey: false, canExecute: true })
  expect(models.find((model) => model.id === 'multi/fast')).toMatchObject({
    providerName: 'Multi',
    description: 'Quick revisions and short questions',
    thinkingLevels: ['off', 'low'],
    defaultThinkingLevel: 'low',
  })
  expect(models.find((model) => model.id === 'multi/deep')).toMatchObject({
    thinkingLevels: ['off', 'medium', 'high'],
    defaultThinkingLevel: 'high',
  })
  expect(models.find((model) => model.id === 'multi/deep')?.description).toBeUndefined()

  const unset = await commands.execute('session.getModel', { sessionId: session.id })
  expect(unset).toMatchObject({ status: 'unset', modelId: null, model: null, thinkingLevel: null })
  await expect(
    commands.execute(
      'session.setThinkingLevel',
      { sessionId: session.id, thinkingLevel: 'high', baselineRevisions: unset.revisions },
      { idempotencyKey: 'thinking-without-model' },
    ),
  ).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
  await expect(
    settings.execute(
      'settings.set',
      {
        schemaVersion: 1,
        scope: { kind: 'session', targetId: session.id },
        path: field('provider.model'),
        value: 'missing/model',
        baselineRevisions: unset.revisions,
      },
      { idempotencyKey: 'invalid-generic-model' },
    ),
  ).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })

  const setFastInput = {
    sessionId: session.id,
    modelId: 'multi/fast',
    baselineRevisions: unset.revisions,
  }
  const fast = await commands.execute('session.setModel', setFastInput, { idempotencyKey: 'set-fast' })
  expect(fast).toMatchObject({
    status: 'configured',
    modelId: 'multi/fast',
    thinkingLevel: 'low',
    revision: 1,
  })
  expect(await commands.execute('session.setModel', setFastInput, { idempotencyKey: 'set-fast' })).toEqual(fast)
  await expect(
    commands.execute('session.setModel', { ...setFastInput, modelId: 'multi/deep' }, { idempotencyKey: 'set-fast' }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })

  const low = await commands.execute(
    'session.setThinkingLevel',
    { sessionId: session.id, thinkingLevel: 'low', baselineRevisions: fast.revisions },
    { idempotencyKey: 'set-low' },
  )
  expect(low).toMatchObject({ modelId: 'multi/fast', thinkingLevel: 'low', revision: 2 })
  const deep = await commands.execute(
    'session.setModel',
    { sessionId: session.id, modelId: 'multi/deep', baselineRevisions: low.revisions },
    { idempotencyKey: 'set-deep' },
  )
  expect(deep).toMatchObject({ modelId: 'multi/deep', thinkingLevel: 'high', revision: 3 })
  expect(await commands.execute('session.getModel', { sessionId: session.id })).toMatchObject({
    modelId: 'multi/deep',
    thinkingLevel: 'high',
    sources: {
      model: `settings:session:${session.id}`,
      thinkingLevel: `settings:session:${session.id}`,
    },
  })

  await kernel.saveProvider({
    id: 'multi',
    name: 'Multi',
    protocol: 'mock',
    baseUrl: 'http://127.0.0.1',
    model: 'deep',
    models: [
      { id: 'fast', thinkingLevels: ['off', 'low'], defaultThinkingLevel: 'low' },
      {
        id: 'deep',
        visible: false,
        thinkingLevels: ['off', 'medium', 'high'],
        defaultThinkingLevel: 'high',
      },
    ],
  })
  expect((await commands.execute('model.list', {})).some((model) => model.id === 'multi/deep')).toBeFalse()
  const hidden = await commands.execute('session.getModel', { sessionId: session.id })
  expect(hidden).toMatchObject({ status: 'configured', modelId: 'multi/deep', thinkingLevel: 'high' })
  expect(
    await commands.execute(
      'session.setThinkingLevel',
      { sessionId: session.id, thinkingLevel: 'medium', baselineRevisions: hidden.revisions },
      { idempotencyKey: 'set-hidden-thinking' },
    ),
  ).toMatchObject({ status: 'configured', modelId: 'multi/deep', thinkingLevel: 'medium' })
  await expect(
    commands.execute(
      'session.setModel',
      { sessionId: session.id, modelId: 'multi/deep', baselineRevisions: hidden.revisions },
      { idempotencyKey: 'select-hidden-model' },
    ),
  ).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
})

test('model service catalog preserves internal visibility and registry filters', async () => {
  const { kernel } = await fixture()
  const service = createModelCommands(kernel, new SettingsService(kernel.storage))
  try {
    const ids = (filter: Parameters<typeof service.list>[0] = {}) =>
      service.list(filter).items.map((item) => item.metadata.id)
    expect(ids()).not.toContain('session.getModelReceipt')
    expect(ids({ includeInternal: true })).toContain('session.getModelReceipt')
    expect(ids({ includeInternal: false })).not.toContain('session.getModelReceipt')
    expect(ids({ includeInternal: true, category: 'model' })).toContain('session.getModelReceipt')
    expect(ids({ includeInternal: true, category: 'settings' })).toEqual([])
    expect(ids({ includeInternal: true, surface: 'api' })).toContain('session.getModelReceipt')
    expect(ids({ includeInternal: true, surface: 'palette' })).not.toContain('session.getModelReceipt')
    const first = service.list({ includeInternal: true, category: 'model.configuration', surface: 'api', limit: 2 })
    expect(first.items.map((item) => item.metadata.id)).toEqual(['model.list', 'session.getContextUsage'])
    expect(first.nextCursor).toBe('session.getContextUsage')
    const second = service.list({
      includeInternal: true,
      category: 'model.configuration',
      surface: 'api',
      after: 'session.getContextUsage',
      limit: 2,
    })
    expect(second.items.map((item) => item.metadata.id)).toEqual(['session.getModel', 'session.getModelReceipt'])
    expect(second.nextCursor).toBe('session.getModelReceipt')
    expect(second.revision).toBe(first.revision)
    expect(ids({ includeInternal: true, after: 'session.setThinkingLevel' })).toEqual([])
    expect(() => service.list({ limit: 0 })).toThrow()
    expect(() => service.list({ limit: 501 })).toThrow()
  } finally {
    service.dispose()
  }
})

test('authenticated model receipt reads recover historical writes without exposing another actor receipt', async () => {
  const { client, session, host } = await fixture()
  const commands = createModelCommandClient(client)
  const catalog = await client.call('command.catalog', { category: 'model.configuration', limit: 20 })
  expect(catalog.items.map((item) => item.metadata.id)).not.toContain('session.getModelReceipt')
  expect(
    await commands.execute('session.getModelReceipt', {
      sessionId: session.id,
      idempotencyKey: 'missing-receipt',
    }),
  ).toBeNull()
  const initial = await commands.execute('session.getModel', { sessionId: session.id })
  const first = await commands.execute(
    'session.setModel',
    {
      sessionId: session.id,
      modelId: 'multi/fast',
      baselineRevisions: initial.revisions,
    },
    { idempotencyKey: 'receipt-fast' },
  )
  const receipt = await commands.execute('session.getModelReceipt', {
    sessionId: session.id,
    idempotencyKey: 'receipt-fast',
  })
  expect(receipt).toMatchObject({
    sessionId: session.id,
    idempotencyKey: 'receipt-fast',
    commitId: first.commitId,
    revision: first.revision,
    modelId: 'multi/fast',
    thinkingLevel: null,
    maxMode: false,
    revisions: first.revisions,
  })
  // Configuration resolves the model default; the original receipt retains the unset override.
  expect(first).toMatchObject({ modelId: 'multi/fast', thinkingLevel: 'low' })
  const explicitThinking = await commands.execute(
    'session.setThinkingLevel',
    {
      sessionId: session.id,
      thinkingLevel: 'low',
      baselineRevisions: first.revisions,
    },
    { idempotencyKey: 'receipt-explicit-thinking' },
  )
  expect(
    await commands.execute('session.getModelReceipt', {
      sessionId: session.id,
      idempotencyKey: 'receipt-explicit-thinking',
    }),
  ).toMatchObject({
    sessionId: session.id,
    idempotencyKey: 'receipt-explicit-thinking',
    commitId: explicitThinking.commitId,
    revision: explicitThinking.revision,
    modelId: 'multi/fast',
    thinkingLevel: 'low',
    maxMode: false,
    revisions: explicitThinking.revisions,
  })
  const second = await commands.execute(
    'session.setModel',
    {
      sessionId: session.id,
      modelId: 'multi/deep',
      baselineRevisions: explicitThinking.revisions,
    },
    { idempotencyKey: 'receipt-deep' },
  )
  expect(
    await commands.execute('session.getModelReceipt', {
      sessionId: session.id,
      idempotencyKey: 'receipt-fast',
    }),
  ).toEqual(receipt)
  expect(await commands.execute('session.getModel', { sessionId: session.id })).toMatchObject({
    modelId: 'multi/deep',
    revisions: second.revisions,
  })
  const other = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  try {
    const pairing = await createSystemCommandClient(client).execute('pairing.create', {})
    await other.pair(pairing.code, 'other model receipt actor')
    expect(
      await createModelCommandClient(other).execute('session.getModelReceipt', {
        sessionId: session.id,
        idempotencyKey: 'receipt-fast',
      }),
    ).toBeNull()
  } finally {
    other.disconnect()
  }
})
