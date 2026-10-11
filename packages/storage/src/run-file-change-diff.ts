import { diffLines } from 'diff'
import { HbarError } from '@hbar/contracts'
import type { RunFileChangeDiff } from '@hbar/contracts/run-file-changes'

export function compareFileVersions(before: string | null, after: string | null) {
  return diffLines((before ?? '').replaceAll('\r\n', '\n'), (after ?? '').replaceAll('\r\n', '\n'), {
    timeout: 50,
    maxEditLength: 20_000,
  })
}
export function countFileChanges(before: string | null, after: string | null) {
  const changes = compareFileVersions(before, after)
  if (!changes) return { addedLines: null, removedLines: null }
  return {
    addedLines: changes.reduce((sum, change) => sum + (change.added ? change.count : 0), 0),
    removedLines: changes.reduce((sum, change) => sum + (change.removed ? change.count : 0), 0),
  }
}
/** Return one bounded page. Only the selected file is diffed, and unchanged runs have folded context. */
export function fileChangeDiffPage(before: string | null, after: string | null, offset: number) {
  const changes = compareFileVersions(before, after)
  if (!changes) throw new HbarError('DIFF_LIMIT', 'File difference exceeded the computation limit')
  const items: RunFileChangeDiff['items'] = []
  let beforeLine = 1,
    afterLine = 1,
    totalLines = 0
  for (const change of changes) {
    const lines = change.value.split('\n')
    if (lines.at(-1) === '') lines.pop()
    const unchanged = !change.added && !change.removed
    for (let index = 0; index < lines.length; index++) {
      // Keep a small amount of context at each edge; do not send entire unchanged files.
      if (!unchanged || index < 3 || index >= lines.length - 3) {
        if (totalLines >= offset && items.length < 200)
          items.push({
            kind: change.added ? 'added' : change.removed ? 'removed' : 'context',
            text: lines[index] ?? '',
            beforeLine: change.added ? null : beforeLine,
            afterLine: change.removed ? null : afterLine,
          })
        totalLines++
      }
      if (!change.added) beforeLine++
      if (!change.removed) afterLine++
    }
  }
  if (offset > totalLines) throw new HbarError('INVALID_CURSOR', 'Difference page is outside this file')
  return { items, offset, totalLines, hasMore: offset + items.length < totalLines }
}
