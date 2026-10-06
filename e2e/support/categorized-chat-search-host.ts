import { mkdir, realpath } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { resolvePathLayout } from '@hbar/storage'
import { startServer } from '../../apps/host/src/server'

const options = z.object({ root: z.string().min(1), assets: z.string().min(1) }).parse({
  root: process.env.HBAR_CATEGORIZED_SEARCH_ROOT,
  assets: process.env.HBAR_E2E_PREVIEW_DIST ?? 'apps/web/dist',
})
const root = await realpath(options.root)
if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith('hbar-categorized-search-'))
  throw new Error('Refusing a non-owned categorized search fixture')
const assets = resolve(options.assets)
if (!(await Bun.file(join(assets, 'index.html')).exists())) throw new Error('Web assets are missing')
const project = join(root, 'Search project — 分类测试工程')
const hiddenProject = join(root, 'Hidden project — 隐藏工程')
await mkdir(project)
await mkdir(hiddenProject)
const layout = await resolvePathLayout({
  dataRoot: join(root, 'data'),
  cacheRoot: join(root, 'cache'),
  pointerFile: join(root, 'paths.json'),
  readPointer: false,
})
const kernel = await Kernel.create({ layout, workspace: project, demo: false, secrets: new MemorySecrets() })
let host: Awaited<ReturnType<typeof startServer>> | undefined
let closing: Promise<void> | undefined
const close = () =>
  (closing ??= (async () => {
    try {
      await host?.close()
    } finally {
      await kernel.close()
    }
  })())
try {
  const workspace = (await kernel.storage.call('workspaces')).find((item) => item.path === project)
  if (!workspace) throw new Error('Owned search workspace is missing')
  const session = await kernel.createSession(workspace.id, 'needle sources — 分类测试')
  // Synthetic canonical history only: no Run, Provider, command execution or real file modification.
  await kernel.storage.call(
    'commit',
    session.id,
    'search-history',
    'user',
    [
      {
        type: 'text',
        text: `${Array.from({ length: 45 }, (_, i) => `Earlier paragraph ${i}: ordinary context before the matched passage.`).join('\n\n')}\n\nneedle DIALOGUE_HIT_MARKER\n\n${'Later context after the matched passage.\n\n'.repeat(20)}`,
      },
    ],
    'search-dialogue',
  )
  await kernel.storage.call(
    'commit',
    session.id,
    'search-history',
    'assistant',
    [
      {
        type: 'tool_call',
        callId: 'search-command',
        name: 'shell',
        args: { command: 'printf needle' },
        presentation: { version: 1, kind: 'command', commandField: 'command' },
      },
      {
        type: 'tool_call',
        callId: 'search-edit',
        name: 'edit',
        args: { path: 'src/needle-file.ts' },
        presentation: { version: 1, kind: 'file-edit', pathField: 'path' },
      },
    ],
    'search-tool-parent',
  )
  await kernel.storage.call(
    'commit',
    session.id,
    'search-history',
    'tool',
    [
      {
        type: 'tool_result',
        callId: 'search-command',
        name: 'shell',
        isError: false,
        text: 'Historical command output',
        outcome: { kind: 'succeeded', executionStarted: true },
      },
      {
        type: 'tool_result',
        callId: 'search-edit',
        name: 'edit',
        isError: false,
        text: 'Historical edit applied',
        details: { path: 'src/needle-file.ts', before: 'const old = 1;\n', after: 'const needlePatch = 2;\n' },
        outcome: { kind: 'succeeded', executionStarted: true },
      },
    ],
    'search-tool-result',
  )
  for (let index = 0; index < 130; index++)
    await kernel.storage.call(
      'commit',
      session.id,
      'search-history',
      index % 2 ? 'assistant' : 'user',
      [
        {
          type: 'text',
          text: `History ${index}\n\n${'Ordinary archived context without the search word.\n\n'.repeat(4)}`,
        },
      ],
      `search-history-${index}`,
    )
  await kernel.storage.call(
    'commit',
    session.id,
    'search-history',
    'assistant',
    [{ type: 'text', text: 'LATEST_OUTPUT_MARKER: the most recent assistant output.' }],
    'search-latest-output',
  )
  for (let index = 0; index < 80; index++)
    await kernel.storage.call(
      'commit',
      session.id,
      'search-history',
      'user',
      [
        {
          type: 'text',
          text: `LATEST_USER_MARKER ${index}\n\n${'An unanswered user prompt follows the latest output.\n\n'.repeat(index === 79 ? 45 : 4)}`,
        },
      ],
      `search-latest-user-${index}`,
    )
  const titleOnly = await kernel.createSession(workspace.id, 'needle title only')
  const archived = await kernel.createSession(workspace.id, 'needle archived')
  await kernel.storage.call('commit', archived.id, 'search-history', 'user', [
    { type: 'text', text: 'needle archived' },
  ])
  await kernel.storage.call('updateSession', archived.id, { archived: true })
  const hiddenWorkspace = await kernel.createWorkspace(hiddenProject)
  const hiddenSession = await kernel.createSession(hiddenWorkspace.id, 'Hidden chat — 隐藏会话')
  await kernel.storage.call(
    'commit',
    hiddenSession.id,
    'search-hidden',
    'assistant',
    [{ type: 'text', text: 'hidden-key HIDDEN_HIT_MARKER: an exact result in a hidden workspace.' }],
    'search-hidden-message',
  )
  for (const item of [session, titleOnly, archived, hiddenSession])
    if ((await kernel.storage.call('snapshot', item.id)).runs.length) throw new Error('Unexpected fixture Run')
  host = await startServer(kernel, { hostname: '127.0.0.1', port: 0, staticRoot: assets })
  const device = await host.auth.createDevice('Categorized chat search E2E')
  // The parent consumes credentials privately. Never persist this stdout as evidence.
  process.stdout.write(
    `${JSON.stringify({
      url: `http://127.0.0.1:${host.server.port}`,
      token: device.token,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      sessionId: session.id,
      sessionTitle: session.title,
      titleOnlyId: titleOnly.id,
      archivedId: archived.id,
      hiddenWorkspaceId: hiddenWorkspace.id,
      hiddenSessionId: hiddenSession.id,
      hiddenSessionTitle: hiddenSession.title,
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
  await close()
  throw error
}
