import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'
import { createRunCommands, Kernel, MemorySecrets } from '@hbar/kernel'
import { providerSchema } from '@hbar/contracts'
import { HbarClient, createOperationWatcher, createRunCommandClient } from '@hbar/client'
import { queuedRunGuidedOperationId } from '@hbar/contracts/commands/run'
import { startServer } from '../apps/host/src/server'
import { waitForRun } from '../apps/cli/src/runtime'
import { definePlugin, provide, type HarnessDriver } from '@hbar/plugin-sdk'

const payloadSchema = z.object({ messages: z.array(z.object({ role: z.string(), content: z.unknown() })) })

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Owned queue guidance fixture did not reach its stage')), 5_000)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function removeOwnedFixture(root: string) {
  const owned = await realpath(root)
  if (dirname(owned) !== (await realpath(tmpdir())) || !basename(owned).startsWith('hbar-queue-guide-driver-'))
    throw new Error('Refusing non-owned queue guidance fixture cleanup')
  await rm(owned, { recursive: true, force: true })
}

test('atomic queue guidance reaches real Pi under the original Run and only the untouched item drains later', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'hbar-queue-guide-driver-')))
  const firstRequest = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const requests: z.infer<typeof payloadSchema>[] = []
  let kernel: Kernel | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const index = requests.length
      requests.push(payloadSchema.parse(await request.json()))
      if (index === 0) {
        firstRequest.resolve()
        await release.promise
      }
      const chunk = (delta: unknown, finishReason: string | null) =>
        `data: ${JSON.stringify({ id: `queue-response-${index}`, object: 'chat.completion.chunk', created: 1, model: 'queue-fixture', choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`
      return new Response(
        chunk({ role: 'assistant', content: `Answer ${index}` }, null) + chunk({}, 'stop') + 'data: [DONE]\n\n',
        {
          headers: { 'Content-Type': 'text/event-stream' },
        },
      )
    },
  })
  try {
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      secrets: new MemorySecrets(),
    })
    await kernel.saveProvider(
      providerSchema.parse({
        id: 'queue-guide-fixture',
        name: 'Owned localhost provider',
        protocol: 'openai-completions',
        baseUrl: `http://127.0.0.1:${server.port}/v1`,
        model: 'queue-fixture',
      }),
      'fixture-only',
    )
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Owned workspace missing')
    const session = await kernel.createSession(workspace.id)
    const active = await kernel.submit(
      session.id,
      'original-task',
      { text: 'Initial task', images: [] },
      'queue-guide-fixture',
    )
    await bounded(firstRequest.promise)
    const selected = await kernel.submit(
      session.id,
      'selected-guide',
      { text: '同一轮引导：先检查当前更改', images: [] },
      'queue-guide-fixture',
    )
    const untouched = await kernel.submit(
      session.id,
      'remaining-queue',
      { text: 'Remaining ordinary queue', images: [] },
      'queue-guide-fixture',
    )
    const queue = await kernel.storage.call('queuedUserRuns', { sessionId: session.id })
    const revision = queue.items.find((item) => item.operationId === selected.id)?.revision
    if (revision === undefined) throw new Error('Selected queue revision missing')
    host = await startServer(kernel, { hostname: '127.0.0.1', port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'Guide fixture actor')
    const publicRuns = createRunCommandClient(client)
    const guidedEvent = Promise.withResolvers<void>()
    const watch = await createOperationWatcher(client).watch(selected.id, 0, (update) => {
      if (update.kind === 'event' && queuedRunGuidedOperationId(update.event) === selected.id) guidedEvent.resolve()
    })
    const cliResult = waitForRun(client, session, selected, 'silent', 'defer')
    const request = {
      sessionId: session.id,
      operationId: selected.id,
      activeRunId: active.id,
      expectedRevision: revision,
    }
    const receipt = await publicRuns.guideQueuedRun(request, 'guide-exact-item')
    await bounded(guidedEvent.promise)
    expect((await bounded(cliResult)).run.status).toBe('guided')
    expect(
      (await client.call('operation.watch', { operationId: selected.id, cursor: 0 })).events.some(
        (event) => queuedRunGuidedOperationId(event) === selected.id,
      ),
    ).toBe(true)
    await watch.close()
    expect(receipt).toMatchObject({ status: 'accepted', operationStatus: 'guided', activeRunId: active.id })
    expect((await kernel.storage.call('run', selected.id)).status).toBe('guided')
    expect((await kernel.storage.call('run', active.id)).status).toBe('running')
    expect((await kernel.storage.call('run', untouched.id)).status).toBe('queued')
    expect(
      (await kernel.storage.call('queuedUserRuns', { sessionId: session.id })).items.map((item) => item.operationId),
    ).toEqual([untouched.id])
    const cursor = (await kernel.storage.call('session', session.id)).seq
    expect(await publicRuns.guideQueuedRun(request, 'guide-exact-item')).toEqual(receipt)
    expect((await kernel.storage.call('session', session.id)).seq).toBe(cursor)
    release.resolve()
    const commands = createRunCommands(kernel)
    try {
      expect(await commands.execute('operation.get', { operationId: selected.id })).toMatchObject({
        operationId: selected.id,
        status: 'guided',
      })
      expect(
        await commands.execute('operation.cancel', { operationId: selected.id }, { actorId: 'fixture-device' }),
      ).toEqual({
        operationId: selected.id,
        status: 'guided',
      })
      try {
        await bounded(
          commands.execute(
            'run.retry',
            { sessionId: session.id, operationId: selected.id },
            {
              actorId: 'fixture-device',
              idempotencyKey: 'cannot-replay-guided-input',
            },
          ),
        )
        throw new Error('Guided input was incorrectly retried')
      } catch (error) {
        expect(error).toMatchObject({ code: 'COMMAND_CONFLICT' })
      }
    } finally {
      commands.dispose()
    }
    await bounded(kernel.waitForIdle())
    const snapshot = await kernel.snapshot(session.id)
    expect(requests).toHaveLength(3)
    expect(requests[1]?.messages.filter((message) => message.role === 'user')).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Initial task' }] },
      { role: 'user', content: [{ type: 'text', text: '同一轮引导：先检查当前更改' }] },
    ])
    expect(requests[1]?.messages.at(-1)).toEqual({
      role: 'user',
      content: [{ type: 'text', text: '同一轮引导：先检查当前更改' }],
    })
    expect(requests[1]?.messages.map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(snapshot.runs.find((run) => run.id === active.id)).toMatchObject({
      requestId: 'original-task',
      status: 'completed',
    })
    expect(snapshot.runs.find((run) => run.id === selected.id)).toMatchObject({
      requestId: 'selected-guide',
      status: 'guided',
      startedAt: null,
    })
    expect(snapshot.runs.find((run) => run.id === untouched.id)?.status).toBe('completed')
    expect(snapshot.messages.filter((message) => message.id === receipt.messageId)).toHaveLength(1)
    expect(snapshot.messages.filter((message) => message.runId === selected.id)).toHaveLength(0)
    expect(
      snapshot.messages.filter((message) => message.runId === active.id && message.role === 'assistant'),
    ).toHaveLength(2)
    const events = await kernel.storage.call('events', session.id, 0)
    expect(events.filter((event) => event.type === 'request.started' && event.runId === active.id)).toHaveLength(2)
    expect(events.filter((event) => event.type === 'request.started' && event.runId === selected.id)).toHaveLength(0)
    expect(events.filter((event) => event.type === 'run.cancelRequested')).toHaveLength(0)
    expect(await publicRuns.getQueuedRunGuideReceipt(session.id, 'guide-exact-item')).toEqual(receipt)
    expect(await publicRuns.guideQueuedRun(request, 'guide-exact-item')).toEqual(receipt)
    await expect(
      publicRuns.guideQueuedRun({ ...request, operationId: untouched.id }, 'guide-exact-item'),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  } finally {
    release.resolve()
    client?.disconnect()
    await host?.close()
    if (kernel) await kernel.close()
    await server.stop(true)
    await removeOwnedFixture(root)
  }
}, 15_000)

test('a legacy or polling-only driver rejects live guidance without consuming the queue item', async () => {
  for (const polling of [false, true]) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'hbar-queue-guide-driver-')))
    const ready = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let kernel: Kernel | undefined
    const plugin = definePlugin({
      manifest: {
        id: 'driver.pi',
        name: 'Legacy fixture',
        description: 'Controlled legacy capability boundary',
        permissions: [],
        version: '1.0.0',
        apiVersion: '^1.0.0',
        scope: 'host',
        provides: { driver: '1.0.0' },
      },
      apply(ctx) {
        provide<HarnessDriver>(ctx, 'driver', {
          ...(polling ? { supportsCanonicalSteering: true } : {}),
          async run(input) {
            expect(input.getSteeringMessages).toBeUndefined()
            ready.resolve()
            await release.promise
          },
          summarize: async () => ({ text: '', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 } }),
        })
      },
    })
    try {
      kernel = await Kernel.create({
        home: join(root, 'data'),
        workspace: root,
        demo: true,
        secrets: new MemorySecrets(),
        profile: { replacements: { 'driver.pi': plugin } },
      })
      const workspace = (await kernel.storage.call('workspaces'))[0]
      if (!workspace) throw new Error('Missing owned workspace')
      const session = await kernel.createSession(workspace.id)
      const active = await kernel.submit(session.id, 'active', { text: 'original', images: [] }, 'local-fixture')
      await bounded(ready.promise)
      const queued = await bounded(
        kernel.storage.call('enqueue', session.id, 'queued', { text: 'remain queued', images: [] }, 'local-fixture'),
      )
      const revision = (await kernel.storage.call('queuedUserRuns', { sessionId: session.id })).items[0]?.revision
      if (revision === undefined) throw new Error('Missing queue revision')
      try {
        await bounded(
          kernel.guideQueuedRun({
            request: {
              sessionId: session.id,
              operationId: queued.id,
              activeRunId: active.id,
              expectedRevision: revision,
            },
            actorId: 'fixture',
            idempotencyKey: 'legacy-guide',
          }),
        )
        throw new Error('Unsupported driver incorrectly consumed guidance')
      } catch (error) {
        expect(error).toMatchObject({ code: 'COMMAND_CONFLICT' })
      }
      expect((await kernel.storage.call('run', queued.id)).status).toBe('queued')
    } finally {
      release.resolve()
      await kernel?.close()
      await removeOwnedFixture(root)
    }
  }
}, 15_000)
