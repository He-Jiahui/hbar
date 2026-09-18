import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createUsageCommandClient } from '@hbar/client'
import { emptyUsage, providerSchema, type Run, type SessionEvent } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { createUsageFact, describeUsageAttempt, UsageService, type UsageReadRow } from '@hbar/usage'
import { startServer } from '../apps/host/src/server.ts'

test('usage commands query session descendants, run scope, filters, and paged export', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-usage-commands-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]!
    const parent = await kernel.createSession(workspace.id, 'parent')
    const child = await kernel.createSession(workspace.id, 'child', parent.id)
    const parentRun = await kernel.submit(
      parent.id,
      'parent-usage',
      { text: 'parent usage', images: [] },
      'local-fixture',
    )
    await kernel.submit(child.id, 'child-usage', { text: 'child usage', images: [] }, 'local-fixture')
    await kernel.waitForIdle()
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'usage command actor')
    const commands = createUsageCommandClient(client)

    const catalog = await client.call('command.catalog', { category: 'monitoring.usage', limit: 20 })
    expect(catalog.items.map((item) => item.metadata.id)).toEqual(['usage.export', 'usage.query'])
    const direct = await commands.execute('usage.query', {
      scope: { kind: 'session', sessionId: parent.id, includeDescendants: false },
    })
    expect(direct.totals.attempts).toBe(1)
    expect(direct.totals.runs).toBe(1)
    expect(direct.cost).toMatchObject({ value: 0, availability: 'available', source: 'fixture' })
    expect(direct.cacheHitRate).toMatchObject({ value: null, availability: 'unavailable' })
    expect(direct.latency.firstText).toMatchObject({ availability: 'available', sampleCount: 1 })
    expect(direct.latency.firstThinking).toMatchObject({ availability: 'unavailable', sampleCount: 0 })

    const tree = await commands.execute('usage.query', {
      scope: { kind: 'session', sessionId: parent.id, includeDescendants: true },
      bucketMs: 1_000,
      maxBuckets: 10,
    })
    expect(tree.totals.attempts).toBe(2)
    expect(tree.models).toHaveLength(1)
    expect(tree.models[0]).toMatchObject({ providerId: 'local-fixture', modelId: 'fixture', attempts: 2 })
    expect(tree.series.length).toBeLessThanOrEqual(10)

    const run = await commands.execute('usage.query', { scope: { kind: 'run', runId: parentRun.id } })
    expect(run.totals).toMatchObject({ attempts: 1, runs: 1 })
    const filtered = await commands.execute('usage.query', {
      scope: { kind: 'workspace', workspaceId: workspace.id },
      filters: { providerId: 'missing-provider' },
    })
    expect(filtered.totals.attempts).toBe(0)
    expect(filtered.cost.availability).toBe('empty')

    const first = await commands.execute('usage.export', {
      scope: { kind: 'session', sessionId: parent.id, includeDescendants: true },
      limit: 1,
    })
    expect(first.items).toHaveLength(1)
    expect(first.nextCursor).toBeDefined()
    const second = await commands.execute('usage.export', {
      scope: { kind: 'session', sessionId: parent.id, includeDescendants: true },
      after: first.nextCursor,
      limit: 1,
    })
    expect(second.items).toHaveLength(1)
    expect(second.items[0]!.usageId).not.toBe(first.items[0]!.usageId)
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('usage aggregation deduplicates usage IDs and reports incomplete price coverage', async () => {
  const fixture = providerSchema.parse({
    id: 'fixture',
    name: 'Fixture',
    protocol: 'mock',
    baseUrl: 'http://127.0.0.1',
    model: 'fixture-model',
  })
  const unpriced = providerSchema.parse({
    id: 'unpriced',
    name: 'Unpriced',
    protocol: 'openai-responses',
    baseUrl: 'https://example.test',
    model: 'unpriced-model',
  })
  const run = (id: string, modelId: string): Run => ({
    id,
    sessionId: 'session',
    requestId: id,
    input: { text: id, images: [] },
    modelId,
    status: 'completed',
    createdAt: 1_000,
    startedAt: 1_100,
    endedAt: 2_000,
    error: null,
  })
  const event = (
    eventId: string,
    type: string,
    time: number,
    stepId: string,
    data: unknown,
    runId: string,
  ): SessionEvent => ({
    eventId,
    sessionId: 'session',
    seq: time,
    runId,
    stepId,
    type,
    data,
    time,
    version: 1,
  })
  const rows: UsageReadRow[] = []
  const add = (value: SessionEvent, valueRun: Run) =>
    rows.push({ event: value, workspaceId: 'workspace', parentSessionId: null, run: valueRun })
  const fixtureRun = run('run-fixture', 'fixture')
  const fixtureDescriptor = describeUsageAttempt('attempt-fixture', 'model', fixture)
  add(event('start-fixture', 'request.started', 1_100, 'attempt-fixture', fixtureDescriptor, fixtureRun.id), fixtureRun)
  const fixtureFact = createUsageFact({
    usage: { ...emptyUsage(), input: 100, output: 20 },
    runId: fixtureRun.id,
    attemptId: 'attempt-fixture',
    source: 'model',
    model: fixture,
  })
  add(event('usage-fixture', 'usage.recorded', 1_500, 'attempt-fixture', fixtureFact, fixtureRun.id), fixtureRun)
  add(event('usage-fixture-copy', 'usage.recorded', 1_501, 'attempt-fixture', fixtureFact, fixtureRun.id), fixtureRun)
  const unpricedRun = run('run-unpriced', 'unpriced')
  const unpricedFact = createUsageFact({
    usage: { ...emptyUsage(), input: 50, output: 10 },
    runId: unpricedRun.id,
    attemptId: 'attempt-unpriced',
    source: 'model',
    model: unpriced,
  })
  add(event('usage-unpriced', 'usage.recorded', 1_700, 'attempt-unpriced', unpricedFact, unpricedRun.id), unpricedRun)
  const service = new UsageService(
    {
      async read(input) {
        const items = rows.filter((row) => row.event.time >= input.from && row.event.time < input.to)
        return { items, hasMore: false }
      },
    },
    () => 2_000,
  )
  const result = await service.query({
    scope: { kind: 'global' },
    from: 1_000,
    to: 2_000,
    bucketMs: 1_000,
    maxBuckets: 10,
    maxSamples: 100,
    filters: {},
  })
  expect(result.totals).toMatchObject({ attempts: 2, runs: 2, input: 150, output: 30, billableTokens: 180 })
  expect(result.cost).toMatchObject({ value: null, availability: 'unavailable', reason: 'PRICE_COVERAGE_INCOMPLETE' })
})
