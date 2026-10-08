import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { fileSourcePage, FILE_SOURCE_LINES_PER_PAGE } from '../packages/app-react/src/file-source-pagination'
import { HbarFileSourceSurface } from '../packages/app-react/src/file-context-surfaces'
import {
  synchronizeFilePreviewPagination,
  changeFilePreviewPage,
  type FilePreviewPaginationState,
} from '../packages/app-react/src/file-preview-pagination'
import { getShellCopy } from '../apps/web/src/shell-copy'

test('source page bounds preserve empty, one, normal, exact and next-page line identities', () => {
  for (const count of [1, 3, 400, 401, 800, 801]) {
    const text = Array.from({ length: count }, (_, index) => `row-${index} — 🙂\r`).join('\n')
    const pages = Array.from({ length: Math.ceil(count / FILE_SOURCE_LINES_PER_PAGE) }, (_, page) =>
      fileSourcePage(text, page),
    )
    expect(pages.flatMap((page) => page.lines.map((line) => line.text)).join('\n')).toBe(text)
    expect(pages.every((page) => page.lines.length <= FILE_SOURCE_LINES_PER_PAGE)).toBe(true)
    expect(
      pages
        .flatMap((page) => page.lines)
        .map((line) => text.slice(line.startOffset, line.startOffset + line.text.length)),
    ).toEqual(text.split('\n'))
    expect(fileSourcePage(text, Infinity).page).toBe(0)
    expect(fileSourcePage(text, 1000).page).toBe(pages.length - 1)
  }
  expect(fileSourcePage('', 10).lines).toEqual([{ index: 0, startOffset: 0, text: '' }])
  expect(fileSourcePage('one\n', 0).lines).toEqual([
    { index: 0, startOffset: 0, text: 'one' },
    { index: 1, startOffset: 4, text: '' },
  ])
})
test('the public 2 MiB document boundary cannot allocate one DOM row per newline', () => {
  const text = '\n'.repeat(2 * 1024 * 1024)
  const last = fileSourcePage(text, Number.MAX_SAFE_INTEGER)
  expect(last.totalLines).toBe(text.length + 1)
  expect(last.lines.length).toBeLessThanOrEqual(400)
  expect(last.lines.at(-1)).toEqual({ index: text.length, startOffset: text.length, text: '' })
  const html = renderToStaticMarkup(
    <HbarFileSourceSurface
      path="source.ts"
      value={text}
      sha256={null}
      previewLabel="原文件"
      labels={getShellCopy('zh-CN').files.context}
      disabled={false}
      onAdd={() => Promise.resolve(false)}
    />,
  )
  expect(html.match(/data-source-code=/g)).toHaveLength(400)
  expect(html).toContain('下一页代码')
  expect(html).toContain('data-text-context="metadata.detail"')
})
test('one-shot reveal pages persist across user navigation, late clearing, capacity and owner changes', () => {
  const initial: FilePreviewPaginationState = { target: 'owner-a', pages: new Map() }
  const source = { id: 'doc', lineCount: 1200, reveal: { requestId: 'request-a', line: 801 } }
  let state = synchronizeFilePreviewPagination(initial, initial.target, [source])
  expect(state.pages.get('doc')?.page).toBe(2)
  state = changeFilePreviewPage(state, state.target, 'doc', 0)
  expect(synchronizeFilePreviewPagination(state, state.target, [source]).pages.get('doc')?.page).toBe(0)
  state = synchronizeFilePreviewPagination(state, state.target, [{ id: 'doc', lineCount: 1200 }])
  expect(state.pages.get('doc')?.page).toBe(0)
  state = synchronizeFilePreviewPagination(state, state.target, [
    { ...source, reveal: { requestId: 'request-b', line: 1200 } },
  ])
  expect(state.pages.get('doc')?.page).toBe(2)
  expect(
    synchronizeFilePreviewPagination(state, state.target, [{ id: 'doc', lineCount: 10 }]).pages.get('doc')?.page,
  ).toBe(0)
  expect(
    synchronizeFilePreviewPagination(state, 'owner-b', [{ id: 'doc', lineCount: 1200 }]).pages.get('doc')?.page,
  ).toBe(0)
  expect(synchronizeFilePreviewPagination(state, state.target, []).pages.size).toBe(0)
})
