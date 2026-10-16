import { expect, test } from 'bun:test'
import { z } from 'zod'
import { HbarError, providerSchema, runSchema } from '@hbar/contracts'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import type { ContentBlock, Message, SessionEvent } from '@hbar/contracts'
import type { DriverInput, ModelDiagnosticEvent } from '@hbar/plugin-sdk'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import { PiDriver } from '../plugins/pi-driver/src/index'
import { VisibleStreamProjection } from '../plugins/pi-driver/src/visible-stream'

const text = 'visible🧪'
const thinking = '思考💡'
const args = { value: 'x'.repeat(128) }
const wireArguments = JSON.stringify(args)
const headers = { 'content-type': 'text/event-stream', 'x-codex-turn-state': 'local-turn-state' }
const event = (type: string, fields: Record<string, unknown>) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`

function response(first: boolean, thinkingFirst: boolean): Response {
  const frames = [event('response.created', { response: { id: first ? 'resp_1' : 'resp_2', status: 'in_progress' } })]
  const textItem = {
    id: first ? 'msg_1' : 'msg_2',
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text, annotations: [] }],
  }
  const reasoningItem = {
    id: 'reasoning_1',
    type: 'reasoning',
    summary: [{ type: 'summary_text', text: thinking }],
  }
  const textFrames = (index: number) => [
    event('response.output_item.added', { output_index: index, item: { ...textItem, content: [] } }),
    event('response.output_text.delta', { output_index: index, content_index: 0, delta: 'vis' }),
    event('response.output_item.done', { output_index: index, item: textItem }),
  ]
  const thinkingFrames = (index: number) => [
    event('response.output_item.added', { output_index: index, item: { ...reasoningItem, summary: [] } }),
    event('response.reasoning_summary_text.delta', { output_index: index, summary_index: 0, delta: '思考' }),
    event('response.output_item.done', { output_index: index, item: reasoningItem }),
  ]
  const output: unknown[] = []
  if (first) {
    frames.push(...(thinkingFirst ? thinkingFrames(0) : textFrames(0)))
    frames.push(...(thinkingFirst ? textFrames(1) : thinkingFrames(1)))
    output.push(...(thinkingFirst ? [reasoningItem, textItem] : [textItem, reasoningItem]))
    const tool = {
      id: 'fc_1',
      call_id: 'call_1',
      type: 'function_call',
      name: 'read_fixture',
      arguments: wireArguments,
    }
    frames.push(event('response.output_item.added', { output_index: 2, item: { ...tool, arguments: '' } }))
    for (const delta of wireArguments)
      frames.push(event('response.function_call_arguments.delta', { output_index: 2, delta }))
    frames.push(event('response.function_call_arguments.done', { output_index: 2, arguments: wireArguments }))
    frames.push(event('response.output_item.done', { output_index: 2, item: tool }))
    output.push(tool)
  } else {
    frames.push(...textFrames(0))
    output.push(textItem)
  }
  frames.push(
    event('response.completed', {
      response: {
        id: first ? 'resp_1' : 'resp_2',
        status: 'completed',
        output,
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          total_tokens: 120,
          input_tokens_details: { cached_tokens: first ? 0 : 90 },
        },
      },
    }),
  )
  return new Response(frames.join(''), { headers })
}

function fixture(baseUrl: string) {
  const controller = new AbortController()
  const session = sessionSchema.parse({
    id: 'session',
    workspaceId: 'workspace',
    title: 'Fixture',
    archived: false,
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    seq: 0,
  })
  const workspace = workspaceSchema.parse({ id: 'workspace', name: 'Fixture', path: '.', createdAt: 1 })
  const run = runSchema.parse({
    id: 'run',
    sessionId: session.id,
    requestId: 'request',
    input: { text: 'Read once', images: [] },
    modelId: 'local-fixture',
    status: 'running',
    createdAt: 1,
    startedAt: 1,
    endedAt: null,
    error: null,
  })
  const model = providerSchema.parse({
    id: 'local-fixture',
    name: 'Local Responses fixture',
    protocol: 'openai-responses',
    model: 'fixture',
    baseUrl,
    reasoning: true,
    thinkingLevels: ['low'],
    defaultThinkingLevel: 'low',
  })
  const messages: Message[] = []
  const events: SessionEvent[] = []
  const diagnostics: ModelDiagnosticEvent[] = []
  const snapshots: Array<{ id: string; text: string; thinking: string }> = []
  const executed: Array<{ name: string; args: Record<string, unknown>; callId: string }> = []
  let seq = 0
  const commit = (
    role: Message['role'],
    content: ContentBlock[],
    id: string = crypto.randomUUID(),
    providerData?: unknown,
  ): Message => {
    const message: Message = {
      id,
      sessionId: session.id,
      runId: run.id,
      role,
      content,
      seq: ++seq,
      createdAt: seq,
      ...(providerData === undefined ? {} : { providerData }),
    }
    messages.push(message)
    return message
  }
  commit('user', [{ type: 'text', text: run.input.text }], 'user_1')
  const stable = 'Stable fixture instructions'
  const input: DriverInput = {
    session,
    workspace,
    run,
    signal: controller.signal,
    apiKey: 'fixture-only',
    request: {
      system: `${stable}\n\nCurrent Host facts`,
      systemContextOffset: stable.length,
      model,
      messages: [...messages],
    },
    tools: [
      {
        name: 'read_fixture',
        description: 'Read the local deterministic fixture',
        effect: 'read',
        timeoutMs: 1000,
        inputSchema: z.object({ value: z.string() }),
        inputJsonSchema: {
          type: 'object',
          properties: { value: { type: 'string' } },
          required: ['value'],
          additionalProperties: false,
        },
        execute: async () => {
          throw new Error('Driver must use Host execution callback')
        },
      },
    ],
    onModelDiagnostic: (value) => diagnostics.push(value),
    resolveKey: async () => 'fixture-only',
    readImage: async () => {
      throw new Error('No image fixture')
    },
    readFile: async () => {
      throw new Error('No file fixture')
    },
    emit: async (type, data, stepId) => {
      const value: SessionEvent = {
        eventId: crypto.randomUUID(),
        sessionId: session.id,
        runId: run.id,
        stepId: stepId ?? null,
        type,
        data,
        time: seq,
        version: 1,
        seq: ++seq,
      }
      events.push(value)
      return value
    },
    commit: async (role, content, id, providerData) => commit(role, content, id, providerData),
    stream: (id, text, thinking) => snapshots.push({ id, text, thinking }),
    execute: async (name, values, callId) => {
      executed.push({ name, args: structuredClone(values), callId })
      commit('tool', [{ type: 'tool_result', callId, name, text: 'fixture settled', isError: false }])
      return { text: 'fixture settled' }
    },
    beforeRequest: async () => ({ ...input.request, messages: structuredClone(messages) }),
    stepEnded: async () => {},
  }
  return { controller, input, messages, events, diagnostics, snapshots, executed }
}

for (const thinkingFirst of [true, false])
  test(`real PiDriver streams visible changes with ${thinkingFirst ? 'thinking' : 'text'} first and preserves cache prefix`, async () => {
    const payloads: Array<z.output<typeof payloadSchema>> = []
    const turnHeaders: Array<string | null> = []
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        payloads.push(payloadSchema.parse(await request.json()))
        turnHeaders.push(request.headers.get('x-codex-turn-state'))
        return response(payloads.length === 1, thinkingFirst)
      },
    })
    const f = fixture(`http://127.0.0.1:${server.port}/v1`)
    try {
      await new PiDriver().run(f.input)
      expect(payloads).toHaveLength(2)
      expect(turnHeaders).toEqual([null, 'local-turn-state'])
      expect(payloads[1]?.tools).toEqual(payloads[0]?.tools)
      expect(payloads[0]?.tools.map((tool) => tool.name)).toEqual(['read_fixture'])
      const firstInput = payloads[0]?.input
      if (!firstInput) throw new Error('Missing first actual request')
      expect(payloads[1]?.input.slice(0, firstInput.length)).toEqual(firstInput)
      expect(payloads[0]?.prompt_cache_key).toBe('session')
      expect(payloads[1]?.prompt_cache_key).toBe('session')
      expect(f.executed).toHaveLength(1)
      expect(f.executed[0]).toMatchObject({ name: 'read_fixture', args })
      const execution = f.executed[0]
      if (!execution) throw new Error('Missing actual Host tool execution')
      const assistants = f.messages.filter((message) => message.role === 'assistant')
      expect(assistants).toHaveLength(2)
      const visibleBlocks: ContentBlock[] = thinkingFirst
        ? [
            { type: 'thinking', text: thinking },
            { type: 'text', text },
          ]
        : [
            { type: 'text', text },
            { type: 'thinking', text: thinking },
          ]
      expect(assistants[0]?.content).toEqual([
        ...visibleBlocks,
        {
          type: 'tool_call',
          callId: execution.callId,
          name: 'read_fixture',
          args,
        },
      ])
      expect(assistants[1]?.content).toEqual([{ type: 'text', text }])
      expect(f.events.filter((value) => value.type === 'attempt.firstThinking')).toHaveLength(1)
      expect(f.events.filter((value) => value.type === 'attempt.firstText')).toHaveLength(2)
      expect(f.diagnostics.filter((value) => value.phase === 'started')).toHaveLength(2)
      expect(f.diagnostics.filter((value) => value.phase === 'settled')).toHaveLength(2)
      const streamIds = [...new Set(f.snapshots.map((value) => value.id))]
      expect(streamIds).toHaveLength(2)
      expect(f.snapshots.filter((value) => value.id === streamIds[0]).at(-1)).toMatchObject({ text, thinking })
      expect(f.snapshots.filter((value) => value.id === streamIds[1]).at(-1)).toMatchObject({ text, thinking: '' })
      for (let index = 1; index < f.snapshots.length; index++) {
        const previous = f.snapshots[index - 1],
          current = f.snapshots[index]
        if (previous?.id === current?.id)
          expect({ text: current?.text, thinking: current?.thinking }).not.toEqual({
            text: previous?.text,
            thinking: previous?.thinking,
          })
      }
      // Independent of wall-clock timing or how transport batches the 140 one-character arguments.
      expect(f.snapshots.length).toBeLessThanOrEqual(8)
      const streamedCharacters = f.snapshots.reduce(
        (sum, snapshot) => sum + snapshot.text.length + snapshot.thinking.length,
        0,
      )
      expect(streamedCharacters).toBeLessThanOrEqual(8 * (text.length + thinking.length))
    } finally {
      f.controller.abort()
      await server.stop(true)
    }
  })

const payloadSchema = z.object({
  input: z.array(z.unknown()),
  tools: z.array(z.object({ name: z.string() }).passthrough()),
  prompt_cache_key: z.string(),
})

test('visible projection notices corrections on tool-only events, block changes and message resets', () => {
  const projection = new VisibleStreamProjection()
  const content: AssistantMessage['content'] = [
    { type: 'text', text },
    { type: 'thinking', thinking },
  ]
  expect(projection.update(content)).toEqual({ text, thinking })
  const tool = { type: 'toolCall' as const, id: 'call', name: 'fixture', arguments: {} }
  content.push(tool)
  for (let index = 0; index < 1000; index++) {
    tool.arguments = { index }
    expect(projection.update(content)).toBeUndefined()
  }
  const first = content[0]
  if (first?.type !== 'text') throw new Error('Missing mutable text block')
  first.text = 'corrected'
  expect(projection.update(content)).toEqual({ text: 'corrected', thinking })
  expect(projection.update([{ type: 'text', text: 'corrected' }])).toEqual({ text: 'corrected', thinking: '' })
  expect(projection.update([])).toEqual({ text: '', thinking: '' })
  expect(projection.update([])).toBeUndefined()
  projection.reset()
  expect(projection.update([])).toEqual({ text: '', thinking: '' })
  expect(projection.update([{ type: 'text', text }])).toEqual({ text, thinking: '' })
  expect(
    projection.update([
      { type: 'text', text: 'vis' },
      { type: 'text', text: 'ible🧪' },
    ]),
  ).toBeUndefined()
})

test('real PiDriver cancellation after a visible update does not commit a partial assistant or execute a tool', async () => {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            // Hold the provider open after its visible partial: cancellation cannot race a completed response.
            controller.enqueue(
              new TextEncoder().encode(
                event('response.created', { response: { id: 'cancelled_response', status: 'in_progress' } }) +
                  event('response.output_item.added', {
                    output_index: 0,
                    item: { id: 'cancelled_reasoning', type: 'reasoning', summary: [] },
                  }) +
                  event('response.reasoning_summary_text.delta', {
                    output_index: 0,
                    summary_index: 0,
                    delta: thinking,
                  }),
              ),
            )
          },
        }),
        { headers },
      ),
  })
  const f = fixture(`http://127.0.0.1:${server.port}/v1`)
  f.input.stream = (id, text, thinking) => {
    f.snapshots.push({ id, text, thinking })
    if (text || thinking) f.controller.abort(new HbarError('CANCELLED', 'Owned fixture cancellation'))
  }
  try {
    await expect(new PiDriver().run(f.input)).rejects.toThrow()
    expect(f.messages.filter((message) => message.role === 'assistant')).toHaveLength(0)
    expect(f.executed).toHaveLength(0)
    expect(f.snapshots.some((snapshot) => snapshot.text || snapshot.thinking)).toBe(true)
  } finally {
    f.controller.abort()
    await server.stop(true)
  }
})
