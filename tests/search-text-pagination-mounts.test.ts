import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { LocalExecution, type WorkspaceMount } from '@hbar/local-tools'
import { workspaceSearchInputSchema, type WorkspaceSearchInput } from '@hbar/contracts/workspace-query'

const fixtures: { root: string; execution: LocalExecution }[] = []
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    fixture.execution.workspaceQuery.dispose()
    if (dirname(fixture.root) !== tmpdir() || !fixture.root.startsWith(join(tmpdir(), 'hbar-mounted-search-')))
      throw new Error('Unexpected mounted search fixture path')
    await rm(fixture.root, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-mounted-search-'))
  const frontend = join(root, 'frontend')
  const backend = join(root, 'backend')
  await mkdir(frontend)
  await mkdir(backend)
  await writeFile(join(frontend, 'a.txt'), 'needle f0\nneedle f1\nneedle f2\n')
  await writeFile(join(backend, 'a.txt'), 'needle b0\nneedle b1\nneedle b2\n')
  const mount: WorkspaceMount = {
    root,
    folders: [
      { alias: 'frontend', path: frontend },
      { alias: 'backend', path: backend },
    ],
  }
  let verifications = 0
  const execution = new LocalExecution([], undefined, {
    get: (workspace) => (workspace === root ? mount : undefined),
    verify: (_mount, signal) => {
      signal?.throwIfAborted()
      verifications++
      return Promise.resolve()
    },
  })
  fixtures.push({ root, execution })
  const search = (extra: Partial<WorkspaceSearchInput> = {}, signal = new AbortController().signal) =>
    execution.workspaceQuery.search(
      root,
      workspaceSearchInputSchema.parse({ pattern: 'needle', literal: true, limit: 2, ...extra }),
      signal,
    )
  return { root, frontend, backend, execution, search, verified: () => verifications }
}

test('full scan counts all ordered mounts and pages cross roots without repeated or missing hits', async () => {
  const f = await fixture()
  const first = await f.search({ fully_scan: true })
  expect(first.matches.map((match) => match.text)).toEqual(['needle f0', 'needle f1'])
  expect(first.pagination).toMatchObject({ totalMatches: 6, remainingMatches: 4, nextIndex: 2, cacheStored: true })
  expect(first.pagination?.folders).toEqual([
    { path: 'backend', matches: 3 },
    { path: 'frontend', matches: 1 },
  ])
  const second = await f.search({ fully_scan: true, from_index: 2 })
  expect(second.matches.map((match) => [match.path, match.text])).toEqual([
    ['frontend/a.txt', 'needle f2'],
    ['backend/a.txt', 'needle b0'],
  ])
  expect(second.pagination).toMatchObject({ totalMatches: 6, remainingMatches: 2, nextIndex: 4, cacheHit: true })
  const third = await f.search({ from_index: 4 })
  expect(third.matches.map((match) => match.text)).toEqual(['needle b1', 'needle b2'])
  expect(third.pagination).toMatchObject({ totalMatches: 6, remainingMatches: 0, scanComplete: true })
  expect(f.verified()).toBe(3)
})

test('ordinary mount pages stop conservatively and can resume across folder boundaries', async () => {
  const f = await fixture()
  const first = await f.search()
  expect(first.pagination).toMatchObject({ nextIndex: 2, scanComplete: false, folders: [] })
  expect(first.pagination?.remainingMatches).toBeUndefined()
  const second = await f.search({ from_index: 2 })
  expect(second.matches.map((match) => match.text)).toEqual(['needle f2', 'needle b0'])
  expect(second.pagination?.nextIndex).toBe(4)
})

test('a byte-limited full-scan page does not jump past hidden hits in an earlier mount', async () => {
  const f = await fixture()
  await writeFile(join(f.frontend, 'a.txt'), `needle ${'世界'.repeat(100_000)}\nneedle f1\n`)
  const first = await f.search({ fully_scan: true, limit: 4 })
  expect(first.matches).toHaveLength(1)
  expect(first.pagination).toMatchObject({ totalMatches: 5, remainingMatches: 4, nextIndex: 1 })
  expect(first.pagination!.folders.reduce((sum, folder) => sum + folder.matches, first.pagination!.otherMatches)).toBe(
    4,
  )
  const second = await f.search({ from_index: 1, fully_scan: true, limit: 4 })
  expect(second.matches.map((match) => match.text)).toEqual(['needle f1', 'needle b0', 'needle b1', 'needle b2'])
})

test('alias-scoped paths, include filters, invalidation and cancellation keep their mount boundaries', async () => {
  const f = await fixture()
  const scoped = await f.search({ path: 'backend', limit: 1, fully_scan: true })
  expect(scoped.matches[0]?.path).toBe('backend/a.txt')
  expect(scoped.pagination?.totalMatches).toBe(3)
  const filtered = await f.search({ include: ['backend/*.txt'], fully_scan: true })
  expect(filtered.matches.every((match) => match.path.startsWith('backend/'))).toBe(true)
  expect(filtered.pagination?.totalMatches).toBe(3)
  await f.execution.write(f.root, 'backend/a.txt', 'needle new\n')
  expect((await f.search({ path: 'backend', fully_scan: true })).pagination?.totalMatches).toBe(1)
  await expect(f.search({ path: '../escape' })).rejects.toThrow('Virtual workspace paths')
  const controller = new AbortController()
  controller.abort()
  await expect(f.search({}, controller.signal)).rejects.toThrow()
  const outside = await f.search({ from_index: 20, fully_scan: true })
  expect(outside.matches).toEqual([])
  expect(outside.pagination).toMatchObject({ totalMatches: 4, remainingMatches: 0 })
})
