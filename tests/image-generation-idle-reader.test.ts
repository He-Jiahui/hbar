import { expect, test } from 'bun:test'
import { providerSchema, runSchema } from '@hbar/contracts'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import {
  runtimePluginIdleCheckpointSchema,
  type RuntimePluginIdleRegistry,
  type ModelRegistry,
  type ToolContext,
} from '@hbar/plugin-sdk'
import { createImageGenerationTool } from '@hbar/image-generation'

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

function deferred<Value>() {
  let finish: (value: Value) => void = () => {
    throw new Error('Deferred not initialized')
  }
  const promise = new Promise<Value>((resolve) => {
    finish = resolve
  })
  return { promise, resolve: (value: Value) => finish(value) }
}
function idleReader() {
  let reader: Parameters<RuntimePluginIdleRegistry['register']>[0] | undefined
  const registry: RuntimePluginIdleRegistry = {
    register(read) {
      if (reader) throw new Error('Duplicate idle reader')
      reader = read
      return () => {
        if (reader === read) reader = undefined
      }
    },
  }
  return {
    registry,
    read: () => {
      if (!reader) throw new Error('Missing production idle reader')
      return runtimePluginIdleCheckpointSchema.parse(reader())
    },
  }
}

test('aborted response reader stays nonidle until the first underlying cancellation Promise physically settles', async () => {
  const idle = idleReader()
  const cancelled = deferred<void>()
  const cleanup = deferred<void>()
  const bodyRead = deferred<void>()
  const controller = new AbortController()
  let cancellations = 0
  let fetches = 0
  let finished = false
  const stream = new ReadableStream<Uint8Array>(
    {
      pull() {
        bodyRead.resolve()
      },
      cancel() {
        cancellations++
        cancelled.resolve()
        return cleanup.promise
      },
    },
    { highWaterMark: 0 },
  )
  const tool = createImageGenerationTool(
    registry(),
    async () => {
      fetches++
      return new Response(stream, { headers: { 'Content-Type': 'application/json' } })
    },
    {},
    idle.registry,
  )
  const operation = tool.execute(input('abort-body'), context(controller.signal, 'abort-body'))
  const result = operation.then(
    (value) => {
      finished = true
      return value
    },
    (error: unknown) => {
      finished = true
      return error
    },
  )
  try {
    await bodyRead.promise
    const reason = new DOMException('Fixture body abort', 'AbortError')
    controller.abort(reason)
    await cancelled.promise
    // One task boundary lets existing already-ready Promise continuations drain; no sleep-based performance threshold.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(cancellations).toBe(1)
    expect(finished).toBe(false)
    expect(idle.read().requests).toBe(1)
    cleanup.resolve()
    expect(await result).toBe(reason)
    expect(idle.read().requests).toBe(0)
    await expect(tool.execute(input('abort-body'), context(controller.signal, 'abort-body'))).rejects.toBe(reason)
    expect(fetches).toBe(1)
    expect(cancellations).toBe(1)
    expect(idle.read().requests).toBe(0)
  } finally {
    cleanup.resolve()
    controller.abort()
    await result
  }
})

test('real factory pending cache join, normal image settlement and known HTTP cleanup keep the typed idle reader accurate', async () => {
  const idle = idleReader()
  const entered = deferred<void>()
  const response = deferred<Response>()
  let fetches = 0
  const tool = createImageGenerationTool(
    registry(),
    () => {
      fetches++
      entered.resolve()
      return response.promise
    },
    {},
    idle.registry,
  )
  const signal = new AbortController().signal
  const first = tool.execute(input('success'), context(signal, 'success'))
  const joined = tool.execute(input('success'), context(signal, 'success'))
  void first.catch(() => undefined)
  void joined.catch(() => undefined)
  try {
    await entered.promise
    expect(idle.read()).toEqual({ supported: true, requests: 1, resources: 0, background: 0, unconfirmed: 0 })
    response.resolve(jsonImage())
    const [a, b] = await Promise.all([first, joined])
    expect(a).toEqual(b)
    expect(a.content).toHaveLength(1)
    expect(fetches).toBe(1)
    expect(idle.read().requests).toBe(0)
    expect(await tool.execute(input('success'), context(signal, 'success'))).toEqual(a)
    expect(fetches).toBe(1)
  } finally {
    response.resolve(jsonImage())
    await Promise.allSettled([first, joined])
  }
  const cancelled = deferred<void>()
  const cleanup = deferred<void>()
  const errors = idleReader()
  const failed = createImageGenerationTool(
    registry(),
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancelled.resolve()
            return cleanup.promise
          },
        }),
        { status: 503 },
      ),
    {},
    errors.registry,
  )
  const pending = failed.execute(input('http-error'), context(signal, 'http-error'))
  const result = pending.then(
    (value) => value,
    (error: unknown) => error,
  )
  try {
    await cancelled.promise
    expect(errors.read().requests).toBe(1)
    cleanup.resolve()
    expect(await result).toMatchObject({ code: 'IMAGE_PROVIDER_HTTP' })
    expect(errors.read().requests).toBe(0)
  } finally {
    cleanup.resolve()
    await result
  }
})
