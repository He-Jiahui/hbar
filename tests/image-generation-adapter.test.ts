import { expect, test } from 'bun:test'
import { providerSchema, runSchema } from '@hbar/contracts'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import type { ModelRegistry, ToolContext } from '@hbar/plugin-sdk'
import { z } from 'zod'
import { createImageGenerationTool } from '../plugins/image-generation/src/index'

const provider = providerSchema.parse({
  id: 'adapter-images',
  name: 'Adapter Images',
  protocol: 'openai-responses',
  baseUrl: 'https://images.example/v1',
  model: 'paint',
  models: [{ id: 'paint', imageGeneration: true }],
})
const session = sessionSchema.parse({
  id: 'fixture-session',
  workspaceId: 'fixture-workspace',
  title: 'Fixture',
  parentId: null,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  seq: 0,
})
const workspace = workspaceSchema.parse({ id: 'fixture-workspace', path: 'D:/fixture', name: 'Fixture', createdAt: 1 })
function context(signal: AbortSignal, callId: string): ToolContext {
  return {
    session,
    workspace,
    run: runSchema.parse({
      id: 'fixture-run',
      sessionId: session.id,
      requestId: 'fixture-request',
      input: { text: 'Generate an image', images: [] },
      modelId: provider.id,
      status: 'running',
      createdAt: 1,
      startedAt: 1,
      endedAt: null,
      error: null,
    }),
    signal,
    callId,
  }
}
function registry(): ModelRegistry {
  return {
    list: async () => [provider],
    get: async (id) => ({ ...provider, id }),
    secret: async () => 'fixture-secret',
  }
}
function input(prompt: string) {
  return { model: provider.id, prompt }
}

const validPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWISClv9H4SZGKAAzgAAAAD//92949EAAAAGSURBVAMAWpUEKyHawvcAAAAASUVORK5CYII=',
  'base64',
)
function jsonImage(bytes: Uint8Array = validPng): Response {
  return Response.json({ data: [{ b64_json: Buffer.from(bytes).toString('base64') }] })
}

test('HTTP and truncated JSON failures are concise and do not copy provider bodies into results', async () => {
  const httpFailure = createImageGenerationTool(registry(), async () =>
    Response.json({ error: 'fixture-secret should stay private' }, { status: 503 }),
  )
  await expect(
    httpFailure.execute(input('http failure'), context(new AbortController().signal, 'http-failure')),
  ).rejects.toMatchObject({ code: 'IMAGE_PROVIDER_HTTP', message: 'Image provider returned HTTP 503' })

  const invalidResponse = createImageGenerationTool(
    registry(),
    async () => new Response('{"data":[', { headers: { 'Content-Type': 'application/json' } }),
  )
  await expect(
    invalidResponse.execute(input('truncated response'), context(new AbortController().signal, 'truncated')),
  ).rejects.toMatchObject({ code: 'IMAGE_PROVIDER_INVALID', message: 'Image provider returned invalid JSON' })
})

test('oversized response streams are cancelled at the hard response limit', async () => {
  let cancelled = false
  const chunk = new Uint8Array(8 * 1024 * 1024)
  const tool = createImageGenerationTool(
    registry(),
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(chunk)
            controller.enqueue(chunk)
          },
          cancel() {
            cancelled = true
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  )
  await expect(
    tool.execute(input('oversized response'), context(new AbortController().signal, 'oversized')),
  ).rejects.toMatchObject({ code: 'IMAGE_RESPONSE_LIMIT' })
  expect(cancelled).toBeTrue()
})

test('fetch timeout propagates its abort reason without leaking a rejected request', async () => {
  const signal = AbortSignal.timeout(10)
  const tool = createImageGenerationTool(
    registry(),
    async (_request, init) =>
      await new Promise<Response>((_resolve, reject) => {
        const requestSignal = init?.signal
        if (requestSignal?.aborted) {
          reject(requestSignal.reason)
          return
        }
        requestSignal?.addEventListener('abort', () => reject(requestSignal.reason), { once: true })
      }),
  )
  await expect(tool.execute(input('timeout'), context(signal, 'timeout'))).rejects.toMatchObject({
    name: 'TimeoutError',
  })
})

test('cancellation while reading a streaming body releases the response reader', async () => {
  const controller = new AbortController()
  let cancelled = false
  const tool = createImageGenerationTool(
    registry(),
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(stream) {
            stream.enqueue(new TextEncoder().encode('{"data":['))
          },
          cancel() {
            cancelled = true
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  )
  const operation = tool.execute(input('cancel'), context(controller.signal, 'cancel'))
  await Bun.sleep(10)
  controller.abort(new DOMException('Fixture cancellation', 'AbortError'))
  await expect(operation).rejects.toMatchObject({ name: 'AbortError', message: 'Fixture cancellation' })
  expect(cancelled).toBeTrue()
})

test('returned PNGs require a complete CRC-valid container and valid image fixture bytes', async () => {
  const malformed = [
    validPng.subarray(0, 8),
    validPng.subarray(0, validPng.length - 5),
    (() => {
      const corrupt = Uint8Array.from(validPng)
      corrupt[29] = (corrupt[29] ?? 0) ^ 1
      return corrupt
    })(),
  ]
  for (const [index, bytes] of malformed.entries()) {
    const tool = createImageGenerationTool(registry(), async () => jsonImage(bytes))
    await expect(
      tool.execute(input(`invalid PNG ${index}`), context(new AbortController().signal, `invalid-png-${index}`)),
    ).rejects.toMatchObject({
      code: 'IMAGE_PROVIDER_INVALID',
      message: 'Image provider returned an incomplete or invalid image',
    })
  }

  const tool = createImageGenerationTool(registry(), async () => jsonImage())
  const result = await tool.execute(input('valid PNG'), context(new AbortController().signal, 'valid-png'))
  expect(result.content).toMatchObject([{ type: 'image', mimeType: 'image/png' }])
})

test('two in-flight requests are the hard limit and oldest settled results are evicted', async () => {
  const calls: string[] = []
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const tool = createImageGenerationTool(registry(), async (_request, init) => {
    const request = z.object({ prompt: z.string() }).parse(JSON.parse(String(init?.body)))
    calls.push(request.prompt)
    if (calls.length <= 2) await gate
    return jsonImage()
  })
  const first = tool.execute(input('first'), context(new AbortController().signal, 'cache-1'))
  const second = tool.execute(input('second'), context(new AbortController().signal, 'cache-2'))
  await Bun.sleep(10)
  await expect(tool.execute(input('third'), context(new AbortController().signal, 'cache-3'))).rejects.toMatchObject({
    code: 'IMAGE_GENERATION_BUSY',
  })
  release?.()
  await Promise.all([first, second])
  for (let index = 3; index <= 17; index++)
    await tool.execute(input(`cached ${index}`), context(new AbortController().signal, `cache-${index}`))
  await tool.execute(input('first'), context(new AbortController().signal, 'cache-1'))
  expect(calls).toHaveLength(18)
})

test('cache accounts for retained base64 string memory and evicts to stay within its byte budget', async () => {
  let requests = 0
  const base64Bytes = Buffer.from(validPng).toString('base64').length * 2
  const tool = createImageGenerationTool(
    registry(),
    async () => {
      requests += 1
      return jsonImage()
    },
    { maxCachedResultMemoryBytes: base64Bytes * 2 },
  )
  for (const callId of ['memory-1', 'memory-2', 'memory-3'])
    await tool.execute(input(callId), context(new AbortController().signal, callId))
  await tool.execute(input('memory-1'), context(new AbortController().signal, 'memory-1'))
  expect(requests).toBe(4)
})

test('provider responses must contain exactly one generated image', async () => {
  const base64 = validPng.toString('base64')
  for (const [callId, data] of [
    ['empty-images', []],
    ['multiple-images', [{ b64_json: base64 }, { b64_json: base64 }]],
  ] as const) {
    const tool = createImageGenerationTool(registry(), async () => Response.json({ data }))
    await expect(tool.execute(input(callId), context(new AbortController().signal, callId))).rejects.toMatchObject({
      code: 'IMAGE_PROVIDER_INVALID',
      message: 'Image provider response must include exactly one generated image',
    })
  }
})

test('late Response after abort cancels its body and preserves the original abort reason', async () => {
  const controller = new AbortController()
  let releaseFetch: (() => void) | undefined
  let cancelled = false
  const fetchGate = new Promise<void>((resolve) => {
    releaseFetch = resolve
  })
  const tool = createImageGenerationTool(registry(), async () => {
    await fetchGate
    controller.abort(new DOMException('Abort before Response resolved', 'AbortError'))
    return new Response(
      new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(new TextEncoder().encode('{"data":['))
        },
        cancel() {
          cancelled = true
        },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  })
  const operation = tool.execute(input('late response after cancellation'), context(controller.signal, 'late-response'))
  releaseFetch?.()
  await expect(operation).rejects.toMatchObject({ name: 'AbortError', message: 'Abort before Response resolved' })
  expect(cancelled).toBeTrue()
})
