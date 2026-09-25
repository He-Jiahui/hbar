import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppSidebar03, type LumenAppSidebarWorkspaceContent } from '@lumen/app-ui'
import { HBAR_APP_UI_APP_SIDEBAR_FIXTURES } from './fixtures/hbar-app-ui-app-sidebar-fixtures'
import { appSidebarWorkspaceFixture } from './fixtures/hbar-app-ui-app-sidebar-workspace-fixtures'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'

const render = (workspacePreview: LumenAppSidebarWorkspaceContent) =>
  renderToStaticMarkup(
    createElement(LumenAppSidebar03, { content: { ...HBAR_APP_UI_APP_SIDEBAR_FIXTURES, workspacePreview } }),
  )

test('host workspace identity, search, three navigation groups and passive profile match the reference hierarchy', () => {
  const html = render(appSidebarWorkspaceFixture())
  expect(html).toContain('<aside')
  expect(html).toContain('aria-label="Search this workspace"')
  expect(html).toContain('<nav aria-label="Primary"')
  expect(html.match(/<ul>/g)).toHaveLength(3)
  expect(html.match(/href="#boards"/g)).toHaveLength(11)
  expect(html).toContain('Northwind Logistics')
  expect(html).toContain('Dana Mireles')
  expect(html).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
})

test('empty, one, default, 64 and 65 rows preserve explicit pane-scroll ownership', () => {
  for (const [mode, count] of [
    ['empty', 0],
    ['one', 1],
    [null, 11],
    ['boundary', 64],
    ['overflow', 65],
  ] as const) {
    const html = render(appSidebarWorkspaceFixture(mode))
    expect(html.match(/href="#boards"/g) ?? []).toHaveLength(count)
    if (!count) expect(html).toContain('No navigation items')
  }
})

test('host-owned workspace selection changes the identity without changing pinned navigation records', () => {
  const html = render(appSidebarWorkspaceFixture(null, 'atlas'))
  expect(html).toContain('Atlas Service Desk')
  expect(html).toContain('Search Atlas')
  expect(html).toContain('Escalation runbook')
  expect(html).not.toContain('aria-current="page"')
})

test('stale selected ID falls back to the first host workspace; duplicate row IDs are not rendered twice', () => {
  const content = appSidebarWorkspaceFixture()
  const row = content.groups[0]!.items[0]!
  const html = render({
    ...content,
    selectedWorkspaceId: 'removed',
    groups: [{ ...content.groups[0]!, items: [row, { ...row, label: 'Duplicate' }] }],
  })
  expect(html).toContain('Northwind Logistics')
  expect(html.match(/href="#boards"/g)).toHaveLength(1)
  expect(html).not.toContain('Duplicate')
})

test('localized long content and accessible labels come from the host', () => {
  const html = render(appSidebarWorkspaceFixture('localized'))
  expect(html).toContain('Primärnavigation')
  expect(html).toContain('ausführliche Beschreibung')
  expect(html).toContain('Administratorin')
})

test('sampling replays distinct workspace menu, search and link mechanisms without every sibling click', () => {
  const plan = auditSamplingPlan('hbar-app-ui-app-sidebar-3')
  expect(plan?.samples).toHaveLength(7)
  expect(plan?.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
})
