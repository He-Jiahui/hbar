import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { preflightImage } from '@hbar/contracts/image-preflight'
import { definePlugin, type ModelRegistry, type ToolDefinition } from '@hbar/plugin-sdk'

const MAX_PROMPT_CHARACTERS = 32_000
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_RESPONSE_BYTES = 14 * 1024 * 1024
const DEFAULT_MAX_IN_FLIGHT_REQUESTS = 2
const DEFAULT_MAX_CACHE_ENTRIES = 16
const DEFAULT_MAX_CACHED_RESULT_MEMORY_BYTES = 32 * 1024 * 1024
const STRING_MEMORY_BYTES_PER_CODE_UNIT = 2
interface ImageGenerationToolOptions {
  readonly timeoutMs?: number
  readonly maxInFlightRequests?: number
  readonly maxCacheEntries?: number
  readonly maxCachedResultMemoryBytes?: number
}

function boundedOption(value: number | undefined, fallback: number, maximum: number, name: string): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new RangeError(`${name} must be an integer from 1 through ${maximum}`)
  return value
}
const imageInputSchema = z.strictObject({
  model: z
    .string()
    .min(1)
    .max(160)
    .describe('Configured provider model selection id with imageGeneration explicitly enabled.'),
  prompt: z.string().trim().min(1).max(MAX_PROMPT_CHARACTERS),
  size: z.string().min(1).max(32).default('1024x1024'),
  quality: z.enum(['low', 'medium', 'high', 'auto']).default('auto'),
  output_format: z.enum(['png', 'jpeg', 'webp']).default('png'),
})
const imageResponseSchema = z.object({
  data: z
    .array(z.object({ b64_json: z.string().min(1).optional() }))
    .min(1)
    .max(4),
})
type ImageInput = z.output<typeof imageInputSchema>
type GeneratedImage = { readonly data: string; readonly mimeType: string; readonly bytes: number }
type ImageResult = { readonly text: string; readonly images: readonly GeneratedImage[] }
type ImageFetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

async function readBounded(response: Response, maximum: number, signal: AbortSignal): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maximum) {
    await response.body?.cancel().catch(() => {})
    throw new HbarError('IMAGE_RESPONSE_LIMIT', 'Image provider response exceeds the 14 MiB limit')
  }
  if (!response.body) throw new HbarError('IMAGE_PROVIDER_EMPTY', 'Image provider returned an empty response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  const abort = () => {
    void reader.cancel(signal.reason).catch(() => {})
  }
  signal.addEventListener('abort', abort, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) {
        await reader.cancel('response size limit exceeded')
        throw new HbarError('IMAGE_RESPONSE_LIMIT', 'Image provider response exceeds the 14 MiB limit')
      }
      chunks.push(value)
    }
    signal.throwIfAborted()
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted()
    throw error
  } finally {
    signal.removeEventListener('abort', abort)
    reader.releaseLock()
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function idempotencyIdentity(runId: string, callId: string, input: ImageInput): string {
  return createHash('sha256')
    .update(JSON.stringify([runId, callId, input]))
    .digest('hex')
}

function responseResult(value: unknown, input: ImageInput): ImageResult {
  const parsed = imageResponseSchema.safeParse(value)
  if (!parsed.success)
    throw new HbarError('IMAGE_PROVIDER_INVALID', 'Image provider response did not include generated image bytes')
  const images: GeneratedImage[] = []
  let totalBytes = 0
  for (const item of parsed.data.data) {
    if (!item.b64_json)
      throw new HbarError('IMAGE_PROVIDER_INVALID', 'Image provider returned an image without base64 bytes')
    if (item.b64_json.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.b64_json))
      throw new HbarError('IMAGE_RESPONSE_LIMIT', 'Generated image is invalid or exceeds the 10 MiB limit')
    const bytes = Buffer.from(item.b64_json, 'base64')
    if (bytes.toString('base64').replace(/=+$/, '') !== item.b64_json.replace(/=+$/, ''))
      throw new HbarError('IMAGE_PROVIDER_INVALID', 'Image provider returned invalid base64 bytes')
    let mimeType: string
    try {
      mimeType = preflightImage(bytes, `image/${input.output_format === 'jpeg' ? 'jpeg' : input.output_format}`).mime
    } catch {
      throw new HbarError('IMAGE_PROVIDER_INVALID', 'Image provider returned an incomplete or invalid image')
    }
    if (mimeType !== `image/${input.output_format === 'jpeg' ? 'jpeg' : input.output_format}`)
      throw new HbarError('IMAGE_PROVIDER_INVALID', 'Image bytes do not match the requested output format')
    totalBytes += bytes.byteLength
    if (totalBytes > MAX_IMAGE_BYTES)
      throw new HbarError('IMAGE_RESPONSE_LIMIT', 'Generated images exceed the 10 MiB total output limit')
    images.push({ data: item.b64_json, mimeType, bytes: bytes.byteLength })
  }
  return { text: `Generated ${images.length} image${images.length === 1 ? '' : 's'} with ${input.model}.`, images }
}

export function createImageGenerationTool(
  registry: ModelRegistry,
  fetcher: ImageFetcher = globalThis.fetch,
  options: ImageGenerationToolOptions = {},
): ToolDefinition {
  const timeoutMs = boundedOption(options.timeoutMs, 120_000, 120_000, 'timeoutMs')
  const maxInFlightRequests = boundedOption(
    options.maxInFlightRequests,
    DEFAULT_MAX_IN_FLIGHT_REQUESTS,
    DEFAULT_MAX_IN_FLIGHT_REQUESTS,
    'maxInFlightRequests',
  )
  const maxCacheEntries = boundedOption(
    options.maxCacheEntries,
    DEFAULT_MAX_CACHE_ENTRIES,
    DEFAULT_MAX_CACHE_ENTRIES,
    'maxCacheEntries',
  )
  const maxCachedResultMemoryBytes = boundedOption(
    options.maxCachedResultMemoryBytes,
    DEFAULT_MAX_CACHED_RESULT_MEMORY_BYTES,
    DEFAULT_MAX_CACHED_RESULT_MEMORY_BYTES,
    'maxCachedResultMemoryBytes',
  )
  const completed = new Map<
    string,
    { readonly identity: string; readonly result: Promise<ImageResult>; settled: boolean; memoryBytes: number }
  >()
  let inFlight = 0
  let cachedResultMemoryBytes = 0
  return {
    name: 'image_generate',
    description:
      'Generate one image from a prompt using a configured OpenAI Images API compatible provider model. Use only a model explicitly saved with imageGeneration=true. Returns durable image attachments. Each call may incur provider charges; never retry after an unknown timeout without checking the existing tool result.',
    inputSchema: imageInputSchema,
    effect: 'network',
    timeoutMs,
    async execute(args, context) {
      const input = imageInputSchema.parse(args)
      const model = await registry.get(input.model)
      if (!model.imageGeneration)
        throw new HbarError(
          'IMAGE_GENERATION_UNAVAILABLE',
          'Enable imageGeneration for this exact provider model before using it',
        )
      if (!['openai-completions', 'openai-responses'].includes(model.protocol))
        throw new HbarError('IMAGE_GENERATION_UNAVAILABLE', 'Image generation requires an OpenAI protocol provider')
      const apiKey = await registry.secret(model.id)
      if (!apiKey)
        throw new HbarError('PROVIDER_CREDENTIAL_MISSING', 'The configured image provider has no saved credential')
      const identity = idempotencyIdentity(context.run.id, context.callId, input)
      const cached = completed.get(`${context.session.id}:${context.run.id}:${context.callId}`)
      if (cached) {
        if (cached.identity !== identity)
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'Image tool call id was reused with different parameters')
        const key = `${context.session.id}:${context.run.id}:${context.callId}`
        completed.delete(key)
        completed.set(key, cached)
        return toToolResult(await cached.result)
      }
      if (inFlight >= maxInFlightRequests)
        throw new HbarError('IMAGE_GENERATION_BUSY', 'Image generation has reached its in-flight request limit')
      const key = `${context.session.id}:${context.run.id}:${context.callId}`
      if (completed.size >= maxCacheEntries)
        evictOldestSettled(completed, (bytes) => (cachedResultMemoryBytes -= bytes))
      if (completed.size >= maxCacheEntries)
        throw new HbarError('IMAGE_GENERATION_BUSY', 'Image generation result cache is full of active requests')
      inFlight += 1
      const operation = generate(fetcher, apiKey, model.baseUrl, model.model, input, context.signal)
      const entry = { identity, result: operation, settled: false, memoryBytes: 0 }
      completed.set(key, entry)
      try {
        const result = await operation
        entry.settled = true
        entry.memoryBytes = result.images.reduce(
          (total, image) => total + image.data.length * STRING_MEMORY_BYTES_PER_CODE_UNIT,
          0,
        )
        while (cachedResultMemoryBytes + entry.memoryBytes > maxCachedResultMemoryBytes) {
          if (!evictOldestSettled(completed, (bytes) => (cachedResultMemoryBytes -= bytes), key)) break
        }
        if (cachedResultMemoryBytes + entry.memoryBytes <= maxCachedResultMemoryBytes)
          cachedResultMemoryBytes += entry.memoryBytes
        else {
          completed.delete(key)
          entry.memoryBytes = 0
        }
        return toToolResult(result)
      } catch (error) {
        entry.settled = true
        throw error
      } finally {
        inFlight -= 1
      }
    },
  }
}

function evictOldestSettled(
  cache: Map<
    string,
    { readonly identity: string; readonly result: Promise<ImageResult>; settled: boolean; memoryBytes: number }
  >,
  onEvict: (memoryBytes: number) => void,
  excluding?: string,
): boolean {
  for (const [key, entry] of cache) {
    if (key === excluding || !entry.settled) continue
    cache.delete(key)
    onEvict(entry.memoryBytes)
    return true
  }
  return false
}

async function generate(
  fetcher: ImageFetcher,
  apiKey: string,
  baseUrl: string,
  providerModel: string,
  input: ImageInput,
  signal: AbortSignal,
): Promise<ImageResult> {
  signal.throwIfAborted()
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/images/generations`
  let response: Response
  try {
    response = await fetcher(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: providerModel,
        prompt: input.prompt,
        size: input.size,
        quality: input.quality,
        output_format: input.output_format,
        n: 1,
      }),
      signal,
    })
  } catch {
    signal.throwIfAborted()
    throw new HbarError(
      'IMAGE_PROVIDER_CONNECTION',
      'Image provider request failed. Check the endpoint and verify the prior call status before retrying.',
    )
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new HbarError('IMAGE_PROVIDER_HTTP', `Image provider returned HTTP ${response.status}`)
  }
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    await response.body?.cancel()
    throw new HbarError('IMAGE_PROVIDER_INVALID', 'Image provider must return an application/json response')
  }
  const body = await readBounded(response, MAX_RESPONSE_BYTES, signal)
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))
  } catch {
    throw new HbarError('IMAGE_PROVIDER_INVALID', 'Image provider returned invalid JSON')
  }
  return responseResult(value, input)
}

function toToolResult(result: ImageResult) {
  return {
    text: result.text,
    content: result.images.map((image) => ({ type: 'image' as const, data: image.data, mimeType: image.mimeType })),
    details: {
      count: result.images.length,
      totalBytes: result.images.reduce((total, image) => total + image.bytes, 0),
    },
  }
}

export function createImageGenerationPlugin(options: ImageGenerationToolOptions = {}) {
  return definePlugin({
    manifest: {
      id: 'image-generation.openai-compatible',
      name: 'OpenAI compatible image generation',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      description: 'Generate durable image artifacts through an explicitly enabled provider model',
      requires: { models: '^1.0.0' },
      permissions: ['network', 'credentials'],
    },
    apply(context) {
      const register = context.hbar.api.tools.register
      register(createImageGenerationTool(context.hbar.api.service<ModelRegistry>('models'), globalThis.fetch, options))
    },
  })
}

export default createImageGenerationPlugin()
