import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
  expect(query.cacheStats()).toMatchObject({ contentEntries: 1, matchEntries: 1 })
})

