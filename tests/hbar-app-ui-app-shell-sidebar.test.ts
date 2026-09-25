import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppShell01, type LumenAppShellSidebarContent } from '@lumen/app-ui'
import { HBAR_APP_UI_APP_SHELL_FIXTURES } from './fixtures/hbar-app-ui-app-shell-fixtures'
import { appShellSidebarFixture } from './fixtures/hbar-app-ui-app-shell-sidebar-fixtures'
import {
  createAppShellSidebarPreviewStore,
  projectAppShellSidebarPreview,
} from '../apps/hbar-app-ui-preview/src/app-shell-sidebar-preview-model'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'

const render = (sidebar: LumenAppShellSidebarContent) =>
  renderToStaticMarkup(createElement(LumenAppShell01, { content: { ...HBAR_APP_UI_APP_SHELL_FIXTURES, sidebar } }))
test('sidebar shell preserves navigation groups, breadcrumbs, four metrics and passive table/card semantics', () => {
  const html = render(appShellSidebarFixture(null))
  expect(html).toContain('data-lumen-variant="1"')
  expect(html).toContain('aria-label="Open navigation"')
  expect(html).toContain('aria-label="Breadcrumb"')
  expect(html).toContain('type="search"')
  expect(html).toContain('aria-haspopup="menu"')
  expect(html).toContain('Shipments currently in transit</caption>')
  expect((html.match(/<th /g) ?? []).length).toBe(6)
  expect((html.match(/data-record-id=/g) ?? []).length).toBe(28)
  expect(html).not.toContain('aria-pressed=')
  expect(html).not.toContain('Workspace overview')
  expect(html.indexOf('On-time delivery')).toBeLessThan(html.indexOf('Active shipments'))
  expect(html).toContain('data-tone="danger"')
})
test('host query accepts text without fabricating filtering, navigation or booking state', () => {
  const actions: string[] = []
  const content = appShellSidebarFixture(null, (action) => actions.push(action))
  const store = createAppShellSidebarPreviewStore()
  projectAppShellSidebarPreview(store.getState(), content).onSearchChange('Kettleworth')
  const next = projectAppShellSidebarPreview(store.getState(), content)
  expect(next.searchValue).toBe('Kettleworth')
  expect(next.records).toBe(content.records)
  next.onNavigate?.('pickup')
  next.onBook()
  next.onWorkspaceOptions()
  next.accountActions[0]!.onInvoke()
  expect(next.currentLinkId).toBe('transit')
  expect(actions).toEqual(['navigate', 'book', 'workspace-options', 'account'])
  expect(store.getState().query).toBe('Kettleworth')
})
test('empty, one, normal, boundary and one-over records remain in the main scroll owner', () => {
  const content = appShellSidebarFixture(null)
  for (const count of [0, 1, 14, 100, 101]) {
    const html = render({
      ...content,
      records: Array.from({ length: count }, (_, i) => ({ ...content.records[0]!, id: `record-${i}` })),
    })
    expect((html.match(/data-record-id=/g) ?? []).length).toBe(count * 2)
    expect(html).toContain('data-lumen-list-strategy="pane-scroll"')
    if (!count) expect(html).toContain('No shipments available')
  }
  for (const count of [0, 1, 5, 50, 51]) {
    const html = render({
      ...content,
      sections: [
        {
          id: 'facilities',
          label: 'Facilities',
          items: Array.from({ length: count }, (_, i) => ({
            id: `facility-${i}`,
            label: `Facility ${i}`,
            href: '#facilities',
          })),
        },
      ],
    })
    expect((html.match(/href="#facilities"/g) ?? []).length).toBe(count)
  }
})
test('duplicate IDs replace in stable order and stale current IDs do not silently select a different destination', () => {
  const content = appShellSidebarFixture(null)
  const html = render({
    ...content,
    currentLinkId: 'removed',
    records: [content.records[0]!, { ...content.records[0]!, consignee: 'Updated consignee' }],
    metrics: [content.metrics[0]!, { ...content.metrics[0]!, value: '95%' }],
  })
  expect((html.match(/data-record-id=/g) ?? []).length).toBe(2)
  expect(html).toContain('Updated consignee')
  expect(html).not.toContain('Brightwater Municipal Utilities District')
  expect(html).not.toContain('aria-current="page" data-muted')
  expect((html.match(/>95%</g) ?? []).length).toBe(1)
})
test('localized, empty and oversized fixtures exercise actual typed content contracts', () => {
  const localized = render(appShellSidebarFixture('localized'))
  expect(localized).toContain('Sendung buchen')
  expect(localized).toContain('Internationale Frachtabwicklung')
  expect(localized).not.toContain('Book shipment')
  expect(localized).not.toContain('Account settings')
  const empty = render(appShellSidebarFixture('empty'))
  expect(empty).toContain('No navigation available')
  expect(empty).toContain('No metrics available')
  expect(empty).toContain('No shipments available')
  expect(appShellSidebarFixture('overflow').records).toHaveLength(101)
})
test('separate host instances retain independent query and callbacks', () => {
  const a = createAppShellSidebarPreviewStore()
  const b = createAppShellSidebarPreviewStore()
  const events: string[] = []
  const old = projectAppShellSidebarPreview(
    a.getState(),
    appShellSidebarFixture(null, () => events.push('a')),
  )
  const next = projectAppShellSidebarPreview(
    b.getState(),
    appShellSidebarFixture(null, () => events.push('b')),
  )
  old.onSearchChange('old host')
  old.onBook()
  next.onBook()
  expect(a.getState().query).toBe('old host')
  expect(b.getState().query).toBe('')
  expect(events).toEqual(['a', 'b'])
})
test('audit samples independent shell behavior and labels equivalence as inference', () => {
  const plan = auditSamplingPlan('hbar-app-ui-app-shell-1')!
  expect(plan.samples).toHaveLength(11)
  expect(plan.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
  expect(plan.samples.some((sample) => sample.suffix.startsWith('shell-navigation-closed'))).toBe(true)
})
