import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rename, rm, stat, unlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeWorkspaceQuery, nativeWorkspaceQueryVersion } from '@hbar/local-tools/native-query'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

test('native workspace query searches, finds, reads ranges, and validates cached file versions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-native-query-'))
  roots.push(root)
  await writeFile(join(root, '.gitignore'), 'ignored.txt\n', 'utf8')
  await writeFile(join(root, 'alpha.ts'), 'first\nhello 世界\nlast\n', 'utf8')
  await writeFile(join(root, 'ignored.txt'), 'hello ignored\n', 'utf8')
  await writeFile(join(root, 'other.md'), 'hello markdown\n', 'utf8')
  const query = new NativeWorkspaceQuery(1024 * 1024)
  expect(nativeWorkspaceQueryVersion).toBe('0.1.0')

  const common = {
    workspace: root,
    path: '.',
    include: ['**/*.ts'],
    exclude: [],
    includeHidden: false,
    blocked: [],
    limit: 20,
  }
  expect(await query.find(common, crypto.randomUUID())).toMatchObject({ paths: ['alpha.ts'], truncated: false })
  const first = await query.search(
    {
      ...common,
      pattern: 'hello',
      literal: true,
      caseMode: 'smart',
      beforeContext: 1,
      afterContext: 1,
    },
    crypto.randomUUID(),
  )
  expect(first.matches).toEqual([
    { path: 'alpha.ts', line: 2, column: 1, text: 'hello 世界', before: ['first'], after: ['last'] },
  ])
  expect(first.cache).toMatchObject({ contentMisses: 1, matchMisses: 1, contentHits: 0, matchHits: 0 })

  const second = await query.search(
    {
      ...common,
      pattern: 'hello',
      literal: true,
      caseMode: 'smart',
      beforeContext: 0,
      afterContext: 0,
    },
    crypto.randomUUID(),
  )
  expect(second.cache).toMatchObject({ contentHits: 1, matchHits: 1, bytesRead: 0 })

  await writeFile(join(root, 'alpha.ts'), 'first\nHELLO 世界\nlast\n', 'utf8')
  const changed = await query.search(
    {
      ...common,
      pattern: 'HELLO',
      literal: true,
      caseMode: 'sensitive',
      beforeContext: 0,
      afterContext: 0,
    },
    crypto.randomUUID(),
  )
  expect(changed.matches[0]).toMatchObject({ line: 2, text: 'HELLO 世界' })
  expect(changed.cache.contentMisses).toBe(1)

  expect(
    await query.read(
      { workspace: root, path: 'alpha.ts', blocked: [], startLine: 2, lineCount: 1 },
      crypto.randomUUID(),
    ),
  ).toMatchObject({ text: 'HELLO 世界', startLine: 2, endLine: 2, totalLines: 3, cacheHit: true })
  const stats = query.cacheStats()
  expect(stats).toMatchObject({
    contentEntries: 1,
    matchEntries: 1,
    globEntries: 1,
    lineIndexEntries: 1,
  })
  expect(stats.lineIndexBytes).toBeGreaterThan(0)
})

test('native cache detects same-size edits even when modification time is restored', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-native-version-'))
  roots.push(root)
  const path = join(root, 'same.txt')
  await writeFile(path, 'alpha value\n', 'utf8')
  const before = await stat(path)
  const query = new NativeWorkspaceQuery(1024 * 1024)
  const request = {
    workspace: root,
    path: '.',
    include: ['**/*.txt'],
    exclude: [],
    includeHidden: false,
    blocked: [],
    limit: 20,
    pattern: 'alpha',
    literal: true,
    caseMode: 'sensitive' as const,
    beforeContext: 0,
    afterContext: 0,
  }
  expect((await query.search(request, crypto.randomUUID())).matches).toHaveLength(1)
  await writeFile(path, 'bravo value\n', 'utf8')
  await utimes(path, before.atime, before.mtime)
  const changed = await query.search({ ...request, pattern: 'bravo' }, crypto.randomUUID())
  expect(changed.matches[0]?.text).toBe('bravo value')
  expect(changed.cache).toMatchObject({ contentMisses: 1, contentHits: 0 })
})

test('native cache detects replacement files with restored size and modification time', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-native-replace-'))
  roots.push(root)
  const path = join(root, 'same.txt')
  const replacement = join(root, 'replacement.tmp')
  const backup = join(root, 'backup.tmp')
  await writeFile(path, 'alpha value\n', 'utf8')
  const before = await stat(path)
  const query = new NativeWorkspaceQuery(1024 * 1024)
  const request = {
    workspace: root,
    path: '.',
    include: ['**/*.txt'],
    exclude: [],
    includeHidden: false,
    blocked: [],
    limit: 20,
    pattern: 'alpha',
    literal: true,
    caseMode: 'sensitive' as const,
    beforeContext: 0,
    afterContext: 0,
  }
  expect((await query.search(request, crypto.randomUUID())).matches).toHaveLength(1)
  await writeFile(replacement, 'bravo value\n', 'utf8')
  await utimes(replacement, before.atime, before.mtime)
  await rename(path, backup)
  await rename(replacement, path)
  await unlink(backup)
  const changed = await query.search({ ...request, pattern: 'bravo' }, crypto.randomUUID())
  expect(changed.matches[0]?.text).toBe('bravo value')
  expect(changed.cache).toMatchObject({ contentMisses: 1, contentHits: 0 })
})

test('native discovery re-reads ignore rules and observes additions, renames, and deletions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-native-discovery-'))
  roots.push(root)
  await writeFile(join(root, '.gitignore'), 'hidden.txt\n', 'utf8')
  await writeFile(join(root, '.ignore'), 'ignored-by-ignore.txt\n', 'utf8')
  await writeFile(join(root, '.rgignore'), 'ignored-by-rg.txt\n', 'utf8')
  await writeFile(join(root, 'first.txt'), 'first\n', 'utf8')
  await writeFile(join(root, 'hidden.txt'), 'hidden\n', 'utf8')
  await writeFile(join(root, 'ignored-by-ignore.txt'), 'ignored\n', 'utf8')
  await writeFile(join(root, 'ignored-by-rg.txt'), 'ignored\n', 'utf8')
  const query = new NativeWorkspaceQuery(1024 * 1024)
  const request = {
    workspace: root,
    path: '.',
    include: ['**/*.txt'],
    exclude: [],
    includeHidden: false,
    blocked: [],
    limit: 20,
  }
  expect((await query.find(request, crypto.randomUUID())).paths).toEqual(['first.txt'])

  await rename(join(root, 'first.txt'), join(root, 'renamed.txt'))
  await writeFile(join(root, 'added.txt'), 'added\n', 'utf8')
  await writeFile(join(root, '.gitignore'), '', 'utf8')
  await writeFile(join(root, '.ignore'), '', 'utf8')
  await writeFile(join(root, '.rgignore'), '', 'utf8')
  expect((await query.find(request, crypto.randomUUID())).paths).toEqual([
    'added.txt',
    'hidden.txt',
    'ignored-by-ignore.txt',
    'ignored-by-rg.txt',
    'renamed.txt',
  ])

  await unlink(join(root, 'renamed.txt'))
  expect((await query.find(request, crypto.randomUUID())).paths).toEqual([
    'added.txt',
    'hidden.txt',
    'ignored-by-ignore.txt',
    'ignored-by-rg.txt',
  ])
})

test('native search handles CRLF and Unicode while skipping binary, empty, and hidden files by default', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-native-text-'))
  roots.push(root)
  await writeFile(join(root, 'crlf.ts'), 'first\r\n你好 needle\r\nlast\r\n', 'utf8')
  await writeFile(join(root, '.hidden.ts'), '你好 needle\n', 'utf8')
  await writeFile(join(root, 'empty.ts'), '', 'utf8')
  await writeFile(join(root, 'binary.ts'), new Uint8Array([0, 110, 101, 101, 100, 108, 101]))
  await writeFile(join(root, 'invalid.ts'), new Uint8Array([0xff, 110, 101, 101, 100, 108, 101]))
  const query = new NativeWorkspaceQuery(1024 * 1024)
  const request = {
    workspace: root,
    path: '.',
    include: ['**/*.ts'],
    exclude: [],
    includeHidden: false,
    blocked: [],
    limit: 20,
    pattern: '你好 needle',
    literal: true,
    caseMode: 'sensitive' as const,
    beforeContext: 1,
    afterContext: 1,
  }
  expect((await query.search(request, crypto.randomUUID())).matches).toEqual([
    { path: 'crlf.ts', line: 2, column: 1, text: '你好 needle', before: ['first'], after: ['last'] },
  ])
  expect((await query.search({ ...request, includeHidden: true }, crypto.randomUUID())).matches).toHaveLength(2)
})

test('native cache remains bounded and isolates identical paths in different workspaces', async () => {
  const firstRoot = await mkdtemp(join(tmpdir(), 'hbar-native-first-'))
  const secondRoot = await mkdtemp(join(tmpdir(), 'hbar-native-second-'))
  roots.push(firstRoot, secondRoot)
  await writeFile(join(firstRoot, 'same.txt'), 'first workspace\n', 'utf8')
  await writeFile(join(secondRoot, 'same.txt'), 'second workspace\n', 'utf8')
  const query = new NativeWorkspaceQuery(16)
  const request = {
    path: '.',
    include: ['**/*.txt'],
    exclude: [],
    includeHidden: false,
    blocked: [],
    limit: 20,
    literal: true,
    caseMode: 'smart' as const,
    beforeContext: 0,
    afterContext: 0,
  }
  const first = await query.search(
    { ...request, workspace: firstRoot, pattern: 'first workspace' },
    crypto.randomUUID(),
  )
  const second = await query.search(
    { ...request, workspace: secondRoot, pattern: 'second workspace' },
    crypto.randomUUID(),
  )
  expect(first.matches[0]?.text).toBe('first workspace')
  expect(second.matches[0]?.text).toBe('second workspace')
  expect(query.cacheStats().bytes).toBeLessThanOrEqual(16)
})

test('native cache does not retain incomplete per-file match results', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-native-incomplete-'))
  roots.push(root)
  await writeFile(join(root, 'many.txt'), `${'needle\n'.repeat(1_100)}`, 'utf8')
  const query = new NativeWorkspaceQuery(1024 * 1024)
  const request = {
    workspace: root,
    path: '.',
    include: ['**/*.txt'],
    exclude: [],
    includeHidden: false,
    blocked: [],
    limit: 1_000,
    pattern: 'needle',
    literal: true,
    caseMode: 'sensitive' as const,
    beforeContext: 0,
    afterContext: 0,
  }
  const first = await query.search(request, crypto.randomUUID())
  const second = await query.search(request, crypto.randomUUID())
  expect(first).toMatchObject({ truncated: true, cache: { matchMisses: 1, matchHits: 0 } })
  expect(second).toMatchObject({ truncated: true, cache: { matchMisses: 1, matchHits: 0 } })
  expect(query.cacheStats().matchEntries).toBe(0)
})

test('native asynchronous queries accept cancellation before traversal completes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-native-cancel-'))
  roots.push(root)
  await writeFile(join(root, 'file.txt'), 'text\n', 'utf8')
  const query = new NativeWorkspaceQuery(1024 * 1024)
  const cancelId = crypto.randomUUID()
  const pending = query.find(
    {
      workspace: root,
      path: '.',
      include: [],
      exclude: [],
      includeHidden: false,
      blocked: [],
      limit: 20,
    },
    cancelId,
  )
  expect(query.cancel(cancelId)).toBe(true)
  await expect(pending).rejects.toThrow('query cancelled')
})
