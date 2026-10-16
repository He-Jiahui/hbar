import { expect, test } from 'bun:test'
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
      model: 'fixture',
      reasoningEffort: 'xhigh',
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
