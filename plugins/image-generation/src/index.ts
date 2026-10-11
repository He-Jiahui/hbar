import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { definePlugin, type ModelRegistry, type ToolDefinition } from '@hbar/plugin-sdk'

const MAX_PROMPT_CHARACTERS = 32_000
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_RESPONSE_BYTES = 14 * 1024 * 1024
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

function imageMime(bytes: Uint8Array): string {
  if (bytes.byteLength >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes.byteLength >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' &&
    Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
  )
    return 'image/webp'
  if (bytes.byteLength >= 6 && ['GIF87a', 'GIF89a'].includes(Buffer.from(bytes.subarray(0, 6)).toString('ascii')))
    return 'image/gif'
  throw new HbarError('INVALID_IMAGE', 'Image provider returned bytes with an unsupported or invalid image signature')
}

async function readBounded(response: Response, maximum: number, signal: AbortSignal): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maximum)
    throw new HbarError('IMAGE_RESPONSE_LIMIT', 'Image provider response exceeds the 14 MiB limit')
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
    const mimeType = imageMime(bytes)
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
): ToolDefinition {
  const completed = new Map<
    string,
    { readonly identity: string; readonly result: Promise<ImageResult>; settled: boolean }
  >()
  return {
    name: 'image_generate',
    description:
      'Generate one image from a prompt using a configured OpenAI Images API compatible provider model. Use only a model explicitly saved with imageGeneration=true. Returns durable image attachments. Each call may incur provider charges; never retry after an unknown timeout without checking the existing tool result.',
    inputSchema: imageInputSchema,
    effect: 'network',
    timeoutMs: 120_000,
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
        return toToolResult(await cached.result)
      }
      if (completed.size >= 256) {
        const expired = [...completed].find(([, entry]) => entry.settled)?.[0]
        if (expired) completed.delete(expired)
        else
          throw new HbarError(
            'IMAGE_GENERATION_BUSY',
            'Image generation has reached its bounded in-flight request limit',
          )
      }
      const operation = generate(fetcher, apiKey, model.baseUrl, model.model, input, context.signal)
      const key = `${context.session.id}:${context.run.id}:${context.callId}`
      const entry = { identity, result: operation, settled: false }
      completed.set(key, entry)
      try {
        const result = await operation
        entry.settled = true
        return toToolResult(result)
      } catch (error) {
        entry.settled = true
        throw error
      }
    },
  }
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

export default definePlugin({
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
    register(createImageGenerationTool(context.hbar.api.service<ModelRegistry>('models')))
  },
})
