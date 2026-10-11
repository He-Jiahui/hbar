import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, test } from 'bun:test'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide, type HarnessDriver } from '@hbar/plugin-sdk'

test('image_generate uses the saved model credential, settles a durable tool result, and does not regenerate a replayed call id', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-image-generation-'))
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWISClv9H4SZGKAAzgAAAAD//92949EAAAAGSURBVAMAWpUEKyHawvcAAAAASUVORK5CYII=',
    'base64',
  )
  const base64 = png.toString('base64')
  let requestCount = 0
  const observed: { authorization: string | null; requestBody: unknown } = {
    authorization: null,
    requestBody: undefined,
  }
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      requestCount += 1
      observed.authorization = request.headers.get('authorization')
      observed.requestBody = await request.json()
      if (new URL(request.url).pathname !== '/v1/images/generations')
        return Response.json({ error: 'unexpected endpoint' }, { status: 404 })
      return Response.json({ data: [{ b64_json: base64 }] })
    },
  })
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Fixture image driver',
      description: 'Calls the registered image tool through the Kernel execution lifecycle',
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
            { model: 'fixture-images', prompt: 'A tiny fixture image' },
            'image-generation-call',
          )
          try {
            await input.execute(
              'image_generate',
              { model: 'fixture-images', prompt: 'A tiny fixture image' },
              'image-generation-call',
            )
          } catch {
            // The persisted call id already has a settled intent; replay cannot start a second provider request.
          }
          await input.commit('assistant', [{ type: 'text', text: result.text }])
        },
        async summarize() {
          return { text: '', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 } }
        },
      })
    },
  })
  const secrets = new MemorySecrets()
  await secrets.set('fixture-images', 'fixture-secret-token')
  let kernel: Kernel | undefined
  try {
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets,
      profile: { replacements: { 'driver.pi': driver } },
    })
    await kernel.saveProvider({
      id: 'fixture-images',
      name: 'Fixture Images',
      protocol: 'openai-responses',
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
      model: 'paint',
      models: [{ id: 'paint', imageGeneration: true }],
    })
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Kernel workspace fixture was not created')
    const session = await kernel.storage.call('createSession', workspace.id)
    const run = await kernel.submit(
      session.id,
      'image-generation-fixture',
      { text: 'Create one fixture image', images: [], approval: 'allow' },
      'fixture-images',
    )
    await kernel.waitForIdle()

    expect(requestCount).toBe(1)
    expect(observed.authorization).toBe('Bearer fixture-secret-token')
    expect(observed.requestBody).toEqual({
      model: 'paint',
      prompt: 'A tiny fixture image',
      size: '1024x1024',
      quality: 'auto',
      output_format: 'png',
      n: 1,
    })
    expect(JSON.stringify(await kernel.storage.call('events', session.id, 0))).not.toContain('fixture-secret-token')

    const events = await kernel.storage.call('events', session.id, 0)
    expect(events.filter((event) => event.runId === run.id && event.type === 'tool.started')).toHaveLength(1)
    expect(events.filter((event) => event.runId === run.id && event.type === 'tool.settled')).toHaveLength(1)
    const snapshot = await kernel.storage.call('snapshot', session.id, undefined, 100)
    const result = snapshot.messages
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result' && block.name === 'image_generate')
    if (!result || result.type !== 'tool_result') throw new Error('Image tool result was not persisted')
    expect(result.images).toHaveLength(1)
    const artifact = result.images?.[0]
    if (!artifact) throw new Error('Image artifact reference was not persisted')
    const stored = await readFile(join(root, 'data', 'artifacts', artifact.id))
    expect(artifact.mime).toBe('image/png')
    expect(artifact.size).toBe(png.byteLength)
    expect(createHash('sha256').update(stored).digest('hex')).toBe(artifact.id)
    expect(stored).toEqual(png)
  } finally {
    await server.stop(true)
    await kernel?.close()
    await rm(root, { recursive: true, force: true })
  }
})
