import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { ContentBlock } from '@hbar/contracts'

const resources: { root: string; kernel: Kernel }[] = []

afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-local-tools-'))
  await writeFile(join(root, '.gitignore'), 'ignored.log\n', 'utf8')
  await writeFile(join(root, 'alpha.ts'), 'zero\nneedle 世界\ntwo\n', 'utf8')
  await writeFile(join(root, 'beta.md'), 'needle markdown\n', 'utf8')
  await writeFile(join(root, 'ignored.log'), 'needle ignored\n', 'utf8')
  const kernel = await Kernel.create({
    home: join(root, '.hbar-data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  return { root, kernel, session }
}

async function invoke(kernel: Kernel, sessionId: string, name: string, args: object): Promise<ContentBlock> {
  await kernel.submit(
    sessionId,
    crypto.randomUUID(),
    { text: `/tool ${name} ${JSON.stringify(args)}`, images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  const block = (await kernel.snapshot(sessionId)).messages
    .flatMap((message) => message.content)
    .findLast((content) => content.type === 'tool_result' && content.name === name)
  if (!block) throw new Error(`Missing ${name} result`)
  return block
}

test('workspace AI tools search, find, list, and read ranges through the managed tool gate', async () => {
  const { kernel, session } = await fixture()
  const tools = kernel.tools.list().map((tool) => tool.name)
  for (const name of ['search_text', 'find_files', 'list_directory', 'read_file']) expect(tools).toContain(name)

  const search = await invoke(kernel, session.id, 'search_text', {
    pattern: 'needle',
    literal: true,
    include: ['**/*.ts'],
    beforeContext: 1,
    afterContext: 1,
  })
  expect(search).toMatchObject({
    type: 'tool_result',
    isError: false,
    text: 'alpha.ts-1-zero\nalpha.ts:2:1:needle 世界\nalpha.ts-3-two\n',
    details: { matchCount: 1, filesChecked: 1, truncated: false },
  })

  const files = await invoke(kernel, session.id, 'find_files', { include: ['**/*.{ts,md}'] })
  expect(files).toMatchObject({
    type: 'tool_result',
    isError: false,
    text: 'alpha.ts\nbeta.md\n',
    details: { fileCount: 2, truncated: false },
  })

  const listed = await invoke(kernel, session.id, 'list_directory', { path: '.', limit: 2 })
  expect(listed).toMatchObject({
    type: 'tool_result',
    isError: false,
    details: { entryCount: 2, truncated: true },
  })

  const range = await invoke(kernel, session.id, 'read_file', {
    path: 'alpha.ts',
    startLine: 2,
    lineCount: 1,
  })
  expect(range).toMatchObject({
    type: 'tool_result',
    isError: false,
    text: 'needle 世界',
    details: { startLine: 2, endLine: 2, totalLines: 3, cacheHit: true, truncated: false },
  })
})

test('workspace AI tools report invalid patterns and denied paths without spawning a shell', async () => {
  const { kernel, session } = await fixture()
  const invalid = await invoke(kernel, session.id, 'search_text', { pattern: '(', literal: false })
  expect(invalid).toMatchObject({ type: 'tool_result', isError: true })
  expect(invalid.type === 'tool_result' ? invalid.text : '').toContain('invalid search pattern')

  const denied = await invoke(kernel, session.id, 'find_files', { path: '..' })
  expect(denied).toMatchObject({ type: 'tool_result', isError: true })
  expect(denied.type === 'tool_result' ? denied.text : '').toContain('outside the workspace')
})
