import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { ContentBlock } from '@hbar/contracts'
import { LocalExecution } from '@hbar/local-tools'

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
  expect(kernel.tools.get('read_file')?.workspaceAccess).toEqual({
    kind: 'paths',
    arguments: [{ field: 'path', access: 'read' }],
  })
  expect(kernel.tools.get('shell')?.workspaceAccess).toEqual({ kind: 'workspace' })

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
  if (listed.type !== 'tool_result') throw new Error('Expected a list_directory result')
  const nextCursor = (listed.details as { nextCursor?: unknown } | undefined)?.nextCursor
  if (typeof nextCursor !== 'string') throw new Error('Expected a list_directory cursor')
  const nextPage = await invoke(kernel, session.id, 'list_directory', {
    path: '.',
    after: nextCursor,
    limit: 2,
  })
  expect(nextPage).toMatchObject({ type: 'tool_result', isError: false, details: { entryCount: 2 } })
  if (nextPage.type !== 'tool_result') throw new Error('Expected a list_directory result')
  for (const firstPageEntry of listed.text.trim().split('\n'))
    expect(nextPage.text).not.toContain(`${firstPageEntry}\n`)

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

test('workspace AI tools deny protected runtime data and symlinks escaping the workspace', async () => {
  const { root, kernel, session } = await fixture()
  const protectedResult = await invoke(kernel, session.id, 'find_files', { path: '.hbar-data' })
  expect(protectedResult).toMatchObject({ type: 'tool_result', isError: true })
  expect(protectedResult.type === 'tool_result' ? protectedResult.text : '').toContain('runtime data is protected')

  const outside = await mkdtemp(join(tmpdir(), 'hbar-local-tools-outside-'))
  const link = join(root, 'escape')
  try {
    await writeFile(join(outside, 'secret.txt'), 'secret\n', 'utf8')
    await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    const escaped = await invoke(kernel, session.id, 'find_files', { path: 'escape' })
    expect(escaped).toMatchObject({ type: 'tool_result', isError: true })
    expect(escaped.type === 'tool_result' ? escaped.text : '').toContain('outside the workspace')
  } finally {
    await unlink(link).catch(() => undefined)
    await rm(outside, { recursive: true, force: true })
  }
})

test('workspace search text is capped at 64 KiB and reports truncation', async () => {
  const { root, kernel, session } = await fixture()
  await writeFile(join(root, 'large.ts'), `needle ${'界'.repeat(100_000)}\n`, 'utf8')
  const result = await invoke(kernel, session.id, 'search_text', {
    pattern: 'needle',
    literal: true,
    include: ['large.ts'],
  })
  expect(result.type).toBe('tool_result')
  if (result.type !== 'tool_result') throw new Error('Expected tool result')
  expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(64 * 1024)
  expect(result.text).toContain('[tool output truncated]')
  expect(result.text).toContain('折叠了剩余内容')
  expect(result.text).toContain('read_file')
  expect(result.details).toMatchObject({ matchCount: 1, truncated: true })
})

test('managed search_text exposes full-scan counts and continues from the displayed next index', async () => {
  const { root, kernel, session } = await fixture()
  await writeFile(join(root, 'pages.ts'), 'needle page 0\nneedle page 1\nneedle page 2\n')
  const first = await invoke(kernel, session.id, 'search_text', {
    pattern: 'needle',
    literal: true,
    include: ['**/*.ts'],
    limit: 1,
    fully_scan: true,
  })
  expect(first).toMatchObject({
    type: 'tool_result',
    isError: false,
    details: { matchCount: 1, pagination: { totalMatches: 4, remainingMatches: 3, nextIndex: 1, cacheStored: true } },
  })
  if (first.type !== 'tool_result') throw new Error('Unexpected search result')
  expect(first.text).toContain('折叠了剩余内容')
  expect(first.text).toContain('from_index=1')
  const next = await invoke(kernel, session.id, 'search_text', {
    pattern: 'needle',
    literal: true,
    include: ['**/*.ts'],
    limit: 2,
    from_index: 1,
  })
  expect(next).toMatchObject({
    type: 'tool_result',
    isError: false,
    details: { matchCount: 2, pagination: { totalMatches: 4, remainingMatches: 1, nextIndex: 3, cacheHit: true } },
  })
  if (next.type !== 'tool_result') throw new Error('Unexpected search result')
  expect(next.text).toContain('pages.ts:1:1:needle page 0')
  expect(next.text).toContain('pages.ts:2:1:needle page 1')
  const last = await invoke(kernel, session.id, 'search_text', {
    pattern: 'needle',
    literal: true,
    include: ['**/*.ts'],
    limit: 2,
    from_index: 3,
  })
  expect(last).toMatchObject({
    type: 'tool_result',
    isError: false,
    details: { matchCount: 1, truncated: false, pagination: { totalMatches: 4, remainingMatches: 0 } },
  })
})

test('local writes immediately invalidate cached ranged reads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-local-write-cache-'))
  const execution = new LocalExecution()
  try {
    await writeFile(join(root, 'value.txt'), 'before\n', 'utf8')
    await execution.workspaceQuery.readRange(root, 'value.txt', 1, 1, new AbortController().signal)
    expect(
      (await execution.workspaceQuery.readRange(root, 'value.txt', 1, 1, new AbortController().signal)).cacheHit,
    ).toBe(true)
    await execution.write(root, 'value.txt', 'after\n')
    const changed = await execution.workspaceQuery.readRange(root, 'value.txt', 1, 1, new AbortController().signal)
    expect(changed).toMatchObject({ text: 'after\n', cacheHit: false })
  } finally {
    execution.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
