import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { expect, test } from 'bun:test'
import { HbarClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide, type HarnessDriver } from '@hbar/plugin-sdk'
import { startServer } from '../apps/host/src/server'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWISClv9H4SZGKAAzgAAAAD//92949EAAAAGSURBVAMAWpUEKyHawvcAAAAASUVORK5CYII=',
  'base64',
)

async function removeFixture(root: string): Promise<void> {
  const actual = await realpath(root)
  if (dirname(actual) !== resolve(tmpdir()) || !basename(actual).startsWith('hbar-image-generation-host-'))
    throw new Error('Refusing cleanup outside the exact image generation Host fixture')
  await rm(actual, { recursive: true, force: true })
}

import { realpath } from 'node:fs/promises'

const driver = definePlugin({
  manifest: {
    id: 'driver.pi',
    name: 'Image Host fixture driver',
    description: 'Exercises image generation through the Host-managed tool lifecycle',
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
          { model: 'fixture-images', prompt: 'A tiny Host fixture image' },
          'host-image-generation-call',
        )
        await input.commit('assistant', [{ type: 'text', text: result.text }])
      },
      async summarize() {
        return { text: '', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 } }
      },
    })
  },
})

test('Host SDK runs image_generate, persists its artifact and requires auth for exact SHA/MIME bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-image-generation-host-'))
  const provider = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname !== '/v1/images/generations')
        return Response.json({ error: 'unexpected route' }, { status: 404 })
      if (request.headers.get('authorization') !== 'Bearer fixture-secret-token')
        return Response.json({ error: 'missing expected fixture authorization' }, { status: 401 })
      return Response.json({ data: [{ b64_json: png.toString('base64') }] })
    },
  })
  let kernel: Kernel | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  const clients: HbarClient[] = []
  try {
    const secrets = new MemorySecrets()
    await secrets.set('fixture-images', 'fixture-secret-token')
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
      baseUrl: `http://127.0.0.1:${provider.port}/v1`,
      model: 'paint',
      models: [{ id: 'paint', imageGeneration: true }],
    })
    host = await startServer(kernel, { hostname: '127.0.0.1', port: 0 })
    const url = `http://127.0.0.1:${host.server.port}`
    const client = new HbarClient(url)
    clients.push(client)
    await client.pair(host.pairing.code, 'Image generation Host fixture')
    await client.call('permission.set', { mode: 'allow' })
    const bootstrap = await client.call('system.bootstrap', {})
    const workspace = bootstrap.workspaces.find((item) => item.path === root)
    if (!workspace) throw new Error('Host did not expose its image generation workspace')
    const session = await client.call('session.create', { workspaceId: workspace.id })
    const run = await client.call('run.start', {
      sessionId: session.id,
      requestId: 'host-image-generation-request',
      input: { text: 'Generate the fixture image', images: [] },
      modelId: 'fixture-images',
    })
    await kernel.waitForIdle()

    const snapshot = await client.call('session.snapshot', { sessionId: session.id })
    const result = snapshot.messages
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result' && block.name === 'image_generate')
    if (!result || result.type !== 'tool_result') throw new Error('Host snapshot omitted the image tool result')
    const artifact = result.images?.[0]
    if (!artifact) throw new Error('Host snapshot omitted the generated artifact reference')
    expect(snapshot.runs.find((item) => item.id === run.id)?.status).toBe('completed')
    const downloaded = await client.readImageArtifact(artifact)
    expect(downloaded).toEqual({ artifactId: artifact.id, mime: 'image/png', bytes: new Uint8Array(png) })
    expect(createHash('sha256').update(downloaded.bytes).digest('hex')).toBe(artifact.id)
    expect(artifact.mime).toBe(downloaded.mime)
    expect(artifact.size).toBe(downloaded.bytes.byteLength)
    expect(await readFile(join(root, 'data', 'artifacts', artifact.id))).toEqual(png)

    const unauthorized = new HbarClient(url, 'invalid-image-fixture-token')
    clients.push(unauthorized)
    await expect(unauthorized.readImageArtifact(artifact)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  } finally {
    for (const client of clients) client.disconnect()
    await host?.close()
    await kernel?.close()
    await provider.stop(true)
    await removeFixture(root)
  }
}, 20_000)
