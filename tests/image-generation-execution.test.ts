import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { expect, test } from 'bun:test'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide, type HarnessDriver } from '@hbar/plugin-sdk'
import { createImageGenerationPlugin } from '@hbar/image-generation'

async function removeFixture(root: string, prefix: string): Promise<void> {
  const actual = await realpath(root)
  if (dirname(actual) !== resolve(tmpdir()) || !basename(actual).startsWith(prefix))
    throw new Error('Refusing cleanup outside the exact image execution fixture')
  await rm(actual, { recursive: true, force: true })
}

function driverPlugin() {
  return definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Image execution fixture driver',
      description: 'Calls image generation once through the durable Kernel tool lifecycle',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      provides: { driver: '1.0.0' },
      permissions: [],
    },
    apply(context) {
      provide<HarnessDriver>(context, 'driver', {
        async run(input) {
          const result = await input.execute(
            'image_generate',
            { model: 'fixture-images', prompt: 'A cancellation fixture image' },
            'image-execution-call',
          )
          await input.commit('assistant', [{ type: 'text', text: result.text }])
        },
        async summarize() {
          return { text: '', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 } }
        },
      })
    },
  })
}

async function createKernelFixture(prefix: string, timeoutMs?: number) {
  const root = await mkdtemp(join(tmpdir(), prefix))
  let requestCount = 0
  const provider = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      requestCount += 1
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"data":['))
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    },
  })
  const secrets = new MemorySecrets()
  await secrets.set('fixture-images', 'fixture-secret-token')
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets,
    profile: {
      replacements: {
        'driver.pi': driverPlugin(),
        ...(timeoutMs === undefined
          ? {}
          : { 'image-generation.openai-compatible': createImageGenerationPlugin({ timeoutMs }) }),
      },
    },
  })
  await kernel.saveProvider({
    id: 'fixture-images',
    name: 'Fixture Images',
    protocol: 'openai-responses',
    baseUrl: `http://127.0.0.1:${provider.port}/v1`,
    model: 'paint',
    models: [{ id: 'paint', imageGeneration: true }],
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Image execution fixture workspace is missing')
  const session = await kernel.createSession(workspace.id)
  return {
    root,
    provider,
    kernel,
    session,
    get providerRequests() {
      return requestCount
    },
  }
}

test('Kernel cancellation aborts an image request and does not send a second provider request', async () => {
  const fixture = await createKernelFixture('hbar-image-generation-cancel-')
  try {
    const run = await fixture.kernel.submit(
      fixture.session.id,
      'cancel-image-run',
      { text: 'Start the cancellable fixture image', images: [], approval: 'allow' },
      'fixture-images',
    )
    for (let attempt = 0; attempt < 100 && fixture.providerRequests === 0; attempt++) await Bun.sleep(10)
    expect(fixture.providerRequests).toBe(1)
    await fixture.kernel.cancel(run.id)
    await fixture.kernel.waitForIdle()
    expect((await fixture.kernel.storage.call('run', run.id)).status).toBe('cancelled')
    await Bun.sleep(20)
    expect(fixture.providerRequests).toBe(1)
  } finally {
    await fixture.kernel.close()
    await fixture.provider.stop(true)
    await removeFixture(fixture.root, 'hbar-image-generation-cancel-')
  }
}, 20_000)

test('Kernel tool timeout aborts an image request and does not retry the unknown provider effect', async () => {
  const fixture = await createKernelFixture('hbar-image-generation-timeout-', 40)
  try {
    expect(fixture.kernel.tools.get('image_generate')?.timeoutMs).toBe(40)
    const run = await fixture.kernel.submit(
      fixture.session.id,
      'timeout-image-run',
      { text: 'Start the timed fixture image', images: [], approval: 'allow' },
      'fixture-images',
    )
    await fixture.kernel.waitForIdle()
    expect(fixture.providerRequests).toBe(1)
    expect((await fixture.kernel.storage.call('run', run.id)).status).toBe('completed')
    const events = await fixture.kernel.storage.call('events', fixture.session.id, 0)
    expect(events.filter((event) => event.runId === run.id && event.type === 'tool.started')).toHaveLength(1)
    expect(events.filter((event) => event.runId === run.id && event.type === 'tool.settled')).toHaveLength(1)
    const snapshot = await fixture.kernel.snapshot(fixture.session.id)
    const result = snapshot.messages
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result' && block.name === 'image_generate')
    expect(result && result.type === 'tool_result' ? result.outcome : undefined).toMatchObject({
      kind: 'unknown',
      executionStarted: true,
    })
    await Bun.sleep(20)
    expect(fixture.providerRequests).toBe(1)
  } finally {
    await fixture.kernel.close()
    await fixture.provider.stop(true)
    await removeFixture(fixture.root, 'hbar-image-generation-timeout-')
  }
}, 20_000)
