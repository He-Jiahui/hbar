import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppSidebar07, type LumenAppSidebarFullContent } from '@lumen/app-ui/catalog'
import { HBAR_APP_UI_APP_SIDEBAR_FIXTURES } from './fixtures/hbar-app-ui-app-sidebar-fixtures'
import { appSidebarFullFixture } from './fixtures/hbar-app-ui-app-sidebar-full-fixtures'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'

const render = (fullPreview: LumenAppSidebarFullContent) => renderToStaticMarkup(
  createElement(LumenAppSidebar07, { content: { ...HBAR_APP_UI_APP_SIDEBAR_FIXTURES, fullPreview } }),
)

test('desktop complement and narrow dialog reuse the same host-owned navigation structure', () => {
  const html = render(appSidebarFullFixture())
  expect(html).toContain('<aside class="lumen-full-desktop">')
  expect(html).toContain('aria-label="Open navigation" aria-expanded="true"')
  expect(html).toContain('aria-label="Close navigation overlay"')
  expect(html).toContain('role="dialog" aria-modal="true" aria-label="Navigation"')
  expect(html.match(/<nav class="lumen-full-navigation" aria-label="Primary"/g)).toHaveLength(2)
  expect(html.match(/<li>/g)).toHaveLength(26)
  expect(html.match(/href="#help"/g)).toHaveLength(2)
  expect(html).toContain('Dana Mireles')
})

test('four groups preserve distinct 2/5/3/3 rows, badge and footer link', () => {
  const fixture = appSidebarFullFixture()
  expect(fixture.groups.map((group) => group.items.length)).toEqual([2, 5, 3, 3])
  expect(fixture.groups.flatMap((group) => group.items).map((item) => item.href)).toEqual(
    Array.from({ length: 13 }, () => '#nav'),
  )
  expect(fixture.footerLink.href).toBe('#help')
  expect(render(fixture)).toContain('Pipelines</span><span class="lumen-full-badge">9</span>')
})

test('empty, one, 64 and 65 records use the explicit pane-owned scroll contract', () => {
  expect(appSidebarFullFixture().listStrategy).toEqual({ kind: 'pane-scroll', expectedMaximum: 64 })
  for (const [mode, count] of [['empty', 0], ['one', 1], ['boundary', 64], ['overflow', 65]] as const) {
    const html = render(appSidebarFullFixture(mode))
    expect(html.match(/<li>/g) ?? []).toHaveLength(count * 2)
    if (!count) expect(html).toContain('No navigation items')
  }
})

test('stale and duplicate IDs fall back to the first unique link; translated copy stays in the host', () => {
  const fixture = appSidebarFullFixture()
  const group = fixture.groups[0]!
  const html = render({
    ...fixture,
    selectedItemId: 'removed',
    groups: [{ ...group, items: [group.items[0]!, { ...group.items[0]!, label: 'Duplicate' }] }],
  })
  expect(html.match(/class="is-active"/g)).toHaveLength(2)
  expect(html).not.toContain('Duplicate')
  expect(html.match(/<li>/g)).toHaveLength(2)
  const localized = render(appSidebarFullFixture('localized'))
  expect(localized).toContain('ausführliche Erlösübersicht')
  expect(localized).toContain('Navigation öffnen')
})

test('audit groups the desktop and narrow transitions without per-link replay', () => {
  const plan = auditSamplingPlan('hbar-app-ui-app-sidebar-7')
  expect(plan?.samples).toHaveLength(8)
  expect(plan?.samples.some((sample) => sample.suffix === 'sidebar-full-closed:14:click')).toBe(true)
  expect(plan?.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
})
