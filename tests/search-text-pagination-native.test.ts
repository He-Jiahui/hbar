import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { NativeWorkspaceQuery, type NativeSearchRequest } from '@hbar/local-tools/native-query'
import { workspaceSearchInputSchema, workspaceSearchToolInputSchema } from '@hbar/contracts/workspace-query'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (dirname(root) !== tmpdir() || !root.startsWith(join(tmpdir(), 'hbar-search-page-')))
      throw new Error('Unexpected search fixture path')
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture(cacheBytes = 1024 * 1024) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-search-page-'))
  roots.push(root)
  const query = new NativeWorkspaceQuery(cacheBytes)
  const request: NativeSearchRequest = {
    workspace: root,
    path: '.',
    include: [],
    exclude: [],
    includeHidden: false,
    blocked: [],
    limit: 2,
    pattern: 'needle',
    literal: true,
    caseMode: 'sensitive',
    beforeContext: 0,
    afterContext: 0,
  }
  const search = (extra: Partial<NativeSearchRequest> = {}) =>
    query.search({ ...request, ...extra }, crypto.randomUUID())
  return { root, query, search }
}

test('search pagination has optional tool arguments, bounded indexes and conservative defaults', () => {
  expect(workspaceSearchInputSchema.parse({ pattern: 'x' })).toMatchObject({
    limit: 200,
    from_index: 0,
    fully_scan: false,
  })
  expect(workspaceSearchToolInputSchema.parse({ pattern: 'x' })).toEqual({ pattern: 'x' })
  for (const input of [
    { from_index: -1 },
    { from_index: 0.5 },
    { from_index: Number.MAX_SAFE_INTEGER + 1 },
    { limit: 0 },
    { limit: 1001 },
  ])
    expect(workspaceSearchInputSchema.safeParse({ pattern: 'x', ...input }).success).toBe(false)
  expect(workspaceSearchInputSchema.parse({ pattern: 'x', from_index: 10_000_001 }).from_index).toBe(10_000_001)
})

test('ordinary pages stop at their matching-line budget without claiming a remaining count', async () => {
  const f = await fixture()
  await writeFile(join(f.root, 'a.txt'), 'needle 0\nneedle 1\nneedle 2\nneedle 3\n')
  await writeFile(join(f.root, 'z.txt'), 'needle last\n')
  const first = await f.search()
  expect(first.matches.map((match) => match.text)).toEqual(['needle 0', 'needle 1'])
  expect(first).toMatchObject({
    filesChecked: 1,
    truncated: true,
    pagination: { fromIndex: 0, nextIndex: 2, scanComplete: false, cacheStored: false, folders: [] },
  })
  expect(first.pagination?.remainingMatches).toBeUndefined()
  expect(first.pagination?.totalMatches).toBeUndefined()
  expect(f.query.cacheStats().matchEntries).toBe(0)
  expect((await f.search({ from_index: 2 })).matches.map((match) => match.text)).toEqual(['needle 2', 'needle 3'])
  const last = await f.search({ from_index: 4 })
  expect(last.matches.map((match) => match.text)).toEqual(['needle last'])
  expect(last.pagination).toMatchObject({ scanComplete: true, totalMatches: 5, remainingMatches: 0 })
  expect(last.pagination?.nextIndex).toBeUndefined()
})

test('full scans cache complete indexes beyond 1000 hits and reuse them across page sizes and contexts', async () => {
  const f = await fixture()
  await writeFile(join(f.root, 'a.txt'), Array.from({ length: 1105 }, (_, index) => `needle ${index}`).join('\n'))
  const first = await f.search({ fully_scan: true })
  expect(first.pagination).toMatchObject({
    scanComplete: true,
    totalMatches: 1105,
    remainingMatches: 1103,
    nextIndex: 2,
    cacheHit: false,
    cacheStored: true,
    folders: [{ path: '.', matches: 1103 }],
  })
  const next = await f.search({ from_index: 1100, limit: 3, beforeContext: 1 })
  expect(next.matches.map((match) => match.text)).toEqual(['needle 1100', 'needle 1101', 'needle 1102'])
  expect(next.matches[0]?.before).toEqual(['needle 1099'])
  expect(next.pagination).toMatchObject({
    cacheHit: true,
    cacheStored: true,
    totalMatches: 1105,
    remainingMatches: 2,
    nextIndex: 1103,
  })
  expect(next.cache.bytesRead).toBe(0)
  const outside = await f.search({ from_index: 1200 })
  expect(outside.matches).toEqual([])
  expect(outside.pagination).toMatchObject({ totalMatches: 1105, remainingMatches: 0, cacheHit: true })
  expect(outside.pagination?.nextIndex).toBeUndefined()
})

test('complete plans revalidate changes, additions, deletions, ignore rules and protected scope', async () => {
  const f = await fixture()
  await writeFile(join(f.root, 'a.txt'), 'needle a\nneedle b\nneedle c\n')
  await f.search({ fully_scan: true })
  await writeFile(join(f.root, 'a.txt'), 'needle x\nneedle y\n')
  expect((await f.search({ from_index: 1, fully_scan: true })).matches[0]?.text).toBe('needle y')
  await writeFile(join(f.root, 'b.txt'), 'needle added\n')
  const added = await f.search({ fully_scan: true })
  expect(added.pagination).toMatchObject({ totalMatches: 3, cacheHit: false })
  await rename(join(f.root, 'b.txt'), join(f.root, 'c.txt'))
  expect((await f.search({ from_index: 2, fully_scan: true })).matches[0]?.path).toBe('c.txt')
  await writeFile(join(f.root, '.gitignore'), 'c.txt\n')
  expect((await f.search({ fully_scan: true })).pagination?.totalMatches).toBe(2)
  await unlink(join(f.root, 'a.txt'))
  expect((await f.search({ fully_scan: true })).pagination?.totalMatches).toBe(0)
  const protectedResult = await f.search({ blocked: [join(f.root, 'c.txt')], includeHidden: true, fully_scan: true })
  expect(protectedResult.matches).toEqual([])
  f.query.invalidate(join(f.root, 'missing.txt'))
  expect((await f.search({ fully_scan: true })).pagination?.cacheHit).toBe(false)
})

test('full-scan summaries compress many directories into at most six groups plus other', async () => {
  const f = await fixture()
  for (let index = 0; index < 18; index++) {
    const folder = join(f.root, `folder-${index}`, 'nested')
    await mkdir(folder, { recursive: true })
    await writeFile(join(folder, 'a.txt'), 'needle\nneedle\n')
  }
  const result = await f.search({ limit: 1, fully_scan: true })
  expect(result.pagination).toMatchObject({ totalMatches: 36, remainingMatches: 35, foldersCompressed: true })
  expect(result.pagination?.folders.length).toBeLessThanOrEqual(6)
  expect(
    result.pagination!.folders.reduce((sum, folder) => sum + folder.matches, result.pagination!.otherMatches),
  ).toBe(35)
})

test('long UTF-8 lines have a byte-bounded page without dropping later results', async () => {
  const f = await fixture()
  await writeFile(join(f.root, 'a.txt'), `needle ${'世界🌟'.repeat(25_000)}\nneedle second\nneedle third\n`)
  const result = await f.search({ fully_scan: true })
  expect(result.matches).toHaveLength(1)
  expect(result.matches[0]?.textTruncated).toBe(true)
  expect(result.matches[0]?.text).not.toContain('�')
  expect(Buffer.byteLength(JSON.stringify(result.matches))).toBeLessThan(64 * 1024)
  expect(result.pagination).toMatchObject({ nextIndex: 1, remainingMatches: 2, totalMatches: 3 })
  expect((await f.search({ from_index: 1 })).matches.map((match) => match.text)).toEqual([
    'needle second',
    'needle third',
  ])
})

test('small caches report uncached full scans honestly and remain byte-bounded', async () => {
  const f = await fixture(16)
  await writeFile(join(f.root, 'a.txt'), 'needle 0\nneedle 1\nneedle 2\n')
  const result = await f.search({ fully_scan: true })
  expect(result.pagination).toMatchObject({
    totalMatches: 3,
    remainingMatches: 1,
    cacheStored: false,
    cacheLimited: true,
  })
  expect(f.query.cacheStats().bytes).toBeLessThanOrEqual(16)
  expect((await f.search({ from_index: 2 })).matches[0]?.text).toBe('needle 2')
})

test('full-scan snapshots share cache accounting across concurrent contexts and skip non-text files safely', async () => {
  const f = await fixture()
  await writeFile(join(f.root, 'a.txt'), 'needle one\nneedle two\nneedle three\n')
  await writeFile(join(f.root, 'binary.txt'), Buffer.from([0, 1, 2]))
  await writeFile(join(f.root, 'invalid.txt'), Buffer.from([0xff, 0xfe]))
  const first = await f.search({ fully_scan: true })
  expect(first.pagination).toMatchObject({ totalMatches: 3, cacheStored: true })
  const expectedBytes = f.query.cacheStats().bytes
  f.query.clear()
  const results = await Promise.all([0, 1, 2, 3].map((beforeContext) => f.search({ fully_scan: true, beforeContext })))
  expect(results.every((result) => result.pagination?.totalMatches === 3)).toBe(true)
  expect(f.query.cacheStats().bytes).toBe(expectedBytes)
  expect((await f.search({ from_index: 10_000_001 })).matches).toEqual([])
  expect((await f.search({ from_index: Number.MAX_SAFE_INTEGER })).pagination?.nextIndex).toBeUndefined()
  const hits = f.query.cacheStats().matchHits
  await f.search({ from_index: 1 })
  expect(f.query.cacheStats().matchHits).toBeGreaterThan(hits)
})
