import { expect, test } from 'bun:test'
import { z } from 'zod'
import { HbarError, providerSchema, type Usage } from '@hbar/contracts'
import { PiDriver } from '@hbar/pi-driver'
import type { ModelDiagnosticEvent, ModelRequest } from '@hbar/plugin-sdk'
import { runtimeDriverDecisionSchema, runtimeDriverDecisionResultSchema } from '@hbar/plugin-sdk/runtime-driver'
import { procedure } from '@hbar/runtime'
import { RuntimeDriverRelay } from '../apps/host/src/runtime-driver-relay'
import { driverRelayFixture } from './fixtures/runtime-driver-relay'

const usage: Usage = { input: 7, output: 3, cacheRead: 0, cacheWrite: 0, cost: 0 }
const outcome = (promise: Promise<unknown>) => promise.catch((error: unknown) => error)
const request = (
  model = providerSchema.parse({
    id: 'fixture',
    name: 'Fixture',
    protocol: 'mock',
    model: 'fixture',
    baseUrl: 'http://127.0.0.1',
  }),
): ModelRequest => ({
  system: 'Return the task preference as a structured answer; never execute tools.',
  model,
  toolNames: [],
  context: { sessionId: 'session', runId: 'run', selectedToolNames: [] },
  messages: [
    {
      id: 'decision',
      sessionId: 'session',
      runId: 'run',
      role: 'user',
      seq: 0,
      createdAt: 0,
      content: [{ type: 'text', text: 'Choose App or API.' }],
    },
  ],
})

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}
async function until(check: () => boolean) {
  const deadline = Date.now() + 3_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Decision transport did not reach its boundary')
    await Bun.sleep(5)
  }
}

test('decision completion validates text capacity, explicit source and a tool-free request before any provider call', () => {
  const valid = request()
  expect(runtimeDriverDecisionSchema.safeParse({ request: valid, maxOutputTokens: 4096, apiKey: null }).success).toBe(
    true,
  )
  for (const maxOutputTokens of [63, 4097, 1_000_000])
    expect(runtimeDriverDecisionSchema.safeParse({ request: valid, maxOutputTokens, apiKey: null }).success).toBe(false)
  for (const invalid of [
    { ...valid, toolNames: ['write_file'] },
    { ...valid, toolNames: undefined },
    { ...valid, context: { ...valid.context, selectedToolNames: ['read_file'] } },
    { ...valid, context: { sessionId: 'session', selectedToolNames: [] } },
    { ...valid, messages: Array.from({ length: 5 }, () => valid.messages[0]) },
    { ...valid, system: 'x'.repeat(16_385) },
    { ...valid, messages: [{ ...valid.messages[0], content: [{ type: 'text', text: 'x'.repeat(131_073) }] }] },
    { ...valid, messages: [{ ...valid.messages[0], content: [{ type: 'image', artifactId: 'secret' }] }] },
  ])
    expect(
      runtimeDriverDecisionSchema.safeParse({ request: invalid, maxOutputTokens: 4096, apiKey: null }).success,
    ).toBe(false)
})

test('the real decision provider sees the pinned model, no tools and a bounded output, with distinct diagnostics and usage', async () => {
  let calls = 0
  const answer = JSON.stringify({ kind: 'answer', answers: { scope: { answers: ['API'] } } })
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(http) {
      calls++
      expect(http.headers.get('x-api-key')).toBe('fixture-only')
      const payload = z
        .object({ model: z.string(), max_tokens: z.number(), tools: z.array(z.unknown()).optional() })
        .parse(await http.json())
      expect(payload.model).toBe('source-model')
      expect(payload.max_tokens).toBeLessThanOrEqual(4096)
      expect(payload.tools ?? []).toHaveLength(0)
      const event = (type: string, data: Record<string, unknown>) =>
        `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
      return new Response(
        event('message_start', {
          message: {
            id: 'msg_decision',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'source-model',
            usage: { input_tokens: 7, output_tokens: 0 },
          },
        }) +
          event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }) +
          event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: answer } }) +
          event('content_block_stop', { index: 0 }) +
          event('message_delta', {
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: 3 },
          }) +
          event('message_stop', {}),
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    },
  })
  try {
    const input = request(
      providerSchema.parse({
        id: 'source',
        name: 'Source',
        protocol: 'anthropic-messages',
        model: 'source-model',
        baseUrl: `http://127.0.0.1:${server.port}`,
      }),
    )
    const diagnostics: ModelDiagnosticEvent[] = []
    const result = await new PiDriver().completeDecision(
      { request: input, maxOutputTokens: 4096 },
      'fixture-only',
      new AbortController().signal,
      (event) => diagnostics.push(event),
    )
    expect(result).toMatchObject({ text: answer, usage: { input: 7, output: 3 } })
    expect(calls).toBe(1)
    expect(diagnostics.map((event) => event.phase)).toContain('settled')
    expect(new Set(diagnostics.map((event) => event.purpose))).toEqual(new Set(['decision']))
    expect(diagnostics.every((event) => !JSON.stringify(event).includes('fixture-only'))).toBe(true)
  } finally {
    await server.stop(true)
  }
})

test('a provider tool-use result cannot become a decision answer and still retains its usage', async () => {
  const input = request()
  const message = input.messages[0]
  if (!message) throw new Error('Missing decision fixture message')
  message.content = [{ type: 'text', text: '/tool write_file {"path":"should-not-run"}' }]
  const result = await new PiDriver().completeDecision(
    { request: input, maxOutputTokens: 4096 },
    null,
    new AbortController().signal,
  )
  expect(result.text).toBe('')
  expect(result.usage.input).toBeGreaterThanOrEqual(0)
})

test('decision output that ignores the token budget is cancelled at the stream character boundary', async () => {
  const input = request()
  const message = input.messages[0]
  if (!message) throw new Error('Expected decision fixture message')
  message.content = [{ type: 'text', text: 'x'.repeat(70_000) }]
  const diagnostics: ModelDiagnosticEvent[] = []
  expect(
    await outcome(
      new PiDriver().completeDecision(
        { request: input, maxOutputTokens: 64 },
        null,
        new AbortController().signal,
        (event) => diagnostics.push(event),
      ),
    ),
  ).toMatchObject({ code: 'DECISION_OUTPUT_LIMIT' })
  expect(diagnostics.at(-1)?.errorCode).toBe('DECISION_OUTPUT_LIMIT')
})

test('the Host authenticates the source Run and holds its original driver until the actual decision reply', async () => {
  const pinned: unknown[] = []
  const f = driverRelayFixture({
    createRelay: (options) =>
      new RuntimeDriverRelay({
        ...options,
        resolve: (version) => {
          pinned.push(version)
          return options.resolve(version)
        },
      }),
  })
  const gate = deferred()
  let entered = false
  const dispose = f.driverPeer.register(
    'driver.completeDecision',
    procedure(runtimeDriverDecisionSchema, runtimeDriverDecisionResultSchema, async () => {
      entered = true
      await gate.promise
      return { text: '{"kind":"need_user"}', usage, diagnostics: [] }
    }),
  )
  try {
    const source = await f.payload('decision')
    await f.start(source)
    const input = {
      ...request(source.request.model),
      context: { sessionId: source.session.id, runId: source.run.id, selectedToolNames: [] },
    }
    for (const context of [
      { ...input.context, runId: 'unclaimed' },
      { ...input.context, sessionId: 'foreign' },
    ])
      expect(
        await outcome(
          f.kernelPeer.call(
            'driver.completeDecision',
            { request: { ...input, context }, maxOutputTokens: 4096, apiKey: null },
            runtimeDriverDecisionResultSchema,
          ),
        ),
      ).toMatchObject({ code: 'EXECUTION_OWNER_MISMATCH' })
    expect(entered).toBe(false)
    const controller = new AbortController()
    const tracked = f.kernelPeer.callTracked(
      'driver.completeDecision',
      { request: input, maxOutputTokens: 4096, apiKey: null },
      runtimeDriverDecisionResultSchema,
      { signal: controller.signal },
    )
    const logical = outcome(tracked.result)
    let actual = false
    const settled = tracked.settled.then((reply) => {
      actual = true
      return reply
    })
    void settled.catch(() => {})
    await until(() => entered)
    controller.abort(new HbarError('USER_CANCELLED', 'Cancel only the logical waiter'))
    expect(await logical).toMatchObject({ code: 'IPC_CANCELLED' })
    await f.terminal(source.invocationId)
    await until(() => f.stats().terminals === 1)
    expect(actual).toBe(false)
    expect(f.relay.hasRun(source.run.id)).toBe(true)
    expect(pinned.at(-1)).toEqual(source.ownership?.versions.driver)
    gate.release()
    expect(await settled).toMatchObject({ text: '{"kind":"need_user"}', usage })
    await until(() => !f.relay.hasRun(source.run.id))
  } finally {
    gate.release()
    dispose()
    f.close()
  }
})

test('the Host bounds pending decision completions and releases all actual replies without replay', async () => {
  const f = driverRelayFixture()
  const gate = deferred()
  let accepted = 0
  const dispose = f.driverPeer.register(
    'driver.completeDecision',
    procedure(runtimeDriverDecisionSchema, runtimeDriverDecisionResultSchema, async () => {
      accepted++
      await gate.promise
      return { text: '{}', usage, diagnostics: [] }
    }),
  )
  const pending: Promise<unknown>[] = []
  try {
    const source = await f.payload('capacity')
    await f.start(source)
    const input = {
      request: {
        ...request(source.request.model),
        context: { sessionId: source.session.id, runId: source.run.id, selectedToolNames: [] },
      },
      apiKey: null,
      maxOutputTokens: 4096,
    }
    for (let index = 0; index < 16; index++)
      pending.push(outcome(f.kernelPeer.call('driver.completeDecision', input, runtimeDriverDecisionResultSchema)))
    await until(() => accepted === 16)
    expect(
      await outcome(f.kernelPeer.call('driver.completeDecision', input, runtimeDriverDecisionResultSchema)),
    ).toMatchObject({ code: 'DRIVER_CAPACITY' })
    expect(accepted).toBe(16)
    gate.release()
    expect(
      (await Promise.all(pending)).every((item) => runtimeDriverDecisionResultSchema.safeParse(item).success),
    ).toBe(true)
    await f.terminal(source.invocationId)
    await until(() => f.stats().invocations === 0)
  } finally {
    gate.release()
    await Promise.all(pending)
    dispose()
    f.close()
  }
})
