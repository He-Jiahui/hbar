import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  changeFilePreviewPage,
  clampFileDiffPage,
  fileDiffLineCount,
  synchronizeFilePreviewPagination,
  useFilePreviewPagination,
  type FilePreviewPaginationState,
} from '../packages/app-react/src/file-preview-pagination'
import { filePreviewReadingOffset } from '../packages/app-react/src/file-preview-reading-position'
import { HbarFileDiff } from '../packages/app-react/src/file-workspace-changes'
import type { FileWorkspacePreviewState } from '@hbar/app-runtime'
import { getShellCopy } from '../apps/web/src/shell-copy'

const empty = (target = 'panel-a:workspace-a'): FilePreviewPaginationState => ({ target, pages: new Map() })
const source = (id: string, lineCount = 1200) => ({ id, lineCount })
const text = Array.from({ length: 1200 }, (_, index) => `+unique-line-${String(index + 1).padStart(4, '0')}`).join('\n')
const diff = { path: 'src/同名文件.ts', cached: false, status: 'ready' as const, text, truncated: false, error: null }
const preview: FileWorkspacePreviewState = {
  id: 'diff-a',
  kind: 'diff',
  path: diff.path,
  cwd: '/fixture',
  originalPath: null,
  diff,
}

test('diff page bounds include empty, exact boundaries, the next line and invalid requests', () => {
  expect([0, 1, 400, 401, 800, 801, 1200].map((count) => clampFileDiffPage(100, count))).toEqual([0, 0, 0, 1, 1, 2, 2])
  expect(clampFileDiffPage(-1, 1200)).toBe(0)
  expect(clampFileDiffPage(1.9, 1200)).toBe(1)
  expect(clampFileDiffPage(Number.NaN, 1200)).toBe(0)
  expect(clampFileDiffPage(Number.POSITIVE_INFINITY, 1200)).toBe(0)
  expect(clampFileDiffPage(2, Number.NaN)).toBe(0)
  for (const value of ['', 'one', 'one\n', '\n\n', 'one\r\ntwo\r\n', text])
    expect(fileDiffLineCount(value)).toBe(value.split('\n').length)
})

test('page ownership survives inactive previews and browser mode without coupling to pathname', () => {
  const sources = [source('worktree'), source('staged'), source('other-file')]
  let state = synchronizeFilePreviewPagination(empty(), empty().target, sources)
  state = changeFilePreviewPage(state, state.target, 'worktree', 2)
  state = changeFilePreviewPage(state, state.target, 'staged', 1)
  // Active ID is deliberately not part of synchronization: Back and A/B selection retain the same open refs.
  const unchanged = synchronizeFilePreviewPagination(state, state.target, sources)
  expect(unchanged).toBe(state)
  expect(unchanged.pages.get('worktree')?.page).toBe(2)
  expect(unchanged.pages.get('staged')?.page).toBe(1)
  expect(unchanged.pages.get('other-file')?.page).toBe(0)
})

test('closed UUID is pruned and a stale page action cannot change a same-path reopened UUID', () => {
  let state = synchronizeFilePreviewPagination(empty(), empty().target, [source('old'), source('other')])
  state = changeFilePreviewPage(state, state.target, 'old', 2)
  state = synchronizeFilePreviewPagination(state, state.target, [source('new'), source('other')])
  expect(state.pages.has('old')).toBe(false)
  expect(state.pages.get('new')?.page).toBe(0)
  expect(changeFilePreviewPage(state, state.target, 'old', 1)).toBe(state)
  expect(changeFilePreviewPage(state, state.target, 'missing', 1)).toBe(state)
})

test('target changes isolate even identical preview IDs and reject an old target callback', () => {
  const original = empty().target
  let state = synchronizeFilePreviewPagination(empty(), original, [source('same-id')])
  state = changeFilePreviewPage(state, original, 'same-id', 2)
  state = synchronizeFilePreviewPagination(state, 'panel-b:workspace-b', [source('same-id')])
  expect(state.pages.get('same-id')?.page).toBe(0)
  expect(changeFilePreviewPage(state, original, 'same-id', 2)).toBe(state)
  state = synchronizeFilePreviewPagination(state, original, [source('same-id')])
  expect(state.pages.get('same-id')?.page).toBe(0)
})

test('successful content shortening commits its clamped page and later growth cannot resurrect an old page', () => {
  let state = synchronizeFilePreviewPagination(empty(), empty().target, [source('a'), source('b')])
  state = changeFilePreviewPage(state, state.target, 'a', 2)
  state = changeFilePreviewPage(state, state.target, 'b', 2)
  state = synchronizeFilePreviewPagination(state, state.target, [source('a', 500), source('b')])
  expect(state.pages.get('a')?.page).toBe(1)
  expect(state.pages.get('b')?.page).toBe(2)
  state = synchronizeFilePreviewPagination(state, state.target, [source('a'), source('b')])
  expect(state.pages.get('a')?.page).toBe(1)
  state = synchronizeFilePreviewPagination(state, state.target, [source('a', 1)])
  expect(state.pages.get('a')?.page).toBe(0)
  expect(state.pages.has('b')).toBe(false)
})

test('page memory has a hard 32 UUID bound, ignores duplicates and releases removed records', () => {
  const sources = Array.from({ length: 33 }, (_, index) => source(`id-${index}`))
  const state = synchronizeFilePreviewPagination(empty(), empty().target, [
    source(''),
    sources[0] ?? source('id-0'),
    ...sources,
  ])
  expect(state.pages.size).toBe(32)
  expect(state.pages.has('')).toBe(false)
  expect(state.pages.has('id-32')).toBe(false)
  expect(changeFilePreviewPage(state, state.target, 'id-32', 2)).toBe(state)
  const pruned = synchronizeFilePreviewPagination(state, state.target, sources.slice(1))
  expect(pruned.pages.size).toBe(32)
  expect(pruned.pages.has('id-0')).toBe(false)
  expect(pruned.pages.has('id-32')).toBe(true)
  expect(synchronizeFilePreviewPagination(pruned, pruned.target, []).pages.size).toBe(0)
})

test('reading offsets belong to the saved diff page, not another page or a clamped page', () => {
  const saved = { top: 420, left: 80, segment: 2 }
  expect(filePreviewReadingOffset(saved, 2)).toEqual({ top: 420, left: 80 })
  expect(filePreviewReadingOffset(saved, 1)).toEqual({ top: 0, left: 0 })
  expect(filePreviewReadingOffset(saved, undefined)).toEqual({ top: 0, left: 0 })
  expect(filePreviewReadingOffset(undefined, 2)).toEqual({ top: 0, left: 0 })
  expect(filePreviewReadingOffset({ top: 300, left: 10, segment: undefined }, undefined)).toEqual({
    top: 300,
    left: 10,
  })
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`controlled diff renders only the requested page with ${locale} Host copy, including long labels`, () => {
    const labels = getShellCopy(locale).files.changes
    const longLabel = `${labels.nextLines} — ${labels.readOnlyDiff} — ${labels.readOnlyDiff}`
    for (const status of ['ready', 'loading', 'error'] as const) {
      const html = renderToStaticMarkup(
        <HbarFileDiff
          diff={{ ...diff, status, error: status === 'error' ? 'CONNECTION_CLOSED' : null }}
          change={undefined}
          labels={{ ...labels, nextLines: longLabel }}
          connected
          pagination={{ page: 1, onChange: () => {} }}
          onOpen={() => {}}
          onFile={() => {}}
        />,
      )
      expect(html.match(/data-kind="addition"/g)).toHaveLength(400)
      expect(html).toContain('+unique-line-0401')
      expect(html).toContain('+unique-line-0800')
      expect(html).not.toContain('+unique-line-0400')
      expect(html).not.toContain('+unique-line-0801')
      expect(html).toContain(labels.linePage(401, 800, 1200))
      expect(html).toContain(longLabel)
    }
  })
}

test('legacy uncontrolled diff remains on its initial page and controlled out-of-range page renders a safe last page', () => {
  const labels = getShellCopy('en-US').files.changes
  const props = { diff, labels, change: undefined, connected: true, onOpen: () => {}, onFile: () => {} }
  const legacy = renderToStaticMarkup(<HbarFileDiff {...props} />)
  expect(legacy).toContain(labels.linePage(1, 400, 1200))
  expect(legacy).not.toContain('+unique-line-0401')
  const controlled = renderToStaticMarkup(<HbarFileDiff {...props} pagination={{ page: 99, onChange: () => {} }} />)
  expect(controlled).toContain(labels.linePage(801, 1200, 1200))
  expect(controlled).not.toContain('+unique-line-0800')
  expect(controlled).toContain('+unique-line-1200')
})

test('pagination hook exposes only the current real diff and does not invent a browser selection', () => {
  function Example({ activeId }: { readonly activeId: string | null }) {
    const pagination = useFilePreviewPagination('panel:workspace', [preview], activeId)
    return <output>{pagination ? String(pagination.page) : 'absent'}</output>
  }
  expect(renderToStaticMarkup(<Example activeId="diff-a" />)).toBe('<output>0</output>')
  expect(renderToStaticMarkup(<Example activeId={null} />)).toBe('<output>absent</output>')
  expect(renderToStaticMarkup(<Example activeId="closed" />)).toBe('<output>absent</output>')
})
