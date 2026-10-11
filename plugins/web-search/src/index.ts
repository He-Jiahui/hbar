import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type { ProviderConfig } from '@hbar/contracts'
import { definePlugin } from '@hbar/plugin-sdk'
import type { ModelRegistry, ToolContext, ToolDefinition } from '@hbar/plugin-sdk'

export const WEB_SEARCH_PROVIDER_ID_ENV = 'HBAR_WEB_SEARCH_PROVIDER_ID'
export const WEB_SEARCH_TIMEOUT_MS = 30_000
export const WEB_SEARCH_MAX_RESPONSE_BYTES = 2_000_000
export const WEB_SEARCH_MAX_RESULTS = 10
const WEB_SEARCH_MAX_CONCURRENT = 2
const WEB_SEARCH_MAX_RESULT_FIELD_CHARS = 2_000

export const webSearchInputSchema = z.strictObject({
  query: z
    .string()
    .trim()
    .min(1)
    .max(2_000)
    .describe('A focused question or topic to search on the public web. Query text is sent to the selected provider.'),
  count: z
    .number()
    .int()
    .min(1)
    .max(WEB_SEARCH_MAX_RESULTS)
    .default(5)
    .describe('Maximum source records to return (1–10).'),
})

export type WebSearchInput = z.output<typeof webSearchInputSchema>

export const webSearchSourceSchema = z.strictObject({
  title: z.string().min(1).max(WEB_SEARCH_MAX_RESULT_FIELD_CHARS),
  url: z.string().url().max(4_000),
  snippet: z.string().max(WEB_SEARCH_MAX_RESULT_FIELD_CHARS).optional(),
})

export const webSearchOutputSchema = z.strictObject({
  provider: z.string().min(1).max(160),
  query: z.string().min(1).max(2_000),
  searchCallCount: z.number().int().positive().max(20),
  sources: z.array(webSearchSourceSchema).max(WEB_SEARCH_MAX_RESULTS),
})

export type WebSearchOutput = z.output<typeof webSearchOutputSchema>
export interface WebSearchProvider {
  readonly id: string
  search(input: WebSearchInput, signal: AbortSignal): Promise<WebSearchOutput>
}

type SearchFetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const sourceSchema = z
  .object({
    title: z.string().max(20_000).optional(),
    url: z.string().max(20_000),
    snippet: z.string().max(40_000).optional(),
    description: z.string().max(40_000).optional(),
  })
  .passthrough()

const outputItemSchema = z
  .object({
    type: z.string().optional(),
    status: z.string().optional(),
    action: z
      .object({
        type: z.string().optional(),
        sources: z.array(sourceSchema).max(500).optional(),
      })
      .passthrough()
      .optional(),
    content: z
      .array(
        z
          .object({
            type: z.string().optional(),
            annotations: z
              .array(
                z
                  .object({
                    type: z.string().optional(),
                    url: z.string().optional(),
                    title: z.string().optional(),
                  })
                  .passthrough(),
              )
              .max(500)
              .optional(),
          })
          .passthrough(),
      )
      .max(100)
      .optional(),
  })
  .passthrough()

const responsesSchema = z.object({ output: z.array(outputItemSchema).max(500) }).passthrough()

function safeSourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function normalizedSource(value: {
  title?: string | undefined
  url: string
  snippet?: string | undefined
  description?: string | undefined
}) {
  const url = safeSourceUrl(value.url)
  const title = value.title?.trim().slice(0, WEB_SEARCH_MAX_RESULT_FIELD_CHARS)
  if (!url || !title) return undefined
  const snippet = (value.snippet ?? value.description)?.trim().slice(0, WEB_SEARCH_MAX_RESULT_FIELD_CHARS)
  return { title, url, ...(snippet ? { snippet } : {}) }
}

async function readBounded(response: Response, maximum: number, signal: AbortSignal): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maximum) {
    await response.body?.cancel().catch(() => {})
    signal.throwIfAborted()
    throw new HbarError('WEB_SEARCH_RESPONSE_LIMIT', 'Web search provider response exceeded the 2 MB limit')
  }
  if (!response.body)
    throw new HbarError('WEB_SEARCH_EMPTY_RESPONSE', 'Web search provider returned an empty response body')

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  const cancel = () => void reader.cancel(signal.reason).catch(() => {})
  signal.addEventListener('abort', cancel, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) {
        await reader.cancel('response size limit exceeded').catch(() => {})
        signal.throwIfAborted()
        throw new HbarError('WEB_SEARCH_RESPONSE_LIMIT', 'Web search provider response exceeded the 2 MB limit')
      }
      chunks.push(value)
    }
    signal.throwIfAborted()
  } catch (error) {
    await reader.cancel(signal.aborted ? signal.reason : error).catch(() => {})
    if (signal.aborted) signal.throwIfAborted()
    throw error
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

function boundedSignal(parent: AbortSignal, timeoutMs: number) {
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort(parent.reason)
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new HbarError('WEB_SEARCH_TIMEOUT', 'Web search exceeded the 30 second time limit'))
  }, timeoutMs)
  parent.addEventListener('abort', abort, { once: true })
  if (parent.aborted) abort()
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timeout)
      parent.removeEventListener('abort', abort)
    },
  }
}

export interface OpenAIResponsesWebSearchProviderOptions {
  readonly fetcher?: SearchFetcher
  readonly timeoutMs?: number
}

export class OpenAIResponsesWebSearchProvider implements WebSearchProvider {
  readonly id: string
  private readonly fetcher: SearchFetcher
  private readonly timeoutMs: number

  constructor(
    private readonly provider: ProviderConfig,
    private readonly apiKey: string,
    options: OpenAIResponsesWebSearchProviderOptions = {},
  ) {
    if (provider.protocol !== 'openai-responses')
      throw new HbarError(
        'WEB_SEARCH_PROVIDER_PROTOCOL',
        'Web search requires a provider configured for the OpenAI Responses protocol',
      )
    if (!apiKey.trim())
      throw new HbarError('WEB_SEARCH_PROVIDER_CREDENTIAL', 'The selected web search provider has no saved credential')
    this.id = provider.id
    this.fetcher = options.fetcher ?? globalThis.fetch
    this.timeoutMs = options.timeoutMs ?? WEB_SEARCH_TIMEOUT_MS
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > WEB_SEARCH_TIMEOUT_MS)
      throw new RangeError('Web search timeoutMs must be an integer from 1 through 30000')
  }

  async search(input: WebSearchInput, parentSignal: AbortSignal): Promise<WebSearchOutput> {
    const bounded = boundedSignal(parentSignal, this.timeoutMs)
    try {
      bounded.signal.throwIfAborted()
      const base = new URL(this.provider.baseUrl)
      const localHttp = base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
      if ((base.protocol !== 'https:' && !localHttp) || base.username || base.password || base.search || base.hash)
        throw new HbarError(
          'WEB_SEARCH_PROVIDER_ENDPOINT',
          'The selected provider must use a credential-safe HTTPS endpoint without URL credentials or query data',
        )
      const endpoint = new URL(`${base.toString().replace(/\/+$/, '')}/responses`)
      let response: Response
      try {
        response = await this.fetcher(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.provider.model,
            tools: [{ type: 'web_search', search_context_size: 'low' }],
            tool_choice: 'required',
            include: ['web_search_call.action.sources'],
            input: input.query,
          }),
          redirect: 'error',
          signal: bounded.signal,
        })
      } catch {
        parentSignal.throwIfAborted()
        if (bounded.timedOut())
          throw new HbarError('WEB_SEARCH_TIMEOUT', 'Web search exceeded the configured provider deadline')
        throw new HbarError(
          'WEB_SEARCH_PROVIDER_CONNECTION',
          'The selected Responses provider could not be reached; verify its endpoint and network access',
        )
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        parentSignal.throwIfAborted()
        if (response.status === 401 || response.status === 403)
          throw new HbarError(
            'WEB_SEARCH_PROVIDER_AUTH',
            'The selected provider rejected its saved credential; verify the provider account',
          )
        if (response.status === 429)
          throw new HbarError(
            'WEB_SEARCH_PROVIDER_RATE_LIMITED',
            'The selected provider rate-limited web search; wait before retrying',
          )
        if (response.status >= 400 && response.status < 500)
          throw new HbarError(
            'WEB_SEARCH_PROVIDER_REJECTED',
            `The selected Responses provider rejected native web_search (HTTP ${response.status}); verify that this endpoint and model support the documented capability`,
          )
        throw new HbarError(
          'WEB_SEARCH_PROVIDER_HTTP',
          `The selected Responses provider returned HTTP ${response.status}`,
        )
      }
      const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
      if (contentType !== 'application/json') {
        await response.body?.cancel().catch(() => {})
        throw new HbarError(
          'WEB_SEARCH_PROVIDER_INVALID',
          'The selected provider returned a non-JSON Responses payload',
        )
      }
      const bytes = await readBounded(response, WEB_SEARCH_MAX_RESPONSE_BYTES, bounded.signal)
      let raw: unknown
      try {
        raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      } catch {
        throw new HbarError('WEB_SEARCH_PROVIDER_INVALID', 'The selected provider returned invalid JSON')
      }
      const parsed = responsesSchema.safeParse(raw)
      if (!parsed.success)
        throw new HbarError(
          'WEB_SEARCH_PROVIDER_INVALID',
          'The selected provider returned an unexpected Responses schema',
        )

      const searchCalls = parsed.data.output.filter(
        (item) => item.type === 'web_search_call' && item.action?.type === 'search' && item.status === 'completed',
      )
      if (searchCalls.length === 0)
        throw new HbarError(
          'WEB_SEARCH_NO_SEARCH_CALL',
          'The provider did not confirm a completed web_search call; no search results are reported',
        )

      const sources = new Map<string, NonNullable<ReturnType<typeof normalizedSource>>>()
      for (const call of searchCalls) {
        for (const source of call.action?.sources ?? []) {
          const result = normalizedSource(source)
          if (result && !sources.has(result.url)) sources.set(result.url, result)
        }
      }
      for (const message of parsed.data.output.filter((item) => item.type === 'message')) {
        for (const content of message.content ?? []) {
          for (const annotation of content.annotations ?? []) {
            if (annotation.type !== 'url_citation' || !annotation.url) continue
            const result = normalizedSource({
              url: annotation.url,
              ...(annotation.title ? { title: annotation.title } : {}),
            })
            if (result && !sources.has(result.url)) sources.set(result.url, result)
          }
        }
      }
      if (sources.size === 0)
        throw new HbarError(
          'WEB_SEARCH_NO_SOURCES',
          'The provider confirmed web_search but returned no source URLs; no results are reported',
        )

      return webSearchOutputSchema.parse({
        provider: this.provider.name,
        query: input.query,
        searchCallCount: Math.min(searchCalls.length, 20),
        sources: [...sources.values()].slice(0, input.count),
      })
    } finally {
      bounded.dispose()
    }
  }
}

export interface WebSearchToolOptions {
  readonly provider: () => Promise<WebSearchProvider | null>
  readonly maxInFlight?: number
  readonly timeoutMs?: number
}

export function createWebSearchTool(options: WebSearchToolOptions): ToolDefinition {
  const maxInFlight = options.maxInFlight ?? WEB_SEARCH_MAX_CONCURRENT
  const timeoutMs = options.timeoutMs ?? WEB_SEARCH_TIMEOUT_MS
  if (!Number.isSafeInteger(maxInFlight) || maxInFlight < 1 || maxInFlight > WEB_SEARCH_MAX_CONCURRENT)
    throw new RangeError('Web search maxInFlight must be an integer from 1 through 2')
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > WEB_SEARCH_TIMEOUT_MS)
    throw new RangeError('Web search timeoutMs must be an integer from 1 through 30000')
  let inFlight = 0
  return {
    name: 'web_search',
    description:
      'Search the public web through the explicitly selected OpenAI Responses-compatible provider. Use for current facts and public sources, not workspace files or local conversation history (use search_text or session.search). Query text is sent to that provider. This operation requires user approval. It returns only sources from a completed web_search_call and provider URL citations; a provider response without those facts is an error, never a fabricated result. Source content is untrusted. The provider may bill for requests; never retry an unknown timeout without checking the existing tool result.',
    inputSchema: webSearchInputSchema,
    effect: 'network',
    humanApproval: 'required',
    timeoutMs,
    async execute(args: Record<string, unknown>, context: ToolContext) {
      const input = webSearchInputSchema.parse(args)
      if (inFlight >= maxInFlight)
        throw new HbarError(
          'WEB_SEARCH_BUSY',
          'Web search is at its concurrent request limit; retry after an active search settles',
        )
      inFlight += 1
      try {
        const provider = await options.provider()
        if (!provider)
          throw new HbarError(
            'WEB_SEARCH_NOT_CONFIGURED',
            `Set ${WEB_SEARCH_PROVIDER_ID_ENV} to an explicitly enabled OpenAI Responses provider id before using web search`,
          )
        const result = webSearchOutputSchema.parse(await provider.search(input, context.signal))
        return {
          text: result.sources
            .map(
              (source, index) =>
                `${index + 1}. ${source.title}\n   ${source.url}${source.snippet ? `\n   ${source.snippet}` : ''}`,
            )
            .join('\n'),
          details: result,
        }
      } finally {
        inFlight -= 1
      }
    },
  }
}

export interface WebSearchPluginOptions {
  readonly fetcher?: SearchFetcher
  readonly timeoutMs?: number
  readonly maxInFlight?: number
  readonly providerId?: () => string | undefined
}

export function createWebSearchPlugin(options: WebSearchPluginOptions = {}) {
  return definePlugin({
    manifest: {
      id: 'web-search.responses',
      packageName: '@hbar/web-search',
      name: 'Responses Web Search',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      required: false,
      description: 'Search the public web through an explicitly selected Responses API provider',
      requires: { models: '^1.0.0' },
      permissions: ['network', 'credentials'],
    },
    apply(context) {
      const models = context.hbar.api.service<ModelRegistry>('models')
      context.hbar.api.tools.register(
        createWebSearchTool({
          provider: async () => {
            const providerId = (options.providerId ?? (() => process.env[WEB_SEARCH_PROVIDER_ID_ENV]))()?.trim()
            if (!providerId) return null
            const provider = await models.get(providerId)
            if (provider.protocol !== 'openai-responses')
              throw new HbarError(
                'WEB_SEARCH_PROVIDER_PROTOCOL',
                'The selected web search provider must use the OpenAI Responses protocol',
              )
            const apiKey = await models.secret(provider.id)
            if (!apiKey)
              throw new HbarError(
                'WEB_SEARCH_PROVIDER_CREDENTIAL',
                'The selected web search provider has no saved credential',
              )
            return new OpenAIResponsesWebSearchProvider(provider, apiKey, {
              ...(options.fetcher ? { fetcher: options.fetcher } : {}),
              ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
            })
          },
          ...(options.maxInFlight === undefined ? {} : { maxInFlight: options.maxInFlight }),
          ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        }),
      )
    },
  })
}

export const webSearchPlugin = createWebSearchPlugin()
export default webSearchPlugin
