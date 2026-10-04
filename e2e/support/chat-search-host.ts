import { mkdir, realpath } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { resolvePathLayout } from '@hbar/storage'
import { startServer } from '../../apps/host/src/server'

const prefix = 'hbar-chat-search-e2e-'
const options = z.object({ root: z.string().min(1), assets: z.string().min(1) }).parse({
  root: process.env.HBAR_CHAT_SEARCH_ROOT,
  assets: process.env.HBAR_CHAT_SEARCH_WEB_DIST,
})
const root = await realpath(options.root)
if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith(prefix))
  throw new Error('Refusing a non-owned chat-search fixture root')
const assets = resolve(options.assets)
if (!(await Bun.file(join(assets, 'index.html')).exists())) throw new Error('Frozen Web assets are missing')

const visiblePath = join(root, 'Visible search project — 可见项目')
const hiddenPath = join(root, 'Hidden search project — 隐藏项目')
await mkdir(visiblePath)
await mkdir(hiddenPath)
const layout = await resolvePathLayout({
  dataRoot: join(root, 'data'),
  cacheRoot: join(root, 'cache'),
  pointerFile: join(root, 'paths.json'),
  readPointer: false,
})
// All messages below are synthetic historical StoragePort commits, not Runs.
const kernel = await Kernel.create({ layout, workspace: visiblePath, demo: false, secrets: new MemorySecrets() })
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
  const visibleWorkspace = (await kernel.storage.call('workspaces')).find((item) => item.path === visiblePath)
  if (!visibleWorkspace) throw new Error('Owned visible workspace is missing')
  const hiddenWorkspace = await kernel.createWorkspace(hiddenPath)
  const filler = []
  for (let index = 1; index <= 7; index++) {
    const session = await kernel.createSession(visibleWorkspace.id, `Synthetic recent chat ${index}`)
    await kernel.storage.call('commit', session.id, `search-filler-${index}`, 'user', [
      { type: 'text', text: `Ordinary synthetic message ${index}; no target search term.` },
    ])
    filler.push(session)
  }
  const visibleMatch = await kernel.createSession(visibleWorkspace.id, 'Visible result — 可见结果')
  const visibleUser = await kernel.storage.call('commit', visibleMatch.id, 'search-visible-history', 'user', [
    { type: 'text', text: 'The user placed needle in the first searchable message.' },
  ])
  const visibleAssistant = await kernel.storage.call('commit', visibleMatch.id, 'search-visible-history', 'assistant', [
    { type: 'text', text: 'An assistant also discussed needle in the same conversation.' },
  ])
  const titleOnly = await kernel.createSession(visibleWorkspace.id, 'needle appears in this title only')
  await kernel.storage.call('commit', titleOnly.id, 'search-title-only-history', 'user', [
    { type: 'text', text: 'This body does not contain the target word.' },
  ])
  const hiddenMatch = await kernel.createSession(hiddenWorkspace.id, 'Hidden project result — 隐藏项目结果')
  const hiddenUser = await kernel.storage.call('commit', hiddenMatch.id, 'search-hidden-history', 'user', [
    { type: 'text', text: 'The hidden project still has a needle in its user history.' },
  ])
  const hiddenAssistant = await kernel.storage.call('commit', hiddenMatch.id, 'search-hidden-history', 'assistant', [
    { type: 'text', text: 'Assistant context for the hidden project includes needle.' },
  ])
  const hiddenFiller = await kernel.createSession(hiddenWorkspace.id, 'Other hidden project chat')
  await kernel.storage.call('commit', hiddenFiller.id, 'search-hidden-filler', 'user', [
    { type: 'text', text: 'Unrelated content under the second workspace.' },
  ])
  const archivedMatch = await kernel.createSession(visibleWorkspace.id, 'Archived result — 已归档结果')
  await kernel.storage.call('commit', archivedMatch.id, 'search-archived-history', 'user', [
    { type: 'text', text: 'This archived message has needle but must stay out of ordinary search.' },
  ])
  await kernel.storage.call('updateSession', archivedMatch.id, { archived: true })
  for (const session of [visibleMatch, hiddenMatch, titleOnly, archivedMatch])
    if ((await kernel.storage.call('snapshot', session.id)).runs.length)
      throw new Error('Unexpected Run in historical chat-search fixture')

  host = await startServer(kernel, { hostname: '127.0.0.1', port: 0, staticRoot: assets })
  const browser = await host.auth.createDevice('Chat search browser fixture')
  const observer = await host.auth.createDevice('Chat search read observer')
  // Only the parent test consumes credentials; never write this stdout to evidence.
  process.stdout.write(
    `${JSON.stringify({
      url: `http://127.0.0.1:${host.server.port}`,
      token: browser.token,
      observerToken: observer.token,
      visibleWorkspace,
      hiddenWorkspace,
      filler,
      visibleMatch,
      hiddenMatch,
      titleOnly,
      hiddenFiller,
      archivedMatch,
      messageIds: {
        visibleUser: visibleUser.message.id,
        visibleAssistant: visibleAssistant.message.id,
        hiddenUser: hiddenUser.message.id,
        hiddenAssistant: hiddenAssistant.message.id,
      },
      initialization: { workspaces: 2, sessions: 12, archivedSessions: 1, demo: false, runs: 0 },
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
    process.stderr.write('Owned chat-search Host cleanup failed\n')
  }
  process.stderr.write(error instanceof Error ? `${error.message}\n` : 'Owned chat-search Host failed\n')
  process.exitCode = 1
}
