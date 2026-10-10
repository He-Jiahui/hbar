import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { resolvePathLayout } from '@hbar/storage'
import { startServer } from '../../apps/host/src/server'
import { setTimeout as delay } from 'node:timers/promises'

const options = z.object({ root: z.string().min(1), assets: z.string().min(1) }).parse({
  root: process.env.HBAR_TOOL_OUTCOME_ROOT,
  assets: process.env.HBAR_TOOL_OUTCOME_WEB_DIST,
})
const root = await realpath(options.root)
if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith('hbar-session-tool-outcome-'))
  throw new Error('Refusing a non-owned tool-outcome fixture root')
const assets = resolve(options.assets)
if (!(await Bun.file(join(assets, 'index.html')).exists())) throw new Error('Frozen Web assets are missing')
const workspacePath = join(root, 'Tool outcomes — 工具结果')
await mkdir(workspacePath)
await writeFile(join(workspacePath, 'known-readable.txt'), 'Safe local fixture read.\n保留原文件。\n')
const layout = await resolvePathLayout({
  dataRoot: join(root, 'data'),
  cacheRoot: join(root, 'cache'),
  pointerFile: join(root, 'paths.json'),
  readPointer: false,
})
const kernel = await Kernel.create({ layout, workspace: workspacePath, demo: true, secrets: new MemorySecrets() })
let host: Awaited<ReturnType<typeof startServer>> | undefined
let closing: Promise<void> | undefined
let continueFeedback: (() => void) | undefined
function waitForFeedback(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise<void>((done, reject) => {
    const finish = (error?: unknown) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', aborted)
      continueFeedback = undefined
      if (error === undefined) done()
      else reject(error)
    }
    const aborted = () => finish(signal.reason)
    const timer = setTimeout(() => finish(new Error('Feedback fixture observation timed out')), 30_000)
    continueFeedback = () => finish()
    signal.addEventListener('abort', aborted, { once: true })
  })
}
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
  if (goal?.config.autoContinue !== false) throw new Error('Fixture automatic Goal continuation is not disabled')
  const workspace = (await kernel.storage.call('workspaces')).find((item) => item.path === workspacePath)
  if (!workspace) throw new Error('Owned workspace is missing')
  const session = await kernel.createSession(workspace.id, 'Tool outcome — 原调用')
  if (process.env.HBAR_TOOL_FEEDBACK_FIXTURE === '1') {
    kernel.tools.register({
      name: 'tool_feedback_read',
      description: 'Four controlled local file reads with real completed-work progress',
      effect: 'read',
      inputSchema: z.object({}),
      async execute(_args, context) {
        for (let completed = 0; completed <= 4; completed++) {
          await context.reportProgress?.({ completed, total: 4 })
          if (completed === 4) break
          if (completed === 1) await waitForFeedback(context.signal)
          context.signal.throwIfAborted()
          await Bun.file(join(workspacePath, 'known-readable.txt')).text()
          await delay(400, undefined, { signal: context.signal })
        }
        return { text: 'Four controlled local reads completed.' }
      },
    })
    kernel.tools.register({
      name: 'tool_feedback_batch',
      description: 'Controlled three-call sequence through the real Host gateway',
      effect: 'read',
      inputSchema: z.object({}),
      async execute(_args, context) {
        const results = await context.executeSequence?.([
          { name: 'read_file', arguments: { path: 'known-readable.txt' } },
          { name: 'tool_feedback_read', arguments: {} },
          { name: 'read_file', arguments: { path: 'known-readable.txt' } },
        ])
        return { text: JSON.stringify(results) }
      },
    })
  }
  host = await startServer(kernel, { hostname: '127.0.0.1', port: 0, staticRoot: assets })
  const browser = await host.auth.createDevice('Tool outcome browser fixture')
  const observer = await host.auth.createDevice('Tool outcome independent observer')
  // Consumed only in the parent test's memory; credentials must not enter evidence.
  process.stdout.write(
    `${JSON.stringify({ url: `http://127.0.0.1:${host.server.port}`, token: browser.token, observerToken: observer.token, workspace, session, goalAutoContinue: false })}\n`,
  )
  const input = createInterface({ input: process.stdin })
  await new Promise<void>((done) => {
    input.on('line', (line) => {
      if (line === 'continue-feedback') continueFeedback?.()
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
    process.stderr.write('Owned tool-outcome Host cleanup failed\n')
  }
  process.stderr.write(error instanceof Error ? `${error.message}\n` : 'Owned tool-outcome Host failed\n')
  process.exitCode = 1
}
