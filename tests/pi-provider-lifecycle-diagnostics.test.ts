import { expect, test } from 'bun:test'
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

function chunk(content: string, finishReason: string | null = null) {
  return `data: ${JSON.stringify({
    id: 'fixture-response',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gpt-6.1-sol',
    choices: [{ index: 0, delta: { content }, finish_reason: finishReason }],
  })}\n\n`
}

async function startFixture(response: (request: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: response })
  return { server, baseUrl: `http://127.0.0.1:${server.port}/v1` }
}

function assertLifecycle(events: readonly ModelDiagnosticEvent[], terminal: ModelDiagnosticEvent['phase']) {
  expect(events).toHaveLength(2)
  expect(events[0]).toMatchObject({ phase: 'started', purpose: 'compaction' })
  expect(events[1]).toMatchObject({ phase: terminal, purpose: 'compaction' })
  expect(events[0]?.modelSelectionId).toBe('niuma_openai/gpt-6.1-sol')
  expect(events[0]?.providerId).toBe('niuma_openai')
  expect(events[0]?.model).toBe('gpt-6.1-sol')
  expect(events[0]?.protocol).toBe('openai-completions')
  expect(events[0]?.modelRequestId).toBeTruthy()
  expect(events[1]?.modelRequestId).toBe(events[0]?.modelRequestId)
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

function runInput(baseUrl: string, signal: AbortSignal, events: ModelDiagnosticEvent[]): DriverInput {
  const selection = model(baseUrl)
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
      headers: { 'content-type': 'text/event-stream' },
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
    assertLifecycle(events, 'settled')
  } finally {
    await fixture.server.stop(true)
  }

  const lengthFixture = await fixtureForFinish('length')
  try {
    const events: ModelDiagnosticEvent[] = []
    const result = await new PiDriver().summarize(
      request(lengthFixture.baseUrl),
      'fixture-only',
      AbortSignal.timeout(5_000),
      (event) => events.push(event),
    )
    expect(result.text).toBe('partial')
    assertLifecycle(events, 'settled')
    expect(events[1]?.stopReason).toBe('length')
  } finally {
    await lengthFixture.server.stop(true)
  }
})

async function fixtureForFinish(reason: 'length') {
  return startFixture(
    () =>
      new Response(chunk('partial', reason) + 'data: [DONE]\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      }),
  )
}

test('Pi compaction diagnostics report provider errors without leaking generic upstream text or API keys', async () => {
  const fixture = await startFixture(() =>
    Response.json({ error: { message: 'genericUpstream canary secret' } }, { status: 502 }),
  )
  try {
    const events: ModelDiagnosticEvent[] = []
    await expect(
      new PiDriver().summarize(request(fixture.baseUrl), 'fixture-only', AbortSignal.timeout(5_000), (event) =>
        events.push(event),
      ),
    ).rejects.toThrow()
    assertLifecycle(events, 'failed')
    expect(JSON.stringify(events)).not.toContain('genericUpstream')
    expect(JSON.stringify(events)).not.toContain('secret')
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
      headers: { 'content-type': 'text/event-stream' },
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
    assertLifecycle(events, 'cancelled')
  } finally {
    controller.abort()
    await pendingOutcome
    await abortFixture.server.stop(true)
  }

  const malformed = await startFixture(
    () => new Response('data: {not-json}\n\n', { headers: { 'content-type': 'text/event-stream' } }),
  )
  try {
    const events: ModelDiagnosticEvent[] = []
    await expect(
      new PiDriver().summarize(request(malformed.baseUrl), 'fixture-only', AbortSignal.timeout(5_000), (event) =>
        events.push(event),
      ),
    ).rejects.toThrow()
    assertLifecycle(events, 'failed')
  } finally {
    await malformed.server.stop(true)
  }
})

test('a diagnostic callback that throws does not change a successful provider result', async () => {
  const fixture = await startFixture(
    () =>
      new Response(chunk('summary') + chunk('', 'stop') + 'data: [DONE]\n\n', {
        headers: { 'content-type': 'text/event-stream' },
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
        headers: { 'content-type': 'text/event-stream' },
      }),
  )
  try {
    const events: ModelDiagnosticEvent[] = []
    await new PiDriver().run(runInput(success.baseUrl, AbortSignal.timeout(5_000), events))
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ phase: 'started', purpose: 'model' })
    expect(events[1]).toMatchObject({ phase: 'settled', purpose: 'model', stopReason: 'stop' })
    expect(events[1]?.modelRequestId).toBe(events[0]?.modelRequestId)
  } finally {
    await success.server.stop(true)
  }

  const failed = await startFixture(() =>
    Response.json({ error: { message: 'genericUpstream canary' } }, { status: 502 }),
  )
  try {
    const events: ModelDiagnosticEvent[] = []
    await expect(new PiDriver().run(runInput(failed.baseUrl, AbortSignal.timeout(5_000), events))).rejects.toThrow()
    expect(events).toHaveLength(2)
    expect(events[1]).toMatchObject({ phase: 'failed', purpose: 'model', stopReason: 'error' })
    expect(JSON.stringify(events)).not.toContain('genericUpstream')
  } finally {
    await failed.server.stop(true)
  }

  const runRequest = Promise.withResolvers<void>()
  const abort = await startFixture(async () => {
    runRequest.resolve()
    await Bun.sleep(200)
    return new Response(chunk('late') + chunk('', 'stop') + 'data: [DONE]\n\n', {
      headers: { 'content-type': 'text/event-stream' },
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
    expect(events).toHaveLength(2)
    expect(events[1]).toMatchObject({ phase: 'cancelled', purpose: 'model', stopReason: 'aborted' })
  } finally {
    controller.abort()
    await pendingOutcome
    await abort.server.stop(true)
  }

  const callback = await startFixture(
    () =>
      new Response(chunk('answer') + chunk('', 'stop') + 'data: [DONE]\n\n', {
        headers: { 'content-type': 'text/event-stream' },
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
