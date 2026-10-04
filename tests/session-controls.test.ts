import { expect, test } from 'bun:test'
import type { ExecuteOptions } from '@hbar/commands'
import {
  createAppRuntime,
  type BudgetCommandPort,
  type SessionTimelinePort,
  type SessionTimelineUpdate,
} from '@hbar/app-runtime'
import { createModelCommandClient } from '@hbar/client'
import { HbarError } from '@hbar/contracts'
import type { UsageQueryResult } from '@hbar/contracts/commands/usage'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const sessions = ['one', 'two'].map((id, index) => ({
  id,
  workspaceId: workspace.id,
  title: id,
  archived: false,
  parentId: null,
  createdAt: index + 2,
  updatedAt: index + 2,
  seq: 0,
}))

function model(sessionId: string, thinkingLevel: 'low' | 'high' = 'low') {
  return {
    sessionId,
    status: 'configured' as const,
    modelId: 'provider:model',
    model: {
      id: 'provider:model',
      providerId: 'provider',
      providerName: 'Provider',
      modelId: 'model',
      modelName: 'Model',
      contextWindow: 100_000,
      maxOutput: 10_000,
      imageInput: true,
      reasoning: true,
      thinkingLevels: ['low', 'high'] as const,
      defaultThinkingLevel: 'low' as const,
      hasKey: true,
    },
    thinkingLevel,
    revisions: { global: 1, workspace: 1, session: 1 },
    sources: { model: 'session', thinkingLevel: 'session' },
  }
}

function metric(value: number | null, unit: 'USD' | 'ratio' | 'tokens_per_second') {
  return {
    value,
    unit,
    availability: value === null ? ('unavailable' as const) : ('available' as const),
    reason: value === null ? 'NO_DATA' : null,
    source: 'test',
    estimated: false,
    sampleCount: value === null ? 0 : 1,
  }
}

function usage(sessionId: string, output: number): UsageQueryResult {
  return {
    accountingVersion: 1,
    scope: { kind: 'session', sessionId, includeDescendants: false },
    window: { from: 0, to: 60_000, bucketMs: 60_000 },
    observedAt: 60_000,
    gap: false,
    totals: { attempts: 1, runs: 1, input: 10, output, cacheRead: 2, cacheWrite: 0, billableTokens: 8 + output },
    cost: metric(0.01, 'USD'),
    cacheHitRate: metric(0.2, 'ratio'),
    rates: {
      input: metric(10, 'tokens_per_second'),
      output: metric(output, 'tokens_per_second'),
      total: metric(10 + output, 'tokens_per_second'),
    },
    latency: {
      firstProviderEvent: {
        p50: 10,
        p95: 10,
        unit: 'milliseconds',
        availability: 'available',
        reason: null,
        sampleCount: 1,
      },
      firstThinking: {
        p50: null,
        p95: null,
        unit: 'milliseconds',
        availability: 'empty',
        reason: 'NO_DATA',
        sampleCount: 0,
      },
      firstText: { p50: 20, p95: 20, unit: 'milliseconds', availability: 'available', reason: null, sampleCount: 1 },
      response: { p50: 30, p95: 30, unit: 'milliseconds', availability: 'available', reason: null, sampleCount: 1 },
    },
    models: [],
    series: [],
  }
}

function directory() {
  return {
    async execute(name: string, input: unknown) {
      if (name === 'session.get')
        return sessions.find((item) => item.id === (input as { sessionId: string }).sessionId) ?? null
      if (name === 'workspace.get') return workspace
      if (name === 'session.list') return { items: sessions, nextCursor: null }
      if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
      throw new Error(`Unsupported query: ${name}`)
    },
  }
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('state did not settle')
}

test('session controls load model, reliable usage and budget without letting stale selection win', async () => {
  let releaseOne!: () => void
  const holdOne = new Promise<void>((resolve) => {
    releaseOne = resolve
  })
  let usageRevision = 1
  const modelKeys: string[] = []
  const models = {
    async execute(name: string, input: unknown, options?: ExecuteOptions) {
      const value = input as { sessionId: string; thinkingLevel?: 'low' | 'high' }
      if (name === 'session.getModel') {
        if (value.sessionId === 'one') await holdOne
        return model(value.sessionId)
      }
      modelKeys.push(options?.idempotencyKey ?? '')
      return {
        ...model(value.sessionId, value.thinkingLevel ?? 'low'),
        commitId: crypto.randomUUID(),
        revision: 2,
      }
    },
  }
  const usagePort = {
    async execute(_name: string, input: unknown) {
      const sessionId = (input as { scope: { sessionId: string } }).scope.sessionId
      return usage(sessionId, usageRevision)
    },
  }
  const budget = {
    async execute(name: string, input: { sessionId: string }) {
      if (name !== 'session.getBudget') throw new Error('Unexpected budget command')
      return {
        sessionId: input.sessionId,
        budgetId: `budget-${input.sessionId}`,
        limit: 1_000,
        phase: 'active',
        usedTokens: 10,
        remainingTokens: 990,
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      }
    },
    async getReceipt() {
      return null
    },
  } as unknown as BudgetCommandPort
  let timelineUpdate: ((update: SessionTimelineUpdate) => void) | undefined
  const timeline: SessionTimelinePort = {
    async snapshot(sessionId) {
      return {
        session: sessions.find((item) => item.id === sessionId)!,
        messages: [],
        runs: [],
        approvals: [],
        userInputs: [],
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
        cursor: 0,
        hasOlder: false,
        streams: [],
      }
    },
    async watch(_sessionId, _cursor, listener) {
      timelineUpdate = listener
      return () => undefined
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'controls',
    hostId: 'host',
    directory: directory(),
    timeline,
    models,
    usage: usagePort,
    budget,
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: 'one' })
    await runtime.view.commands.execute('app.setSession', { sessionId: 'two' })
    await waitFor(() => runtime.view.state.controls.getSnapshot().status === 'ready')
    expect(runtime.view.state.controls.getSnapshot()).toMatchObject({
      sessionId: 'two',
      model: { sessionId: 'two', modelId: 'provider:model' },
      usage: { totals: { output: 1 } },
      budget: { sessionId: 'two', remainingTokens: 990 },
    })
    releaseOne()
    await Bun.sleep(5)
    expect(runtime.view.state.controls.getSnapshot().sessionId).toBe('two')

    usageRevision = 7
    timelineUpdate!({
      kind: 'event',
      event: {
        eventId: 'usage',
        sessionId: 'two',
        seq: 1,
        runId: 'run',
        stepId: null,
        type: 'usage.recorded',
        data: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0 },
        time: 2,
        version: 1,
      },
    })
    await waitFor(() => runtime.view.state.controls.getSnapshot().usage?.totals.output === 7)

    await runtime.view.commands.execute('session.setThinkingLevel', {
      sessionId: 'two',
      thinkingLevel: 'high',
      baselineRevisions: { global: 1, workspace: 1, session: 1 },
    })
    expect(modelKeys[0]).toBeString()
  } finally {
    runtime.dispose()
  }
})

test('model client maps lost setting writes to an unknown result', async () => {
  const client = createModelCommandClient({
    call: async () => {
      throw new HbarError('DISCONNECTED', 'lost')
    },
  })
  await expect(
    client.execute(
      'session.setThinkingLevel',
      { sessionId: 'session', thinkingLevel: 'high', baselineRevisions: {} },
      { idempotencyKey: 'thinking-key' },
    ),
  ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
})
