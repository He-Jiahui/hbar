import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import type { FetchFunction } from '@earendil-works/pi-ai'
import { providerModelSelectionId, providerSchema, resolveProviderModel } from '@hbar/contracts'
import type { ModelDiagnosticEvent } from '@hbar/plugin-sdk'
import { PiDriver } from '@hbar/pi-driver'
import { withProviderResponseDiagnostics } from '../plugins/pi-driver/src/provider-http-diagnostics'
import { ProviderStreamObservation } from '../plugins/pi-driver/src/provider-stream-diagnostics'

const apiKey = 'provider-key-canary-do-not-log'
const bodyCanary = 'provider-body-canary-do-not-log'
const upstreamRequestId = 'stream-fixture-request-id'
const upstreamRequestIdHash = createHash('sha256').update(upstreamRequestId).digest('hex')
const headers = { 'content-type': 'text/event-stream', 'x-request-id': upstreamRequestId }

function request(baseUrl: string) {
  const provider = providerSchema.parse({
    id: 'niuma_openai',
    name: 'Pi stream fixture',
    protocol: 'openai-responses',
    baseUrl,
    model: 'gpt-6.1-sol',
    models: [
      {
        id: 'gpt-6.1-sol',
        name: 'gpt-6.1-sol',
        contextWindow: 272_000,
        maxOutput: 8_192,
        thinkingLevels: ['low', 'medium', 'high'],
        defaultThinkingLevel: 'low',
      },
    ],
    contextWindow: 272_000,
    maxOutput: 8_192,
    thinkingLevels: ['low', 'medium', 'high'],
    defaultThinkingLevel: 'low',
  })
  const selectionId = providerModelSelectionId(provider, 'gpt-6.1-sol')
  return {
    system: 'Bounded provider stream observation fixture.',
    messages: [],
    model: { ...resolveProviderModel(provider, selectionId), id: selectionId },
    context: { sessionId: 'stream-observation-fixture', thinking: 'low' as const },
  }
}

function event(type: string, value: Record<string, unknown>) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`
}

async function startFixture(fetch: (request: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch })
  return { server, baseUrl: `http://127.0.0.1:${server.port}/v1` }
}

function assertOneFailure(events: readonly ModelDiagnosticEvent[], streamErrorClass: string) {
  const started = events.filter((item) => item.phase === 'started')
  const terminal = events.filter((item) => ['settled', 'failed', 'cancelled'].includes(item.phase))
  expect(started).toHaveLength(1)
  expect(terminal).toHaveLength(1)
  expect(terminal[0]?.phase).toBe('failed')
  expect(terminal[0]?.modelRequestId).toBe(started[0]?.modelRequestId)
  expect(terminal[0]).toMatchObject({
    purpose: 'compaction',
    httpStatus: 200,
    upstreamRequestIdSha256: upstreamRequestIdHash,
    streamSubtype: 'provider_error',
    streamErrorClass,
  })
  expect(JSON.stringify(events)).not.toContain(apiKey)
  expect(JSON.stringify(events)).not.toContain(bodyCanary)
}

const providerErrorCases = [
  {
    name: 'named error event with top-level code',
    frame: `event: error\ndata: ${JSON.stringify({ code: 'invalid_api_key', message: bodyCanary })}\n\n`,
    errorClass: 'authentication',
  },
  {
    name: 'named error event with wrapped error code',
    frame: `event: error\ndata: ${JSON.stringify({ error: { code: 'rate_limit_exceeded', message: bodyCanary } })}\n\n`,
    errorClass: 'rate_limit',
  },
  {
    name: 'anonymous data error object',
    frame: `data: ${JSON.stringify({ error: { code: 'invalid_request_error', message: bodyCanary } })}\n\n`,
    errorClass: 'invalid_request',
  },
  {
    name: 'Responses response.failed event',
    frame: event('response.failed', {
      response: { id: 'resp-safe', status: 'failed', error: { code: 'server_error', message: bodyCanary } },
    }),
    errorClass: 'upstream',
  },
  {
    name: 'context capacity error event',
    frame: event('response.failed', {
      response: { error: { code: 'context_length_exceeded', message: bodyCanary } },
    }),
    errorClass: 'context_capacity',
  },
] as const

for (const item of providerErrorCases) {
  test(`Pi summarize emits one safe terminal diagnostic for ${item.name}`, async () => {
    const fixture = await startFixture(() => new Response(item.frame, { status: 200, headers }))
    try {
      const diagnostics: ModelDiagnosticEvent[] = []
      await expect(
        new PiDriver().summarize(request(fixture.baseUrl), apiKey, AbortSignal.timeout(5_000), (diagnostic) =>
          diagnostics.push(diagnostic),
        ),
      ).rejects.toThrow()
      assertOneFailure(diagnostics, item.errorClass)
    } finally {
      await fixture.server.stop(true)
    }
  })
}

test('transport response observer preserves body bytes and stream cancellation when observers throw', async () => {
  const source = new TextEncoder().encode(
    `data: ${JSON.stringify({ error: { code: 'invalid_api_key', message: bodyCanary } })}\n\n`,
  )
  const cancellationReason = { kind: 'caller-cancel', canary: bodyCanary }
  let sourceCancelledWith: unknown
  const original = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(source)
      },
      cancel(reason) {
        sourceCancelledWith = reason
      },
    }),
    { status: 200, headers },
  )
  const fetchImpl = Object.assign(async () => original, { preconnect: () => undefined }) as FetchFunction
  const observed = withProviderResponseDiagnostics(
    fetchImpl,
    () => {
      throw new Error(bodyCanary)
    },
    () => {
      throw new Error(bodyCanary)
    },
    () => {
      throw new Error(bodyCanary)
    },
    () => {
      throw new Error(bodyCanary)
    },
  )

  const response = await observed('http://fixture.invalid')
  const reader = response.body!.getReader()
  const first = await reader.read()
  expect(first.value).toEqual(source)
  await reader.cancel(cancellationReason)
  expect(sourceCancelledWith).toBe(cancellationReason)
})

test('observed Response supports text, JSON and arrayBuffer reads with HTTP metadata intact', async () => {
  const text = JSON.stringify({ error: { code: 'server_error', message: bodyCanary } })
  for (const method of ['text', 'json', 'arrayBuffer'] as const) {
    const original = new Response(text, {
      status: 502,
      statusText: 'Fixture upstream unavailable',
      headers: { ...headers, 'content-type': 'application/json' },
    })
    Object.defineProperties(original, {
      url: { value: 'http://fixture.invalid/v1/responses' },
      redirected: { value: true },
      type: { value: 'basic' },
    })
    const fetchImpl = Object.assign(async () => original, { preconnect: () => undefined }) as FetchFunction
    let eofCount = 0
    const response = await withProviderResponseDiagnostics(
      fetchImpl,
      () => {
        throw new Error(bodyCanary)
      },
      undefined,
      () => {
        throw new Error(bodyCanary)
      },
      () => {
        eofCount++
      },
    )('http://fixture.invalid')
    expect(response.status).toBe(502)
    expect(response.statusText).toBe(original.statusText)
    expect(response.url).toBe(original.url)
    expect(response.redirected).toBe(true)
    expect(response.type).toBe('basic')
    expect(response.headers.get('x-request-id')).toBe(upstreamRequestId)
    expect(response.headers.get('content-type')).toBe('application/json')
    if (method === 'text') expect(await response.text()).toBe(text)
    else if (method === 'json') {
      const parsed: unknown = await response.json()
      expect(parsed).toEqual({ error: { code: 'server_error', message: bodyCanary } })
    } else expect(new Uint8Array(await response.arrayBuffer())).toEqual(new TextEncoder().encode(text))
    expect(response.bodyUsed).toBe(true)
    expect(eofCount).toBe(1)
  }
})

test('transport stream read failure reports its nested cause and stream phase, then preserves the error', async () => {
  const sourceError = Object.assign(new Error('stream transport canary'), {
    cause: Object.assign(new Error('socket cause canary'), { code: 'ECONNRESET' }),
  })
  let pullCount = 0
  const fetchImpl = Object.assign(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (pullCount++ === 0) controller.enqueue(new TextEncoder().encode('data: {"type":"response.created"}\n\n'))
            else throw sourceError
          },
        }),
        { status: 200, headers },
      ),
    { preconnect: () => undefined },
  ) as FetchFunction
  const failures: Array<{ kind: string; code?: string; phase?: string }> = []
  const observed = withProviderResponseDiagnostics(
    fetchImpl,
    () => undefined,
    (kind, code, phase) => failures.push({ kind, ...(code ? { code } : {}), ...(phase ? { phase } : {}) }),
  )

  const response = await observed('http://fixture.invalid')
  await expect(response.arrayBuffer()).rejects.toBe(sourceError)
  expect(failures).toEqual([{ kind: 'connection', code: 'ECONNRESET', phase: 'stream' }])
  expect(JSON.stringify(failures)).not.toContain('canary')
})

test('transport framing retains earlier small error metadata and ignores unknown oversized frames', async () => {
  const smallError = `event: error\r\ndata: ${JSON.stringify({ code: 'invalid_api_key', message: bodyCanary })}\r\n\r\n`
  const oversized = `data: ${JSON.stringify({ opaque: 'x'.repeat(5_000) })}\r\n\r\n`
  const trailing = `data: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed' } })}\r\n\r\n`
  const bytes = new TextEncoder().encode(`${smallError}${oversized}${trailing}`)
  const fetchImpl = Object.assign(async () => new Response(bytes, { status: 200, headers }), {
    preconnect: () => undefined,
  }) as FetchFunction
  const providerCodes: unknown[] = []
  const observed = withProviderResponseDiagnostics(
    fetchImpl,
    () => undefined,
    undefined,
    (code) => providerCodes.push(code),
  )

  const response = await observed('http://fixture.invalid')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  expect(providerCodes).toEqual(['invalid_api_key'])
  expect(JSON.stringify(providerCodes)).not.toContain(bodyCanary)
})

test('stream framing recovers after a split oversized delimiter and observes a multiline named error', async () => {
  const parts = [
    `data: ${JSON.stringify({ opaque: 'x'.repeat(5_000) })}\r\n\r`,
    `\nevent:error\r\ndata: {"error":\r\ndata: ${JSON.stringify({ code: 'context_length_exceeded', message: bodyCanary })}}\r\n\r\n`,
  ]
  const fetchImpl = Object.assign(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const part of parts) controller.enqueue(new TextEncoder().encode(part))
            controller.close()
          },
        }),
        { status: 200, headers },
      ),
    { preconnect: () => undefined },
  ) as FetchFunction
  const providerCodes: unknown[] = []
  const response = await withProviderResponseDiagnostics(
    fetchImpl,
    () => undefined,
    undefined,
    (code) => providerCodes.push(code),
  )('http://fixture.invalid')
  expect(await response.text()).toBe(parts.join(''))
  expect(providerCodes).toEqual(['context_length_exceeded'])
  expect(JSON.stringify(providerCodes)).not.toContain(bodyCanary)
})

test('ProviderStreamObservation separates text and thinking and does not infer EOF after parser failure', () => {
  const observation = new ProviderStreamObservation()
  observation.observe({ type: 'response.output_text.delta', delta: 'ordinary text' })
  observation.observe({ type: 'response.reasoning_summary_text.delta', delta: 'private thinking' })
  observation.observe({ type: 'response.failed', response: { error: { code: 'server_error' } } })
  observation.markProviderError('server_error')
  expect(observation.facts('unknown')).toMatchObject({
    streamSubtype: 'provider_error',
    streamEventCount: 3,
    streamTextChars: 'ordinary text'.length,
    streamThinkingChars: 'private thinking'.length,
    streamErrorClass: 'upstream',
  })

  const parserFailure = new ProviderStreamObservation()
  expect(parserFailure.facts('unknown').streamSubtype).toBe('unknown')
  expect(parserFailure.facts('unknown').streamSubtype).not.toBe('eof')
})

test('parsed oversized errors retain safe classification and unrelated events do not erase a known error', () => {
  const observation = new ProviderStreamObservation()
  observation.observe({
    type: 'response.failed',
    response: { error: { code: 'context_length_exceeded', message: bodyCanary.repeat(1_000) } },
  })
  observation.observe({ type: 'response.created' })
  observation.markProviderError()
  expect(observation.facts('unknown')).toMatchObject({
    streamSubtype: 'provider_error',
    streamEventCount: 2,
    streamErrorClass: 'context_capacity',
  })
  expect(JSON.stringify(observation.facts('unknown'))).not.toContain(bodyCanary)
})

test('response.completed is observed before a kept-open body is cancelled by the bounded signal', async () => {
  const received = Promise.withResolvers<void>()
  const fixture = await startFixture(() => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            event('response.completed', {
              response: {
                id: 'resp-open-body',
                status: 'completed',
                output: [],
                usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
              },
            }),
          ),
        )
        received.resolve()
      },
    })
    return new Response(stream, { status: 200, headers })
  })
  const controller = new AbortController()
  const diagnostics: ModelDiagnosticEvent[] = []
  const pending = new PiDriver().summarize(request(fixture.baseUrl), apiKey, controller.signal, (item) =>
    diagnostics.push(item),
  )
  const deadline = setTimeout(
    () => controller.abort(new DOMException('bounded fixture cancellation', 'AbortError')),
    500,
  )
  try {
    await Promise.race([
      received.promise,
      Bun.sleep(1_000).then(() => Promise.reject(new Error('fixture request deadline'))),
    ])
    const outcome = await Promise.race([
      pending.then(
        () => 'resolved',
        () => 'rejected',
      ),
      Bun.sleep(2_000).then(() => 'pending'),
    ])
    expect(outcome).toBe('rejected')
    const terminal = diagnostics.filter((item) => ['settled', 'failed', 'cancelled'].includes(item.phase))
    expect(terminal).toHaveLength(1)
    expect(terminal[0]).toMatchObject({
      phase: 'cancelled',
      stopReason: 'aborted',
      streamSubtype: 'completed',
      transportKind: 'abort',
    })
  } finally {
    clearTimeout(deadline)
    controller.abort()
    await fixture.server.stop(true)
  }
})

test('a kept-open provider error remains the terminal cause when SDK cleanup aborts its body reader', async () => {
  const fixture = await startFixture(
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `event:error\ndata: ${JSON.stringify({
                  error: { code: 'server_error', message: bodyCanary },
                })}\n\n`,
              ),
            )
            // Leave the upstream body open. The SDK cancels it after reading error.
          },
        }),
        { status: 200, headers },
      ),
  )
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new DOMException('fixture watchdog', 'TimeoutError')), 2_000)
  try {
    const diagnostics: ModelDiagnosticEvent[] = []
    await expect(
      new PiDriver().summarize(request(fixture.baseUrl), apiKey, controller.signal, (item) => diagnostics.push(item)),
    ).rejects.toThrow()
    expect(controller.signal.aborted).toBe(false)
    assertOneFailure(diagnostics, 'upstream')
    const terminal = diagnostics.find((item) => item.phase === 'failed')
    expect(terminal).toMatchObject({
      failureKind: 'stream',
      failurePhase: 'stream',
      errorCode: 'PROVIDER_STREAM_INTERRUPTED',
      stopReason: 'error',
      streamSubtype: 'provider_error',
      streamErrorClass: 'upstream',
    })
    expect(terminal?.errorCode).not.toBe('PROVIDER_ABORTED')
  } finally {
    clearTimeout(timeout)
    controller.abort()
    await fixture.server.stop(true)
  }
})
