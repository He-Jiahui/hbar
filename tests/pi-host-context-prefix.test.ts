import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { providerSchema } from '@hbar/contracts'
import { appendModelContext } from '@hbar/plugin-sdk'

test('Responses preserves every transmitted Host snapshot across tool growth and restart, and retires it at compaction', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-host-prefix-'))
  const secrets = new MemorySecrets()
  let kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, secrets })
  const bodySchema = z.object({
    input: z.array(z.record(z.string(), z.unknown())),
    tools: z.array(z.record(z.string(), z.unknown())),
  })
  const bodies: z.infer<typeof bodySchema>[] = []
  let revision = 0
  const provider = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      bodies.push(bodySchema.parse(await request.json()))
      const count = bodies.length
      const item =
        count < 3
          ? {
              id: `fc_${count}`,
              call_id: `call_${count}`,
              type: 'function_call',
              name: 'prefix_fixture',
              arguments: '{}',
              status: 'completed',
            }
          : {
              id: `msg_${count}`,
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'verified', annotations: [] }],
            }
      const event = (type: string, fields: Record<string, unknown>) =>
        `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`
      return new Response(
        event('response.created', { response: { id: `resp_${count}`, status: 'in_progress' } }) +
          event('response.output_item.added', { output_index: 0, item }) +
          event('response.output_item.done', { output_index: 0, item }) +
          event('response.completed', {
            response: {
              id: `resp_${count}`,
              status: 'completed',
              output: [item],
              usage: { input_tokens: 1000, output_tokens: 10, total_tokens: 1010 },
            },
          }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    },
  })
  const attach = () => {
    kernel.tools.register({
      name: 'prefix_fixture',
      description: 'Read a bounded fixture',
      effect: 'read',
      workspaceAccess: { kind: 'none' },
      inputSchema: z.object({}),
      execute: async () => {
        revision++
        return { text: `Source result ${revision}: ${'reference '.repeat(250)}` }
      },
    })
    kernel.hooks.on('tools.select', (event) => ({
      ...event,
      tools: event.tools.filter((tool) => tool.name === 'prefix_fixture'),
    }))
    kernel.hooks.on('context.build', (request) => appendModelContext(request, `Current Host revision: ${revision}`))
  }
  try {
    await kernel.saveProvider(
      providerSchema.parse({
        id: 'prefix',
        name: 'Prefix fixture',
        protocol: 'openai-responses',
        baseUrl: `http://127.0.0.1:${provider.port}/v1`,
        model: 'fixture-network',
      }),
      'fixture-only',
    )
    const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
    attach()
    await kernel.submit(session.id, 'first', { text: 'Read the bounded fixture twice', images: [] }, 'prefix')
    await kernel.waitForIdle()
    expect(bodies).toHaveLength(3)
    for (let index = 1; index < 3; index++) {
      expect(bodies[index]?.input.slice(0, bodies[index - 1]?.input.length)).toEqual(bodies[index - 1]?.input)
      expect(bodies[index]?.tools).toEqual(bodies[0]?.tools)
    }
    await kernel.close()
    kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, secrets })
    attach()
    await kernel.submit(session.id, 'restart', { text: 'Continue after restart', images: [] }, 'prefix')
    await kernel.waitForIdle()
    expect(bodies).toHaveLength(4)
    expect(bodies[3]?.input.slice(0, bodies[2]?.input.length)).toEqual(bodies[2]?.input)
    const snapshot = await kernel.snapshot(session.id)
    await kernel.storage.call(
      'compact',
      session.id,
      Math.max(...snapshot.messages.map((message) => message.seq)),
      'Completed the fixture reads; continue the task.',
      'prefix',
    )
    await kernel.submit(session.id, 'compacted', { text: 'Continue after compaction', images: [] }, 'prefix')
    await kernel.waitForIdle()
    expect(bodies).toHaveLength(5)
    const contexts = bodies[4]?.input.filter(
      (item) => typeof item.content === 'string' && item.content.includes('<host_context_snapshot>'),
    )
    expect(contexts).toHaveLength(1)
    expect(JSON.stringify(bodies[4]?.input)).not.toContain('Current Host revision: 0')
  } finally {
    await kernel.close()
    await provider.stop(true)
    await rm(root, { recursive: true, force: true })
  }
})
