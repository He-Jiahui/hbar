import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { providerSchema } from '@hbar/contracts'
import type { BudgetService } from '@hbar/plugin-sdk'

test('active runs allow a strict provider model append and reject every other provider mutation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-provider-append-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let runId: string | undefined
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Fixture workspace missing')
    const session = await kernel.createSession(workspace.id)
    const run = await kernel.submit(session.id, 'append-active', { text: '/slow', images: [] }, 'local-fixture')
    runId = run.id
    for (let attempt = 0; attempt < 100 && kernel.streams.size === 0; attempt++) await Bun.sleep(10)
    expect(kernel.streams.size).toBeGreaterThan(0)
    const existing = (await kernel.storage.call('providers')).find((provider) => provider.id === 'local-fixture')
    if (!existing) throw new Error('Fixture provider missing')
    const append = {
      ...existing,
      models: [
        ...existing.models,
        {
          id: 'gpt-6-astra',
          name: 'GPT-6 Astra',
          visible: true,
          contextWindow: 272_000,
          maxOutput: 128_000,
          imageInput: true,
          reasoning: true,
          inputPrice: 0,
          outputPrice: 0,
          thinkingLevels: ['off', 'low', 'medium', 'high', 'xhigh', 'max'],
          supportedThinkingLevels: ['off', 'low', 'medium', 'high', 'xhigh', 'max'],
          defaultThinkingLevel: 'high',
          defaultReasoningEffort: 'high',
          supportedReasoningEfforts: ['off', 'low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
    }
    await kernel.saveProvider(providerSchema.parse(append))
    expect(
      (await kernel.storage.call('providers')).find((provider) => provider.id === 'local-fixture')?.models,
    ).toHaveLength(2)
    const secondAppend = {
      ...append,
      models: [...append.models, { ...append.models[1]!, id: 'gpt-6-nova', name: 'GPT-6 Nova' }],
    }
    await kernel.saveProvider(providerSchema.parse(secondAppend))
    expect(
      (await kernel.storage.call('providers')).find((provider) => provider.id === 'local-fixture')?.models,
    ).toHaveLength(3)
    await expect(kernel.saveProvider(providerSchema.parse(secondAppend))).rejects.toMatchObject({ code: 'BUSY' })
    await expect(
      kernel.saveProvider(
        providerSchema.parse({
          ...secondAppend,
          models: secondAppend.models.map((model, index) => (index === 1 ? { ...model, name: 'Changed Astra' } : model)),
        }),
      ),
    ).rejects.toMatchObject({ code: 'BUSY' })
    await expect(kernel.saveProvider(providerSchema.parse(existing))).rejects.toMatchObject({ code: 'BUSY' })
    await expect(
      kernel.saveProvider(providerSchema.parse({ ...append, baseUrl: 'http://changed.invalid' })),
    ).rejects.toMatchObject({ code: 'BUSY' })
    await expect(
      kernel.saveProvider(providerSchema.parse({ ...append, model: 'gpt-6-astra' })),
    ).rejects.toMatchObject({ code: 'BUSY' })
    await expect(
      kernel.saveProvider(providerSchema.parse(append), 'changed-secret'),
    ).rejects.toMatchObject({ code: 'BUSY' })
  } finally {
    if (runId) await kernel.cancel(runId).catch(() => undefined)
    await kernel.waitForIdle().catch(() => undefined)
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

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
      const body = (await request.json()) as {
        messages: { role: string; content: unknown }[]
        tools: { function: { name: string; parameters: Record<string, unknown> } }[]
      }
      const first = requests++ === 0
      if (first) {
        const update = body.tools.find((tool) => tool.function.name === 'workflow_update')?.function.parameters
        expect(update?.type).toBe('object')
        expect(update?.properties).toHaveProperty('action')
        expect(update?.properties).toHaveProperty('scope')
        expect(update?.oneOf).toBeUndefined()
      }
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
        chunk({}, first ? 'tool_calls' : 'stop', {
          prompt_tokens: 20,
          prompt_tokens_details: { cached_tokens: 7 },
          completion_tokens: 5,
          total_tokens: 25,
        }) +
        'data: [DONE]\n\n'
      return new Response(text, { headers: { 'Content-Type': 'text/event-stream' } })
    },
  })
  const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, secrets: new MemorySecrets() })
  try {
    // This fixture measures one tool turn and one response; automatic Budget
    // continuations would add separate Runs and change the Session totals.
    await kernel.changePlugin('budget.codex', true, { autoContinue: false })
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
    const budgets = kernel.plugins.get<BudgetService>('budget')
    await budgets.set(session.id, 100)
    await kernel.submit(session.id, 'network', { text: 'Read source.txt', images: [] }, 'network-test')
    await kernel.waitForIdle()
    const snapshot = await kernel.snapshot(session.id)
    expect(snapshot.runs[0]?.status).toBe('completed')
    expect(snapshot.messages.at(-1)?.content).toEqual([{ type: 'text', text: 'Network adapter completed' }])
    expect(snapshot.usage.input).toBe(40)
    expect(snapshot.usage.cacheRead).toBe(14)
    expect((await budgets.get(session.id))?.usedTokens).toBe(36)
    expect(requests).toBe(2)
    expect(JSON.stringify(await kernel.storage.call('events', session.id, 0))).not.toContain('fixture-credential')
  } finally {
    await kernel.close()
    await provider.stop(true)
    await rm(root, { recursive: true, force: true })
  }
})

test('read_file persists image references, rehydrates later tool history and keeps binary bytes out of events', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-provider-image-'))
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
    'base64',
  )
  await writeFile(join(root, 'pixel.png'), image)
  let requests = 0
  let receivedImage = false
  const provider = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as {
        messages: { role: string; content: string | { type: string; image_url?: { url?: string } }[] }[]
      }
      const first = requests++ === 0
      if (!first) {
        const attachment = body.messages.find(
          (message) =>
            message.role === 'user' &&
            Array.isArray(message.content) &&
            message.content.some((block) => block.type === 'image_url'),
        )
        receivedImage =
          Array.isArray(attachment?.content) &&
          attachment.content.some(
            (block) =>
              block.type === 'image_url' &&
              block.image_url?.url === `data:image/png;base64,${image.toString('base64')}`,
          )
      }
      const chunk = (delta: unknown, finishReason: string | null = null) =>
        `data: ${JSON.stringify({ id: 'fixture-image', object: 'chat.completion.chunk', created: 1, model: 'fixture-image', choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`
      const text = first
        ? chunk({
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: 'call-image',
                type: 'function',
                function: { name: 'read_file', arguments: '{"path":"pixel.png"}' },
              },
            ],
          }) + chunk({}, 'tool_calls')
        : chunk({ role: 'assistant', content: 'Image received' }) + chunk({}, 'stop')
      return new Response(`${text}data: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
    },
  })
  let kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, secrets: new MemorySecrets() })
  try {
    await kernel.saveProvider(
      providerSchema.parse({
        id: 'image-test',
        name: 'Image fixture',
        protocol: 'openai-completions',
        baseUrl: `http://127.0.0.1:${provider.port}/v1`,
        model: 'fixture-image',
        imageInput: true,
      }),
      'fixture-credential',
    )
    const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
    await kernel.submit(session.id, 'image', { text: 'Read pixel.png', images: [] }, 'image-test')
    await kernel.waitForIdle()
    const snapshot = await kernel.snapshot(session.id)
    const serializedEvents = JSON.stringify(await kernel.storage.call('events', session.id, 0))
    expect(snapshot.runs[0]?.status).toBe('completed')
    expect(receivedImage).toBeTrue()
    expect(serializedEvents).not.toContain(image.toString('base64'))
    expect(serializedEvents).toContain('Read image file pixel.png [image/png]')
    const output = snapshot.messages.flatMap((message) => message.content).find((block) => block.type === 'tool_result')
    if (output?.type !== 'tool_result') throw new Error('Missing read_file result')
    expect(output.images).toHaveLength(1)
    const ref = output.images?.[0]
    if (!ref) throw new Error('Missing durable image')
    expect(ref).toMatchObject({ mime: 'image/png', size: image.length, name: 'read_file-1.png' })
    expect(Buffer.from(await Bun.file(join(kernel.options.layout.artifacts, ref.id)).arrayBuffer())).toEqual(image)
    await kernel.close()
    kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, secrets: new MemorySecrets() })
    receivedImage = false
    await kernel.submit(
      session.id,
      'image-follow-up',
      { text: 'Inspect the earlier image again', images: [] },
      'image-test',
    )
    await kernel.waitForIdle()
    expect(receivedImage).toBeTrue()
    expect((await kernel.snapshot(session.id)).runs.every((run) => run.status === 'completed')).toBeTrue()
  } finally {
    await kernel.close()
    await provider.stop(true)
    await rm(root, { recursive: true, force: true })
  }
})
