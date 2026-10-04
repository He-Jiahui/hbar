import { mkdir, realpath } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { HbarClient, createModelCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { resolvePathLayout } from '@hbar/storage'
import { startServer } from '../../apps/host/src/server'

const prefix = 'hbar-send-shortcut-'
const options = z.object({ root: z.string().min(1), assets: z.string().min(1) }).parse({
  root: process.env.HBAR_SEND_SHORTCUT_ROOT,
  assets: process.env.HBAR_SEND_SHORTCUT_WEB_DIST,
})
const root = await realpath(options.root)
if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith(prefix))
  throw new Error('Refusing a non-owned send-shortcut fixture root')
const assets = resolve(options.assets)
if (!(await Bun.file(join(assets, 'index.html')).exists())) throw new Error('Frozen Web assets are missing')

const workspacePath = join(root, 'Send key preference — 发送按键')
await mkdir(workspacePath)
const layout = await resolvePathLayout({
  dataRoot: join(root, 'data'),
  cacheRoot: join(root, 'cache'),
  pointerFile: join(root, 'paths.json'),
  readPointer: false,
})
const kernel = await Kernel.create({ layout, workspace: workspacePath, demo: true, secrets: new MemorySecrets() })
let host: Awaited<ReturnType<typeof startServer>> | undefined
let closing: Promise<void> | undefined
function close(): Promise<void> {
  closing ??= (async () => {
    try {
      await host?.close()
    } finally {
      await kernel.close()
    }
  })()
  return closing
}
try {
  await kernel.changePlugin('goal.codex', true, { autoContinue: false })
  const goal = (await kernel.storage.call('plugins')).find((plugin) => plugin.id === 'goal.codex')
  if (goal?.config.autoContinue !== false) throw new Error('Goal automatic continuation must remain disabled')
  const workspace = (await kernel.storage.call('workspaces')).find((item) => item.path === workspacePath)
  if (!workspace) throw new Error('Owned send-shortcut workspace is missing')
  const firstSession = await kernel.createSession(workspace.id, 'Send key A — 原会话')
  const secondSession = await kernel.createSession(workspace.id, 'Send key B — 独立会话')
  host = await startServer(kernel, { hostname: '127.0.0.1', port: 0, staticRoot: assets })
  const browser = await host.auth.createDevice('Send shortcut browser fixture')
  const observer = await host.auth.createDevice('Send shortcut independent observer')
  const url = `http://127.0.0.1:${host.server.port}`
  const setup = new HbarClient(url, browser.token)
  try {
    await setup.connect()
    const models = createModelCommandClient(setup)
    for (const session of [firstSession, secondSession]) {
      const current = await models.execute('session.getModel', { sessionId: session.id })
      await models.execute(
        'session.setModel',
        { sessionId: session.id, modelId: 'local-fixture', baselineRevisions: current.revisions },
        { idempotencyKey: `send-shortcut-setup-${session.id}` },
      )
    }
  } finally {
    setup.disconnect()
  }
  // Credentials are consumed only by the parent test; never write stdout to evidence.
  process.stdout.write(
    `${JSON.stringify({
      url,
      token: browser.token,
      observerToken: observer.token,
      workspace,
      firstSession,
      secondSession,
      goalAutoContinue: false,
      initializationWrites: [
        'plugin.change(goal.codex:autoContinue=false)',
        'session.create',
        'session.create',
        'session.setModel(A:local-fixture)',
        'session.setModel(B:local-fixture)',
      ],
    })}\n`,
  )
  const input = createInterface({ input: process.stdin })
  await new Promise<void>((done) => {
    input.on('line', (line) => {
      if (line === 'stop') done()
    })
    input.once('close', done)
  })
  input.close()
  await close()
} catch (error) {
  try {
    await close()
  } catch {
    process.stderr.write('Owned send-shortcut Host cleanup failed\n')
  }
  process.stderr.write(error instanceof Error ? `${error.message}\n` : 'Owned send-shortcut Host failed\n')
  process.exitCode = 1
}
