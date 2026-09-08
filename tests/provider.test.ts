import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { providerSchema } from '@hbar/contracts'

test('real pi-ai OpenAI transport streams tool calls and usage through a local HTTP provider', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-provider-'))
  await writeFile(join(root, 'source.txt'), 'from file')
  let requests = 0
  const provider = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      expect(request.headers.get('authorization')).toBe('Bearer fixture-credential')
      expect(new URL(request.url).pathname).toBe('/v1/chat/completions')
      const body = (await request.json()) as { messages: { role: string; content: unknown }[] }
      const first = requests++ === 0
      if (!first)
        expect(body.messages.some((message) => message.role === 'tool' && message.content === 'from file')).toBeTrue()
      const chunk = (delta: unknown, finish_reason: string | null = null, usage?: unknown) =>
        `data: ${JSON.stringify({ id: 'fixture-chat', object: 'chat.completion.chunk', created: 1, model: 'fixture-network', choices: [{ index: 0, delta, finish_reason }], usage })}\n\n`
      const text =
        chunk(
          first
            ? {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call-read',
                    type: 'function',
                    function: { name: 'read_file', arguments: '{"path":"source.txt"}' },
                  },
                ],
              }
            : { role: 'assistant', content: 'Network adapter completed' },
        ) +
        chunk({}, first ? 'tool_calls' : 'stop', { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }) +
        'data: [DONE]\n\n'
      return new Response(text, { headers: { 'Content-Type': 'text/event-stream' } })
    },
  })
  const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, secrets: new MemorySecrets() })
  try {
    await kernel.saveProvider(
      providerSchema.parse({
        id: 'network-test',
        name: 'Network fixture',
        protocol: 'openai-completions',
        baseUrl: `http://127.0.0.1:${provider.port}/v1`,
        model: 'fixture-network',
      }),
      'fixture-credential',
    )
    const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
    await kernel.submit(session.id, 'network', { text: 'Read source.txt', images: [] }, 'network-test')
    await kernel.waitForIdle()
    const snapshot = await kernel.snapshot(session.id)
    expect(snapshot.runs[0]?.status).toBe('completed')
    expect(snapshot.messages.at(-1)?.content).toEqual([{ type: 'text', text: 'Network adapter completed' }])
    expect(snapshot.usage.input).toBe(40)
    expect(requests).toBe(2)
    expect(JSON.stringify(await kernel.storage.call('events', session.id, 0))).not.toContain('fixture-credential')
  } finally {
    await kernel.close()
    await provider.stop(true)
    await rm(root, { recursive: true, force: true })
  }
})
