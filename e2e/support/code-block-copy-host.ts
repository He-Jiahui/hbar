import { mkdir, realpath } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { resolvePathLayout } from '@hbar/storage'
import { startServer } from '../../apps/host/src/server'
import { codeBlockCopyFixtures, codeBlockCopyMessages } from '../../tests/fixtures/code-block-copy-fixtures'

const options = z.object({ root: z.string().min(1), assets: z.string().min(1) }).parse({
  root: process.env.HBAR_CODE_COPY_ROOT,
  assets: process.env.HBAR_CODE_COPY_WEB_DIST,
})
const root = await realpath(options.root)
if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith('hbar-code-block-copy-ui-'))
  throw new Error('Refusing non-owned code-copy fixture root')
const assets = resolve(options.assets)
if (!existsSync(join(assets, 'index.html'))) throw new Error('Code-copy frozen static root is missing')
const workspacePath = join(root, 'Code original workspace — 代码原工程')
await mkdir(workspacePath)
const layout = await resolvePathLayout({
  dataRoot: join(root, 'data'),
  cacheRoot: join(root, 'cache'),
  pointerFile: join(root, 'paths.json'),
  readPointer: false,
})
// No demo provider, Goal mutation, plugin remount or Run is needed. Public
// StoragePort commits are synthetic historical messages, not model execution.
const kernel = await Kernel.create({ layout, workspace: workspacePath, demo: false, secrets: new MemorySecrets() })
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
  const workspace = (await kernel.storage.call('workspaces')).find((item) => item.path === workspacePath)
  if (!workspace) throw new Error('Owned code-copy workspace is missing')
  const firstSession = await kernel.createSession(workspace.id, 'Code A — 原代码会话')
  const secondSession = await kernel.createSession(workspace.id, 'Code B — 独立会话')
  const ids = codeBlockCopyFixtures.messageIds
  await kernel.storage.call(
    'commit',
    firstSession.id,
    'synthetic-code-history-a',
    'assistant',
    codeBlockCopyMessages.multipleTextBlocks.map((text) => ({ type: 'text' as const, text })),
    ids.multipleTextBlocks,
  )
  await kernel.storage.call(
    'commit',
    firstSession.id,
    'synthetic-code-history-a',
    'assistant',
    [{ type: 'text', text: codeBlockCopyMessages.historicalPlan }],
    ids.historicalPlan,
  )
  await kernel.storage.call(
    'commit',
    firstSession.id,
    'synthetic-code-history-a',
    'assistant',
    [
      { type: 'text', text: codeBlockCopyMessages.ordinary },
      { type: 'thinking', text: codeBlockCopyFixtures.thinking },
    ],
    ids.ordinary,
  )
  await kernel.storage.call(
    'commit',
    secondSession.id,
    'synthetic-code-history-b',
    'assistant',
    [{ type: 'text', text: codeBlockCopyMessages.otherSession }],
    ids.otherSession,
  )
  for (const session of [firstSession, secondSession])
    if ((await kernel.storage.call('snapshot', session.id)).runs.length)
      throw new Error('Unexpected Run in code-copy history-only fixture')
  host = await startServer(kernel, { hostname: '127.0.0.1', port: 0, staticRoot: assets })
  const browser = await host.auth.createDevice('Code copy browser fixture')
  const observer = await host.auth.createDevice('Code copy read observer')
  process.stdout.write(
    `${JSON.stringify({
      url: `http://127.0.0.1:${host.server.port}`,
      token: browser.token,
      observerToken: observer.token,
      workspace,
      firstSession,
      secondSession,
      messageIds: ids,
      initialization: { sessions: 2, messageCommits: 4, demo: false, providerChanges: 0, runs: 0 },
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
    process.stderr.write('Owned code-copy Host cleanup failed\n')
  }
  process.stderr.write(error instanceof Error ? `${error.message}\n` : 'Owned code-copy Host failed\n')
  process.exitCode = 1
}
