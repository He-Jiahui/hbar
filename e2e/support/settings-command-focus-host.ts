import { mkdir, realpath } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { resolvePathLayout } from '@hbar/storage'
import { startServer } from '../../apps/host/src/server'

const prefix = 'hbar-settings-command-focus-'
const options = z.object({ root: z.string().min(1), assets: z.string().min(1) }).parse({
  root: process.env.HBAR_SETTINGS_COMMAND_FOCUS_ROOT,
  assets: process.env.HBAR_SETTINGS_COMMAND_FOCUS_WEB_DIST,
})
const root = await realpath(options.root)
if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith(prefix))
  throw new Error('Refusing a non-owned settings-command-focus root')
const assets = resolve(options.assets)
if (!(await Bun.file(join(assets, 'index.html')).exists())) throw new Error('Frozen Web assets are missing')

const workspacePath = join(root, 'Focus fixture project — 焦点工程')
await mkdir(workspacePath)
const layout = await resolvePathLayout({
  dataRoot: join(root, 'data'),
  cacheRoot: join(root, 'cache'),
  pointerFile: join(root, 'paths.json'),
  readPointer: false,
})
const kernel = await Kernel.create({ layout, workspace: workspacePath, demo: false, secrets: new MemorySecrets() })
let host: Awaited<ReturnType<typeof startServer>> | undefined
let sessionId: string | undefined
let closing: Promise<void> | undefined
function close(): Promise<void> {
  closing ??= (async () => {
    try {
      await host?.close()
      if (sessionId && (await kernel.storage.call('snapshot', sessionId)).runs.length)
        throw new Error('Settings focus fixture unexpectedly created a Run')
    } finally {
      await kernel.close()
    }
  })()
  return closing
}

try {
  const workspace = (await kernel.storage.call('workspaces')).find((item) => item.path === workspacePath)
  if (!workspace) throw new Error('Owned focus fixture workspace is missing')
  const session = await kernel.createSession(workspace.id, 'Settings focus fixture chat — 设置焦点会话')
  sessionId = session.id
  host = await startServer(kernel, { hostname: '127.0.0.1', port: 0, staticRoot: assets })
  const device = await host.auth.createDevice('Settings command focus browser fixture')
  // Credentials are consumed only by the parent test and are never persisted.
  process.stdout.write(
    `${JSON.stringify({
      url: `http://127.0.0.1:${host.server.port}`,
      token: device.token,
      workspace,
      session,
      initialization: { workspaces: 1, sessions: 1, demo: false, runs: 0 },
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
    process.stderr.write('Owned settings-command-focus Host cleanup failed\n')
  }
  process.stderr.write(error instanceof Error ? `${error.message}\n` : 'Owned settings-command-focus Host failed\n')
  process.exitCode = 1
}
