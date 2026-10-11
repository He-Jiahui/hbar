import { expect, test } from 'bun:test'
import { Context } from 'cordis'
import { HbarError, providerSchema } from '@hbar/contracts'
import { HbarService } from '@hbar/plugin-sdk'
import type { HbarAPI, ToolContext } from '@hbar/plugin-sdk'
import { kernelCapabilityPlugins } from '../packages/kernel/src/plugin-composition'
import {
  WEB_SEARCH_MAX_RESPONSE_BYTES,
  WEB_SEARCH_PROVIDER_ID_ENV,
  OpenAIResponsesWebSearchProvider,
  createWebSearchPlugin,
  createWebSearchTool,
  webSearchInputSchema,
} from '../plugins/web-search/src/index'

function toolContext(signal = new AbortController().signal): ToolContext {
  return {
    session: { id: 'session-web-search-test' },
    workspace: { id: 'workspace-web-search-test' },
    run: { id: 'run-web-search-test' },
    signal,
    callId: 'call-web-search-test',
  } as ToolContext
}

const providerConfig = providerSchema.parse({
  id: 'fixture-responses',
  name: 'Fixture Responses',
  protocol: 'openai-responses',
  baseUrl: 'https://provider.example.test/v1',
  model: 'fixture-model',
  imageInput: false,
  imageGeneration: false,
  reasoning: false,
  inputPrice: 0,
  outputPrice: 0,
})

const source = {
  type: 'url',
  title: 'Official source',
  url: 'https://docs.example.test/search?ref=provider',
  snippet: 'Provider supplied source excerpt.',
}

function responsesPayload(
  sources: readonly Record<string, unknown>[] = [source],
  searchStatus = 'completed',
  includeCitation = true,
) {
  return {
    id: 'resp_fixture',
    output: [
      {
        type: 'web_search_call',
        id: 'ws_fixture',
        status: searchStatus,
        action: { type: 'search', query: 'What changed?', sources },
      },
      ...(includeCitation
        ? [
            {
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'The search call consulted the official source.',
                  annotations: [
                    { type: 'url_citation', url: source.url, title: source.title, start_index: 39, end_index: 57 },
                  ],
                },
              ],
            },
          ]
        : []),
    ],
  }
}

function contextResponse(payload: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

test('Responses adapter requires a completed web_search_call and returns provider source citations', async () => {
  let request: { url: URL; init: RequestInit; body: Record<string, unknown> } | undefined
  const adapter = new OpenAIResponsesWebSearchProvider(providerConfig, 'fixture-private-key', {
    fetcher: async (input, init) => {
      request = {
        url: new URL(input instanceof Request ? input.url : input.toString()),
        init: init ?? {},
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      }
      return contextResponse(responsesPayload())
    },
  })
  const result = await adapter.search(
    webSearchInputSchema.parse({ query: 'What changed?', count: 1 }),
    new AbortController().signal,
  )

  expect(request?.url.toString()).toBe('https://provider.example.test/v1/responses')
  expect(request?.init.method).toBe('POST')
  expect(new Headers(request?.init.headers).get('authorization')).toBe('Bearer fixture-private-key')
  expect(request?.body).toMatchObject({
    model: 'fixture-model',
    tools: [{ type: 'web_search', search_context_size: 'low' }],
    tool_choice: 'required',
    include: ['web_search_call.action.sources'],
    input: 'What changed?',
  })
  expect(result).toEqual({
    provider: 'Fixture Responses',
    query: 'What changed?',
    searchCallCount: 1,
    sources: [{ title: source.title, url: source.url, snippet: source.snippet }],
  })
})

test('search tool reports missing provider configuration instead of returning fake results', async () => {
  let providerReads = 0
  const tool = createWebSearchTool({
    provider: async () => {
      providerReads += 1
      return null
    },
  })
  await expect(tool.execute({ query: 'today news' }, toolContext())).rejects.toMatchObject({
    code: 'WEB_SEARCH_NOT_CONFIGURED',
  })
  expect(providerReads).toBe(1)
})

test('tool schema is strict and bounds query text and result count', () => {
  expect(webSearchInputSchema.parse({ query: '  current web fact  ' })).toEqual({ query: 'current web fact', count: 5 })
  expect(() => webSearchInputSchema.parse({ query: 'current web fact', unexpected: true })).toThrow()
  expect(() => webSearchInputSchema.parse({ query: 'x'.repeat(2_001) })).toThrow()
  expect(() => webSearchInputSchema.parse({ query: 'valid', count: 11 })).toThrow()
})

test('provider HTTP errors are explicit and never include upstream body or key', async () => {
  const adapter = new OpenAIResponsesWebSearchProvider(providerConfig, 'never-return-this-key', {
    fetcher: async () =>
      new Response('upstream secret error details', { status: 400, headers: { 'content-type': 'text/plain' } }),
  })
  await expect(
    adapter.search(webSearchInputSchema.parse({ query: 'web search test' }), new AbortController().signal),
  ).rejects.toMatchObject({ code: 'WEB_SEARCH_PROVIDER_REJECTED' })
})

test('a provider response without a completed search call or actual URLs is not accepted as search', async () => {
  const incomplete = new OpenAIResponsesWebSearchProvider(providerConfig, 'fixture-key', {
    fetcher: async () => contextResponse(responsesPayload([source], 'in_progress')),
  })
  await expect(
    incomplete.search(webSearchInputSchema.parse({ query: 'source check' }), new AbortController().signal),
  ).rejects.toMatchObject({ code: 'WEB_SEARCH_NO_SEARCH_CALL' })

  const noSources = new OpenAIResponsesWebSearchProvider(providerConfig, 'fixture-key', {
    fetcher: async () => contextResponse(responsesPayload([], 'completed', false)),
  })
  await expect(
    noSources.search(webSearchInputSchema.parse({ query: 'source check' }), new AbortController().signal),
  ).rejects.toMatchObject({ code: 'WEB_SEARCH_NO_SOURCES' })
})

test('source output rejects non-web and credential-bearing URLs and caps source fields', async () => {
  const adapter = new OpenAIResponsesWebSearchProvider(providerConfig, 'fixture-key', {
    fetcher: async () =>
      contextResponse(
        responsesPayload(
          [
            { ...source, url: 'javascript:alert(1)' },
            { ...source, url: 'https://user:pass@evil.example.test/' },
            { ...source, title: 'T'.repeat(2_001), url: 'https://docs.example.test/capped' },
            { ...source, title: 'Safe source', snippet: 'S'.repeat(2_001), url: 'https://docs.example.test/safe' },
          ],
          'completed',
          false,
        ),
      ),
  })
  const result = await adapter.search(
    webSearchInputSchema.parse({ query: 'safe sources', count: 10 }),
    new AbortController().signal,
  )
  expect(result.sources).toEqual([
    {
      title: 'T'.repeat(2_000),
      url: 'https://docs.example.test/capped',
      snippet: source.snippet,
    },
    { title: 'Safe source', url: 'https://docs.example.test/safe', snippet: 'S'.repeat(2_000) },
  ])
})

test('response parser bounds bytes and rejects malformed responses', async () => {
  const oversized = new OpenAIResponsesWebSearchProvider(providerConfig, 'fixture-key', {
    fetcher: async () =>
      new Response('x', {
        headers: { 'content-type': 'application/json', 'content-length': String(WEB_SEARCH_MAX_RESPONSE_BYTES + 1) },
      }),
  })
  await expect(
    oversized.search(webSearchInputSchema.parse({ query: 'bounded size' }), new AbortController().signal),
  ).rejects.toMatchObject({ code: 'WEB_SEARCH_RESPONSE_LIMIT' })

  const invalidJson = new OpenAIResponsesWebSearchProvider(providerConfig, 'fixture-key', {
    fetcher: async () => new Response('{', { headers: { 'content-type': 'application/json' } }),
  })
  await expect(
    invalidJson.search(webSearchInputSchema.parse({ query: 'parse response' }), new AbortController().signal),
  ).rejects.toMatchObject({ code: 'WEB_SEARCH_PROVIDER_INVALID' })
})

test('parent cancellation reaches the provider request and its request slot is released', async () => {
  let receivedSignal: AbortSignal | undefined
  const adapter = new OpenAIResponsesWebSearchProvider(providerConfig, 'fixture-key', {
    timeoutMs: 1_000,
    fetcher: async (_input, init) => {
      receivedSignal = init?.signal as AbortSignal
      return await new Promise<Response>((_resolve, reject) => {
        receivedSignal?.addEventListener('abort', () => reject(receivedSignal?.reason), { once: true })
      })
    },
  })
  const controller = new AbortController()
  const pending = adapter.search(webSearchInputSchema.parse({ query: 'cancel this search' }), controller.signal)
  await Bun.sleep(5)
  controller.abort(new HbarError('RUN_CANCELLED', 'fixture cancellation'))
  await expect(pending).rejects.toMatchObject({ code: 'RUN_CANCELLED' })
  expect(receivedSignal?.aborted).toBeTrue()

  const succeeding = new OpenAIResponsesWebSearchProvider(providerConfig, 'fixture-key', {
    fetcher: async () => contextResponse(responsesPayload()),
  })
  await expect(
    succeeding.search(webSearchInputSchema.parse({ query: 'later query' }), new AbortController().signal),
  ).resolves.toMatchObject({ sources: [{ url: source.url }] })
})

test('tool admission bounds concurrent searches and provider timeout', async () => {
  let releaseFirst: (() => void) | undefined
  const tool = createWebSearchTool({
    maxInFlight: 1,
    provider: async () => ({
      id: 'deferred',
      search: async (input) =>
        await new Promise((resolve) => {
          releaseFirst = () =>
            resolve({
              provider: 'fixture',
              query: input.query,
              searchCallCount: 1,
              sources: [{ title: 'Source', url: 'https://example.test' }],
            })
        }),
    }),
  })
  const first = tool.execute({ query: 'first query' }, toolContext())
  await Bun.sleep(5)
  await expect(tool.execute({ query: 'second query' }, toolContext())).rejects.toMatchObject({
    code: 'WEB_SEARCH_BUSY',
  })
  releaseFirst?.()
  await expect(first).resolves.toMatchObject({
    details: {
      provider: 'fixture',
      searchCallCount: 1,
      sources: [{ title: 'Source', url: 'https://example.test' }],
    },
  })

  const timed = new OpenAIResponsesWebSearchProvider(providerConfig, 'fixture-key', {
    timeoutMs: 10,
    fetcher: async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      }),
  })
  await expect(
    timed.search(webSearchInputSchema.parse({ query: 'deadline query' }), new AbortController().signal),
  ).rejects.toMatchObject({ code: 'WEB_SEARCH_TIMEOUT' })
})

test('plugin registers web_search and requests the selected provider secret only for that provider', async () => {
  const registered: Array<Awaited<ReturnType<typeof createWebSearchTool>>> = []
  const registry = { get: async () => providerConfig, secret: async () => 'selected-provider-secret' }
  const api = {
    tools: {
      register: (tool: (typeof registered)[number]) => {
        registered.push(tool)
        return () => {
          registered.splice(registered.indexOf(tool), 1)
        }
      },
    },
    service: <T>(name: string) => {
      expect(name).toBe('models')
      return registry as T
    },
  } as HbarAPI
  const cordis = new Context()
  new HbarService(cordis, api)
  const plugin = createWebSearchPlugin({
    providerId: () => providerConfig.id,
    fetcher: async (_input, init) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer selected-provider-secret')
      return contextResponse(responsesPayload())
    },
  })
  await plugin.apply(cordis, {})
  const tool = registered[0]
  expect(tool).toBeDefined()
  expect(tool?.name).toBe('web_search')
  expect(tool?.effect).toBe('network')
  expect(tool?.humanApproval).toBe('required')
  expect(WEB_SEARCH_PROVIDER_ID_ENV).toBe('HBAR_WEB_SEARCH_PROVIDER_ID')
  const result = await tool?.execute({ query: 'What changed?' }, toolContext())
  expect(result?.details).toMatchObject({ provider: providerConfig.name, sources: [{ url: source.url }] })
})

test('Kernel keeps web search available in both local and external-plugin compositions', () => {
  for (const externalPlugins of [false, true]) {
    const plugins = kernelCapabilityPlugins(externalPlugins)
    expect(plugins).toHaveLength(1)
    expect(plugins[0]?.manifest.id).toBe('web-search.responses')
  }
})
