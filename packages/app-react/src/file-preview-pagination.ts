import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FileWorkspacePreviewState } from '@hbar/app-runtime'

export const FILE_DIFF_LINES_PER_PAGE = 400
const MAX_PREVIEW_PAGES = 32

export interface FileDiffPagination {
  readonly page: number
  readonly onChange: (page: number) => void
}

export interface FilePreviewPageSource {
  readonly id: string
  readonly lineCount: number
  readonly reveal?: { readonly requestId: string; readonly line: number } | undefined
}

export interface FilePreviewPaginationState {
  readonly target: string
  readonly pages: ReadonlyMap<
    string,
    { readonly page: number; readonly lineCount: number; readonly revealRequestId?: string }
  >
}

/** Count like split('\n') without allocating a second array for a large diff. */
export function fileDiffLineCount(text: string): number {
  let count = 1
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) count += 1
  return count
}

export function clampFileDiffPage(requestedPage: number, lineCount: number): number {
  const page = Number.isFinite(requestedPage) ? Math.max(0, Math.floor(requestedPage)) : 0
  const count = Number.isFinite(lineCount) ? Math.max(0, Math.floor(lineCount)) : 0
  return Math.min(page, Math.max(0, Math.ceil(count / FILE_DIFF_LINES_PER_PAGE) - 1))
}

/** Ephemeral geometry only: keep at most the current panel's 32 immutable preview lifetimes. */
export function synchronizeFilePreviewPagination(
  state: FilePreviewPaginationState,
  target: string,
  sources: readonly FilePreviewPageSource[],
): FilePreviewPaginationState {
  const pages = new Map<
    string,
    { readonly page: number; readonly lineCount: number; readonly revealRequestId?: string }
  >()
  for (const source of sources) {
    if (!source.id || pages.has(source.id)) continue
    if (pages.size === MAX_PREVIEW_PAGES) break
    const previous = state.target === target ? state.pages.get(source.id) : undefined
    const lineCount = Number.isFinite(source.lineCount) ? Math.max(0, Math.floor(source.lineCount)) : 0
    const reveal = source.reveal
    const requestedPage =
      reveal && reveal.requestId !== previous?.revealRequestId
        ? Math.floor((reveal.line - 1) / FILE_DIFF_LINES_PER_PAGE)
        : (previous?.page ?? 0)
    const revealRequestId = reveal?.requestId ?? previous?.revealRequestId
    pages.set(source.id, {
      page: clampFileDiffPage(requestedPage, lineCount),
      lineCount,
      ...(revealRequestId ? { revealRequestId } : {}),
    })
  }
  if (
    state.target === target &&
    state.pages.size === pages.size &&
    Array.from(pages).every(([id, value]) => {
      const previous = state.pages.get(id)
      return (
        previous?.page === value.page &&
        previous.lineCount === value.lineCount &&
        previous.revealRequestId === value.revealRequestId
      )
    })
  )
    return state
  return { target, pages }
}

export function changeFilePreviewPage(
  state: FilePreviewPaginationState,
  target: string,
  previewId: string,
  requestedPage: number,
): FilePreviewPaginationState {
  const previous = state.pages.get(previewId)
  if (state.target !== target || !previous) return state
  const page = clampFileDiffPage(requestedPage, previous.lineCount)
  if (page === previous.page) return state
  const pages = new Map(state.pages)
  pages.set(previewId, { ...previous, page })
  return { target, pages }
}

/** The workspace owns pages for immutable preview lifetimes, including one-shot source reveals. */
export function useFilePreviewPagination(
  target: string,
  previews: readonly FileWorkspacePreviewState[],
  activePreviewId: string | null,
): FileDiffPagination | undefined {
  const lineCounts = useRef(new WeakMap<object, number>())
  const sources = useMemo(
    () =>
      previews.flatMap((preview) => {
        const content = preview.kind === 'diff' ? preview.diff : preview.document
        let lineCount = lineCounts.current.get(content)
        if (lineCount === undefined) {
          lineCount = fileDiffLineCount(preview.kind === 'diff' ? preview.diff.text : preview.document.draft)
          lineCounts.current.set(content, lineCount)
        }
        return [
          {
            id: preview.id,
            lineCount,
            ...(preview.kind === 'document' &&
            preview.document.sha256 &&
            preview.document.status !== 'loading' &&
            preview.reveal
              ? { reveal: { requestId: preview.reveal.requestId, line: preview.reveal.line } }
              : {}),
          },
        ]
      }),
    [previews],
  )
  const [state, setState] = useState<FilePreviewPaginationState>(() => ({ target, pages: new Map() }))
  const current = synchronizeFilePreviewPagination(state, target, sources)
  const live = useRef({ target, activePreviewId, sources })
  live.current = { target, activePreviewId, sources }
  useLayoutEffect(() => {
    // Persist pruning and clamping, so a later longer response cannot resurrect an old out-of-range page.
    setState((previous) => synchronizeFilePreviewPagination(previous, target, sources))
  }, [target, sources])
  const selected = activePreviewId ? current.pages.get(activePreviewId) : undefined
  if (!activePreviewId || !selected) return undefined
  return {
    page: selected.page,
    onChange: (page) => {
      if (live.current.target !== target || live.current.activePreviewId !== activePreviewId) return
      setState((previous) => {
        if (live.current.target !== target || live.current.activePreviewId !== activePreviewId) return previous
        const synchronized = synchronizeFilePreviewPagination(previous, target, live.current.sources)
        return changeFilePreviewPage(synchronized, target, activePreviewId, page)
      })
    },
  }
}
