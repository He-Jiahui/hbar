import { expect, test } from 'bun:test'
import { z } from 'zod'
import { providerSchema } from '@hbar/contracts'
import { PiDriver } from '@hbar/pi-driver'

test('Anthropic receives normalized system instructions and history with inclusive cache usage', async () => {
  const instruction = 'Summarize the conversation. 保留目标与已验证成果。'
  const history = 'Previous work: 已完成检查 🧪'
  let requests = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      expect(new URL(request.url).pathname).toBe('/v1/messages')
      expect(request.headers.get('x-api-key')).toBe('fixture-only')
      const payload = z
        .object({
          system: z.array(z.object({ type: z.literal('text'), text: z.string() })),
          messages: z.array(
            z.object({
              role: z.enum(['user', 'assistant']),
              content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
            }),
          ),
        })
        .parse(await request.json())
      expect(payload.system.map((block) => block.text).join('\n')).toBe(instruction)
      expect(payload.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: history }] }])
      requests++
      const event = (type: string, data: Record<string, unknown>) =>
        `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
      return new Response(
        event('message_start', {
          message: {
            id: 'msg_fixture',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'fixture-anthropic',
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 11, output_tokens: 0, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 },
          },
        }) +
          event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }) +
          event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Summary preserved.' } }) +
          event('content_block_stop', { index: 0 }) +
          event('message_delta', {
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: 5 },
          }) +
          event('message_stop', {}),
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    },
  })
  try {
    const result = await new PiDriver().summarize(
      {
        system: instruction,
        messages: [
          {
            id: 'history',
            sessionId: 'session',
            runId: 'history-run',
            seq: 1,
            createdAt: 1,
            role: 'user',
            content: [{ type: 'text', text: history }],
          },
        ],
        model: providerSchema.parse({
          id: 'anthropic-fixture',
          name: 'Anthropic fixture',
          protocol: 'anthropic-messages',
          model: 'fixture-anthropic',
          baseUrl: `http://127.0.0.1:${server.port}`,
        }),
      },
      'fixture-only',
      AbortSignal.timeout(5000),
    )
    expect(result.text).toBe('Summary preserved.')
    expect(result.usage).toMatchObject({ input: 16, output: 5, cacheRead: 3, cacheWrite: 2 })
    expect(requests).toBe(1)
  } finally {
    await server.stop(true)
  }
})
