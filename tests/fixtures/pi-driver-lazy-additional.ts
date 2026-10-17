import { plugin } from 'bun'
import { expect } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { providerSchema } from '@hbar/contracts'
import type { ModelDiagnosticEvent } from '@hbar/plugin-sdk'

const mode = Bun.argv[2]
if (mode !== 'anthropic' && mode !== 'responses' && mode !== 'load-failure' && mode !== 'load-abort')
  throw new Error('Invalid mode')
const events: ModelDiagnosticEvent[] = []
const entered = Promise.withResolvers<void>()
const release = Promise.withResolvers<void>()
let loads = 0
let requests = 0
let body: unknown
const diagnostics = (event: ModelDiagnosticEvent) => events.push(event)
const terminals = () => events.filter((event) => ['settled', 'failed', 'cancelled'].includes(event.phase))
const sse = (type: string, value: Record<string, unknown>) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`
const encoder = new TextEncoder()
const responseStarted = Promise.withResolvers<void>()
const finishResponse = Promise.withResolvers<void>()
const streamFinished = Promise.withResolvers<void>()
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(request) {
    requests++
    expect(request.method).toBe('POST')
    if (mode === 'responses') {
      expect(new URL(request.url).pathname).toBe('/v1/responses')
      expect(new URL(request.url).origin).toBe(`http://127.0.0.1:${server.port}`)
      expect(request.headers.get('authorization')).toBe('Bearer fixture-not-a-secret')
      body = await request.json()
      const content = { type: 'output_text', text: 'Summary: responses fixture', annotations: [] }
      const item = {
        id: 'msg_responses_fixture',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [content],
      }
      return new Response(
        new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              controller.enqueue(
                encoder.encode(
                  sse('response.created', { response: { id: 'resp_fixture', status: 'in_progress' } }) +
                    sse('response.output_item.added', { output_index: 0, item: { ...item, content: [] } }) +
                    sse('response.content_part.added', {
                      output_index: 0,
                      content_index: 0,
                      part: { ...content, text: '' },
                    }) +
                    sse('response.output_text.delta', { output_index: 0, content_index: 0, delta: 'Summary: ' }),
                ),
              )
              responseStarted.resolve()
              await finishResponse.promise
              controller.enqueue(
                encoder.encode(
                  sse('response.output_text.delta', {
                    output_index: 0,
                    content_index: 0,
                    delta: 'responses fixture',
                  }) +
                    sse('response.output_item.done', { output_index: 0, item }) +
                    sse('response.completed', {
                      response: {
                        id: 'resp_fixture',
                        status: 'completed',
                        output: [item],
                        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
                      },
                    }),
                ),
              )
              controller.close()
            } finally {
              streamFinished.resolve()
            }
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    }
    expect(new URL(request.url).pathname).toBe('/v1/messages')
    expect(request.headers.get('x-api-key')).toBe('fixture-not-a-secret')
    body = await request.json()
    return new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            controller.enqueue(
              encoder.encode(
                sse('message_start', {
                  message: {
                    id: 'msg_lazy_fixture',
                    type: 'message',
                    role: 'assistant',
                    model: 'claude-fixture',
                    content: [],
                    stop_reason: null,
                    stop_sequence: null,
                    usage: {
                      input_tokens: 7,
                      output_tokens: 0,
                      cache_read_input_tokens: 2,
                      cache_creation_input_tokens: 3,
                    },
                  },
                }) +
                  sse('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }) +
                  sse('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Summary: ' } }),
              ),
            )
            responseStarted.resolve()
            await finishResponse.promise
            controller.enqueue(
              encoder.encode(
                sse('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'anthropic fixture' } }) +
                  sse('content_block_stop', { index: 0 }) +
                  sse('message_delta', {
                    delta: { stop_reason: 'end_turn', stop_sequence: null },
                    usage: { output_tokens: 5 },
                  }) +
                  sse('message_stop', {}),
              ),
            )
            controller.close()
          } finally {
            streamFinished.resolve()
          }
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    )
  },
})
const operationSignal = AbortSignal.timeout(8_000)
const abort = new AbortController()
let outcome: Promise<unknown> = Promise.resolve()
let neighborOutcome: Promise<unknown> = Promise.resolve()
try {
  if (mode === 'load-failure' || mode === 'load-abort') {
    plugin({
      name: 'owned-pi-real-provider-load-failure',
      setup(build) {
        build.onLoad({ filter: /[\\/]pi-ai[\\/]dist[\\/]api[\\/]openai-completions\.js$/ }, async ({ path }) => {
          const original = await readFile(path, 'utf8')
          loads++
          entered.resolve()
          await release.promise
          return { contents: `throw new Error('OWNED_PROVIDER_LOAD_FAILURE');\n${original}`, loader: 'js' }
        })
      },
    })
  }
  // Provider loading must happen inside the actual summarize call, after this import.
  const { PiDriver } = await import('@hbar/pi-driver')
  const driver = new PiDriver()
  const request = {
    system: 'Summarize the fixture conversation.',
    messages: [],
    model: providerSchema.parse({
      id: 'lazy-additional',
      name: 'Local actual provider fixture',
      protocol:
        mode === 'anthropic' ? 'anthropic-messages' : mode === 'responses' ? 'openai-responses' : 'openai-completions',
      model: mode === 'anthropic' ? 'claude-fixture' : 'gpt-fixture',
      baseUrl: `http://127.0.0.1:${server.port}${mode === 'anthropic' ? '' : '/v1'}`,
      maxOutput: 128,
    }),
  }
  const pending = driver.summarize(
    request,
    'fixture-not-a-secret',
    AbortSignal.any([operationSignal, abort.signal]),
    diagnostics,
  )
  outcome = pending.then(
    (value) => value,
    (error: unknown) => error,
  )
  if (mode === 'anthropic') {
    await responseStarted.promise
    expect(terminals()).toHaveLength(0)
    finishResponse.resolve()
    const result = await pending
    expect(result.text).toBe('Summary: anthropic fixture')
    expect(result.usage).toMatchObject({ input: 12, output: 5, cacheRead: 2, cacheWrite: 3 })
    expect(requests).toBe(1)
    expect(body).toMatchObject({ model: 'claude-fixture', stream: true, max_tokens: 128 })
    expect(terminals()).toHaveLength(1)
    expect(terminals()[0]).toMatchObject({ phase: 'settled', protocol: 'anthropic-messages', stopReason: 'stop' })
    await streamFinished.promise
  } else if (mode === 'responses') {
    await responseStarted.promise
    expect(terminals()).toHaveLength(0)
    finishResponse.resolve()
    const result = await pending
    expect(result.text).toBe('Summary: responses fixture')
    expect(result.usage).toMatchObject({ input: 10, output: 5, cacheRead: 0, cacheWrite: 0 })
    expect(requests).toBe(1)
    expect(loads).toBe(0)
    expect(body).toMatchObject({ model: 'gpt-fixture', stream: true, max_output_tokens: 128 })
    expect(terminals()).toHaveLength(1)
    expect(terminals()[0]).toMatchObject({ phase: 'settled', protocol: 'openai-responses', stopReason: 'stop' })
    const started = events.filter((event) => event.phase === 'started')
    expect(started).toHaveLength(1)
    expect(started[0]?.modelRequestId).toBeTruthy()
    expect(terminals()[0]?.modelRequestId).toBe(started[0]?.modelRequestId)
    await streamFinished.promise
  } else {
    await entered.promise
    if (mode === 'load-abort') {
      const neighborEvents: ModelDiagnosticEvent[] = []
      const neighbor = driver.summarize(request, 'fixture-not-a-secret', operationSignal, (event) =>
        neighborEvents.push(event),
      )
      neighborOutcome = neighbor.then(
        (value) => value,
        (error: unknown) => error,
      )
      abort.abort(new Error('OWNED_CALLER_ABORT'))
      release.resolve()
      expect(await neighborOutcome).toBeInstanceOf(Error)
      expect(operationSignal.aborted).toBe(false)
      const neighborStarted = neighborEvents.filter((event) => event.phase === 'started')
      expect(neighborStarted).toHaveLength(1)
      const neighborTerminals = neighborEvents.filter((event) =>
        ['settled', 'failed', 'cancelled'].includes(event.phase),
      )
      expect(neighborTerminals).toHaveLength(1)
      expect(neighborTerminals[0]).toMatchObject({ phase: 'failed', stopReason: 'error' })
      expect(neighborStarted[0]?.modelRequestId).toBeTruthy()
      expect(neighborTerminals[0]?.modelRequestId).toBe(neighborStarted[0]?.modelRequestId)
      expect(neighborStarted[0]?.modelRequestId).not.toBe(events[0]?.modelRequestId)
    } else {
      release.resolve()
    }
    expect(await outcome).toBeInstanceOf(Error)
    // lazyApi calls load once per stream; failed imports need not share a cached load.
    // One caller allows one attempt; two concurrent callers allow at most two.
    expect(loads).toBeGreaterThanOrEqual(1)
    expect(loads).toBeLessThanOrEqual(mode === 'load-abort' ? 2 : 1)
    expect(requests).toBe(0)
    expect(terminals()).toHaveLength(1)
    expect(terminals()[0]).toMatchObject({
      phase: mode === 'load-abort' ? 'cancelled' : 'failed',
      stopReason: mode === 'load-abort' ? 'aborted' : 'error',
    })
  }
  expect(events.filter((event) => event.phase === 'started')).toHaveLength(1)
  console.info(
    JSON.stringify({ type: 'pi-lazy-additional-complete', mode, requests, loads, terminal: terminals()[0]?.phase }),
  )
} finally {
  release.resolve()
  finishResponse.resolve()
  abort.abort()
  await Promise.all([outcome, neighborOutcome])
  await server.stop(true)
}
