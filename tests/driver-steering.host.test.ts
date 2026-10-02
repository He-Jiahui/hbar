import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { providerSchema } from '@hbar/contracts'
import type { Message } from '@hbar/contracts'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { DriverInput, HarnessDriver } from '@hbar/plugin-sdk'
import { PiDriver } from '@hbar/pi-driver'

const requestSchema = z.object({ messages: z.array(z.object({ role: z.string(), content: z.unknown() })) })

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Owned driver fixture did not reach its stage')), 5_000)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function removeOwnedFixture(root: string) {
  const ownedRoot = await realpath(root)
  if (dirname(ownedRoot) !== (await realpath(tmpdir())) || !basename(ownedRoot).startsWith('hbar-driver-steering-'))
    throw new Error('Refusing non-owned steering fixture cleanup')
  await rm(ownedRoot, { recursive: true, force: true })
}

test('a canonical message committed during real Pi inference reaches the next request under the original Run', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'hbar-driver-steering-')))
  const inputReady = Promise.withResolvers<DriverInput>()
  const firstRequest = Promise.withResolvers<void>()
  const releaseResponse = Promise.withResolvers<void>()
  const requests: z.infer<typeof requestSchema>[] = []
  let steering: Message[] = []
  let kernel: Kernel | undefined
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const index = requests.length
      requests.push(requestSchema.parse(await request.json()))
      if (index === 0) {
        firstRequest.resolve()
        await releaseResponse.promise
      }
      const chunk = (delta: unknown, finishReason: string | null) =>
        `data: ${JSON.stringify({ id: `response-${index}`, object: 'chat.completion.chunk', created: 1, model: 'fixture-network', choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`
      return new Response(
        chunk({ role: 'assistant', content: index === 0 ? 'Initial answer' : 'Guided answer' }, null) +
          chunk({}, 'stop') +
          'data: [DONE]\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    },
  })
  try {
    const pi = new PiDriver()
    const driver = definePlugin({
      manifest: {
        id: 'driver.pi',
        name: 'Owned steering fixture',
        description: 'Canonical live steering through real Pi',
        permissions: [],
        version: '1.0.0',
        apiVersion: '^1.0.0',
        scope: 'host',
        provides: { driver: '1.0.0' },
      },
      apply(ctx) {
        provide<HarnessDriver>(ctx, 'driver', {
          run(input) {
            inputReady.resolve(input)
            return pi.run({
              ...input,
              getSteeringMessages: (target) => {
                expect(target.sessionId).toBe(input.session.id)
                expect(target.runId).toBe(input.run.id)
                const batch = steering
                steering = []
                return Promise.resolve(batch)
              },
            })
          },
          summarize: (request, apiKey, signal) => pi.summarize(request, apiKey, signal),
        })
      },
    })
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      secrets: new MemorySecrets(),
      profile: { replacements: { 'driver.pi': driver } },
    })
    await kernel.saveProvider(
      providerSchema.parse({
        id: 'steering-fixture',
        name: 'Owned local provider',
        protocol: 'openai-completions',
        baseUrl: `http://127.0.0.1:${server.port}/v1`,
        model: 'fixture-network',
      }),
      'fixture-only',
    )
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Owned fixture workspace missing')
    const session = await kernel.createSession(workspace.id)
    const run = await kernel.submit(
      session.id,
      'original-admission',
      { text: 'Initial task', images: [] },
      'steering-fixture',
    )
    const input = await bounded(inputReady.promise)
    await bounded(firstRequest.promise)
    expect(requests).toHaveLength(1)
    const guided = await input.commit(
      'user',
      [{ type: 'text', text: 'Refine the active task — 同一轮引导' }],
      'canonical-steer',
    )
    steering = [guided]
    const before = await kernel.snapshot(session.id)
    expect(before.runs).toHaveLength(1)
    expect(before.runs[0]).toMatchObject({ id: run.id, status: 'running' })
    expect(before.messages.find((message) => message.id === guided.id)).toEqual(guided)
    releaseResponse.resolve()
    await kernel.waitForIdle()
    const after = await kernel.snapshot(session.id)
    expect(after.runs).toHaveLength(1)
    expect(after.runs[0]).toMatchObject({ id: run.id, requestId: 'original-admission', status: 'completed' })
    expect(requests).toHaveLength(2)
    expect(requests[0]?.messages.filter((message) => message.role === 'user')).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Initial task' }] },
    ])
    expect(requests[1]?.messages.filter((message) => message.role === 'user')).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Initial task' }] },
      { role: 'user', content: [{ type: 'text', text: 'Refine the active task — 同一轮引导' }] },
    ])
    expect(after.messages.filter((message) => message.id === guided.id)).toHaveLength(1)
    expect(after.messages.filter((message) => message.role === 'assistant')).toHaveLength(2)
    expect(after.messages.every((message) => message.runId === run.id)).toBe(true)
    const events = await kernel.storage.call('events', session.id, 0)
    expect(events.filter((event) => event.type === 'message.committed')).toHaveLength(4)
    expect(events.filter((event) => event.type === 'run.cancelled')).toHaveLength(0)
  } finally {
    releaseResponse.resolve()
    if (kernel) await kernel.close()
    await server.stop(true)
    await removeOwnedFixture(root)
  }
}, 15_000)
