import type { WorkspaceSearchResult } from '@hbar/contracts/workspace-query'

export type SearchPagination = NonNullable<WorkspaceSearchResult['pagination']>
type Folder = SearchPagination['folders'][number]

/** Exact retained group counts; overflow is represented by one bounded "other" count. */
export function compressSearchFolders(folders: readonly Folder[], otherMatches = 0) {
  const grouped = new Map<string, number>()
  for (const folder of folders) grouped.set(folder.path, (grouped.get(folder.path) ?? 0) + folder.matches)
  const compressed = grouped.size > 6
  const compact = new Map<string, number>()
  for (const [path, matches] of grouped) {
    const key = compressed ? path.split('/')[0] || '.' : path
    compact.set(key, (compact.get(key) ?? 0) + matches)
  }
  const sorted = [...compact].sort(([a, aCount], [b, bCount]) => bCount - aCount || a.localeCompare(b))
  return {
    folders: sorted.slice(0, 6).map(([path, matches]) => ({ path, matches })),
    otherMatches: otherMatches + sorted.slice(6).reduce((sum, [, matches]) => sum + matches, 0),
    foldersCompressed: compressed,
  }
}

export function hiddenSearchFolders(matches: readonly WorkspaceSearchResult['matches'][number][]): Folder[] {
  return matches.map((match) => ({
    path: match.path.includes('/') ? match.path.slice(0, match.path.lastIndexOf('/')) : '.',
    matches: 1,
  }))
}

/** Output limits may shorten a native page. Continue after displayed hits, never skipped hits. */
export function displayedSearchPagination(result: WorkspaceSearchResult, shown: number): SearchPagination | undefined {
  const page = result.pagination
  if (!page) return undefined
  const next = page.fromIndex + shown
  const more = !page.scanComplete || (page.totalMatches ?? next) > next
  const summary = compressSearchFolders(
    [...page.folders, ...hiddenSearchFolders(result.matches.slice(shown))],
    page.otherMatches,
  )
  const { nextIndex: _next, remainingMatches: _remaining, ...rest } = page
  return {
    ...rest,
    ...(more ? { nextIndex: next } : {}),
    ...(page.scanComplete && page.totalMatches !== undefined
      ? { remainingMatches: Math.max(0, page.totalMatches - next) }
      : {}),
    ...summary,
    foldersCompressed: page.foldersCompressed || summary.foldersCompressed,
  }
}
