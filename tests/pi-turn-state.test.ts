import { expect, test } from 'bun:test'
import type { FetchFunction } from '@earendil-works/pi-ai'
import type { ProviderConfig } from '@hbar/contracts'
import { ProviderTurnState } from '../plugins/pi-driver/src/provider-turn-state'

const provider = {
  id: 'fixture',
  model: 'fixture-model',
  baseUrl: 'https://provider.invalid/v1',
  protocol: 'openai-responses',
} as const satisfies Pick<ProviderConfig, 'id' | 'model' | 'baseUrl' | 'protocol'>
const endpoint = `${provider.baseUrl}/responses`
const init = {
  method: 'POST',
  headers: { authorization: 'Bearer fixture-only', session_id: 'fixture-session' },
  body: 'exact fixture body',
}

function fixture(respond: (request: Request) => Response | Promise<Response>): FetchFunction {
  return Object.assign(async (...args: Parameters<FetchFunction>) => respond(new Request(...args)), {
    preconnect: globalThis.fetch.preconnect,
  })
}

test('the first server turn-state is replayed unchanged and response streams remain untouched', async () => {
  const states: (string | null)[] = []
  const responses: Response[] = []
  const fetchImpl = fixture(async (request) => {
    states.push(request.headers.get('x-codex-turn-state'))
    expect(request.headers.get('authorization')).toBe('Bearer fixture-only')
    expect(await request.text()).toBe(init.body)
    const response = new Response(`stream-${states.length}`, {
      headers: { 'x-codex-turn-state': `state-${states.length}` },
    })
    responses.push(response)
    return response
  })
  const state = new ProviderTurnState()
  for (let index = 0; index < 3; index++) {
    const response = await state.forProvider(provider, fetchImpl)(endpoint, init)
    const expected = responses[index]
    if (!expected) throw new Error(`Missing fixture response ${index}`)
    expect(response).toBe(expected)
    expect(response.bodyUsed).toBe(false)
    expect(await response.text()).toBe(`stream-${index + 1}`)
  }
  expect(states).toEqual([null, 'state-1', 'state-1'])
})

test('provider, model, endpoint, auth and session changes retire the old routing state', async () => {
  const observed: (string | null)[] = []
  const fetchImpl = fixture((request) => {
    observed.push(request.headers.get('x-codex-turn-state'))
    return new Response(null, { headers: { 'x-codex-turn-state': `state-${observed.length}` } })
  })
  const state = new ProviderTurnState()
  await state.forProvider(provider, fetchImpl)(endpoint, init)
  await state.forProvider(provider, fetchImpl)(endpoint, init)
  await state.forProvider({ ...provider, id: 'another-provider' }, fetchImpl)(endpoint, init)
  await state.forProvider(provider, fetchImpl)(endpoint, init)
  await state.forProvider({ ...provider, model: 'another-model' }, fetchImpl)(endpoint, init)
  await state.forProvider(provider, fetchImpl)(endpoint, init)
  await state.forProvider(provider, fetchImpl)(`${endpoint}?route=another`, init)
  await state.forProvider(provider, fetchImpl)(endpoint, init)
  await state.forProvider(provider, fetchImpl)(endpoint, {
    ...init,
    headers: { ...init.headers, authorization: 'Bearer rotated-fixture' },
  })
  await state.forProvider(provider, fetchImpl)(endpoint, {
    ...init,
    headers: { ...init.headers, session_id: 'other-session' },
  })
  expect(observed).toEqual([null, 'state-1', null, null, null, null, null, null, null, null])
})

test('different Runs isolate routing state and another protocol never captures or sends it', async () => {
  const observed: (string | null)[] = []
  const fetchImpl = fixture(async (request) => {
    observed.push(request.headers.get('x-codex-turn-state'))
    await Promise.resolve()
    return new Response(null, { headers: { 'x-codex-turn-state': `state-${request.headers.get('session_id')}` } })
  })
  const first = new ProviderTurnState(),
    second = new ProviderTurnState()
  await Promise.all([
    first.forProvider(provider, fetchImpl)(endpoint, init),
    second.forProvider(provider, fetchImpl)(endpoint, { ...init, headers: { ...init.headers, session_id: 'second' } }),
  ])
  await Promise.all([
    first.forProvider(provider, fetchImpl)(endpoint, init),
    second.forProvider(provider, fetchImpl)(endpoint, { ...init, headers: { ...init.headers, session_id: 'second' } }),
  ])
  await first.forProvider({ ...provider, protocol: 'openai-completions' }, fetchImpl)(endpoint, init)
  await first.forProvider(provider, fetchImpl)(endpoint, init)
  expect(observed).toEqual([null, null, 'state-fixture-session', 'state-second', null, null])
})

test('missing, oversized and unsuccessful response state cannot establish a routing token', async () => {
  for (const response of [
    new Response(),
    new Response(null, { headers: { 'x-codex-turn-state': 'x'.repeat(8193) } }),
    new Response(null, { status: 429, headers: { 'x-codex-turn-state': 'failed-state' } }),
  ]) {
    const observed: (string | null)[] = []
    const fetchImpl = fixture((request) => {
      observed.push(request.headers.get('x-codex-turn-state'))
      return observed.length === 1 ? response : new Response()
    })
    const state = new ProviderTurnState()
    await state.forProvider(provider, fetchImpl)(endpoint, init)
    await state.forProvider(provider, fetchImpl)(endpoint, init)
    expect(observed).toEqual([null, null])
  }
})

test('late responses and stale route callbacks cannot reactivate a retired provider', async () => {
  let release: (response: Response) => void = () => {
    throw new Error('Request has not started')
  }
  const observed: (string | null)[] = []
  const fetchImpl = fixture((request) => {
    observed.push(request.headers.get('x-codex-turn-state'))
    return observed.length === 1
      ? new Promise<Response>((resolve) => {
          release = resolve
        })
      : new Response()
  })
  const state = new ProviderTurnState()
  const oldRoute = state.forProvider(provider, fetchImpl)
  const pending = oldRoute(endpoint, init)
  await state.forProvider({ ...provider, id: 'new-provider' }, fetchImpl)(endpoint, init)
  release(new Response(null, { headers: { 'x-codex-turn-state': 'old-state' } }))
  await pending
  await state.forProvider(provider, fetchImpl)(endpoint, init)
  await oldRoute(endpoint, init)
  expect(observed).toEqual([null, null, null, null])
})
