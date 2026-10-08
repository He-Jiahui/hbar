import { clampFileDiffPage, fileDiffLineCount, FILE_DIFF_LINES_PER_PAGE } from './file-preview-pagination'

export const FILE_SOURCE_LINES_PER_PAGE = FILE_DIFF_LINES_PER_PAGE
export interface FileSourceLine {
  readonly index: number
  readonly startOffset: number
  readonly text: string
}
export interface FileSourcePage {
  readonly page: number
  readonly totalLines: number
  readonly startLine: number
  readonly lines: readonly FileSourceLine[]
}

/** Scan the bounded document, allocating only the current page's source rows. */
export function fileSourcePage(value: string, requestedPage: number): FileSourcePage {
  const totalLines = fileDiffLineCount(value)
  const page = clampFileDiffPage(requestedPage, totalLines)
  const startLine = page * FILE_SOURCE_LINES_PER_PAGE
  let startOffset = 0
  for (let index = 0; index < startLine; index += 1) startOffset = value.indexOf('\n', startOffset) + 1
  const lines: FileSourceLine[] = []
  for (let index = startLine; index < Math.min(totalLines, startLine + FILE_SOURCE_LINES_PER_PAGE); index += 1) {
    const next = value.indexOf('\n', startOffset)
    lines.push({ index, startOffset, text: value.slice(startOffset, next === -1 ? value.length : next) })
    startOffset = next === -1 ? value.length : next + 1
  }
  return { page, totalLines, startLine, lines }
}
