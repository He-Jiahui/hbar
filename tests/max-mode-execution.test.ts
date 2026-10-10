import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Kernel, MemorySecrets, SettingsService } from '@hbar/kernel'
import { HbarClient, createModelCommandClient } from '@hbar/client'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { DriverInput, HarnessDriver, ModelRequest } from '@hbar/plugin-sdk'
import { PiDriver } from '@hbar/pi-driver'
import { MAX_MODE_SETTING } from '@hbar/contracts/commands/models'
import { startServer } from '../apps/host/src/server'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close()
})

async function fixture(onRun?: (input: DriverInput) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-max-mode-'))
  const summaries: ModelRequest[] = []
  const pi = new PiDriver()
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'MAX test driver',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      description: 'Exercise captured context modes without paid requests',
      provides: { driver: '1.0.0' },
      permissions: [],
    },
    apply(context) {
      provide<HarnessDriver>(context, 'driver', {
        run:
          onRun ??
          (async (input) => {
            await input.beforeRequest(input.request, 'initial')
            await input.commit('assistant', [{ type: 'text', text: 'Complete.' }])
          }),
        async summarize(request, key, signal) {
          summaries.push(request)
          return pi.summarize(request, key, signal)
        },
      })
    },
  })
  const options = {
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    profile: { replacements: { 'driver.pi': driver } },
  }
  const kernel = await Kernel.create(options)
  await kernel.changePlugin('budget.codex', true, { autoContinue: false })
  await kernel.saveProvider({
    id: 'tiered',
    name: 'Tiered fixture',
    protocol: 'mock',
    baseUrl: 'http://localhost',
    model: 'large',
    models: [
      {
        id: 'large',
        contextWindow: 4096,
        maxOutput: 1024,
        thinkingLevels: ['off', 'high', 'max'],
        defaultThinkingLevel: 'high',
        inputPrice: 2,
        outputPrice: 10,
        contextTiers: [{ id: 'long', contextWindow: 16_384, inputTokensAbove: 4096, inputPrice: 4, outputPrice: 15 }],
      },
      { id: 'small', contextWindow: 4096, maxOutput: 1024, thinkingLevels: ['off'] },
    ],
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id, 'MAX fixture')
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    const target = await realpath(root)
    if (
      dirname(target).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
      !basename(target).startsWith('hbar-max-mode-')
    )
      throw new Error('Refusing to remove an unowned MAX fixture')
    await rm(target, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'MAX fixture')
  const models = createModelCommandClient(client)
  const initial = await models.execute('session.getModel', { sessionId: session.id })
  await models.execute(
    'session.setModel',
    {
      sessionId: session.id,
      modelId: 'tiered/large',
      baselineRevisions: initial.revisions,
    },
    { idempotencyKey: 'initial-model' },
  )
  return { kernel, session, workspace, models, client, summaries, settings: new SettingsService(kernel.storage) }
}

async function setMax(settings: SettingsService, scope: Parameters<SettingsService['get']>[0], enabled: boolean) {
  const snapshot = await settings.get(scope)
  return settings.apply({
    schemaVersion: 1,
    scope,
    changes: [{ op: 'set', path: [{ kind: 'field', name: MAX_MODE_SETTING }], value: enabled }],
    baselineRevisions: snapshot.revisions,
    actorId: 'max-fixture',
    idempotencyKey: crypto.randomUUID(),
  })
}

test('MAX commands are layered, capability guarded, independent of thinking and recoverable by receipt', async () => {
  const { kernel, session, workspace, models, settings } = await fixture()
  let configuration = await models.execute('session.getModel', { sessionId: session.id })
  expect(configuration).toMatchObject({ maxMode: false, thinkingLevel: 'high' })
  expect(await models.execute('session.getContextUsage', { sessionId: session.id })).toMatchObject({
    contextWindow: 4096,
    contextMode: 'standard',
  })
  await setMax(settings, { kind: 'global' }, true)
  expect(await models.execute('session.getModel', { sessionId: session.id })).toMatchObject({
    maxMode: true,
    sources: { maxMode: 'settings:global' },
  })
  await setMax(settings, { kind: 'workspace', targetId: workspace.id }, false)
  configuration = await models.execute('session.getModel', { sessionId: session.id })
  const input = { sessionId: session.id, enabled: true, baselineRevisions: configuration.revisions }
  const enabled = await models.execute('session.setMaxMode', input, { idempotencyKey: 'enable-max' })
  expect(enabled).toMatchObject({ maxMode: true, thinkingLevel: 'high' })
  expect(await models.execute('session.setMaxMode', input, { idempotencyKey: 'enable-max' })).toEqual(enabled)
  expect(
    await models.execute('session.getModelReceipt', { sessionId: session.id, idempotencyKey: 'enable-max' }),
  ).toMatchObject({ maxMode: true, commitId: enabled.commitId })
  expect(await models.execute('session.getContextUsage', { sessionId: session.id })).toMatchObject({
    contextWindow: 16_384,
    contextMode: 'max',
  })
  await expect(
    models.execute('session.setMaxMode', { ...input, enabled: false }, { idempotencyKey: 'enable-max' }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  const small = await models.execute(
    'session.setModel',
    { sessionId: session.id, modelId: 'tiered/small', baselineRevisions: enabled.revisions },
    { idempotencyKey: 'small-model' },
  )
  expect(small.maxMode).toBe(false)
  await expect(
    models.execute(
      'session.setMaxMode',
      { sessionId: session.id, enabled: true, baselineRevisions: small.revisions },
      { idempotencyKey: 'unsupported-max' },
    ),
  ).rejects.toMatchObject({ code: 'MAX_MODE_UNSUPPORTED' })
  expect((await kernel.getContextUsage(session.id, 'tiered/small')).contextWindow).toBe(4096)
})

test('active and queued Runs retain the admitted mode while default changes affect subsequent Runs', async () => {
  let enter!: () => void
  let release!: () => void
  const started = new Promise<void>((resolve) => {
    enter = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const windows: number[] = []
  const { kernel, session, models, settings } = await fixture(async (input) => {
    const request = await input.beforeRequest(input.request, input.run.id)
    windows.push(request.model.contextWindow)
    if (windows.length === 1) {
      enter()
      await gate
    }
    await input.commit('assistant', [{ type: 'text', text: 'Complete.' }])
  })
  await setMax(settings, { kind: 'global' }, true)
  const first = await kernel.submit(session.id, 'first-max', { text: 'First', images: [] }, 'tiered/large')
  await started
  const queued = await kernel.submit(session.id, 'queued-max', { text: 'Queued', images: [] }, 'tiered/large')
  await setMax(settings, { kind: 'global' }, false)
  expect(await models.execute('session.getContextUsage', { sessionId: session.id })).toMatchObject({
    contextWindow: 16_384,
    contextMode: 'max',
  })
  const third = await kernel.submit(session.id, 'next-standard', { text: 'Standard', images: [] }, 'tiered/large')
  release()
  await kernel.waitForIdle()
  expect(windows).toEqual([16_384, 16_384, 4096])
  expect((await kernel.storage.call('run', first.id)).input.maxMode).toBe(true)
  expect((await kernel.storage.call('run', queued.id)).input.maxMode).toBe(true)
  expect((await kernel.storage.call('run', third.id)).input.maxMode).toBe(false)
  expect(await models.execute('session.getContextUsage', { sessionId: session.id })).toMatchObject({
    contextWindow: 4096,
    contextMode: 'standard',
  })
})

test.each([false, true])(
  'tool settlement uses the captured MAX=%s capacity and preserves raw messages',
  async (maxMode) => {
    const { kernel, session, summaries } = await fixture(async (input) => {
      await input.beforeRequest(input.request, 'tools')
      await input.commit('assistant', [
        { type: 'tool_call', callId: 'read-file', name: 'read', args: { path: 'fixture.txt' } },
      ])
      await input.commit('tool', [
        { type: 'tool_result', callId: 'read-file', name: 'read', text: 'x'.repeat(19_000), isError: false },
      ])
      await input.stepEnded('tools')
      await input.commit('assistant', [{ type: 'text', text: 'Complete.' }])
    })
    const run = await kernel.submit(
      session.id,
      `settled-${maxMode}`,
      { text: 'Read this file.', images: [], maxMode },
      'tiered/large',
    )
    await kernel.waitForIdle()
    expect((await kernel.storage.call('run', run.id)).status).toBe('completed')
    expect(summaries.length > 0).toBe(!maxMode)
    expect(summaries.every((request) => request.model.contextWindow === 4096)).toBe(true)
    expect((await kernel.snapshot(session.id)).messages).toHaveLength(4)
    expect((await kernel.storage.call('providers')).find((provider) => provider.id === 'tiered')?.contextWindow).toBe(
      4096,
    )
  },
)

test('request hooks cannot enable a larger, more expensive context without the captured MAX choice', async () => {
  const { kernel, session } = await fixture()
  kernel.hooks.on('model.request', (request) => ({
    ...request,
    model: { ...request.model, contextWindow: 16_384 },
  }))
  const blocked = await kernel.submit(
    session.id,
    'hook-expansion',
    { text: 'Standard mode', images: [] },
    'tiered/large',
  )
  await kernel.waitForIdle()
  const failed = await kernel.storage.call('run', blocked.id)
  expect(failed.status).toBe('failed')
  expect(failed.error).toContain('cannot expand')
  const allowed = await kernel.submit(
    session.id,
    'explicit-expansion',
    { text: 'MAX mode', images: [], maxMode: true },
    'tiered/large',
  )
  await kernel.waitForIdle()
  expect((await kernel.storage.call('run', allowed.id)).status).toBe('completed')
})
