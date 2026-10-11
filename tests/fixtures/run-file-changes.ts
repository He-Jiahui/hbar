import type {
  RunChangedFile,
  RunFileChangesSummary,
  RunFileChangesPage,
  RunFileChangeDiff,
} from '@hbar/contracts/run-file-changes'

export function changedFile(index: number): RunChangedFile {
  return {
    path: `source/folder-${index}/file-${String(index).padStart(3, '0')}.ts`,
    kind: 'modified',
    addedLines: index + 1,
    removedLines: 1,
  }
}
export function fileChangeSummary(
  totalFiles = 10,
  overrides: Partial<RunFileChangesSummary> = {},
): RunFileChangesSummary {
  return {
    seq: 20,
    totalFiles,
    addedLines: 1080,
    removedLines: 3,
    preview: Array.from({ length: Math.min(3, totalFiles) }, (_, index) => changedFile(index)),
    canUndo: totalFiles > 0,
    incomplete: false,
    undoneAt: null,
    ...overrides,
  }
}
export function fileChangePage(count = 10, start = 0): RunFileChangesPage {
  const items = Array.from({ length: Math.min(50, Math.max(0, count - start)) }, (_, index) =>
    changedFile(start + index),
  )
  return {
    sessionId: 'session',
    runId: 'run',
    summary: fileChangeSummary(count),
    items,
    nextCursor: count > start + items.length ? (items.at(-1)?.path ?? null) : null,
  }
}
export function fileChangeDiff(path = changedFile(0).path, offset = 0): RunFileChangeDiff {
  return {
    sessionId: 'session',
    runId: 'run',
    path,
    offset,
    totalLines: 2,
    hasMore: false,
    items: [
      { kind: 'removed', text: 'const before = 1', beforeLine: 1, afterLine: null },
      { kind: 'added', text: 'const after = 2', beforeLine: null, afterLine: 1 },
    ],
  }
}
