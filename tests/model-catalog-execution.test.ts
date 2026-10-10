import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { ModelRegistry } from '@hbar/plugin-sdk'

const requestSchema = z.object({
  model: z.string(),
  messages: z.array(z.object({ role: z.string(), content: z.unknown() })),
})

for (const override of ['none', 'model', 'endpoint'] as const) {
  test(`real transport retains a composite model selection and rejects unregistered overrides (${override})`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-catalog-execution-'))
    await writeFile(join(root, 'proof.txt'), 'catalog proof')
    const received: z.infer<typeof requestSchema>[] = []
    const provider = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        expect(request.headers.get('authorization')).toBe('Bearer fixture-catalog-key')
        const body = requestSchema.parse(await request.json())
        received.push(body)
        const first = received.length === 1
        const chunk = (delta: unknown, finishReason: string | null, usage?: unknown) =>
          `data: ${JSON.stringify({ id: 'catalog-response', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finishReason }], usage })}\n\n`
        const delta = first
          ? {
              role: 'assistant',
              tool_calls: [
                {
                  index: 0,
                  id: 'catalog-read',
                  type: 'function',
                  function: { name: 'read_file', arguments: '{"path":"proof.txt"}' },
                },
              ],
            }
          : { role: 'assistant', content: 'Selected model completed' }
        return new Response(
          chunk(delta, null) +
            chunk({}, first ? 'tool_calls' : 'stop', { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }) +
            'data: [DONE]\n\n',
          { headers: { 'Content-Type': 'text/event-stream' } },
        )
      },
    })
    const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, secrets: new MemorySecrets() })
    try {
      await kernel.changePlugin('budget.codex', true, { autoContinue: false })
      await kernel.saveProvider(
        {
          id: 'catalog',
          name: 'Catalog fixture',
          protocol: 'openai-completions',
          baseUrl: `http://127.0.0.1:${provider.port}/v1`,
          model: 'primary',
          models: [{ id: 'primary' }, { id: 'selected' }],
        },
        'fixture-catalog-key',
      )
      if (override !== 'none')
        kernel.hooks.on('model.request', (request) => ({
          ...request,
          model: {
            ...request.model,
            ...(override === 'model' ? { model: 'primary' } : { baseUrl: `${request.model.baseUrl}/unregistered` }),
          },
        }))
      const workspace = (await kernel.storage.call('workspaces'))[0]
      if (!workspace) throw new Error('Catalog fixture workspace was not created')
      const session = await kernel.createSession(workspace.id)
      await kernel.submit(session.id, `catalog-${override}`, { text: 'Read proof.txt', images: [] }, 'catalog/selected')
      await kernel.waitForIdle()
      const snapshot = await kernel.snapshot(session.id)
      const events = await kernel.storage.call('events', session.id, 0)
      if (override === 'none') {
        expect(snapshot.runs[0]?.status).toBe('completed')
        expect(received.map((request) => request.model)).toEqual(['selected', 'selected'])
        expect(
          received[1]?.messages.some((message) => message.role === 'tool' && message.content === 'catalog proof'),
        ).toBeTrue()
        expect(snapshot.messages.at(-1)?.content).toEqual([{ type: 'text', text: 'Selected model completed' }])
        expect(snapshot.usage.input).toBe(40)
        expect(snapshot.usage.output).toBe(10)
        const registry = kernel.plugins.get<ModelRegistry>('models')
        expect((await registry.get('catalog/selected')).id).toBe('catalog/selected')
        expect((await registry.get('catalog/selected')).model).toBe('selected')
        expect((await registry.get('catalog')).model).toBe('primary')
        const starts = events.filter((event) => event.type === 'request.started')
        expect(starts).toHaveLength(2)
        for (const start of starts) {
          const data = z
            .object({ request: z.object({ model: z.object({ id: z.string(), model: z.string() }) }) })
            .parse(start.data)
          expect(data.request.model.id).toBe('catalog/selected')
          expect(data.request.model.model).toBe('selected')
        }
      } else {
        expect(snapshot.runs[0]?.status).toBe('failed')
        expect(snapshot.runs[0]?.failure?.code).toBe('INVALID_MODEL_OVERRIDE')
        expect(received).toHaveLength(0)
        expect(events.filter((event) => event.type === 'request.started')).toHaveLength(0)
        expect(snapshot.usage.input).toBe(0)
        expect(snapshot.usage.output).toBe(0)
      }
      expect(JSON.stringify(events)).not.toContain('fixture-catalog-key')
    } finally {
      await kernel.close()
      await provider.stop(true)
      await rm(root, { recursive: true, force: true })
    }
  })
}
