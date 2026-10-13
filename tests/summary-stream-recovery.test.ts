import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { providerModelSelectionId, providerSchema, resolveProviderModel, type DiagnosticEvent } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { usageRecordedDataSchema } from '@hbar/contracts/usage'
import type { ModelDiagnosticEvent, ModelRequest } from '@hbar/plugin-sdk'
import { PiDriver } from '@hbar/pi-driver'

const API_KEY = 'summary-upstream-recovery-fixture-key'
const PRIVATE_PARTIAL = 'summary-upstream-recovery-partial-canary'
const UPSTREAM_ID = 'summary-upstream-recovery-request'

function selectedProvider(baseUrl: string) {
  const config = providerSchema.parse({
    id: 'summary-recovery',
    name: 'Summary recovery fixture',
    protocol: 'openai-responses',
    baseUrl,
    model: 'summary-model',
    contextWindow: 4096,
    maxOutput: 512,
    models: [{ id: 'summary-model', contextWindow: 4096, maxOutput: 512 }],
  })
  const id = providerModelSelectionId(config, 'summary-model')
  return { config, model: { ...resolveProviderModel(config, id), id } }
}

function responseEvent(type: string, data: Record<string, unknown>) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
}

function completedSummary(text: string) {
  const content = { type: 'output_text', text, annotations: [] }
  const item = {
    id: 'summary-recovery-message',
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [content],
  }
  return (
    responseEvent('response.created', { response: { id: 'summary-recovery-response', status: 'in_progress' } }) +
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
        id: 'summary-recovery-response',
        status: 'completed',
        output: [item],
        usage: { input_tokens: 37, output_tokens: 11, total_tokens: 48 },
      },
    })
  )
}

function upstreamFailure() {
  return (
    responseEvent('response.created', { response: { id: 'summary-failed-response', status: 'in_progress' } }) +
    responseEvent('response.output_text.delta', { output_index: 0, content_index: 0, delta: PRIVATE_PARTIAL }) +
    responseEvent('response.failed', {
      response: {
        id: 'summary-failed-response',
        status: 'failed',
        error: { code: 'server_error', message: 'private transient upstream detail' },
      },
    })
  )
}

function sse(body: string, requestId = UPSTREAM_ID) {
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream', 'x-request-id': requestId },
  })
}

function summaryRequest(baseUrl: string): ModelRequest {
  const selected = selectedProvider(baseUrl)
  return {
    system: 'Summarize the provided history accurately.',
    messages: [
      {
        id: 'summary-recovery-source',
        sessionId: 'summary-recovery-session',
        runId: 'summary-recovery-run',
        seq: 1,
        createdAt: 1,
        role: 'user',
        content: [{ type: 'text', text: 'The source history remains authoritative.' }],
      },
    ],
    model: selected.model,
    context: { sessionId: 'summary-recovery-session' },
  }
}

async function removeFixture(root: string) {
  const resolved = await realpath(root)
  if (
    dirname(resolved) !== (await realpath(tmpdir())) ||
    !basename(resolved).startsWith('hbar-summary-upstream-recovery-')
  )
    throw new Error('Refusing to remove an unowned summary recovery fixture')
  await rm(resolved, { recursive: true, force: true })
}

test('PiDriver retries a recognized HTTP 200 upstream summary failure and returns only the completed attempt', async () => {
  const requests: Request[] = []
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      requests.push(request)
      return sse(requests.length === 1 ? upstreamFailure() : completedSummary('verified summary'))
    },
  })
  try {
    const events: ModelDiagnosticEvent[] = []
    const result = await new PiDriver().summarize(
      summaryRequest(`http://127.0.0.1:${server.port}/v1`),
      API_KEY,
      AbortSignal.timeout(5_000),
      (event) => events.push(event),
    )
    expect(requests).toHaveLength(2)
    expect(result).toEqual({
      text: 'verified summary',
      usage: { input: 37, output: 11, cacheRead: 0, cacheWrite: 0, cost: 0 },
    })
    expect(JSON.stringify(result)).not.toContain(PRIVATE_PARTIAL)
    const started = events.filter((event) => event.phase === 'started')
    const terminal = events.filter((event) => event.phase === 'failed' || event.phase === 'settled')
    expect(started).toHaveLength(2)
    expect(terminal).toHaveLength(2)
    expect(new Set(started.map((event) => event.modelRequestId)).size).toBe(2)
    expect(
      events.filter((event) => ['started', 'failed', 'settled'].includes(event.phase)).map((event) => event.phase),
    ).toEqual(['started', 'failed', 'started', 'settled'])
    expect(terminal.map((event) => event.modelRequestId)).toEqual(started.map((event) => event.modelRequestId))
    expect(terminal[0]).toMatchObject({
      phase: 'failed',
      purpose: 'compaction',
      httpStatus: 200,
      streamSubtype: 'provider_error',
      streamErrorClass: 'upstream',
    })
    expect(terminal[1]).toMatchObject({ phase: 'settled', purpose: 'compaction', httpStatus: 200 })
    expect(JSON.stringify(events)).not.toContain(PRIVATE_PARTIAL)
    expect(JSON.stringify(events)).not.toContain('private transient upstream detail')
    expect(JSON.stringify(events)).not.toContain(API_KEY)
  } finally {
    await server.stop(true)
  }
})

test('PiDriver bounds summary upstream retries to two and fails the same summary operation', async () => {
  let requests = 0
  const requestStarts: number[] = []
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      requests++
      requestStarts.push(performance.now())
      return sse(upstreamFailure())
    },
  })
  try {
    const events: ModelDiagnosticEvent[] = []
    let failure: unknown
    try {
      await new PiDriver().summarize(
        summaryRequest(`http://127.0.0.1:${server.port}/v1`),
        API_KEY,
        AbortSignal.timeout(5_000),
        (event) => events.push(event),
      )
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    expect(requests).toBe(3)
    const [first, second, third] = requestStarts
    if (first === undefined || second === undefined || third === undefined)
      throw new Error('Expected exactly three summary provider attempts')
    expect(second - first).toBeGreaterThanOrEqual(230)
    expect(third - second).toBeGreaterThanOrEqual(480)
    const started = events.filter((event) => event.phase === 'started')
    const failed = events.filter((event) => event.phase === 'failed')
    expect(started).toHaveLength(3)
    expect(failed).toHaveLength(3)
    expect(new Set(started.map((event) => event.modelRequestId)).size).toBe(3)
    expect(failed.map((event) => event.modelRequestId)).toEqual(started.map((event) => event.modelRequestId))
  } finally {
    await server.stop(true)
  }
})

test('PiDriver does not retry summaries for auth, rate, context or invalid-input stream errors', async () => {
  const cases = [
    { code: 'invalid_api_key', expected: 'authentication' },
    { code: 'rate_limit_exceeded', expected: 'rate_limit' },
    { code: 'context_length_exceeded', expected: 'context_capacity' },
    { code: 'invalid_request_error', expected: 'invalid_request' },
  ] as const
  for (const fixtureCase of cases) {
    let requests = 0
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch() {
        requests++
        return sse(
          responseEvent('error', {
            error: { code: fixtureCase.code, message: 'private provider classification detail' },
          }),
        )
      },
    })
    try {
      const events: ModelDiagnosticEvent[] = []
      await expect(
        new PiDriver().summarize(
          summaryRequest(`http://127.0.0.1:${server.port}/v1`),
          API_KEY,
          AbortSignal.timeout(5_000),
          (event) => events.push(event),
        ),
      ).rejects.toThrow()
      expect(requests).toBe(1)
      expect(events.filter((event) => event.phase === 'started')).toHaveLength(1)
      expect(events.filter((event) => event.phase === 'failed')).toHaveLength(1)
      expect(events.find((event) => event.phase === 'failed')?.streamErrorClass).toBe(fixtureCase.expected)
    } finally {
      await server.stop(true)
    }
  }
})

test('PiDriver does not retry an HTTP 502 summary response', async () => {
  let requests = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      requests++
      return Response.json({ error: { message: 'private upstream response detail' } }, { status: 502 })
    },
  })
  try {
    const events: ModelDiagnosticEvent[] = []
    await expect(
      new PiDriver().summarize(
        summaryRequest(`http://127.0.0.1:${server.port}/v1`),
        API_KEY,
        AbortSignal.timeout(5_000),
        (event) => events.push(event),
      ),
    ).rejects.toThrow()
    expect(requests).toBe(1)
    expect(events.filter((event) => event.phase === 'started')).toHaveLength(1)
    expect(events.filter((event) => event.phase === 'failed')).toHaveLength(1)
    expect(events.find((event) => event.phase === 'failed')?.httpStatus).toBe(502)
  } finally {
    await server.stop(true)
  }
})

test('PiDriver does not retry an incomplete summary response', async () => {
  let requests = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      requests++
      const item = {
        id: 'summary-incomplete-message',
        type: 'message',
        role: 'assistant',
        status: 'incomplete',
        content: [{ type: 'output_text', text: PRIVATE_PARTIAL, annotations: [] }],
      }
      return sse(
        responseEvent('response.created', { response: { id: 'summary-incomplete-response', status: 'in_progress' } }) +
          responseEvent('response.output_item.added', { output_index: 0, item: { ...item, content: [] } }) +
          responseEvent('response.output_text.delta', { output_index: 0, content_index: 0, delta: PRIVATE_PARTIAL }) +
          responseEvent('response.incomplete', {
            response: {
              id: 'summary-incomplete-response',
              status: 'incomplete',
              incomplete_details: { reason: 'max_output_tokens' },
              output: [item],
              usage: { input_tokens: 37, output_tokens: 512, total_tokens: 549 },
            },
          }),
      )
    },
  })
  try {
    const events: ModelDiagnosticEvent[] = []
    let failure: unknown
    try {
      await new PiDriver().summarize(
        summaryRequest(`http://127.0.0.1:${server.port}/v1`),
        API_KEY,
        AbortSignal.timeout(5_000),
        (event) => events.push(event),
      )
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({ code: 'COMPACTION_INCOMPLETE' })
    expect(requests).toBe(1)
    expect(events.filter((event) => event.phase === 'started')).toHaveLength(1)
    expect(events.find((event) => event.phase === 'failed')).toMatchObject({
      stopReason: 'length',
      streamSubtype: 'incomplete',
      errorCode: 'COMPACTION_INCOMPLETE',
    })
    expect(JSON.stringify(events)).not.toContain(PRIVATE_PARTIAL)
  } finally {
    await server.stop(true)
  }
})

test('PiDriver does not retry a malformed HTTP 200 summary stream', async () => {
  let requests = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      requests++
      return sse('data: {not-json}\n\n')
    },
  })
  try {
    const events: ModelDiagnosticEvent[] = []
    let failure: unknown
    try {
      await new PiDriver().summarize(
        summaryRequest(`http://127.0.0.1:${server.port}/v1`),
        API_KEY,
        AbortSignal.timeout(5_000),
        (event) => events.push(event),
      )
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    expect(requests).toBe(1)
    expect(events.filter((event) => event.phase === 'started')).toHaveLength(1)
    expect(events.some((event) => event.phase === 'failed')).toBe(true)
  } finally {
    await server.stop(true)
  }
})

test('PiDriver cancellation during summary retry backoff does not start another provider request', async () => {
  let requests = 0
  const controller = new AbortController()
  const failed = Promise.withResolvers<void>()
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      requests++
      return sse(upstreamFailure())
    },
  })
  try {
    const events: ModelDiagnosticEvent[] = []
    const pending = new PiDriver().summarize(
      summaryRequest(`http://127.0.0.1:${server.port}/v1`),
      API_KEY,
      controller.signal,
      (event) => {
        events.push(event)
        if (event.phase === 'failed') failed.resolve()
      },
    )
    const outcome = pending.then(
      () => null,
      (error: unknown) => error,
    )
    await failed.promise
    setTimeout(() => controller.abort(new DOMException('Fixture cancellation', 'AbortError')), 20)
    expect(await outcome).toBe(controller.signal.reason)
    expect(requests).toBe(1)
    expect(events.filter((event) => event.phase === 'started')).toHaveLength(1)
  } finally {
    controller.abort()
    await server.stop(true)
  }
})

test('Kernel records successful retried summary usage and leaves history untouched on exhausted retries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-summary-upstream-recovery-'))
  let requestCount = 0
  let failAll = false
  const diagnostics: DiagnosticEvent[] = []
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      requestCount++
      return sse(failAll || requestCount <= 2 ? upstreamFailure() : completedSummary('completed after retry'))
    },
  })
  let kernel: Kernel | undefined
  let closed = false
  try {
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      secrets: new MemorySecrets(),
      diagnostics: { emit: (event) => diagnostics.push(event) },
    })
    const selected = selectedProvider(`http://127.0.0.1:${server.port}/v1`)
    await kernel.saveProvider(selected.config, API_KEY)
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Summary recovery fixture workspace missing')
    const session = await kernel.createSession(workspace.id)
    for (let index = 0; index < 18; index++)
      await kernel.storage.call('commit', session.id, 'summary-recovery-seed', index % 2 ? 'assistant' : 'user', [
        { type: 'text', text: `authoritative history ${index} ${'x'.repeat(1500)}` },
      ])
    const beforeContext = await kernel.storage.call('context', session.id)
    const beforeMessages = (await kernel.snapshot(session.id)).messages

    await kernel.compact(session.id, selected.model.id)

    expect(requestCount).toBe(5)
    const afterContext = await kernel.storage.call('context', session.id)
    expect(afterContext.summary).toContain('completed after retry')
    expect(afterContext.summary).not.toContain(PRIVATE_PARTIAL)
    expect(afterContext.throughSeq).toBeGreaterThan(beforeContext.throughSeq)
    expect((await kernel.snapshot(session.id)).messages).toEqual(beforeMessages)
    const usage = await kernel.storage.call('usageEvents', {
      scope: { kind: 'session', sessionId: session.id, includeDescendants: true },
      from: 0,
      to: Date.now() + 1,
      limit: 100,
    })
    const summaryUsage = usage.items.flatMap((item) => {
      if (item.event.type !== 'usage.recorded') return []
      const parsed = usageRecordedDataSchema.safeParse(item.event.data)
      return parsed.success && parsed.data.source === 'compaction' ? [parsed.data] : []
    })
    expect(summaryUsage).toHaveLength(3)
    expect(
      summaryUsage.map((data) =>
        data && typeof data === 'object' && 'input' in data && 'output' in data ? [data.input, data.output] : null,
      ),
    ).toEqual([
      [37, 11],
      [37, 11],
      [37, 11],
    ])
    const providerEvents = diagnostics.filter(
      (event) => event.event.startsWith('provider.') && event.sessionId === session.id,
    )
    const started = providerEvents.filter((event) => event.event === 'provider.request_started')
    const settled = providerEvents.filter((event) => event.event === 'provider.request_settled')
    expect(started).toHaveLength(5)
    expect(settled).toHaveLength(5)
    expect(new Set(started.map((event) => event.modelRequestId)).size).toBe(5)
    expect(settled.map((event) => event.outcome)).toEqual(['failure', 'failure', 'success', 'success', 'success'])
    const requestsPerChunk = [...new Set(started.map((event) => event.attemptId))].map(
      (attemptId) => started.filter((event) => event.attemptId === attemptId).length,
    )
    expect(requestsPerChunk).toEqual([3, 1, 1])
    const retriedChunkId = started[0]?.attemptId
    expect(retriedChunkId).toBeDefined()
    expect(settled.filter((event) => event.attemptId === retriedChunkId).map((event) => event.outcome)).toEqual([
      'failure',
      'failure',
      'success',
    ])
    expect(JSON.stringify(providerEvents)).not.toContain(PRIVATE_PARTIAL)

    for (let index = 0; index < 4; index++)
      await kernel.storage.call('commit', session.id, 'summary-recovery-later-seed', index % 2 ? 'assistant' : 'user', [
        { type: 'text', text: `later authoritative history ${index} ${'y'.repeat(1500)}` },
      ])
    const beforeFailedContext = await kernel.storage.call('context', session.id)
    const beforeFailedMessages = (await kernel.snapshot(session.id)).messages
    failAll = true
    requestCount = 0
    let failure: unknown
    try {
      await kernel.compact(session.id, selected.model.id)
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    expect(requestCount).toBe(3)
    expect(await kernel.storage.call('context', session.id)).toEqual(beforeFailedContext)
    expect((await kernel.snapshot(session.id)).messages).toEqual(beforeFailedMessages)
    const contextHistory = (await kernel.snapshot(session.id)).contextHistory
    expect(contextHistory?.records.find((record) => record.status === 'failed')).toMatchObject({ chunks: 0 })
  } finally {
    if (kernel) {
      await kernel.close()
      closed = true
    }
    await server.stop(true)
    if (closed) await removeFixture(root)
  }
})

test('Kernel overall compaction deadline cancels a pending retry without changing existing context', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-summary-upstream-recovery-'))
  let requestCount = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      requestCount++
      return sse(upstreamFailure())
    },
  })
  let kernel: Kernel | undefined
  let closed = false
  try {
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      secrets: new MemorySecrets(),
      compactionTimeoutMs: 100,
    })
    const selected = selectedProvider(`http://127.0.0.1:${server.port}/v1`)
    await kernel.saveProvider(selected.config, API_KEY)
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Summary timeout fixture workspace missing')
    const session = await kernel.createSession(workspace.id)
    for (let index = 0; index < 18; index++)
      await kernel.storage.call('commit', session.id, 'summary-timeout-seed', index % 2 ? 'assistant' : 'user', [
        { type: 'text', text: `authoritative timeout history ${index} ${'x'.repeat(1500)}` },
      ])
    const beforeContext = await kernel.storage.call('context', session.id)
    const beforeMessages = (await kernel.snapshot(session.id)).messages
    let failure: unknown
    try {
      await kernel.compact(session.id, selected.model.id)
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({ code: 'COMPACTION_TIMEOUT' })
    expect(requestCount).toBe(1)
    expect(await kernel.storage.call('context', session.id)).toEqual(beforeContext)
    expect((await kernel.snapshot(session.id)).messages).toEqual(beforeMessages)
    expect((await kernel.snapshot(session.id)).contextHistory?.records[0]).toMatchObject({
      status: 'failed',
      errorCode: 'COMPACTION_TIMEOUT',
      chunks: 0,
    })
  } finally {
    if (kernel) {
      await kernel.close()
      closed = true
    }
    await server.stop(true)
    if (closed) await removeFixture(root)
  }
})
