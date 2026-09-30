import { CommandError } from '@hbar/commands'
import type { FileComposerContextSelection } from '@hbar/contracts/commands/file-workspace'
import type { PromptWorkspaceContextInput } from '@hbar/contracts/commands/draft'
import type { FileWorkspaceEntryState } from './types'

export interface WorkspaceDiffRow {
  readonly index: number
  readonly raw: string
  readonly text: string
  readonly kind: 'metadata' | 'hunk' | 'addition' | 'deletion' | 'context'
  readonly side: 'old' | 'new' | null
  readonly oldLine: number | null
  readonly newLine: number | null
  readonly hunkId: string | null
}

export interface WorkspaceDiffRange {
  readonly rowStart: number
  readonly rowEnd: number
  readonly rowIndices: readonly number[]
  readonly diffSide: 'old' | 'new'
  readonly hunkId: string
  readonly lineStart: number
  readonly lineEnd: number
  readonly quote: string
}

/** Project only returned unified-diff text; never reconstruct unreturned lines. */
export function projectWorkspaceDiffRows(text: string): readonly WorkspaceDiffRow[] {
  let oldLine = 0
  let newLine = 0
  let hunkId: string | null = null
  return text.split('\n').map((raw, index) => {
    const base = { index, raw, text: raw, side: null, oldLine: null, newLine: null, hunkId: null } as const
    if (raw.startsWith('diff --git ')) hunkId = null
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      hunkId = `hunk:${index}`
      return { ...base, kind: 'hunk' as const, hunkId }
    }
    if (!hunkId || !['+', '-', ' '].includes(raw[0] ?? '')) return { ...base, kind: 'metadata' as const }
    const content = raw.slice(1)
    if (raw[0] === '+')
      return { ...base, text: content, kind: 'addition' as const, side: 'new' as const, newLine: newLine++, hunkId }
    if (raw[0] === '-')
      return { ...base, text: content, kind: 'deletion' as const, side: 'old' as const, oldLine: oldLine++, hunkId }
    return {
      ...base,
      text: content,
      kind: 'context' as const,
      side: 'new' as const,
      oldLine: oldLine++,
      newLine: newLine++,
      hunkId,
    }
  })
}

/** CC uses compatible endpoints, then includes only that side of that hunk. */
export function selectWorkspaceDiffRange(
  rows: readonly WorkspaceDiffRow[],
  anchor: number,
  focus: number,
): WorkspaceDiffRange | null {
  const first = rows[anchor]
  const last = rows[focus]
  if (!first?.side || !first.hunkId || first.side !== last?.side || first.hunkId !== last.hunkId) return null
  const selected = rows
    .slice(Math.min(anchor, focus), Math.max(anchor, focus) + 1)
    .filter((row) => row.side === first.side && row.hunkId === first.hunkId)
  const lineStart = first.side === 'old' ? selected[0]?.oldLine : selected[0]?.newLine
  const end = selected.at(-1)
  const lineEnd = first.side === 'old' ? end?.oldLine : end?.newLine
  if (!lineStart || !lineEnd || selected.length === 0) return null
  return {
    rowStart: selected[0]!.index,
    rowEnd: end!.index,
    rowIndices: selected.map((row) => row.index),
    diffSide: first.side,
    hunkId: first.hunkId,
    lineStart,
    lineEnd,
    quote: selected.map((row) => row.text).join('\n'),
  }
}

export function captureFileWorkspaceContext(
  entry: FileWorkspaceEntryState,
  path: string,
  selection: FileComposerContextSelection,
): PromptWorkspaceContextInput {
  const origin = { workspaceId: entry.workspaceId, path }
  if (selection.kind === 'diff-comment') {
    const diff = entry.diff
    if (
      entry.view !== 'diff' ||
      !diff ||
      diff.status !== 'ready' ||
      diff.cached !== selection.cached ||
      diff.text !== selection.expectedText
    )
      throw new CommandError('TARGET_CHANGED', 'The selected diff snapshot changed')
    const range = selectWorkspaceDiffRange(projectWorkspaceDiffRows(diff.text), selection.rowStart, selection.rowEnd)
    if (!range || range.diffSide !== selection.diffSide)
      throw new CommandError('INVALID_INPUT', 'Select one compatible side of one diff hunk')
    return {
      ...origin,
      kind: selection.kind,
      cached: diff.cached,
      diffSide: range.diffSide,
      hunkId: range.hunkId,
      lineStart: range.lineStart,
      lineEnd: range.lineEnd,
      quote: range.quote,
      note: selection.note,
    }
  }
  const document = entry.document
  if (entry.view !== 'document' || !document || document.sha256 !== selection.sha256)
    throw new CommandError('TARGET_CHANGED', 'The selected source snapshot changed')
  const text = document.draft
  const { startOffset, endOffset } = selection
  if (startOffset >= endOffset || endOffset > text.length)
    throw new CommandError('INVALID_INPUT', 'The source selection is outside the preview')
  const lineStart = text.slice(0, startOffset).split('\n').length
  const lineEnd = text.slice(0, endOffset - 1).split('\n').length
  // CC expands multiline selections to whole lines, while a one-line drag can
  // quote a smaller expression. A gutter comment always owns complete lines.
  const wholeLines = lineStart !== lineEnd || selection.kind === 'source-comment'
  const start = wholeLines ? (startOffset === 0 ? 0 : text.lastIndexOf('\n', startOffset - 1) + 1) : startOffset
  const nextBreak = text.indexOf('\n', endOffset - 1)
  const end = wholeLines ? (nextBreak < 0 ? text.length : nextBreak) : endOffset
  const quote = selection.kind === 'source-selection' ? text.slice(start, end).trim() : text.slice(start, end)
  if (!quote) throw new CommandError('INVALID_INPUT', 'Select nonempty source text')
  const context = { ...origin, kind: selection.kind, sha256: selection.sha256, lineStart, lineEnd, quote }
  return selection.kind === 'source-comment'
    ? { ...context, kind: selection.kind, note: selection.note }
    : { ...context, kind: selection.kind }
}
