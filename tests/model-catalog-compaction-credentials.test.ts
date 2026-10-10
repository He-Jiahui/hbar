import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'

const requestSchema = z.object({ model: z.string(), messages: z.array(z.unknown()) })

test('composite model compaction resolves the provider credential before summarizing', async () => {
  const root = await mkdtemp(join(process.env.TEMP ?? 'C:/Windows/Temp', 'hbar-catalog-compaction-'))
  const authorizations: string[] = []
  const models: string[] = []
  const provider = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      authorizations.push(request.headers.get('authorization') ?? '')
      const body = requestSchema.parse(await request.json())
      models.push(body.model)
      const chunk = `data: ${JSON.stringify({
        id: 'catalog-summary',
        object: 'chat.completion.chunk',
        created: 1,
        model: body.model,
        choices: [{ index: 0, delta: { role: 'assistant', content: 'Compacted history.' }, finish_reason: null }],
      })}\n\n`
      const done = `data: ${JSON.stringify({
        id: 'catalog-summary',
        object: 'chat.completion.chunk',
        created: 1,
        model: body.model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
      })}\n\ndata: [DONE]\n\n`
      return new Response(chunk + done, { headers: { 'Content-Type': 'text/event-stream' } })
    },
  })
  const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, secrets: new MemorySecrets() })
  try {
    await kernel.saveProvider(
      {
        id: 'catalog',
        name: 'Catalog fixture',
        protocol: 'openai-completions',
        baseUrl: `http://127.0.0.1:${provider.port}/v1`,
        model: 'primary',
        contextWindow: 4096,
        maxOutput: 512,
        models: [{ id: 'primary' }, { id: 'selected' }],
      },
      'fixture-catalog-key',
    )
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Catalog fixture workspace was not created')
    const session = await kernel.createSession(workspace.id)
    for (let index = 0; index < 18; index++)
      await kernel.storage.call('commit', session.id, 'seed', index % 2 ? 'assistant' : 'user', [
        { type: 'text', text: `History ${index} ${'x'.repeat(900)}` },
      ])
    await kernel.compact(session.id, 'catalog/selected')
    expect(authorizations.length).toBeGreaterThan(0)
    expect(authorizations.every((value) => value === 'Bearer fixture-catalog-key')).toBeTrue()
    expect(models.every((value) => value === 'selected')).toBeTrue()
  } finally {
    await kernel.close()
    await provider.stop(true)
    await rm(root, { recursive: true, force: true })
  }
})
