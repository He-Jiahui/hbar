import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { providerSchema } from '@hbar/contracts'

test('OpenAI batches are explicitly enabled but dependent tools execute sequentially through Host settlement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-provider-batch-'))
  const requests: { parallel_tool_calls: boolean; messages: { role: string; content: unknown }[] }[] = []
  const bodySchema = z.object({
    parallel_tool_calls: z.boolean(),
    messages: z.array(z.object({ role: z.string(), content: z.unknown() })),
  })
  const provider = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      requests.push(bodySchema.parse(await request.json()))
      const first = requests.length === 1
      const chunk = (delta: unknown, finish_reason: string | null) =>
        `data: ${JSON.stringify({ id: 'batch', object: 'chat.completion.chunk', created: 1, model: 'fixture-network', choices: [{ index: 0, delta, finish_reason }] })}\n\n`
      return new Response(
        chunk(
          first
            ? {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'write',
                    type: 'function',
                    function: {
                      name: 'write_file',
                      arguments: JSON.stringify({ path: 'proof.txt', text: 'verified batch' }),
                    },
                  },
                  {
                    index: 1,
                    id: 'read',
                    type: 'function',
                    function: { name: 'read_file', arguments: JSON.stringify({ path: 'proof.txt' }) },
                  },
                ],
              }
            : { role: 'assistant', content: 'Verified sequence' },
          null,
        ) +
          chunk({}, first ? 'tool_calls' : 'stop') +
          'data: [DONE]\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    },
  })
  const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, secrets: new MemorySecrets() })
  try {
    await kernel.saveProvider(
      providerSchema.parse({
        id: 'batch',
        name: 'Batch fixture',
        protocol: 'openai-completions',
        baseUrl: `http://127.0.0.1:${provider.port}/v1`,
        model: 'fixture-network',
      }),
      'fixture-only',
    )
    await kernel.setPermissionMode('allow')
    const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
    const settled: string[] = []
    kernel.hooks.on('tool.settled', (event) => {
      settled.push(event.name)
    })
    await kernel.submit(session.id, 'batch', { text: 'Write then read proof.txt', images: [] }, 'batch')
    await kernel.waitForIdle()
    expect((await kernel.snapshot(session.id)).runs[0]?.status).toBe('completed')
    expect(requests).toHaveLength(2)
    expect(requests.every((request) => request.parallel_tool_calls)).toBe(true)
    expect(settled).toEqual(['write_file', 'read_file'])
    expect(
      requests[1]?.messages.some((message) => message.role === 'tool' && message.content === 'verified batch'),
    ).toBe(true)
    expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('verified batch')
  } finally {
    await kernel.close()
    await provider.stop(true)
    await rm(root, { recursive: true, force: true })
  }
})
