import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarFileChanges, HbarFileDiff } from '../packages/app-react/src/file-workspace-changes'
import { getShellCopy } from '../apps/web/src/shell-copy'

test('Changed list renders only the current 100 rows and preserves its localized path filter and count', () => {
  const labels = getShellCopy('zh-CN').files.changes
  const changes = {
    status: 'ready' as const,
    isRepository: true,
    cwd: '/repo',
    root: '/repo',
    branch: 'main',
    error: null,
    items: Array.from({ length: 5000 }, (_, index) => ({
      path: `很长的目录/文件-${String(index).padStart(4, '0')}.ts`,
      index: ' ',
      worktree: 'M',
    })),
    filter: '',
    page: 49,
    limitReached: true,
  }
  const html = renderToStaticMarkup(
    <HbarFileChanges
      changes={changes}
      labels={labels}
      connected
      selectedPath="很长的目录/文件-4999.ts"
      onRefresh={() => {}}
      onFilter={() => {}}
      onPage={() => {}}
      onOpen={() => {}}
    />,
  )
  expect(html.match(/(?:class="|\s)hbar-file-change(?=\s|")/g)).toHaveLength(100)
  expect(html).toContain('很长的目录/文件-4999.ts')
  expect(html).not.toContain('很长的目录/文件-4800.ts')
  expect(html).toContain(labels.page(4901, 5000, 5000))
  expect(html).toContain(labels.limit)
  expect(html).toContain(labels.filter)
  expect(html.match(/aria-current="page"/g)).toHaveLength(1)
})

test('read-only diff bounds lines, displays truncation separately, and keeps comparison actions', () => {
  const labels = getShellCopy('en-US').files.changes
  const text = Array.from({ length: 1200 }, (_, index) => `+line ${index}`).join('\n')
  const html = renderToStaticMarkup(
    <HbarFileDiff
      diff={{ path: 'long/source.ts', cached: true, status: 'ready', text, truncated: true, error: null }}
      change={{ path: 'long/source.ts', index: 'M', worktree: 'M' }}
      labels={labels}
      connected
      onOpen={() => {}}
      onFile={() => {}}
    />,
  )
  expect(html.match(/data-kind="addition"/g)).toHaveLength(400)
  expect(html).toContain('+line 399')
  expect(html).not.toContain('+line 400')
  expect(html).toContain(labels.linePage(1, 400, 1200))
  expect(html).toContain(labels.truncated)
  expect(html).toContain('aria-pressed="true"')
  expect(html).toContain(labels.openFile)
})
