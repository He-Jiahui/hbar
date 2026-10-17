import { expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { providerSchema, userInputAutomaticDecisionSchema, type SessionSnapshot } from '@hbar/contracts'
import { usageRecordedDataSchema } from '@hbar/contracts/usage'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function until<Result>(read: () => Promise<Result | undefined>): Promise<Result> {
  const deadline = Date.now() + 30_000
  for (;;) {
    const result = await read()
    if (result !== undefined) return result
    if (Date.now() >= deadline) throw new Error('Managed automatic decision did not reach its boundary')
    await Bun.sleep(10)
  }
}
const event = (type: string, data: Record<string, unknown>) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
function response(content: Record<string, unknown>, delta: Record<string, unknown>, stop: string): Response {
  return new Response(
    event('message_start', {
      message: {
        id: crypto.randomUUID(),
        type: 'message',
        role: 'assistant',
        model: 'pinned-source-model',
        content: [],
        usage: { input_tokens: 50, output_tokens: 0 },
      },
    }) +
      event('content_block_start', { index: 0, content_block: content }) +
      event('content_block_delta', { index: 0, delta }) +
      event('content_block_stop', { index: 0 }) +
      event('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 10 } }) +
      event('message_stop', {}),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}

test('an actual Host uses the original model for automatic decisions, records source usage and retains human fallback without Goals', async () => {
  const prefix = 'hbar-managed-input-completion-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const question = {
    id: 'scope',
    header: 'Scope',
    question: 'Which implementation scope?',
    purpose: 'decision',
    options: [
      { label: 'App', description: 'Implement the app.' },
      { label: 'API', description: 'Implement the API.' },
    ],
  }
  const decisions: number[] = []
  const mainReplies: unknown[] = []
  let needsUser = false
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(http) {
      expect(http.headers.get('x-api-key')).toBe('decision-fixture-only')
      const payload = z
        .object({
          model: z.string(),
          max_tokens: z.number(),
          tools: z.array(z.object({ name: z.string() })).optional(),
          messages: z.array(z.object({ role: z.string(), content: z.unknown() })),
        })
        .parse(await http.json())
      expect(payload.model).toBe('pinned-source-model')
      if (!payload.tools?.length) {
        decisions.push(payload.max_tokens)
        expect(payload.max_tokens).toBeLessThanOrEqual(4096)
        const answer = needsUser ? { kind: 'need_user' } : { kind: 'answer', answers: { scope: { answers: ['API'] } } }
        return response({ type: 'text', text: '' }, { type: 'text_delta', text: JSON.stringify(answer) }, 'end_turn')
      }
      expect(payload.tools.some((tool) => tool.name === 'request_user_input')).toBe(true)
      const last = z.array(z.object({ type: z.string() })).safeParse(payload.messages.at(-1)?.content)
      if (last.success && last.data.some((block) => block.type === 'tool_result')) {
        mainReplies.push(payload.messages.at(-1)?.content)
        return response(
          { type: 'text', text: '' },
          { type: 'text_delta', text: 'The ordinary task is complete.' },
          'end_turn',
        )
      }
      return response(
        { type: 'tool_use', id: crypto.randomUUID(), name: 'request_user_input', input: {} },
        { type: 'input_json_delta', partial_json: JSON.stringify({ questions: [question] }) },
        'tool_use',
      )
    },
  })
  let runtime: ProcessHostRuntime | undefined
  let pendingRunId: string | undefined
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      demo: true,
      workspace: root,
      secrets: new MemorySecrets(),
    })
    const host = runtime
    await host.kernel.changePlugin('budget.codex', true, { autoContinue: false })
    await host.kernel.saveProvider(
      providerSchema.parse({
        id: 'decision-source',
        name: 'Pinned source',
        protocol: 'anthropic-messages',
        model: 'pinned-source-model',
        baseUrl: `http://127.0.0.1:${server.port}`,
        inputPrice: 2,
        outputPrice: 3,
      }),
      'decision-fixture-only',
    )
    const workspace = (await host.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Expected managed completion workspace')
    const session = await host.storage.call('createSession', workspace.id)
    await host.kernel.automationSet(session.id, true)
    const budget = host.kernel.plugins.get('budget')
    await budget.set(session.id, 100_000)
    const first = await host.kernel.submit(
      session.id,
      crypto.randomUUID(),
      { text: 'Implement the chosen scope.', images: [] },
      'decision-source',
    )
    pendingRunId = first.id
    const completed = await until<SessionSnapshot>(async () => {
      const snapshot = await host.kernel.snapshot(session.id)
      if (snapshot.userInputs.length) {
        const events = await host.storage.call('events', session.id, 0, 2000)
        if (events.some((item) => item.type === 'user_input.automationWaiting'))
          throw new Error(
            `Automatic source unexpectedly waits: ${JSON.stringify(events.filter((item) => item.type === 'user_input.automationWaiting'))}`,
          )
      }
      return snapshot.runs.find((run) => run.id === first.id)?.status === 'completed' ? snapshot : undefined
    })
    await host.waitForIdle()
    pendingRunId = undefined
    expect(completed.runs).toHaveLength(1)
    let events = await host.storage.call('events', session.id, 0, 2000)
    const audit = userInputAutomaticDecisionSchema.parse(
      events.find((item) => item.type === 'user_input.autoDecided')?.data,
    )
    expect(audit).toMatchObject({
      source: 'model',
      modelId: 'decision-source',
      request: { runId: first.id },
      response: { answers: { scope: { answers: ['API'] } } },
    })
    expect(audit.attemptIds).toHaveLength(1)
    expect(decisions).toHaveLength(1)
    needsUser = true
    const second = await host.kernel.submit(
      session.id,
      crypto.randomUUID(),
      { text: 'Choose the next implementation scope.', images: [] },
      'decision-source',
    )
    pendingRunId = second.id
    const pending = await until(async () => {
      const events = await host.storage.call('events', session.id, 0, 2000)
      if (!events.some((item) => item.runId === second.id && item.type === 'user_input.automationWaiting'))
        return undefined
      return (await host.kernel.snapshot(session.id)).userInputs.find((item) => item.runId === second.id)
    })
    expect(await host.kernel.resolveUserInput(pending.requestId, { scope: { answers: ['App'] } })).toBe(true)
    await host.waitForIdle()
    pendingRunId = undefined
    events = await host.storage.call('events', session.id, 0, 2000)
    expect(events.filter((item) => item.type === 'user_input.autoDecided')).toHaveLength(1)
    expect(events.some((item) => item.type === 'goal.created')).toBe(false)
    expect(decisions).toHaveLength(2)
    expect(mainReplies).toHaveLength(2)
    expect(JSON.stringify(mainReplies[1])).toContain('App')
    const usage = events
      .filter((item) => item.type === 'usage.recorded')
      .map((item) => ({ runId: item.runId, fact: usageRecordedDataSchema.parse(item.data) }))
    expect(usage).toHaveLength(6)
    expect(usage.every((item) => item.runId === first.id || item.runId === second.id)).toBe(true)
    expect((await budget.get(session.id))?.usedTokens).toBe(
      usage.reduce((total, item) => total + item.fact.input - item.fact.cacheRead + item.fact.output, 0),
    )
    expect(host.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0, physicalTools: 0 })
  } finally {
    if (runtime && pendingRunId) await runtime.kernel.cancel(pendingRunId)
    await runtime?.close()
    await server.stop(true)
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)
