import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppSidebar05, type LumenAppSidebarTreeContent } from '@lumen/app-ui'
import { HBAR_APP_UI_APP_SIDEBAR_FIXTURES } from './fixtures/hbar-app-ui-app-sidebar-fixtures'
import { appSidebarTreeFixture } from './fixtures/hbar-app-ui-app-sidebar-tree-fixtures'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'

const render = (treePreview: LumenAppSidebarTreeContent) => renderToStaticMarkup(
  createElement(LumenAppSidebar05, { content: { ...HBAR_APP_UI_APP_SIDEBAR_FIXTURES, treePreview } }),
)

test('document tree exposes nested semantic lists, real controls and passive profile', () => {
  const html = render(appSidebarTreeFixture())
  expect(html).toContain('<h2>Knowledge base</h2>')
  expect(html).toContain('aria-label="Search documents"')
  expect(html).toContain('<nav aria-label="Documents"')
  expect(html).toContain('aria-label="Actions for Escalation runbook"')
  expect(html).toContain('aria-expanded="true"')
  expect(html.match(/<li>/g)).toHaveLength(16)
  expect(html).toContain('Lena Marchetti')
  expect(html).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
})

test('all four folders keep the observed 4/4/2/2 children and stable selected page', () => {
  const fixture = appSidebarTreeFixture()
  expect(fixture.folders.map((folder) => folder.documents.length)).toEqual([4, 4, 2, 2])
  expect(fixture.selectedDocumentId).toBe('escalation')
  expect(fixture.folders.flatMap((folder) => folder.documents).map((item) => item.label)).toContain(
    'North America field escalation protocol and exception notes',
  )
})

test('empty, one, 64 and 65 rows use explicit pane scrolling without clipping in code', () => {
  for (const [mode, count] of [['empty', 0], ['one', 2], ['boundary', 65], ['overflow', 66]] as const) {
    const html = render(appSidebarTreeFixture(mode))
    expect(html.match(/<li>/g) ?? []).toHaveLength(count)
  }
})

test('host-owned long localization and duplicate IDs remain bounded', () => {
  const localized = render(appSidebarTreeFixture('localized'))
  expect(localized).toContain('ausführliche Beschreibung')
  expect(localized).toContain('Aktionen für')
  const fixture = appSidebarTreeFixture()
  const first = fixture.folders[0]!
  const html = render({ ...fixture, folders: [first, { ...first, label: 'Duplicate folder' }] })
  expect(html).not.toContain('Duplicate folder')
  expect(html.match(/<li>/g)).toHaveLength(5)
})

test('audit samples distinct tree, menu and input mechanisms without repeating every row', () => {
  const plan = auditSamplingPlan('hbar-app-ui-app-sidebar-5')
  expect(plan?.samples).toHaveLength(7)
  expect(plan?.samples.some((sample) => sample.suffix === 'sidebar-tree-menu-open:4:click')).toBe(true)
  expect(plan?.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
})
