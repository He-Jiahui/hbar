import { expect, test } from 'bun:test'
import { providerSchema, runSchema } from '@hbar/contracts'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import type { ModelRegistry, ToolContext } from '@hbar/plugin-sdk'
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
