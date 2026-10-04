import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppSidebar06, type LumenAppSidebarDrawerContent } from '@lumen/app-ui'
import { HBAR_APP_UI_APP_SIDEBAR_FIXTURES } from './fixtures/hbar-app-ui-app-sidebar-fixtures'
import { appSidebarDrawerFixture } from './fixtures/hbar-app-ui-app-sidebar-drawer-fixtures'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'

const render = (drawerPreview: LumenAppSidebarDrawerContent) => renderToStaticMarkup(
  createElement(LumenAppSidebar06, { content: { ...HBAR_APP_UI_APP_SIDEBAR_FIXTURES, drawerPreview } }),
)

test('drawer keeps opener, scrim and semantic dialog in source reading order', () => {
  const html = render(appSidebarDrawerFixture())
  expect(html.indexOf('aria-label="Open navigation"')).toBeLessThan(html.indexOf('aria-label="Close navigation overlay"'))
  expect(html.indexOf('aria-label="Close navigation overlay"')).toBeLessThan(html.indexOf('role="dialog"'))
  expect(html).toContain('aria-expanded="true"')
  expect(html).toContain('role="dialog" aria-modal="true" aria-label="Navigation"')
  expect(html).toContain('<nav class="lumen-drawer-navigation" aria-label="Primary"')
  expect(html).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  expect(html.match(/<li>/g)).toHaveLength(12)
  expect(html).toContain('Priya Nair')
})

test('three host groups retain the observed 4/5/3 links and explicit badges', () => {
  const fixture = appSidebarDrawerFixture()
  expect(fixture.groups.map((group) => group.items.length)).toEqual([4, 5, 3])
  expect(fixture.groups.flatMap((group) => group.items).map((item) => item.href)).toEqual(
    Array.from({ length: 12 }, () => '#home'),
  )
  const html = render(fixture)
  expect(html).toContain('Inbox</span><span class="lumen-drawer-badge">6</span>')
  expect(html).toContain('Tasks</span><span class="lumen-drawer-badge">4</span>')
})

test('empty, one, 64 and 65 links use a pane-owned scrolling region', () => {
  expect(appSidebarDrawerFixture().listStrategy).toEqual({ kind: 'pane-scroll', expectedMaximum: 64 })
  for (const [mode, count] of [['empty', 0], ['one', 1], ['boundary', 64], ['overflow', 65]] as const) {
    const html = render(appSidebarDrawerFixture(mode))
    expect(html.match(/<li>/g) ?? []).toHaveLength(count)
    if (!count) expect(html).toContain('No navigation items')
  }
})

test('stale and duplicate IDs fall back to the first unique link without hard-coded copy', () => {
  const fixture = appSidebarDrawerFixture()
  const group = fixture.groups[0]!
  const html = render({
    ...fixture,
    selectedItemId: 'removed',
    groups: [{ ...group, items: [group.items[0]!, { ...group.items[0]!, label: 'Duplicate' }] }],
  })
  expect(html).toContain('class="is-active"')
  expect(html).not.toContain('Duplicate')
  expect(html.match(/<li>/g)).toHaveLength(1)
  const localized = render(appSidebarDrawerFixture('localized'))
  expect(localized).toContain('ausführliche Team-Navigation')
  expect(localized).toContain('Navigation öffnen')
})

test('sampling covers drawer transitions and representative link feedback, not each row', () => {
  const plan = auditSamplingPlan('hbar-app-ui-app-sidebar-6')
  expect(plan?.samples).toHaveLength(6)
  expect(plan?.samples.some((sample) => sample.suffix === 'sidebar-drawer-closed:0:click')).toBe(true)
  expect(plan?.samples.some((sample) => sample.viewport === 'stress' && sample.suffix === '1:click')).toBe(true)
  expect(plan?.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
})
