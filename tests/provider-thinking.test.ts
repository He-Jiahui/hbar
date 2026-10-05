import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { providerSchema } from '@hbar/contracts'
import type { ThinkingLevel } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { PiDriver } from '@hbar/pi-driver'

const reasoningLevels: ThinkingLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']
const requestSchema = z.object({
  instructions: z.string().optional(),
  input: z.array(z.unknown()),
  reasoning: z.object({ effort: z.string() }).optional(),
})

function responsesFixture(allowOff = false) {
  const requests: z.infer<typeof requestSchema>[] = []
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      expect(request.headers.get('authorization')).toBe('Bearer fixture-only')
      expect(new URL(request.url).pathname).toBe('/v1/responses')
      const body = requestSchema.parse(await request.json())
      requests.push(body)
      if (!allowOff && body.reasoning?.effort === 'none')
        return Response.json(
          { error: { message: 'This model does not support reasoning effort "none"', type: 'invalid_request_error' } },
          { status: 400 },
        )
      const text = JSON.stringify(body).includes('Summarize') ? 'History summarized.' : 'Request completed.'
      const content = { type: 'output_text', text, annotations: [] }
      const item = { id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [content] }
      const event = (type: string, data: Record<string, unknown>) =>
        `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
      return new Response(
        event('response.created', { response: { id: 'resp_fixture', status: 'in_progress' } }) +
          event('response.output_item.added', { output_index: 0, item: { ...item, content: [] } }) +
          event('response.content_part.added', { output_index: 0, content_index: 0, part: { ...content, text: '' } }) +
          event('response.output_text.delta', { output_index: 0, content_index: 0, delta: text }) +
          event('response.output_item.done', { output_index: 0, item }) +
          event('response.completed', {
            response: {
              id: 'resp_fixture',
              status: 'completed',
              output: [item],
              usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
            },
          }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    },
  })
  return { server, requests }
}

test('normal inference preserves every Host-declared reasoning level in the actual Responses payload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-thinking-'))
  const fixture = responsesFixture()
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  try {
    await kernel.saveProvider(
      providerSchema.parse({
        id: 'reasoning-fixture',
        name: 'Reasoning fixture',
        protocol: 'openai-responses',
        baseUrl: `http://127.0.0.1:${fixture.server.port}/v1`,
        model: 'fixture-reasoning',
        reasoning: true,
        thinkingLevels: reasoningLevels,
        defaultThinkingLevel: 'medium',
      }),
      'fixture-only',
    )
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Fixture workspace missing')
    const session = await kernel.createSession(workspace.id)
    for (const thinking of reasoningLevels) {
      await kernel.submit(
        session.id,
        `thinking-${thinking}`,
        { text: 'Complete the request.', images: [], thinking },
        'reasoning-fixture',
      )
      await kernel.waitForIdle()
      const snapshot = await kernel.snapshot(session.id)
      expect(snapshot.runs.at(-1)?.status).toBe('completed')
      expect(fixture.requests.at(-1)?.reasoning?.effort).toBe(thinking)
    }
    expect(fixture.requests).toHaveLength(reasoningLevels.length)
  } finally {
    await kernel.close()
    await fixture.server.stop(true)
    await rm(root, { recursive: true, force: true })
  }
})

test('automatic compaction and subsequent inference retain Run max instead of the model default or none', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-compaction-thinking-'))
  const fixture = responsesFixture()
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Fixture workspace missing')
    const session = await kernel.createSession(workspace.id)
    for (let index = 0; index < 4; index++) {
      await kernel.submit(
        session.id,
        `history-${index}`,
        { text: 'Keep this history. '.repeat(100), images: [] },
        'local-fixture',
      )
      await kernel.waitForIdle()
    }
    await kernel.changePlugin('context.summary', true, { threshold: 0.3, retainMessages: 2 })
    await kernel.saveProvider(
      providerSchema.parse({
        id: 'compaction-fixture',
        name: 'Compaction reasoning fixture',
        protocol: 'openai-responses',
        baseUrl: `http://127.0.0.1:${fixture.server.port}/v1`,
        model: 'fixture-reasoning',
        reasoning: true,
        thinkingLevels: reasoningLevels,
        defaultThinkingLevel: 'xhigh',
        contextWindow: 4096,
        maxOutput: 1024,
      }),
      'fixture-only',
    )
    const run = await kernel.submit(
      session.id,
      'compact-and-answer',
      { text: 'Continue.', images: [], thinking: 'max' },
      'compaction-fixture',
    )
    await kernel.waitForIdle()
    const snapshot = await kernel.snapshot(session.id)
    expect(snapshot.runs.find((item) => item.id === run.id)?.status).toBe('completed')
    expect(snapshot.runs.find((item) => item.id === run.id)?.input.thinking).toBe('max')
    expect(fixture.requests).toHaveLength(2)
    expect(JSON.stringify(fixture.requests[0])).toContain('Summarize the conversation')
    expect(fixture.requests.map((request) => request.reasoning?.effort)).toEqual(['max', 'max'])
    const events = await kernel.storage.call('events', session.id, 0)
    const compaction = events.find((event) => event.type === 'compaction.request' && event.runId === run.id)
    expect(
      z.object({ request: z.object({ context: z.object({ thinking: z.literal('max') }) }) }).parse(compaction?.data),
    ).toBeDefined()
    expect((await kernel.storage.call('context', session.id)).summary).toBe('History summarized.')
  } finally {
    await kernel.close()
    await fixture.server.stop(true)
    await rm(root, { recursive: true, force: true })
  }
})

for (const thinking of ['medium', 'xhigh', 'max', 'off'] as const) {
  test(`standalone summary uses the supported model default ${thinking}`, async () => {
    const fixture = responsesFixture(thinking === 'off')
    try {
      const result = await new PiDriver().summarize(
        {
          system: 'Summarize this history.',
          messages: [],
          model: providerSchema.parse({
            id: 'summary-fixture',
            name: 'Summary fixture',
            protocol: 'openai-responses',
            baseUrl: `http://127.0.0.1:${fixture.server.port}/v1`,
            model: 'fixture-reasoning',
            reasoning: true,
            thinkingLevels: thinking === 'off' ? ['off', ...reasoningLevels] : reasoningLevels,
            defaultThinkingLevel: thinking,
          }),
        },
        'fixture-only',
        AbortSignal.timeout(5000),
      )
      expect(result.text).toBe('History summarized.')
      expect(fixture.requests.map((request) => request.reasoning?.effort)).toEqual([
        thinking === 'off' ? 'none' : thinking,
      ])
    } finally {
      await fixture.server.stop(true)
    }
  })
}

test('Chat Completions compaction also sends pinned max without Pi clamping it to high', async () => {
  const efforts: string[] = []
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      expect(new URL(request.url).pathname).toBe('/v1/chat/completions')
      const payload = z.object({ reasoning_effort: z.string() }).parse(await request.json())
      efforts.push(payload.reasoning_effort)
      const chunk = (delta: Record<string, unknown>, finish_reason: string | null) =>
        `data: ${JSON.stringify({ id: 'chat_fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture-reasoning', choices: [{ index: 0, delta, finish_reason }] })}\n\n`
      return new Response(
        chunk({ role: 'assistant', content: 'History summarized.' }, null) + chunk({}, 'stop') + 'data: [DONE]\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    },
  })
  try {
    const result = await new PiDriver().summarize(
      {
        system: 'Summarize this history.',
        messages: [],
        context: { sessionId: 'summary-session', thinking: 'max' },
        model: providerSchema.parse({
          id: 'completion-fixture',
          name: 'Completion fixture',
          protocol: 'openai-completions',
          baseUrl: `http://127.0.0.1:${server.port}/v1`,
          model: 'fixture-reasoning',
          reasoning: true,
          thinkingLevels: reasoningLevels,
          defaultThinkingLevel: 'medium',
        }),
      },
      'fixture-only',
      AbortSignal.timeout(5000),
    )
    expect(result.text).toBe('History summarized.')
    expect(efforts).toEqual(['max'])
  } finally {
    await server.stop(true)
  }
})
