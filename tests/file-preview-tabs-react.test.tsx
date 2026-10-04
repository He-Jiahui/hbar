import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarFilePreviewTabs,
  uniqueFilePreviews,
  filePreviewCloseTargets,
  type HbarFilePreviewItem,
} from '@hbar/app-react'
import { LumenFileDocument, LumenButton } from '@lumen/app-ui'
import { getShellCopy } from '../apps/web/src/shell-copy'

const labels = getShellCopy('zh-CN').files
const item = (index: number): HbarFilePreviewItem => ({
  id: `preview-${index}`,
  path: `src/非常长的本地化文件目录${index}/同名文件.ts`,
  kind: 'document',
  protection: null,
})
const props = { labels: labels.previews, onSelect: () => {}, onClose: () => {} }
test('preview strip handles empty, one, normal, boundary and over-boundary content without view-side truncation', () => {
  expect(renderToStaticMarkup(<HbarFilePreviewTabs {...props} items={[]} activeId={null} />)).toBe('')
  for (const count of [1, 4, 32, 33]) {
    const html = renderToStaticMarkup(
      <HbarFilePreviewTabs {...props} items={Array.from({ length: count }, (_, i) => item(i))} activeId="preview-0" />,
    )
    expect(html.match(/role="tab"/g)).toHaveLength(count)
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(html).toContain(labels.previews.tab(item(count - 1).path, 'document'))
    expect(html).toContain('aria-controls="file-preview-panel-preview-0"')
  }
})
test('preview duplicate and missing identities do not fabricate a selected item', () => {
  const items = [item(0), { ...item(0), path: 'duplicate' }, { ...item(1), id: '' }, item(2)]
  expect(uniqueFilePreviews(items).map((value) => value.id)).toEqual(['preview-0', 'preview-2'])
  const html = renderToStaticMarkup(<HbarFilePreviewTabs {...props} items={items} activeId="removed" />)
  expect(html.match(/role="tab"/g)).toHaveLength(2)
  expect(html.match(/tabindex="0"/g)).toHaveLength(1)
  expect(html).not.toContain('aria-selected="true"')
  expect(html).not.toContain('duplicate')
})
test('same-path content, worktree and staged previews keep distinct localized identities and protection hints', () => {
  const items: HbarFilePreviewItem[] = [
    { ...item(0), protection: 'unknown' },
    { ...item(0), id: 'worktree', kind: 'working' },
    { ...item(0), id: 'index', kind: 'staged' },
  ]
  const html = renderToStaticMarkup(<HbarFilePreviewTabs {...props} items={items} activeId="index" />)
  for (const value of items) {
    expect(html).toContain(labels.previews.tab(value.path, value.kind))
    expect(html).toContain(labels.previews.close(value.path, value.kind))
  }
  expect(html).toContain(labels.previews.status('unknown'))
  expect(html).not.toContain(labels.previews.status('submitting'))
})
test('menu scope is calculated from captured lifetimes, not a later reopened pathname', () => {
  const captured = ['a-old', 'b', 'c', 'd']
  const current = ['a-new', 'b', 'c', 'd', 'e']
  expect(filePreviewCloseTargets(captured, 'b', 'current')).toEqual(['b'])
  expect(filePreviewCloseTargets(captured, 'b', 'others')).toEqual(['a-old', 'c', 'd'])
  expect(filePreviewCloseTargets(captured, 'b', 'left')).toEqual(['a-old'])
  expect(filePreviewCloseTargets(captured, 'b', 'right')).toEqual(['c', 'd'])
  expect(filePreviewCloseTargets(captured, 'b', 'all')).toEqual(captured)
  expect(filePreviewCloseTargets(captured, 'missing', 'all')).toEqual([])
  expect(current).toEqual(['a-new', 'b', 'c', 'd', 'e'])
})
test('document opt-in keeps confirmed content during refresh while legacy loading stays a placeholder', () => {
  const render = (retain: boolean, available = true) =>
    renderToStaticMarkup(
      <LumenFileDocument
        path="original.txt"
        labels={labels}
        loading
        contentAvailable={available}
        retainContentWhileLoading={retain}
        onRetry={() => {}}
        headerActions={<LumenButton>{labels.previews.close('original.txt', 'document')}</LumenButton>}
      >
        <textarea aria-label="original.txt" defaultValue="confirmed body" />
      </LumenFileDocument>,
    )
  expect(render(false)).not.toContain('confirmed body')
  expect(render(true)).toContain('confirmed body')
  expect(render(true)).toContain('aria-busy="true"')
  expect(render(true)).toContain(labels.previews.close('original.txt', 'document'))
  expect(render(true, false)).not.toContain('confirmed body')
  expect(render(true, false)).toContain(labels.loading)
})
