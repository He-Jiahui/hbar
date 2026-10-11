import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  providerModelSelectionId,
  providerSchema,
  resolveProviderModel,
  runSchema,
  sessionSchema,
  workspaceSchema,
  type ContentBlock,
  type Message,
} from '@hbar/contracts'
import { z } from 'zod'
import type { DriverInput, ModelDiagnosticEvent } from '@hbar/plugin-sdk'
import { PiDriver } from '@hbar/pi-driver'

const model = (baseUrl: string) =>
  (() => {
    const provider = providerSchema.parse({
      id: 'niuma_openai',
      name: 'gpt-6.1-sol fixture',
      protocol: 'openai-completions',
      baseUrl,
      model: 'gpt-6.1-sol',
      models: [
        {
          id: 'gpt-6.1-sol',
          maxOutput: 8_192,
          contextWindow: 272_000,
          thinkingLevels: ['off', 'low', 'medium', 'high', 'xhigh'],
          defaultThinkingLevel: 'xhigh',
        },
        {
          id: 'gpt-6-astra',
          maxOutput: 8_192,
          contextWindow: 272_000,
          thinkingLevels: ['off', 'low', 'medium', 'high', 'xhigh'],
          defaultThinkingLevel: 'xhigh',
        },
      ],
      contextWindow: 272_000,
      maxOutput: 8_192,
      thinkingLevels: ['off', 'low', 'medium', 'high', 'xhigh'],
      defaultThinkingLevel: 'xhigh',
    })
    const selectionId = providerModelSelectionId(provider, 'gpt-6.1-sol')
    return { ...resolveProviderModel(provider, selectionId), id: selectionId }
  })()

const request = (baseUrl: string) => ({
  system: 'Summarize the conversation without exposing private data.',
  messages: [],
  model: model(baseUrl),
  context: { sessionId: 'diagnostic-session', thinking: 'xhigh' as const },
})
const responsesRequest = (baseUrl: string) => ({
  ...(() => {
    const base = request(baseUrl)
    return { ...base, model: { ...base.model, protocol: 'openai-responses' as const } }
  })(),
})
const UPSTREAM_REQUEST_ID = 'fixture-upstream-request-42'
const requestIdHash = createHash('sha256').update(UPSTREAM_REQUEST_ID).digest('hex')
const sseHeaders = { 'content-type': 'text/event-stream', 'x-request-id': UPSTREAM_REQUEST_ID }

function chunk(content: string, finishReason: string | null = null) {
  return `data: ${JSON.stringify({
    id: 'fixture-response',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gpt-6.1-sol',
    choices: [{ index: 0, delta: { content }, finish_reason: finishReason }],
  })}\n\n`
}

function responseEvent(type: string, data: Record<string, unknown>) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
}

function responsesTextSse(text: string) {
  const content = { type: 'output_text', text, annotations: [] }
  const item = {
    id: 'msg_responses_fixture',
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [content],
  }
  return (
    responseEvent('response.created', { response: { id: 'resp_fixture', status: 'in_progress' } }) +
    responseEvent('response.output_item.added', { output_index: 0, item: { ...item, content: [] } }) +
    responseEvent('response.content_part.added', {
      output_index: 0,
      content_index: 0,
      part: { ...content, text: '' },
    }) +
    responseEvent('response.output_text.delta', { output_index: 0, content_index: 0, delta: text }) +
    responseEvent('response.output_item.done', { output_index: 0, item }) +
    responseEvent('response.completed', {
      response: {
        id: 'resp_fixture',
        status: 'completed',
        output: [item],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      },
    })
  )
}

async function startFixture(response: (request: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: response })
  return { server, baseUrl: `http://127.0.0.1:${server.port}/v1` }
}

function assertLifecycle(
  events: readonly ModelDiagnosticEvent[],
  terminal: ModelDiagnosticEvent['phase'],
  responseStatus?: number,
  purpose: 'compaction' | 'model' = 'compaction',
  protocol: 'openai-completions' | 'openai-responses' = 'openai-completions',
  transportKind?: ModelDiagnosticEvent['transportKind'],
) {
  const started = events.filter((event) => event.phase === 'started')
  const terminals = events.filter((event) => event.phase === terminal)
  const terminalEvents = events.filter((event) => ['settled', 'failed', 'cancelled'].includes(event.phase))
  const responses = events.filter((event) => event.phase === 'response')
  const transports = events.filter((event) => event.phase === 'transport_failure')
  expect(started).toHaveLength(1)
  expect(terminals).toHaveLength(1)
  expect(terminalEvents).toHaveLength(1)
  expect(events).toHaveLength(started.length + responses.length + transports.length + terminalEvents.length)
  expect(started[0]).toMatchObject({ phase: 'started', purpose })
  expect(terminals[0]).toMatchObject({ phase: terminal, purpose })
  expect(started[0]?.modelSelectionId).toBe('niuma_openai/gpt-6.1-sol')
  expect(started[0]?.providerId).toBe('niuma_openai')
  expect(started[0]?.model).toBe('gpt-6.1-sol')
  expect(started[0]?.protocol).toBe(protocol)
  expect(started[0]?.modelRequestId).toBeTruthy()
  expect(terminals[0]?.modelRequestId).toBe(started[0]?.modelRequestId)
  if (responseStatus === undefined) expect(responses).toHaveLength(0)
  else {
    expect(responses).toHaveLength(1)
    expect(responses[0]?.httpStatus).toBe(responseStatus)
    expect(responses[0]?.upstreamRequestIdSha256).toBe(requestIdHash)
  }
  expect(terminals[0]?.httpStatus).toBe(responseStatus)
  if (responseStatus !== undefined) expect(terminals[0]?.upstreamRequestIdSha256).toBe(requestIdHash)
  else expect(terminals[0]?.upstreamRequestIdSha256).toBeUndefined()
  if (transportKind === undefined) expect(transports).toHaveLength(0)
  else {
    expect(transports).toHaveLength(1)
    expect(transports[0]).toMatchObject({ phase: 'transport_failure', purpose, transportKind })
    expect(transports[0]?.modelRequestId).toBe(started[0]?.modelRequestId)
    expect(terminals[0]?.transportKind).toBe(transportKind)
    expect(terminals[0]?.transportCode).toBe(transports[0]?.transportCode)
  }
  if (terminal === 'failed') {
    const failureKind =
      transportKind === undefined
        ? responseStatus === undefined
          ? 'unknown'
          : responseStatus >= 400
            ? 'http'
            : 'stream'
        : 'transport'
    const failurePhase =
      failureKind === 'transport'
        ? 'fetch'
        : failureKind === 'http'
          ? 'response'
          : failureKind === 'stream'
            ? 'stream'
            : 'terminal'
    expect(terminals[0]).toMatchObject({ failureKind, failurePhase })
  } else {
    expect(terminals[0]?.failureKind).toBeUndefined()
    expect(terminals[0]?.failurePhase).toBeUndefined()
    expect(terminals[0]?.errorCode).toBeUndefined()
  }
  expect(JSON.stringify(events)).not.toContain('fixture-only')
  expect(JSON.stringify(events)).not.toContain('canary')
  expect(
    Object.values(events).some((event) => Object.keys(event).some((key) => key === 'status' || key === 'headers')),
  ).toBeFalse()
}

async function awaitArrival(arrival: Promise<void>, label: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      arrival,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 1_000)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function runInput(
  baseUrl: string,
  signal: AbortSignal,
  events: ModelDiagnosticEvent[],
  protocol: 'openai-completions' | 'openai-responses' = 'openai-completions',
): DriverInput {
  const selectedModel = model(baseUrl)
  const selection = protocol === 'openai-responses' ? { ...selectedModel, protocol } : selectedModel
  const session = sessionSchema.parse({
    id: 'run-session',
    workspaceId: 'run-workspace',
    title: 'Fixture',
    archived: false,
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    seq: 0,
  })
  const workspace = workspaceSchema.parse({ id: 'run-workspace', name: 'Fixture', path: '.', createdAt: 1 })
  const run = runSchema.parse({
    id: 'run-id',
    sessionId: session.id,
    requestId: 'run-request',
    input: { text: 'ordinary request', images: [], thinking: 'xhigh' },
    modelId: selection.id,
    status: 'running',
    createdAt: 1,
    startedAt: 1,
    endedAt: null,
    error: null,
  })
  let sequence = 0
  const commit = (
    role: Message['role'],
    content: ContentBlock[],
    id: string = crypto.randomUUID(),
    providerData?: unknown,
  ): Message => ({
    id,
    sessionId: session.id,
    runId: run.id,
    role,
    content,
    seq: ++sequence,
    createdAt: sequence,
    ...(providerData === undefined ? {} : { providerData }),
  })
  return {
    session,
    workspace,
    run,
    request: { system: 'ordinary request', messages: [], model: selection },
    tools: [],
    apiKey: 'fixture-only',
    signal,
    onModelDiagnostic: (event) => events.push(event),
    resolveKey: async () => 'fixture-only',
    readImage: async () => ({ mime: 'image/png', data: '' }),
    readFile: async () => ({ name: 'fixture.txt', mime: 'text/plain', size: 0, text: '', truncated: false }),
    emit: async (type, data, stepId) => ({
      eventId: crypto.randomUUID(),
      sessionId: session.id,
      runId: run.id,
      stepId: stepId ?? null,
      type,
      data,
      time: ++sequence,
      version: 1,
      seq: sequence,
    }),
    commit: async (role, content, id, providerData) => commit(role, content, id, providerData),
    stream: () => {},
    execute: async () => ({ text: 'unused', isError: false }),
    beforeRequest: async (request) => request,
    stepEnded: async () => undefined,
  }
}

test('Pi compaction diagnostics preserve selection identity and one started/terminal pair on stop and length', async () => {
  const fixture = await startFixture(async (request) => {
    expect(request.headers.get('authorization')).toBe('Bearer fixture-only')
    const body = z.object({ model: z.string() }).parse(await request.json())
    expect(body.model).toBe('gpt-6.1-sol')
    return new Response(chunk('summary') + chunk('', 'stop') + 'data: [DONE]\n\n', {
      headers: sseHeaders,
    })
  })
  try {
    const events: ModelDiagnosticEvent[] = []
    const result = await new PiDriver().summarize(
      request(fixture.baseUrl),
      'fixture-only',
      AbortSignal.timeout(5_000),
      (event) => events.push(event),
    )
    expect(result.text).toBe('summary')
    assertLifecycle(events, 'settled', 200)
  } finally {
    await fixture.server.stop(true)
  }

  const lengthFixture = await fixtureForFinish('length')
  try {
    const events: ModelDiagnosticEvent[] = []
    await expect(
      new PiDriver().summarize(request(lengthFixture.baseUrl), 'fixture-only', AbortSignal.timeout(5_000), (event) =>
        events.push(event),
      ),
    ).rejects.toMatchObject({ code: 'COMPACTION_INCOMPLETE' })
    assertLifecycle(events, 'failed', 200)
    expect(events.find((event) => event.phase === 'failed')).toMatchObject({
      stopReason: 'length',
      streamSubtype: 'incomplete',
      errorCode: 'COMPACTION_INCOMPLETE',
    })
  } finally {
    await lengthFixture.server.stop(true)
  }
})

async function fixtureForFinish(reason: 'length') {
  return startFixture(
    () =>
      new Response(chunk('partial', reason) + 'data: [DONE]\n\n', {
        headers: sseHeaders,
      }),
  )
}

test('Pi compaction diagnostics report provider errors without leaking generic upstream text or API keys', async () => {
  const fixture = await startFixture(() =>
    Response.json(
      { error: { message: 'genericUpstream canary secret' } },
      { status: 502, headers: { 'x-request-id': UPSTREAM_REQUEST_ID } },
    ),
  )
  try {
    const events: ModelDiagnosticEvent[] = []
    await expect(
      new PiDriver().summarize(request(fixture.baseUrl), 'fixture-only', AbortSignal.timeout(5_000), (event) =>
        events.push(event),
      ),
    ).rejects.toThrow()
    assertLifecycle(events, 'failed', 502)
    expect(JSON.stringify(events)).not.toContain('genericUpstream')
    expect(JSON.stringify(events)).not.toContain('secret')
  } finally {
    await fixture.server.stop(true)
  }
})

test('Pi compaction diagnostics retain a 401 response classification without retaining its body', async () => {
  const fixture = await startFixture(
    () =>
      new Response(JSON.stringify({ error: { message: 'unauthorized canary body' }, unknownHeader: 'secret' }), {
        status: 401,
        headers: {
          'content-type': 'application/json',
          'x-request-id': UPSTREAM_REQUEST_ID,
          'x-unknown-header': 'secret',
        },
      }),
  )
  try {
    const events: ModelDiagnosticEvent[] = []
    await expect(
      new PiDriver().summarize(request(fixture.baseUrl), 'fixture-only', AbortSignal.timeout(5_000), (event) =>
        events.push(event),
      ),
    ).rejects.toThrow()
    assertLifecycle(events, 'failed', 401)
    expect(JSON.stringify(events)).not.toContain('unauthorized canary')
    expect(JSON.stringify(events)).not.toContain('unknownHeader')
  } finally {
    await fixture.server.stop(true)
  }
})

test('Pi compaction diagnostics report abort and malformed provider conversion as terminal failures', async () => {
  const requestSeen = Promise.withResolvers<void>()
  const abortFixture = await startFixture(async () => {
    requestSeen.resolve()
    await Bun.sleep(200)
    return new Response(chunk('late') + chunk('', 'stop') + 'data: [DONE]\n\n', {
      headers: sseHeaders,
    })
  })
  const controller = new AbortController()
  let pendingOutcome: Promise<unknown> = Promise.resolve(null)
  try {
    const events: ModelDiagnosticEvent[] = []
    const pending = new PiDriver().summarize(
      request(abortFixture.baseUrl),
      'fixture-only',
      controller.signal,
      (event) => events.push(event),
    )
    pendingOutcome = pending.then(
      () => null,
      (error: unknown) => error,
    )
    // The fixture has received this request before the abort is issued.
    await awaitArrival(requestSeen.promise, 'compaction provider request')
    controller.abort()
    expect(await pendingOutcome).toBeInstanceOf(Error)
    assertLifecycle(events, 'cancelled', undefined, 'compaction', 'openai-completions', 'abort')
  } finally {
    controller.abort()
    await pendingOutcome
    await abortFixture.server.stop(true)
  }

  const malformed = await startFixture(() => new Response('data: {not-json}\n\n', { headers: sseHeaders }))
  try {
    const events: ModelDiagnosticEvent[] = []
    await expect(
      new PiDriver().summarize(request(malformed.baseUrl), 'fixture-only', AbortSignal.timeout(5_000), (event) =>
        events.push(event),
      ),
    ).rejects.toThrow()
    assertLifecycle(events, 'failed', 200)
  } finally {
    await malformed.server.stop(true)
  }
})

test('a diagnostic callback that throws does not change a successful provider result', async () => {
  const fixture = await startFixture(
    () =>
      new Response(chunk('summary') + chunk('', 'stop') + 'data: [DONE]\n\n', {
        headers: sseHeaders,
      }),
  )
  try {
    const result = await new PiDriver().summarize(
      request(fixture.baseUrl),
      'fixture-only',
      AbortSignal.timeout(5_000),
      () => {
        throw new Error('diagnostic callback canary')
      },
    )
    expect(result.text).toBe('summary')
  } finally {
    await fixture.server.stop(true)
  }
})

test('ordinary Pi.run emits one model lifecycle pair for success, provider error, abort, and throwing diagnostics', async () => {
  const success = await startFixture(
    () =>
      new Response(chunk('answer') + chunk('', 'stop') + 'data: [DONE]\n\n', {
        headers: sseHeaders,
      }),
  )
  try {
    const events: ModelDiagnosticEvent[] = []
    await new PiDriver().run(runInput(success.baseUrl, AbortSignal.timeout(5_000), events))
    const successStarted = events.find((event) => event.phase === 'started')
    const successTerminal = events.find((event) => event.phase === 'settled')
    const successResponse = events.find((event) => event.phase === 'response')
    expect(successStarted).toMatchObject({ purpose: 'model' })
    expect(successTerminal).toMatchObject({ purpose: 'model', stopReason: 'stop' })
    expect(successTerminal?.modelRequestId).toBe(successStarted?.modelRequestId)
    expect(successTerminal).toMatchObject({ streamSubtype: 'completed', streamEventCount: 2, streamTextChars: 6 })
    expect(successResponse).toMatchObject({ httpStatus: 200, upstreamRequestIdSha256: requestIdHash })
    expect(events).toHaveLength(3)
  } finally {
    await success.server.stop(true)
  }

  const failed = await startFixture(
    () =>
      new Response(JSON.stringify({ error: { message: 'genericUpstream canary' } }), {
        status: 502,
        headers: { 'content-type': 'application/json', 'x-request-id': UPSTREAM_REQUEST_ID },
      }),
  )
  try {
    const events: ModelDiagnosticEvent[] = []
    await expect(new PiDriver().run(runInput(failed.baseUrl, AbortSignal.timeout(5_000), events))).rejects.toThrow()
    const failedStarted = events.find((event) => event.phase === 'started')
    const failedTerminal = events.find((event) => event.phase === 'failed')
    const failedResponse = events.find((event) => event.phase === 'response')
    expect(failedStarted).toMatchObject({ purpose: 'model' })
    expect(failedTerminal).toMatchObject({
      purpose: 'model',
      stopReason: 'error',
      failureKind: 'http',
      failurePhase: 'response',
      errorCode: 'PROVIDER_HTTP_ERROR',
      httpStatus: 502,
    })
    expect(failedTerminal?.modelRequestId).toBe(failedStarted?.modelRequestId)
    expect(failedResponse).toMatchObject({ httpStatus: 502, upstreamRequestIdSha256: requestIdHash })
    expect(events.filter((event) => event.phase === 'failed')).toHaveLength(1)
    expect(events).toHaveLength(3)
    expect(JSON.stringify(events)).not.toContain('genericUpstream')
  } finally {
    await failed.server.stop(true)
  }

  const runRequest = Promise.withResolvers<void>()
  const abort = await startFixture(async () => {
    runRequest.resolve()
    await Bun.sleep(200)
    return new Response(chunk('late') + chunk('', 'stop') + 'data: [DONE]\n\n', {
      headers: sseHeaders,
    })
  })
  const controller = new AbortController()
  let pendingOutcome: Promise<unknown> = Promise.resolve(null)
  try {
    const events: ModelDiagnosticEvent[] = []
    const pending = new PiDriver().run(runInput(abort.baseUrl, controller.signal, events))
    pendingOutcome = pending.then(
      () => null,
      (error: unknown) => error,
    )
    await awaitArrival(runRequest.promise, 'ordinary provider request')
    controller.abort()
    expect(await pendingOutcome).toBeInstanceOf(Error)
    expect(events.filter((event) => event.phase === 'started')).toHaveLength(1)
    expect(events.filter((event) => event.phase === 'cancelled')).toHaveLength(1)
    expect(events.find((event) => event.phase === 'cancelled')).toMatchObject({
      purpose: 'model',
      stopReason: 'aborted',
    })
    expect(events.filter((event) => event.phase === 'transport_failure')).toHaveLength(1)
    expect(events.find((event) => event.phase === 'transport_failure')).toMatchObject({
      purpose: 'model',
      transportKind: 'abort',
    })
    expect(events.filter((event) => event.phase === 'response')).toHaveLength(0)
    expect(events).toHaveLength(3)
  } finally {
    controller.abort()
    await pendingOutcome
    await abort.server.stop(true)
  }

  const callback = await startFixture(
    () =>
      new Response(chunk('answer') + chunk('', 'stop') + 'data: [DONE]\n\n', {
        headers: sseHeaders,
      }),
  )
  try {
    const events: ModelDiagnosticEvent[] = []
    const input = runInput(callback.baseUrl, AbortSignal.timeout(5_000), events)
    input.onModelDiagnostic = () => {
      throw new Error('diagnostic callback canary')
    }
    await new PiDriver().run(input)
    expect(events).toHaveLength(0)
  } finally {
    await callback.server.stop(true)
  }
})

test('OpenAI Responses compaction and ordinary inference retain response metadata on a real SSE success', async () => {
  const fixture = await startFixture(async (request) => {
    expect(new URL(request.url).pathname).toBe('/v1/responses')
    expect(request.headers.get('authorization')).toBe('Bearer fixture-only')
    const body = z
      .object({ model: z.string(), input: z.array(z.unknown()) })
      .passthrough()
      .parse(await request.json())
    expect(body.model).toBe('gpt-6.1-sol')
    return new Response(responsesTextSse('summary'), { headers: sseHeaders })
  })
  try {
    const summaryEvents: ModelDiagnosticEvent[] = []
    const summary = await new PiDriver().summarize(
      responsesRequest(fixture.baseUrl),
      'fixture-only',
      AbortSignal.timeout(5_000),
      (event) => summaryEvents.push(event),
    )
    expect(summary.text).toBe('summary')
    assertLifecycle(summaryEvents, 'settled', 200, 'compaction', 'openai-responses')

    const runEvents: ModelDiagnosticEvent[] = []
    await new PiDriver().run(runInput(fixture.baseUrl, AbortSignal.timeout(5_000), runEvents, 'openai-responses'))
    assertLifecycle(runEvents, 'settled', 200, 'model', 'openai-responses')
  } finally {
    await fixture.server.stop(true)
  }
})

test('OpenAI Responses provider errors preserve 401 and 502 status plus request identity without body leakage', async () => {
  for (const status of [401, 502] as const) {
    const fixture = await startFixture(async (request) => {
      expect(new URL(request.url).pathname).toBe('/v1/responses')
      const body = z
        .object({ model: z.string(), input: z.array(z.unknown()) })
        .passthrough()
        .parse(await request.json())
      expect(body.model).toBe('gpt-6.1-sol')
      return Response.json(
        { error: { message: `responses-${status} genericUpstream canary` }, unknownHeader: 'secret' },
        {
          status,
          headers: { 'x-request-id': UPSTREAM_REQUEST_ID, 'x-unknown-header': 'secret' },
        },
      )
    })
    try {
      const events: ModelDiagnosticEvent[] = []
      await expect(
        new PiDriver().summarize(
          responsesRequest(fixture.baseUrl),
          'fixture-only',
          AbortSignal.timeout(5_000),
          (event) => events.push(event),
        ),
      ).rejects.toThrow()
      assertLifecycle(events, 'failed', status, 'compaction', 'openai-responses')
      expect(JSON.stringify(events)).not.toContain('genericUpstream')
      expect(JSON.stringify(events)).not.toContain('unknownHeader')
      expect(JSON.stringify(events)).not.toContain('secret')
    } finally {
      await fixture.server.stop(true)
    }
  }
})

test('OpenAI Responses abort after request arrival emits no response phase', async () => {
  const requestSeen = Promise.withResolvers<void>()
  const fixture = await startFixture(async (request) => {
    expect(new URL(request.url).pathname).toBe('/v1/responses')
    requestSeen.resolve()
    await Bun.sleep(200)
    return new Response(responsesTextSse('late'), { headers: sseHeaders })
  })
  const controller = new AbortController()
  let pendingOutcome: Promise<unknown> = Promise.resolve(null)
  try {
    const events: ModelDiagnosticEvent[] = []
    const pending = new PiDriver().summarize(
      responsesRequest(fixture.baseUrl),
      'fixture-only',
      controller.signal,
      (event) => events.push(event),
    )
    pendingOutcome = pending.then(
      () => null,
      (error: unknown) => error,
    )
    await awaitArrival(requestSeen.promise, 'Responses provider request')
    controller.abort()
    expect(await pendingOutcome).toBeInstanceOf(Error)
    assertLifecycle(events, 'cancelled', undefined, 'compaction', 'openai-responses', 'abort')
  } finally {
    controller.abort()
    await pendingOutcome
    await fixture.server.stop(true)
  }
})

test('transport diagnostics preserve connection refusal for compaction and ordinary model calls without raw errors', async () => {
  const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('unused') })
  const unavailableBaseUrl = `http://127.0.0.1:${probe.port}/v1`
  await probe.stop(true)

  const summaryEvents: ModelDiagnosticEvent[] = []
  await expect(
    new PiDriver().summarize(request(unavailableBaseUrl), 'fixture-only', AbortSignal.timeout(5_000), (event) =>
      summaryEvents.push(event),
    ),
  ).rejects.toThrow()
  assertLifecycle(summaryEvents, 'failed', undefined, 'compaction', 'openai-completions', 'connection')
  expect(summaryEvents.find((event) => event.phase === 'transport_failure')?.transportCode).toBe('ConnectionRefused')
  expect(JSON.stringify(summaryEvents)).not.toContain(unavailableBaseUrl)

  const runEvents: ModelDiagnosticEvent[] = []
  await expect(
    new PiDriver().run(runInput(unavailableBaseUrl, AbortSignal.timeout(5_000), runEvents)),
  ).rejects.toThrow()
  assertLifecycle(runEvents, 'failed', undefined, 'model', 'openai-completions', 'connection')
  expect(runEvents.find((event) => event.phase === 'transport_failure')?.transportCode).toBe('ConnectionRefused')
  expect(JSON.stringify(runEvents)).not.toContain(unavailableBaseUrl)
})

test('transport diagnostics classify a real provider timeout and retain cancellation semantics', async () => {
  const requestSeen = Promise.withResolvers<void>()
  const fixture = await startFixture(async () => {
    requestSeen.resolve()
    await Bun.sleep(500)
    return new Response(chunk('late') + chunk('', 'stop') + 'data: [DONE]\n\n', { headers: sseHeaders })
  })
  let pendingOutcome: Promise<unknown> = Promise.resolve(null)
  try {
    const events: ModelDiagnosticEvent[] = []
    const pending = new PiDriver().summarize(
      request(fixture.baseUrl),
      'fixture-only',
      AbortSignal.timeout(100),
      (event) => events.push(event),
    )
    pendingOutcome = pending.then(
      () => null,
      (error: unknown) => error,
    )
    await awaitArrival(requestSeen.promise, 'timeout provider request')
    expect(await pendingOutcome).toBeInstanceOf(Error)
    assertLifecycle(events, 'cancelled', undefined, 'compaction', 'openai-completions', 'timeout')
    expect(JSON.stringify(events)).not.toContain('127.0.0.1')
  } finally {
    await pendingOutcome
    await fixture.server.stop(true)
  }
})

test('Pi.run retains HTTP 200 on stream failure and emits one terminal failure for both OpenAI protocols', async () => {
  for (const protocol of ['openai-completions', 'openai-responses'] as const) {
    const fixture = await startFixture(() => new Response('data: {not-json}\n\n', { headers: sseHeaders }))
    try {
      const events: ModelDiagnosticEvent[] = []
      await expect(
        new PiDriver().run(runInput(fixture.baseUrl, AbortSignal.timeout(5_000), events, protocol)),
      ).rejects.toThrow()
      const terminals = events.filter(
        (event) => event.phase === 'failed' || event.phase === 'cancelled' || event.phase === 'settled',
      )
      expect(terminals).toHaveLength(1)
      expect(terminals[0]).toMatchObject({
        purpose: 'model',
        stopReason: 'error',
        httpStatus: 200,
        failureKind: 'stream',
        failurePhase: 'stream',
      })
      expect(terminals[0]?.modelRequestId).toBe(events.find((event) => event.phase === 'started')?.modelRequestId)
    } finally {
      await fixture.server.stop(true)
    }
  }
})

test('HTTP 200 provider error events emit bounded stream facts without event text', async () => {
  for (const protocol of ['openai-responses'] as const) {
    const fixture = await startFixture(
      () =>
        new Response(
          'data: {"type":"response.failed","response":{"status":"failed","error":{"code":"server_error","message":"private-stream-body"}}}\n\n',
          { headers: sseHeaders },
        ),
    )
    try {
      const events: ModelDiagnosticEvent[] = []
      await expect(
        new PiDriver().run(runInput(fixture.baseUrl, AbortSignal.timeout(5_000), events, protocol)),
      ).rejects.toThrow()
      const streamEvents = events.filter((event) => event.streamSubtype === 'provider_error')
      expect(streamEvents).toHaveLength(1)
      expect(streamEvents[0]).toMatchObject({
        phase: 'failed',
        purpose: 'model',
        streamSubtype: 'provider_error',
        streamEventCount: 1,
        streamErrorClass: 'upstream',
        errorCode: 'PROVIDER_STREAM_INTERRUPTED',
      })
      expect(streamEvents[0]?.modelRequestId).toBe(events.find((event) => event.phase === 'started')?.modelRequestId)
      expect(JSON.stringify(events)).not.toContain('private-stream-body')
      expect(JSON.stringify(events)).not.toContain('server_error')
    } finally {
      await fixture.server.stop(true)
    }
  }
})

test('named SSE error and anonymous error envelope are classified with bounded allowlisted codes', async () => {
  const cases = [
    {
      protocol: 'openai-responses' as const,
      body: 'event: error\ndata: {"error":{"code":"invalid_api_key","message":"private auth text"}}\n\n',
      expected: 'authentication',
    },
    {
      protocol: 'openai-completions' as const,
      body: 'data: {"error":{"code":"rate_limit_exceeded","message":"private rate text"}}\n\n',
      expected: 'rate_limit',
    },
  ]
  for (const fixtureCase of cases) {
    const fixture = await startFixture(() => new Response(fixtureCase.body, { headers: sseHeaders }))
    try {
      const events: ModelDiagnosticEvent[] = []
      await expect(
        new PiDriver().run(runInput(fixture.baseUrl, AbortSignal.timeout(5_000), events, fixtureCase.protocol)),
      ).rejects.toThrow()
      const terminal = events.find((event) => event.phase === 'failed')
      expect(terminal).toMatchObject({
        httpStatus: 200,
        streamSubtype: 'provider_error',
        streamErrorClass: fixtureCase.expected,
      })
      expect(JSON.stringify(events)).not.toContain('private auth text')
      expect(JSON.stringify(events)).not.toContain('private rate text')
      expect(JSON.stringify(events)).not.toContain('invalid_api_key')
      expect(JSON.stringify(events)).not.toContain('rate_limit_exceeded')
    } finally {
      await fixture.server.stop(true)
    }
  }
})

test('HTTP 200 stalled body abort is classified per attempt without buffering the body', async () => {
  const fixture = await startFixture(() => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(chunk('partial')))
      },
    })
    return new Response(body, { headers: sseHeaders })
  })
  try {
    const events: ModelDiagnosticEvent[] = []
    await expect(
      new PiDriver().run(runInput(fixture.baseUrl, AbortSignal.timeout(100), events, 'openai-completions')),
    ).rejects.toThrow()
    const terminal = events.filter((event) => ['failed', 'cancelled', 'settled'].includes(event.phase))
    expect(terminal).toHaveLength(1)
    expect(terminal[0]).toMatchObject({
      httpStatus: 200,
      transportKind: 'timeout',
      failurePhase: 'stream',
      streamSubtype: 'aborted',
      streamTextChars: 7,
    })
    expect(JSON.stringify(events)).not.toContain('partial')
  } finally {
    await fixture.server.stop(true)
  }
})

test('HTTP 200 response.completed followed by an open body records progress before bounded abort', async () => {
  const fixture = await startFixture(() => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(responsesTextSse('bounded fixture output')))
      },
    })
    return new Response(body, { headers: sseHeaders })
  })
  try {
    const events: ModelDiagnosticEvent[] = []
    await expect(
      new PiDriver().summarize(responsesRequest(fixture.baseUrl), 'fixture-only', AbortSignal.timeout(100), (event) =>
        events.push(event),
      ),
    ).rejects.toThrow()
    const terminal = events.find((event) => event.phase === 'cancelled')
    expect(terminal).toMatchObject({
      stopReason: 'aborted',
      httpStatus: 200,
      streamSubtype: 'completed',
      streamTextChars: 'bounded fixture output'.length,
    })
    expect(terminal?.streamEventCount).toBeGreaterThan(0)
    expect(terminal?.streamFirstEventMs).toBeLessThanOrEqual(terminal?.streamLastEventMs ?? -1)
    expect(JSON.stringify(events)).not.toContain('bounded fixture output')
  } finally {
    await fixture.server.stop(true)
  }
})

test('Pi diagnostics isolate response facts across a failed model call, compaction and a refused request', async () => {
  const fixture = await startFixture(() =>
    Response.json(
      { error: { message: 'private-error-canary' } },
      { status: 502, headers: { 'x-request-id': UPSTREAM_REQUEST_ID } },
    ),
  )
  const driver = new PiDriver()
  try {
    const failed: ModelDiagnosticEvent[] = []
    await expect(driver.run(runInput(fixture.baseUrl, AbortSignal.timeout(5_000), failed))).rejects.toThrow()
    assertLifecycle(failed, 'failed', 502, 'model')
    const failedRequestId = failed.find((event) => event.phase === 'started')?.modelRequestId
    await fixture.server.stop(true)
    const refused: ModelDiagnosticEvent[] = []
    await expect(
      driver.summarize(responsesRequest(fixture.baseUrl), 'fixture-only', AbortSignal.timeout(5_000), (event) =>
        refused.push(event),
      ),
    ).rejects.toThrow()
    assertLifecycle(refused, 'failed', undefined, 'compaction', 'openai-responses', 'connection')
    expect(refused.find((event) => event.phase === 'started')?.modelRequestId).not.toBe(failedRequestId)
    expect(JSON.stringify(refused)).not.toContain(requestIdHash)
    expect(JSON.stringify([...failed, ...refused])).not.toContain('private-error-canary')
  } finally {
    await fixture.server.stop(true)
  }
})

test('two provider steps within one Run keep independent stream counts and upstream identities', async () => {
  const firstText = 'text before the fixture tool'
  const firstThinking = 'private-thinking-canary'
  const finalText = 'final answer'
  let requests = 0
  const fixture = await startFixture(() => {
    const index = ++requests
    if (index > 2) throw new Error('Unexpected third provider request')
    const body =
      index === 1
        ? `data: ${JSON.stringify({
            id: 'fixture-first',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'gpt-6.1-sol',
            choices: [
              { index: 0, delta: { content: firstText, reasoning_content: firstThinking }, finish_reason: null },
            ],
          })}\n\n` +
          `data: ${JSON.stringify({
            id: 'fixture-first',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'gpt-6.1-sol',
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'fixture-call',
                      type: 'function',
                      function: { name: 'fixture_read', arguments: '{}' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          })}\n\n` +
          chunk('', 'tool_calls') +
          'data: [DONE]\n\n'
        : chunk(finalText) + chunk('', 'stop') + 'data: [DONE]\n\n'
    return new Response(body, { headers: { ...sseHeaders, 'x-request-id': `fixture-step-${index}` } })
  })
  try {
    const diagnostics: ModelDiagnosticEvent[] = []
    const input = runInput(fixture.baseUrl, AbortSignal.timeout(5_000), diagnostics)
    input.tools = [
      {
        name: 'fixture_read',
        description: 'Return a fixed fixture value.',
        inputSchema: z.strictObject({}),
        effect: 'read',
        execute: async () => ({ text: 'fixture result' }),
      },
    ]
    let executed = 0
    input.execute = async (name) => {
      expect(name).toBe('fixture_read')
      executed++
      return { text: 'fixture result', isError: false }
    }
    await new PiDriver().run(input)
    expect(requests).toBe(2)
    expect(executed).toBe(1)
    const starts = diagnostics.filter((item) => item.phase === 'started')
    const terminals = diagnostics.filter((item) => ['failed', 'cancelled', 'settled'].includes(item.phase))
    expect(starts).toHaveLength(2)
    expect(terminals).toHaveLength(2)
    expect(new Set(starts.map((item) => item.modelRequestId)).size).toBe(2)
    for (const [index, terminal] of terminals.entries()) {
      expect(terminal.modelRequestId).toBe(starts[index]?.modelRequestId)
      expect(terminal.upstreamRequestIdSha256).toBe(
        createHash('sha256')
          .update(`fixture-step-${index + 1}`)
          .digest('hex'),
      )
    }
    expect(terminals[0]).toMatchObject({
      phase: 'settled',
      stopReason: 'toolUse',
      streamSubtype: 'completed',
      streamEventCount: 3,
      streamTextChars: firstText.length,
      streamThinkingChars: firstThinking.length,
    })
    expect(terminals[1]).toMatchObject({
      phase: 'settled',
      stopReason: 'stop',
      streamSubtype: 'completed',
      streamEventCount: 2,
      streamTextChars: finalText.length,
      streamThinkingChars: 0,
    })
    expect(JSON.stringify(diagnostics)).not.toContain(firstThinking)
    expect(JSON.stringify(diagnostics)).not.toContain(firstText)
    expect(JSON.stringify(diagnostics)).not.toContain(finalText)
  } finally {
    await fixture.server.stop(true)
  }
})
