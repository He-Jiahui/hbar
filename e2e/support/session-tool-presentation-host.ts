import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { resolvePathLayout } from '@hbar/storage'
import { startServer } from '../../apps/host/src/server'

const options = z.object({ root: z.string().min(1), assets: z.string().min(1) }).parse({
  root: process.env.HBAR_TOOL_PRESENTATION_ROOT,
  assets: process.env.HBAR_TOOL_PRESENTATION_WEB_DIST,
})
const root = await realpath(options.root)
if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith('hbar-session-tool-presentation-'))
  throw new Error('Refusing a non-owned tool-presentation fixture root')
const assets = resolve(options.assets)
if (!(await Bun.file(join(assets, 'index.html')).exists()))
  throw new Error('Frozen tool-presentation assets are missing')
const workspacePath = join(root, 'Tool presentation — 工具身份')
await mkdir(join(workspacePath, 'fixtures', '资料'), { recursive: true })
await writeFile(join(workspacePath, 'fixtures', '资料', 'original-edit-target.txt'), 'Original editable fixture.\n')
await writeFile(
  join(workspacePath, 'fixtures', '资料', 'readable-original-with-a-long-file-name.txt'),
  `START identity-needle 原始命中\n${'Read-only fixture output — 保留完整内容。\n'.repeat(450)}END-OF-ORIGINAL-OUTPUT\n`,
)
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
  if (goal?.config.autoContinue !== false) throw new Error('Fixture Goal continuation must remain disabled')
  const workspace = (await kernel.storage.call('workspaces')).find((item) => item.path === workspacePath)
  if (!workspace) throw new Error('Owned tool-presentation workspace is missing')
  const session = await kernel.createSession(workspace.id, 'Tool identity — 原工具调用')
  host = await startServer(kernel, { hostname: '127.0.0.1', port: 0, staticRoot: assets })
  const browser = await host.auth.createDevice('Tool presentation browser fixture')
  const observer = await host.auth.createDevice('Tool presentation independent observer')
  // Only the parent test consumes credentials in memory; evidence excludes them.
  process.stdout.write(
    `${JSON.stringify({ url: `http://127.0.0.1:${host.server.port}`, token: browser.token, observerToken: observer.token, workspace, session, goalAutoContinue: false })}\n`,
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
    process.stderr.write('Owned tool-presentation Host cleanup failed\n')
  }
  process.stderr.write(error instanceof Error ? `${error.message}\n` : 'Owned tool-presentation Host failed\n')
  process.exitCode = 1
}
