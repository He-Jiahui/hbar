import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { WorkspaceFoldersState } from '@hbar/app-runtime'
import { WorkspaceFoldersDialog } from '../packages/app-react/src/workspace-folders'
import { workspaceFoldersCopy } from '../apps/web/src/workspace-folders-copy'

function state(count = 0): WorkspaceFoldersState {
  return {
    open: true,
    token: 1,
    workspaceId: null,
    phase: 'editing',
    status: 'ready',
    folders: Array.from({ length: count }, (_, index) => ({
      id: `root-${index}`,
      alias: `folder-${index}`,
      path: `D:/long/${'nested/'.repeat(40)}${index}`,
    })),
    snapshot: null,
    path: '',
    page: null,
    selected: [],
    error: null,
    validation: null,
    request: null,
    key: null,
    requestInFlight: false,
    result: null,
  }
}
function render(value: WorkspaceFoldersState, locale: 'zh-CN' | 'en-US' = 'en-US', connected = true) {
  return renderToStaticMarkup(
    <WorkspaceFoldersDialog
      state={value}
      labels={workspaceFoldersCopy(locale)}
      connected={connected}
      execute={() => {}}
    />,
  )
}
for (const locale of ['zh-CN', 'en-US'] as const) {
  for (const count of [0, 1, 32]) {
    test(`folder editor preserves Host copy, stable row identities and capacity ${locale} ${count}`, () => {
      const html = render(state(count), locale)
      const labels = workspaceFoldersCopy(locale)
      expect(html).toContain(labels.create)
      expect(html).toContain(labels.count(count, 32))
      expect(html.match(/data-folder-id=/g) ?? []).toHaveLength(count)
      expect(html).not.toContain('<select')
      expect(html).not.toContain('<option')
      if (count === 0) expect(html).toContain(labels.empty)
      else expect(html).toContain(labels.primary)
    })
  }
}
test('unknown save exposes reconciliation and original retry, never an enabled new save', () => {
  const html = render({ ...state(1), status: 'unknown', key: 'original-key' })
  const labels = workspaceFoldersCopy('en-US')
  expect(html).toContain(labels.reconcile)
  expect(html).toContain(labels.retry)
  const save = [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].find((match) =>
    match[0].includes(labels.save),
  )?.[0]
  expect(save).toContain('disabled')
  const inFlight = render({ ...state(1), status: 'unknown', requestInFlight: true })
  for (const label of [labels.reconcile, labels.retry]) {
    const button = [...inFlight.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].find((match) =>
      match[0].includes(label),
    )?.[0]
    expect(button).toContain('disabled')
  }
})
test('empty browse page retains multi-selection and uses a componentized quick-location picker', () => {
  const html = render({
    ...state(),
    phase: 'browsing',
    selected: ['D:/selected/one'],
    page: {
      path: 'D:/current',
      parent: 'D:/',
      roots: [{ name: 'D:', path: 'D:/' }],
      items: [],
      nextCursor: null,
      scanTruncated: false,
    },
  })
  const labels = workspaceFoldersCopy('en-US')
  expect(html).toContain(labels.emptyDirectory)
  expect(html).toContain(labels.selected(1))
  expect(html).toContain('role="combobox"')
  expect(html).not.toContain('<select')
  expect(render({ ...state(), open: false })).toBe('')
})
