import { z } from 'zod'
import { normalizeContext } from '@earendil-works/pi-ai'
import type { Model } from '@earendil-works/pi-ai'
import { lazyApi } from '@earendil-works/pi-ai/api/lazy'
import { expect, test } from 'bun:test'
import { PiDriver } from '@hbar/pi-driver'
import { providerSchema, resolveProviderModel } from '@hbar/contracts'
import type { ModelDiagnosticEvent } from '@hbar/plugin-sdk'

function request(baseUrl: string) {
  const provider = providerSchema.parse({
    id: 'lazy-local',
    name: 'Local only',
    protocol: 'openai-completions',
    model: 'fixture-network',
    baseUrl,
    maxOutput: 128,
  })
  return {
    system: 'Summarize.',
    messages: [],
    model: resolveProviderModel(provider, 'fixture-network'),
    context: { sessionId: 'lazy-local' },
  }
}
function chunk(text: string, finish: string | null = null) {
  return `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture-network', choices: [{ index: 0, delta: { content: text }, finish_reason: finish }] })}\n\n`
}
function outcome<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
}

test('real PiDriver concurrent first provider requests reach independent streams; abort cannot cancel its neighbor', async () => {
  const both = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  let arrivals = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(httpRequest) {
      const body = z
        .object({ messages: z.array(z.object({ role: z.string(), content: z.unknown() })) })
        .parse(await httpRequest.json())
      const system = body.messages.find((message) => message.role === 'system' || message.role === 'developer')
      const sentinel = z.enum(['lazy-owner-a', 'lazy-owner-b']).parse(system?.content)
      arrivals++
      if (arrivals === 2) both.resolve()
      return new Response(
        new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(new TextEncoder().encode(chunk(`stream-${sentinel}`)))
            await release.promise
            try {
              controller.enqueue(new TextEncoder().encode(chunk('', 'stop') + 'data: [DONE]\n\n'))
              controller.close()
            } catch {
              /* Aborted HTTP consumer already owns this closed stream. */
            }
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    },
  })
  const a = new AbortController(),
    b = new AbortController(),
    deadlineController = new AbortController()
  const deadlineTimer = setTimeout(() => deadlineController.abort(), 8_000),
    deadline = deadlineController.signal
  const eventsA: ModelDiagnosticEvent[] = [],
    eventsB: ModelDiagnosticEvent[] = []
  const driver = new PiDriver(),
    input = request(`http://127.0.0.1:${server.port}/v1`)
  const first = outcome(
    driver.summarize(
      { ...input, system: 'lazy-owner-a' },
      'local-fixture-only',
      AbortSignal.any([a.signal, deadline]),
      (event) => eventsA.push(event),
    ),
  )
  const second = outcome(
    driver.summarize(
      { ...input, system: 'lazy-owner-b' },
      'local-fixture-only',
      AbortSignal.any([b.signal, deadline]),
      (event) => eventsB.push(event),
    ),
  )
  try {
    await Promise.race([
      both.promise,
      new Promise<never>((_, reject) =>
        deadline.addEventListener('abort', () => reject(new Error('Concurrent requests did not both arrive')), {
          once: true,
        }),
      ),
    ])
    expect(arrivals).toBe(2)
    a.abort()
    expect((await first).ok).toBe(false)
    expect(eventsA.filter((event) => event.phase === 'cancelled')).toHaveLength(1)
    expect(eventsB.filter((event) => ['settled', 'failed', 'cancelled'].includes(event.phase))).toHaveLength(0)
    release.resolve()
    const result = await second
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    expect(result.value.text).toContain('stream-lazy-owner-b')
    expect(eventsB.filter((event) => event.phase === 'settled')).toHaveLength(1)
    const pre = new AbortController()
    pre.abort()
    expect((await outcome(driver.summarize(input, 'local-fixture-only', pre.signal))).ok).toBe(false)
    expect(arrivals).toBe(2)
  } finally {
    clearTimeout(deadlineTimer)
    release.resolve()
    a.abort()
    b.abort()
    await Promise.all([first, second])
    await server.stop(true)
  }
}, 15_000)

test('actual upstream lazyApi setup rejection remains finite when cancellation overlaps loading', async () => {
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>(),
    controller = new AbortController()
  const api = lazyApi(async () => {
    entered.resolve()
    await release.promise
    throw new Error('controlled-import-rejection')
  })
  const setupModel: Model<'openai-completions'> = {
    id: 'local-setup-fixture',
    name: 'Local setup fixture',
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: 'http://127.0.0.1',
    input: ['text'],
    reasoning: false,
    contextWindow: 4096,
    maxTokens: 128,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }
  const stream = api.streamSimple(setupModel, normalizeContext({ messages: [] }), { signal: controller.signal })
  await entered.promise
  controller.abort()
  release.resolve()
  const kinds: string[] = []
  for await (const event of stream) kinds.push(event.type)
  const result = await stream.result()
  expect(kinds).toEqual(['error'])
  expect(result.stopReason).toBe('error')
  expect(controller.signal.aborted).toBe(true)
}, 5_000)
