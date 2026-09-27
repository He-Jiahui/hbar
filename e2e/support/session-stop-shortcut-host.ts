import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { resolvePathLayout } from '@hbar/storage'
import { startServer } from '../../apps/host/src/server'

// Only a fresh, explicitly owned profile. This demo model is local test capability,
// not a commercial provider. No tool approval is ever issued by this fixture.
const options = z.object({ root: z.string().min(1), assets: z.string().min(1) }).parse({
  root: process.env.HBAR_STOP_SHORTCUT_ROOT,
  assets: process.env.HBAR_STOP_SHORTCUT_WEB_DIST,
})
const root = await realpath(options.root)
if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith('hbar-session-stop-ui-'))
  throw new Error('Refusing a non-owned Stop shortcut fixture root')
const assets = resolve(options.assets)
if (!(await Bun.file(join(assets, 'index.html')).exists())) throw new Error('Frozen Web assets are missing')
const workspacePath = join(root, 'Original Stop workspace — 原工程')
await mkdir(workspacePath)
await writeFile(join(workspacePath, 'original-draft.md'), '# Original file\nNever save by shortcut.\n')
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
  if (goal?.config.autoContinue !== false) throw new Error('Fixture Goal automatic continuation is not disabled')
  const workspace = (await kernel.storage.call('workspaces')).find((item) => item.path === workspacePath)
  if (!workspace) throw new Error('Owned workspace is missing')
  const firstSession = await kernel.createSession(workspace.id, 'Stop A — 原会话')
  const secondSession = await kernel.createSession(workspace.id, 'Stop B — 独立会话')
  host = await startServer(kernel, { hostname: '127.0.0.1', port: 0, staticRoot: assets })
  const browser = await host.auth.createDevice('Stop shortcut browser fixture')
  const observer = await host.auth.createDevice('Stop shortcut independent observer')
  // Credential-bearing stdout is consumed only in memory, never copied into evidence.
  process.stdout.write(
    `${JSON.stringify({
      url: `http://127.0.0.1:${host.server.port}`,
      token: browser.token,
      observerToken: observer.token,
      workspace,
      firstSession,
      secondSession,
      goalAutoContinue: false,
      initializationWrites: ['plugin.change(goal.codex:autoContinue=false)', 'session.create', 'session.create'],
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
    process.stderr.write('Owned Stop shortcut Host cleanup failed\n')
  }
  process.stderr.write(error instanceof Error ? `${error.message}\n` : 'Owned Stop shortcut Host failed\n')
  process.exitCode = 1
}
