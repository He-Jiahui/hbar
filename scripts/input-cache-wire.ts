import { createHash } from 'node:crypto'
import { z } from 'zod'

const payloadSchema = z.object({ input: z.array(z.unknown()) }).catchall(z.unknown())
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export interface InputCacheWireSample {
  request: number
  inputItems: number
  inputHash: string
  configurationHash: string
  model: string | null
  reasoningEffort: string | null
  previousInputIsExactPrefix: boolean | null
  configurationStable: boolean | null
  sessionAffinityMatches: boolean
  upstreamStatus: number | null
  upstreamRequestId: string | null
}

/** Verification-only transparent proxy: inspect final wire bodies without retaining prompts or credentials. */
export function startInputCacheWireProxy(options: {
  baseUrl: string
  sessionId: () => string | undefined
  deadlineAt: number
}) {
  const samples: InputCacheWireSample[] = []
  let previousInput: string[] | undefined
  let firstConfiguration: string | undefined
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    idleTimeout: 255,
    maxRequestBodySize: 8 * 1024 * 1024,
    async fetch(request) {
      if (request.method !== 'POST' || new URL(request.url).pathname !== '/v1/responses')
        return new Response('Unsupported verification route', { status: 404 })
      if (samples.length >= 12) return new Response('Verification request ceiling reached', { status: 429 })
      const raw = await request.text()
      const { input, ...configuration } = payloadSchema.parse(JSON.parse(raw) as unknown)
      const items = input.map((item) => JSON.stringify(item))
      const configurationHash = hash(configuration)
      const reasoning = z.object({ effort: z.string() }).safeParse(configuration.reasoning)
      const expectedSession = options.sessionId()
      const sample: InputCacheWireSample = {
        request: samples.length + 1,
        inputItems: input.length,
        inputHash: hash(input),
        configurationHash,
        model: typeof configuration.model === 'string' ? configuration.model : null,
        reasoningEffort: reasoning.success ? reasoning.data.effort : null,
        previousInputIsExactPrefix: previousInput
          ? previousInput.length <= items.length && previousInput.every((item, index) => item === items[index])
          : null,
        configurationStable: firstConfiguration ? firstConfiguration === configurationHash : null,
        sessionAffinityMatches:
          !!expectedSession &&
          configuration.prompt_cache_key === expectedSession &&
          request.headers.get('session_id') === expectedSession,
        upstreamStatus: null,
        upstreamRequestId: null,
      }
      samples.push(sample)
      previousInput = items
      firstConfiguration ??= configurationHash
      const headers = new Headers(request.headers)
      for (const name of ['host', 'content-length', 'connection']) headers.delete(name)
      const remaining = options.deadlineAt - Date.now()
      if (remaining <= 0) return new Response('Verification deadline exceeded', { status: 504 })
      const response = await fetch(`${options.baseUrl.replace(/\/$/, '')}/responses`, {
        method: 'POST',
        headers,
        body: raw,
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(remaining)]),
      })
      sample.upstreamStatus = response.status
      sample.upstreamRequestId = response.headers.get('x-request-id')
      const responseHeaders = new Headers(response.headers)
      // fetch exposes decoded bytes; do not advertise the upstream compressed length/encoding twice.
      for (const name of ['content-encoding', 'content-length', 'transfer-encoding', 'connection'])
        responseHeaders.delete(name)
      return new Response(response.body, { status: response.status, headers: responseHeaders })
    },
    error() {
      return new Response('Verification proxy failed', { status: 502 })
    },
  })
  return { baseUrl: `http://127.0.0.1:${server.port}/v1`, samples, stop: () => server.stop(true) }
}
