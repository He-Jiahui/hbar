import { expect, test } from 'bun:test'
import type { WorkspaceSearchResult } from '@hbar/contracts/workspace-query'
import { formatSearchText } from '../plugins/local-tools/src/search-output'

function result(overrides: Partial<WorkspaceSearchResult> = {}): WorkspaceSearchResult {
  return {
    matches: [{ path: 'src/a.ts', line: 1, column: 1, text: 'needle', before: [], after: [] }],
    filesChecked: 1,
    truncated: false,
    cache: { contentHits: 0, contentMisses: 0, matchHits: 0, matchMisses: 0, bytesRead: 0 },
    ...overrides,
  }
}
const page = (overrides: Partial<NonNullable<WorkspaceSearchResult['pagination']>> = {}) => ({
  fromIndex: 0,
  scanComplete: true,
  totalMatches: 3,
  remainingMatches: 2,
  nextIndex: 1,
  cacheHit: false,
  cacheStored: true,
  cacheLimited: false,
  folders: [{ path: 'src', matches: 2 }],
  otherMatches: 0,
  foldersCompressed: false,
  ...overrides,
})

test('ordinary output keeps complete small results unchanged and gives unknown counts for stopped scans', () => {
  expect(formatSearchText(result()).text).toBe('src/a.ts:1:1:needle\n')
  const output = formatSearchText(
    result({
      truncated: true,
      pagination: page({
        scanComplete: false,
        cacheStored: false,
        totalMatches: undefined,
        remainingMatches: undefined,
        folders: [],
      }),
    }),
  )
  expect(output.text).toContain('折叠了剩余内容')
  expect(output.text).toContain('剩余数量未知')
  expect(output.text).toContain('from_index=1')
  expect(output.text).toContain('fully_scan=true')
  expect(output.text).not.toContain('共 3 条')
})

test('complete output reports exact remaining counts, compact folder distribution and cache reuse', () => {
  const output = formatSearchText(result({ truncated: true, pagination: page({ cacheHit: true }) }))
  expect(output.text).toContain('共 3 条命中，本页显示 1 条，剩余 2 条')
  expect(output.text).toContain('src/ 2 条')
  expect(output.text).toContain('完整搜索缓存已复用')
  expect(output.pagination).toMatchObject({ nextIndex: 1, remainingMatches: 2 })
})

test('the text cap advances only displayed hits, preserving hidden whole hits and UTF-8 boundaries', () => {
  const base = result().matches[0]!
  const output = formatSearchText(
    result({
      matches: [
        { ...base, path: 'first/a.ts', text: '世界🌟'.repeat(100_000) },
        { ...base, path: 'second/a.ts', text: 'needle next' },
      ],
      truncated: true,
      pagination: page({ fromIndex: 10, totalMatches: 13, remainingMatches: 1, nextIndex: 12 }),
    }),
  )
  expect(Buffer.byteLength(output.text)).toBeLessThanOrEqual(64 * 1024)
  expect(output.text).not.toContain('�')
  expect(output.text).toContain('read_file')
  expect(output.text).toContain('from_index=11')
  expect(output.shownMatches).toBe(1)
  expect(output.pagination).toMatchObject({ nextIndex: 11, remainingMatches: 2 })
  expect(output.pagination?.folders.reduce((sum, folder) => sum + folder.matches, 0)).toBe(3)
})

test('many hidden rows and very long folder names remain compressed and byte bounded', () => {
  const base = result().matches[0]!
  const matches = Array.from({ length: 1000 }, (_, index) => ({
    ...base,
    path: `folder-${index}/${'中'.repeat(500)}/a.ts`,
    text: 'needle',
  }))
  const output = formatSearchText(
    result({
      matches,
      pagination: page({
        totalMatches: 1000,
        remainingMatches: 0,
        nextIndex: undefined,
        folders: [],
        cacheStored: false,
      }),
    }),
  )
  expect(Buffer.byteLength(output.text)).toBeLessThanOrEqual(64 * 1024)
  expect(output.pagination?.folders.length).toBeLessThanOrEqual(6)
  expect(output.pagination?.foldersCompressed).toBe(true)
  expect(
    output.pagination!.folders.reduce((sum, folder) => sum + folder.matches, output.pagination!.otherMatches),
  ).toBe(1000 - output.shownMatches)
  const footer = output.text.slice(output.text.lastIndexOf('\n['))
  expect(Buffer.byteLength(footer)).toBeLessThan(3000)
  expect(footer).toContain('其他目录')
})

test('a shortened final line distinguishes folded original text from zero remaining hits', () => {
  const output = formatSearchText(
    result({
      truncated: true,
      matches: [{ ...result().matches[0]!, textTruncated: true }],
      pagination: page({ totalMatches: 1, remainingMatches: 0, nextIndex: undefined, folders: [] }),
    }),
  )
  expect(output.text).toContain('没有剩余条目')
  expect(output.text).toContain('read_file')
  expect(output.text).not.toContain('from_index=')
})

test('out-of-range pages distinguish a page with no hits from a query with no matches', () => {
  const output = formatSearchText(
    result({
      matches: [],
      pagination: page({ fromIndex: 20, remainingMatches: 0, nextIndex: undefined, folders: [] }),
    }),
  )
  expect(output.text).toContain('No matches on this page')
  expect(output.text).toContain('共 3 条命中')
  expect(output.pagination?.nextIndex).toBeUndefined()
})
