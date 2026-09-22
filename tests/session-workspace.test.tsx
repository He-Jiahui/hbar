import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRuntimeProvider, HbarSessionWorkspace } from '@hbar/app-react'
import { createAppRuntime, type BudgetCommandPort, type SessionTimelinePort } from '@hbar/app-runtime'
import type { UsageQueryResult } from '@hbar/contracts/commands/usage'
import { getShellCopy } from '../apps/web/src/shell-copy'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const session = {
  id: 'session',
  workspaceId: workspace.id,
  title: 'Rich session',
  archived: false,
  parentId: null,
  createdAt: 2,
  updatedAt: 3,
  seq: 4,
}

function usage(): UsageQueryResult {
  const metric = (value: number, unit: 'USD' | 'ratio' | 'tokens_per_second') => ({
    value,
    unit,
    availability: 'available' as const,
    reason: null,
    source: 'test',
    estimated: false,
    sampleCount: 1,
  })
  const latency = {
    p50: 10,
    p95: 10,
    unit: 'milliseconds' as const,
    availability: 'available' as const,
    reason: null,
    sampleCount: 1,
  }
  return {
    accountingVersion: 1,
    scope: { kind: 'session', sessionId: session.id, includeDescendants: false },
    window: { from: 0, to: 60_000, bucketMs: 60_000 },
    observedAt: 60_000,
    gap: false,
    totals: { attempts: 1, runs: 1, input: 10, output: 10, cacheRead: 2, cacheWrite: 0, billableTokens: 18 },
    cost: metric(0.01, 'USD'),
    cacheHitRate: metric(0.2, 'ratio'),
    rates: {
      input: metric(2, 'tokens_per_second'),
      output: metric(3, 'tokens_per_second'),
      total: metric(5, 'tokens_per_second'),
    },
    latency: { firstProviderEvent: latency, firstThinking: latency, firstText: latency, response: latency },
    models: [],
    series: [
      {
        start: 0,
        end: 60_000,
        attempts: 1,
        runs: 1,
        input: 10,
        output: 10,
        cacheRead: 2,
        cacheWrite: 0,
        billableTokens: 18,
        cost: metric(0.01, 'USD'),
      },
    ],
  }
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('state did not settle')
}

test('session workspace renders sanitized timeline, command-owned forms and reliable usage from host content', async () => {
  const timeline: SessionTimelinePort = {
    async snapshot() {
      return {
        session,
        messages: [
          {
            id: 'message',
            sessionId: session.id,
            runId: 'run',
            role: 'assistant' as const,
            content: [{ type: 'text' as const, text: '**safe** <script>unsafe()</script>' }],
            seq: 1,
            createdAt: 1,
          },
        ],
        runs: [
          {
            id: 'run',
            sessionId: session.id,
            requestId: 'request',
            input: { text: 'hello', images: [], files: [] },
            modelId: 'provider:model',
            status: 'completed' as const,
            createdAt: 1,
            startedAt: 1,
            endedAt: 2,
            error: null,
          },
        ],
        approvals: [
          {
            id: 'approval',
            sessionId: session.id,
            runId: 'run',
            callId: 'call',
            tool: 'write_file',
            args: { path: 'notes.txt' },
            status: 'pending' as const,
            createdAt: 2,
          },
        ],
        userInputs: [
          {
            requestId: 'questionnaire',
            sessionId: session.id,
            runId: 'run',
            callId: 'question',
            questions: [
              {
                id: 'continue',
                header: 'Choice',
                question: 'Should we continue?',
                options: [{ label: 'Yes', description: 'Continue the run' }],
                isOther: true,
                isSecret: false,
              },
            ],
            isBlocking: true,
          },
        ],
        usage: { input: 10, output: 10, cacheRead: 2, cacheWrite: 0, cost: 0.01 },
        cursor: 4,
        hasOlder: true,
        streams: [],
      }
    },
    async plan() {
      return {
        sessionId: session.id,
        revision: 1,
        turnId: 'run',
        explanation: 'Keep the plan attached to its run.',
        plan: [
          { step: 'Inspect the change', status: 'completed' as const },
          { step: 'Run verification', status: 'in_progress' as const },
        ],
        updatedAt: 4,
      }
    },
    async watch() {
      return () => undefined
    },
  }
  const directory = {
    async execute(name: string) {
      if (name === 'session.get') return session
      if (name === 'workspace.get') return workspace
      if (name === 'session.list') return { items: [session], nextCursor: null }
      if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
      throw new Error(`Unsupported query: ${name}`)
    },
  }
  const budget = {
    async execute() {
      return {
        sessionId: session.id,
        budgetId: 'budget',
        limit: 100,
        phase: 'active',
        usedTokens: 20,
        remainingTokens: 80,
        revision: 1,
        createdAt: 1,
        updatedAt: 2,
      }
    },
    async getReceipt() {
      return null
    },
  } as unknown as BudgetCommandPort
  const runtime = createAppRuntime({
    instanceId: 'session-workspace',
    hostId: 'host',
    directory,
    timeline,
    budget,
    models: {
      async execute() {
        return {
          sessionId: session.id,
          status: 'configured',
          modelId: 'provider:model',
          model: {
            id: 'provider:model',
            providerId: 'provider',
            providerName: 'Provider',
            modelId: 'model',
            modelName: 'Fixture Model',
            contextWindow: 100_000,
            maxOutput: 10_000,
            imageInput: true,
            reasoning: true,
            thinkingLevels: ['low'],
            defaultThinkingLevel: 'low',
            hasKey: true,
          },
          thinkingLevel: 'low',
          revisions: {},
          sources: { model: 'session', thinkingLevel: 'session' },
        }
      },
    },
    usage: {
      async execute() {
        return usage()
      },
    },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    await waitFor(
      () =>
        runtime.view.state.timeline.getSnapshot().status === 'ready' &&
        runtime.view.state.controls.getSnapshot().status === 'ready',
    )
    await runtime.view.commands.execute('draft.setText', { sessionId: session.id, text: 'next prompt' })
    await runtime.view.commands.execute('questionnaire.setAnswer', {
      sessionId: session.id,
      requestId: 'questionnaire',
      questionId: 'continue',
      answer: { kind: 'option', value: 'Yes' },
    })
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarSessionWorkspace
          sessionTitle={session.title}
          workspaceName="Workspace 1"
          labels={getShellCopy('en-US').session}
          connected
          prepareAttachment={async () => {
            throw new Error('not invoked during static rendering')
          }}
        />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('Session: Rich session')
    expect(html).toContain('<strong>safe</strong>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('next prompt')
    expect(html).toContain('Fixture Model · thinking low')
    expect(html).toContain('Agent approval')
    expect(html).toContain('Agent plan')
    expect(html).toContain('1 of 2 completed')
    expect(html).toContain('Keep the plan attached to its run.')
    expect(html).toContain('Should we continue?')
    expect(html).toContain('AI usage')
    expect(html).toContain('Load earlier messages')
    expect(html).toContain('aria-label="Add attachment"')
    expect(html).toContain('20 tokens')
    expect(html).toContain('Workspace 1')
  } finally {
    runtime.dispose()
  }
})
