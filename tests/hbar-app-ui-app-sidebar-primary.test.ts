import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppSidebar01, type LumenAppSidebarPrimaryContent } from '@lumen/app-ui/catalog'
import { HBAR_APP_UI_APP_SIDEBAR_FIXTURES } from './fixtures/hbar-app-ui-app-sidebar-fixtures'
import { appSidebarPrimaryFixture } from './fixtures/hbar-app-ui-app-sidebar-primary-fixtures'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'

const render = (primary: LumenAppSidebarPrimaryContent) =>
  renderToStaticMarkup(createElement(LumenAppSidebar01, { content: { ...HBAR_APP_UI_APP_SIDEBAR_FIXTURES, primary } }))

test('primary variant renders host groups as semantic links and a distinct profile/menu trigger', () => {
  const html = render(appSidebarPrimaryFixture())
  expect(html).toContain('<nav aria-label="Primary"')
  expect(html.match(/href="#command-center"/g)).toHaveLength(11)
  expect(html).toContain('Command center')
  expect(html).toContain('Automations')
  expect(html).toContain('Iris Renner')
  expect(html).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  expect(html).not.toContain('Operations host')
})

test('empty, one, default, 64 and 65 rows retain pane-scrolling content without slicing', () => {
  for (const [mode, count] of [
    ['empty', 0],
    ['one', 1],
    [null, 11],
    ['boundary', 64],
    ['overflow', 65],
  ] as const) {
    const html = render(appSidebarPrimaryFixture(mode))
    expect(html.match(/href="#command-center"/g) ?? []).toHaveLength(count)
    if (count === 0) expect(html).toContain('No navigation items')
  }
})

test('stale active ID and duplicate ID do not invent a selection or duplicate a row', () => {
  const value = appSidebarPrimaryFixture()
  const first = value.groups[0]!.items[0]!
  const changed: LumenAppSidebarPrimaryContent = {
    ...value,
    activeItemId: 'removed',
    groups: [{ ...value.groups[0]!, items: [first, { ...first, label: 'Duplicate' }] }],
  }
  const html = render(changed)
  expect(html.match(/href="#command-center"/g)).toHaveLength(1)
  expect(html).not.toContain('Duplicate')
  expect(html).not.toContain('class="is-active"')
})

test('non-default locale and long labels remain host-owned, with original stable action IDs', () => {
  const value = appSidebarPrimaryFixture('localized')
  const html = render(value)
  expect(html).toContain('Primärnavigation')
  expect(html).toContain('ausführliche Beschreibung')
  expect(html).toContain('Leitung für den Betrieb')
  expect(html).not.toContain('Operations lead')
  expect(value.groups[0]?.items[0]?.id).toBe('command')
})

test('sampled feedback distinguishes navigation, collapse, profile menu and mobile drawer', () => {
  const plan = auditSamplingPlan('hbar-app-ui-app-sidebar-1')
  expect(plan?.samples).toHaveLength(5)
  expect(plan?.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
})
