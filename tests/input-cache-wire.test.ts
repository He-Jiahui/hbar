import { expect, test } from 'bun:test'
import { z } from 'zod'
import { startInputCacheWireProxy } from '../scripts/input-cache-wire'

test('the acceptance command refuses network access without explicit live opt-in', async () => {
  let requests = 0
  const provider = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      requests++
      return new Response('Unexpected verification request', { status: 500 })
    },
  })
  try {
    const command = Bun.spawn(['bun', 'scripts/verify-input-cache.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HBAR_CACHE_VERIFY_BASE_URL: `http://127.0.0.1:${provider.port}/v1`,
        HBAR_CACHE_VERIFY_MODEL: 'fixture',
        HBAR_CACHE_VERIFY_API_KEY: 'fixture-only',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [exitCode, errors, output] = await Promise.all([
      command.exited,
      new Response(command.stderr).text(),
      new Response(command.stdout).text(),
    ])
    expect(exitCode).not.toBe(0)
    expect(errors).toContain('Live verification requires --live')
    expect(requests).toBe(0)
    expect(`${errors}${output}`).not.toContain('fixture-only')
  } finally {
    await provider.stop(true)
  }
})

test('the full acceptance command retains the real tool catalog through all twelve requests', async () => {
  const toolSets: string[][] = []
  const requestSchema = z.object({ tools: z.array(z.object({ name: z.string() })) })
  const upstream = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const payload = requestSchema.parse(await request.json())
      toolSets.push(payload.tools.map((tool) => tool.name))
      const count = toolSets.length
      const item =
        count < 12
          ? {
              id: `fc_${count}`,
              call_id: `call_${count}`,
              type: 'function_call',
              name: 'cache_acceptance_step',
              arguments: JSON.stringify({ step: count }),
              status: 'completed',
            }
          : {
              id: `msg_${count}`,
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'OK', annotations: [] }],
            }
      const event = (type: string, fields: Record<string, unknown>) =>
        `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`
      return new Response(
        event('response.created', { response: { id: `resp_${count}`, status: 'in_progress' } }) +
          event('response.output_item.added', { output_index: 0, item }) +
          event('response.output_item.done', { output_index: 0, item }) +
          event('response.completed', {
            response: {
              id: `resp_${count}`,
              status: 'completed',
              output: [item],
              usage: {
                input_tokens: 12000,
                output_tokens: 10,
                total_tokens: 12010,
                input_tokens_details: { cached_tokens: count === 1 ? 0 : 11900 },
              },
            },
          }),
        { headers: { 'content-type': 'text/event-stream', 'x-codex-turn-state': 'full-catalog-fixture' } },
      )
    },
  })
  const command = Bun.spawn(['bun', 'scripts/verify-input-cache.ts', '--live'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HBAR_CACHE_VERIFY_BASE_URL: `http://127.0.0.1:${upstream.port}/v1`,
      HBAR_CACHE_VERIFY_MODEL: 'fixture-full-catalog',
      HBAR_CACHE_VERIFY_API_KEY: 'fixture-only',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const deadline = setTimeout(() => command.kill(), 25_000)
  try {
    const [exitCode, output, errors] = await Promise.all([
      command.exited,
      new Response(command.stdout).text(),
      new Response(command.stderr).text(),
    ])
    expect(exitCode).toBe(0)
    expect(`${output}${errors}`).not.toContain('fixture-only')
    const line = output.split('\n').find((line) => line.startsWith('{"path":'))
    if (!line) throw new Error('Missing acceptance report')
    const report = z
      .object({
        passed: z.boolean(),
        calls: z.number(),
        unexpectedTools: z.number(),
        toolNames: z.array(z.string()),
        wire: z.array(z.object({ toolNames: z.array(z.string()), previousInputIsExactPrefix: z.boolean().nullable() })),
      })
      .parse(JSON.parse(line))
    expect(report.passed).toBe(true)
    expect(report.calls).toBe(11)
    expect(report.unexpectedTools).toBe(0)
    expect(report.toolNames.length).toBeGreaterThan(20)
    for (const name of ['cache_acceptance_step', 'read_file', 'get_plan', 'workflow_focus'])
      expect(report.toolNames).toContain(name)
    expect(toolSets).toHaveLength(12)
    expect(report.wire).toHaveLength(12)
    for (const tools of toolSets) expect(tools).toEqual(report.toolNames)
    for (const sample of report.wire) {
      expect(sample.toolNames).toEqual(report.toolNames)
      expect(sample.previousInputIsExactPrefix).not.toBe(false)
    }
  } finally {
    clearTimeout(deadline)
    command.kill()
    await upstream.stop(true)
  }
}, 30_000)

test('wire verification forwards exact payloads and streams while detecting prefix, affinity and configuration changes', async () => {
  const bodies: string[] = []
  const upstream = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      expect(new URL(request.url).pathname).toBe('/v1/responses')
      expect(request.headers.get('authorization')).toBe('Bearer fixture-only')
      bodies.push(await request.text())
      return new Response('data: {"fixture":true}\n\n', {
        headers: {
          'content-type': 'text/event-stream',
          'x-request-id': `fixture-${bodies.length}`,
          'x-client-request-id': `gateway-fixture-${bodies.length}`,
          'x-codex-turn-state': `opaque-fixture-${bodies.length}`,
        },
      })
    },
  })
  const proxy = startInputCacheWireProxy({
    baseUrl: `http://127.0.0.1:${upstream.port}/v1`,
    sessionId: () => 'fixture-session',
    deadlineAt: Date.now() + 10_000,
  })
  const send = async (input: unknown[], model = 'fixture', session = 'fixture-session', turnState?: string) => {
    const body = JSON.stringify({ model, input, tools: [], reasoning: { effort: 'xhigh' }, prompt_cache_key: session })
    const response = await fetch(`${proxy.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer fixture-only',
        session_id: session,
        'x-client-request-id': `fixture-client-${input.length}`,
        'content-type': 'application/json',
        ...(turnState ? { 'x-codex-turn-state': turnState } : {}),
      },
      body,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(await response.text()).toBe('data: {"fixture":true}\n\n')
    expect(bodies.at(-1)).toBe(body)
  }
  try {
    const first = { role: 'developer', content: 'Fixture secret prompt, only in memory' }
    await send([first])
    await send([first, { role: 'user', content: 'Continue' }], 'fixture', 'fixture-session', 'opaque-fixture-1')
    await send([{ role: 'user', content: 'Replaced prefix' }], 'different-model', 'other-session', 'opaque-fixture-2')
    expect(proxy.samples).toHaveLength(3)
    expect(proxy.samples[0]).toMatchObject({
      previousInputIsExactPrefix: null,
      configurationStable: null,
      sessionAffinityMatches: true,
      upstreamStatus: 200,
      upstreamRequestId: 'fixture-1',
      clientRequestId: 'fixture-client-1',
      responseClientRequestId: 'gateway-fixture-1',
      model: 'fixture',
      reasoningEffort: 'xhigh',
      toolNames: [],
      turnStateSent: false,
      turnStateReceived: true,
      turnStateReplayMatches: null,
    })
    expect(proxy.samples[1]).toMatchObject({
      previousInputIsExactPrefix: true,
      configurationStable: true,
      sessionAffinityMatches: true,
      turnStateSent: true,
      turnStateReplayMatches: true,
      clientRequestId: 'fixture-client-2',
    })
    expect(proxy.samples[2]).toMatchObject({
      previousInputIsExactPrefix: false,
      configurationStable: false,
      sessionAffinityMatches: false,
      turnStateReplayMatches: false,
    })
    expect(JSON.stringify(proxy.samples)).not.toContain('Fixture secret prompt')
    expect(JSON.stringify(proxy.samples)).not.toContain('fixture-only')
    expect(JSON.stringify(proxy.samples)).not.toContain('opaque-fixture')
    expect((await fetch(`${proxy.baseUrl}/unknown`)).status).toBe(404)
  } finally {
    await proxy.stop()
    await upstream.stop(true)
  }
})
