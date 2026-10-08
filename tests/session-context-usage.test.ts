import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets, SettingsService } from '@hbar/kernel'
import { createModelCommandClient, createSettingsCommandClient, HbarClient } from '@hbar/client'
import { providerSchema } from '@hbar/contracts'
import { COMPACTION_PERCENT_SETTING, sessionContextUsageSchema } from '@hbar/contracts/commands/models'
import { encodePath } from '@hbar/schema-core'
import { startServer } from '../apps/host/src/server'
import { compactionInputThreshold, describeContextUsage } from '../packages/kernel/src/context-usage'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})
const path = [{ kind: 'field' as const, name: COMPACTION_PERCENT_SETTING }]
const writeOptions = () => ({ idempotencyKey: crypto.randomUUID() })

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-context-usage-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const service = new SettingsService(kernel.storage)
  await kernel.saveProvider({
    id: 'context-fixture',
    name: 'Context fixture',
    protocol: 'mock',
    model: 'context-fixture',
    baseUrl: 'http://localhost',
    contextWindow: 24_000,
    maxOutput: 1_000,
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id, 'Context usage fixture')
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'Context usage test')
  return {
    root,
    kernel,
    service,
    workspace,
    session,
    client,
    models: createModelCommandClient(client),
    settings: createSettingsCommandClient(client),
  }
}

test('context policy is inclusive at the configured threshold and reserves output capacity', () => {
  const request = {
    system: 'x'.repeat(23_995),
    messages: [],
    model: providerSchema.parse({
      id: 'fixture',
      name: 'Fixture',
      protocol: 'mock',
      model: 'fixture',
      baseUrl: 'http://localhost',
      contextWindow: 10_000,
      maxOutput: 1_000,
    }),
  }
  expect(compactionInputThreshold(request, 80)).toBe(8_000)
  expect(compactionInputThreshold(request, 95)).toBe(9_000)
  const usage = describeContextUsage('session', request, 80)
  expect(usage).toMatchObject({ inputTokens: 7_999, contextWindow: 10_000, compactionTokens: 8_000, estimated: true })
  expect(describeContextUsage('session', { ...request, system: 'x'.repeat(23_998) }, 80).inputTokens).toBe(8_000)
  expect(compactionInputThreshold({ ...request, model: { ...request.model, maxOutput: 15_000 } }, 80)).toBe(0)
})

test('Host reports missing models without invented usage and uses global/workspace/session threshold inheritance', async () => {
  const { kernel, service, workspace, session, models, settings } = await fixture()
  expect(await models.execute('session.getContextUsage', { sessionId: session.id })).toMatchObject({
    status: 'no-model',
    inputTokens: null,
    contextWindow: null,
    compactionPercent: 80,
  })
  const initial = await models.execute('session.getModel', { sessionId: session.id })
  await models.execute(
    'session.setModel',
    { sessionId: session.id, modelId: 'context-fixture', baselineRevisions: initial.revisions },
    writeOptions(),
  )
  const before = await models.execute('session.getContextUsage', { sessionId: session.id })
  expect(before).toMatchObject({
    modelId: 'context-fixture',
    contextWindow: 24_000,
    compactionTokens: 19_200,
    outputReserve: 1_000,
  })
  expect(before.inputTokens).toBeGreaterThan(0)
  for (const [scope, percent] of [
    [{ kind: 'global' as const }, 75],
    [{ kind: 'workspace' as const, targetId: workspace.id }, 65],
    [{ kind: 'session' as const, targetId: session.id }, 55],
  ] as const) {
    const snapshot = await service.get(scope)
    await settings.execute(
      'settings.set',
      { schemaVersion: 1, scope, path, value: percent, baselineRevisions: snapshot.revisions },
      writeOptions(),
    )
    expect(await models.execute('session.getContextUsage', { sessionId: session.id })).toMatchObject({
      compactionPercent: percent,
      compactionTokens: (24_000 * percent) / 100,
    })
  }
  const latest = await service.get({ kind: 'session', targetId: session.id })
  for (const value of [29, 96, 50.5, null]) {
    const failure = await settings
      .execute(
        'settings.set',
        { schemaVersion: 1, scope: latest.scope, path, value, baselineRevisions: latest.revisions },
        writeOptions(),
      )
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(failure).toBeInstanceOf(Error)
  }
  await expect(
    settings.execute(
      'settings.set',
      { schemaVersion: 1, scope: latest.scope, path, value: 60, baselineRevisions: initial.revisions },
      writeOptions(),
    ),
  ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
  expect((await service.get(latest.scope)).resolution.reports[encodePath(path)]?.effectiveValue).toBe(55)
  const missing = await models.execute('session.getContextUsage', { sessionId: 'missing-session' }).then(
    () => null,
    (error: unknown) => error,
  )
  expect(missing).toBeInstanceOf(Error)
  const sibling = await kernel.createSession(workspace.id, 'Sibling')
  expect(await models.execute('session.getContextUsage', { sessionId: sibling.id })).toMatchObject({
    compactionPercent: 65,
    inputTokens: null,
  })
})

test('saved threshold controls actual automatic compaction and the meter drops while raw history and billing persist', async () => {
  const { kernel, service, session, models, settings } = await fixture()
  for (let i = 0; i < 16; i++)
    await kernel.storage.call('commit', session.id, 'seed-run', i % 2 === 0 ? 'user' : 'assistant', [
      { type: 'text', text: i < 4 ? 'Long history '.repeat(1_000) : `Retained message ${i}` },
    ])
  const initial = await models.execute('session.getModel', { sessionId: session.id })
  await models.execute(
    'session.setModel',
    { sessionId: session.id, modelId: 'context-fixture', baselineRevisions: initial.revisions },
    writeOptions(),
  )
  let current = await service.get({ kind: 'session', targetId: session.id })
  await settings.execute(
    'settings.set',
    { schemaVersion: 1, scope: current.scope, path, value: 95, baselineRevisions: current.revisions },
    writeOptions(),
  )
  const before = await models.execute('session.getContextUsage', { sessionId: session.id })
  expect(before.inputTokens).toBeGreaterThan(7_200)
  expect(before.inputTokens).toBeLessThan(23_000)
  expect(sessionContextUsageSchema.safeParse(before).success).toBe(true)
  await kernel.submit(session.id, 'keep-history', { text: 'Continue', images: [] }, 'context-fixture')
  await kernel.waitForIdle()
  expect((await kernel.storage.call('events', session.id, 0)).some((event) => event.type === 'context.compacted')).toBe(
    false,
  )
  current = await service.get(current.scope)
  await settings.execute(
    'settings.set',
    { schemaVersion: 1, scope: current.scope, path, value: 30, baselineRevisions: current.revisions },
    writeOptions(),
  )
  await kernel.submit(session.id, 'compact-now', { text: 'Continue', images: [] }, 'context-fixture')
  await kernel.waitForIdle()
  const events = await kernel.storage.call('events', session.id, 0)
  expect(events.some((event) => event.type === 'context.compacted')).toBe(true)
  const after = await models.execute('session.getContextUsage', { sessionId: session.id })
  expect(after.inputTokens).toBeLessThan(before.inputTokens!)
  expect(after.compactionPercent).toBe(30)
  expect((await kernel.snapshot(session.id)).messages.length).toBeGreaterThanOrEqual(18)
  expect(events.some((event) => event.type === 'usage.recorded')).toBe(true)
})
