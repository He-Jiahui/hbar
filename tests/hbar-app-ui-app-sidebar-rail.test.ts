import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppSidebar02, type LumenAppSidebarRailContent } from '@lumen/app-ui'
import { HBAR_APP_UI_APP_SIDEBAR_FIXTURES } from './fixtures/hbar-app-ui-app-sidebar-fixtures'
import { appSidebarRailFixture } from './fixtures/hbar-app-ui-app-sidebar-rail-fixtures'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'

const render = (railPreview: LumenAppSidebarRailContent) =>
  renderToStaticMarkup(
    createElement(LumenAppSidebar02, { content: { ...HBAR_APP_UI_APP_SIDEBAR_FIXTURES, railPreview } }),
  )

test('icon rail groups and footer are host-owned with semantic controls', () => {
  const html = render(appSidebarRailFixture())
  expect(html).toContain('<nav aria-label="Primary"')
  expect(html.match(/<ul>/g)).toHaveLength(2)
  expect(
    html.match(
      /aria-label="(?:Overview|Automation|Services|Data|Integrations|Governance|Monitoring|Releases|Environments|Credentials)"/g,
    ),
  ).toHaveLength(10)
  expect(html).toContain('aria-label="Support"')
  expect(html).toContain('aria-label="Your account"')
  expect(html).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  expect(html).not.toContain('Operations host')
})

test('empty, one, default, 64 and 65 items preserve the capacity boundary', () => {
  for (const [mode, count] of [
    ['empty', 0],
    ['one', 1],
    [null, 10],
    ['boundary', 64],
    ['overflow', 65],
  ] as const) {
    const html = render(appSidebarRailFixture(mode))
    expect(html.match(/<li>/g) ?? []).toHaveLength(count)
    if (!count) expect(html).toContain('No navigation items')
  }
})

test('stale selection and duplicate IDs do not invent state or duplicate a button', () => {
  const value = appSidebarRailFixture()
  const first = value.groups[0]!.items[0]!
  const html = render({
    ...value,
    selectedItemId: 'removed',
    groups: [{ ...value.groups[0]!, items: [first, { ...first, label: 'Duplicate' }] }],
  })
  expect(html.match(/<li>/g)).toHaveLength(1)
  expect(html).not.toContain('Duplicate')
  expect(html).not.toContain('class="is-active"')
})

test('non-default locale and long labels are supplied by the host', () => {
  const html = render(appSidebarRailFixture('localized'))
  expect(html).toContain('Primärnavigation')
  expect(html).toContain('ausführliche Beschreibung')
  expect(html).toContain('Hilfe')
  expect(html).not.toContain('Your account')
})

test('audit samples distinct flyout and account mechanisms, with repeated icons explicitly inferred', () => {
  const plan = auditSamplingPlan('hbar-app-ui-app-sidebar-2')
  expect(plan?.samples).toHaveLength(8)
  expect(plan?.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
})
