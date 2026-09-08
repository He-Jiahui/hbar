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

test('read_file sends images to the model without persisting binary data in session events', async () => {
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
            (block) => block.type === 'image_url' && block.image_url?.url === `data:image/png;base64,${image.toString('base64')}`,
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
  const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, secrets: new MemorySecrets() })
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
  } finally {
    await kernel.close()
    await provider.stop(true)
    await rm(root, { recursive: true, force: true })
  }
})
