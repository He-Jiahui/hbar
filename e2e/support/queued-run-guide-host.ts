import { mkdir, realpath } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { HbarClient, createModelCommandClient } from '@hbar/client'
import { providerSchema } from '@hbar/contracts'
import { startServer } from '../../apps/host/src/server'

const root = await realpath(z.string().min(1).parse(process.env.HBAR_GUIDE_FIXTURE_ROOT))
if (
  dirname(root).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
  !basename(root).startsWith('hbar-queued-guide-ui-')
)
  throw new Error('Refusing non-owned guidance fixture root')
const assets = resolve(z.string().min(1).parse(process.env.HBAR_GUIDE_FIXTURE_DIST))
const workspacePath = join(root, 'Guide workspace')
await mkdir(workspacePath)
const requests: unknown[] = []
const releases = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]
const controlToken = crypto.randomUUID()
const provider = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/v1/')) {
      if (request.headers.get('Authorization') !== `Bearer ${controlToken}`) return new Response(null, { status: 401 })
      if (url.pathname === '/requests') return Response.json(requests)
      if (url.pathname === '/release' && request.method === 'POST') {
        const index = Number(url.searchParams.get('index'))
        if (index !== 0 && index !== 1) return new Response(null, { status: 400 })
        releases[index]?.resolve()
        return Response.json({ released: index })
      }
      return new Response(null, { status: 404 })
    }
    const index = requests.length
    requests.push(await request.json())
    await releases[index]?.promise
    const chunk = (delta: unknown, finish: string | null) =>
      `data: ${JSON.stringify({ id: `guide-${index}`, object: 'chat.completion.chunk', created: 1, model: 'guide-local', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
    return new Response(
      chunk({ role: 'assistant', content: `本地测试回复 ${index}` }, null) + chunk({}, 'stop') + 'data: [DONE]\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } },
    )
  },
})
let kernel: Kernel | undefined
let host: Awaited<ReturnType<typeof startServer>> | undefined
let client: HbarClient | undefined
try {
  kernel = await Kernel.create({ home: join(root, 'data'), workspace: workspacePath, secrets: new MemorySecrets() })
  await kernel.saveProvider(
    providerSchema.parse({
      id: 'guide-fixture',
      name: '本地引导测试',
      protocol: 'openai-completions',
      baseUrl: `http://127.0.0.1:${provider.port}/v1`,
      model: 'guide-local',
    }),
    'fixture-only',
  )
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Missing fixture workspace')
  const session = await kernel.createSession(workspace.id, '同轮引导测试')
  host = await startServer(kernel, { hostname: '127.0.0.1', port: 0, staticRoot: assets })
  const device = await host.auth.createDevice('Owned guidance browser')
  const url = `http://127.0.0.1:${host.server.port}`
  client = new HbarClient(url, device.token)
  await client.connect()
  const models = createModelCommandClient(client)
  const configured = await models.execute('session.getModel', { sessionId: session.id })
  await models.execute(
    'session.setModel',
    { sessionId: session.id, modelId: 'guide-fixture', baselineRevisions: configured.revisions },
    { idempotencyKey: 'guide-model' },
  )
  process.stdout.write(
    `${JSON.stringify({ url, token: device.token, sessionId: session.id, sessionTitle: session.title, controlUrl: `http://127.0.0.1:${provider.port}`, controlToken })}\n`,
  )
  const input = createInterface({ input: process.stdin })
  await new Promise<void>((done) => {
    input.on('line', (line) => {
      if (line === 'stop') done()
    })
    input.once('close', done)
  })
  input.close()
} finally {
  for (const release of releases) release.resolve()
  client?.disconnect()
  await host?.close()
  await kernel?.close()
  await provider.stop(true)
}
process.exit(0)
