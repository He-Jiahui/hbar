import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppShell03, type LumenAppShellContractsContent } from '@lumen/app-ui'
import { HBAR_APP_UI_APP_SHELL_FIXTURES } from './fixtures/hbar-app-ui-app-shell-fixtures'
import { appShellContractsFixture } from './fixtures/hbar-app-ui-app-shell-contracts-fixtures'
import {
  createAppShellContractsPreviewStore,
  projectAppShellContractsPreview,
} from '../apps/hbar-app-ui-preview/src/app-shell-contracts-preview-model'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'
const render = (contracts: LumenAppShellContractsContent) =>
  renderToStaticMarkup(createElement(LumenAppShell03, { content: { ...HBAR_APP_UI_APP_SHELL_FIXTURES, contracts } }))
test('contract shell expresses topbar, grouped navigation, three metrics and both native table/card forms', () => {
  const html = render(appShellContractsFixture(null))
  expect(html).toContain('aria-label="Primary"')
  expect(html).toContain('role="radiogroup"')
  expect(html).toContain('Agreements by renewal date</caption>')
  expect((html.match(/data-record-id=/g) ?? []).length).toBe(28)
  expect((html.match(/<th /g) ?? []).length).toBe(5)
  expect(html).not.toContain('aria-pressed=')
  expect(html).not.toContain('Connected')
})
test('host filtering distinguishes signed and attention, composes trimmed case-insensitive search and resets both', () => {
  const content = appShellContractsFixture(null),
    store = createAppShellContractsPreviewStore()
  const view = () => projectAppShellContractsPreview(store.getState(), content)
  view().onFilterChange('signed')
  expect(view().records).toHaveLength(7)
  view().onFilterChange('attention')
  expect(view().records).toHaveLength(3)
  view().onSearchChange('no-match-test')
  expect(view().records).toHaveLength(0)
  expect(render(view())).toContain('No agreements match this search')
  expect(view().labels.recordsCount).toBe('0 of 14 agreements')
  view().onClearSearch()
  expect(view().filterId).toBe('all')
  expect(view().searchValue).toBe('')
  expect(view().records).toHaveLength(14)
  view().onSearchChange(' KESTREL ')
  expect(view().records).toHaveLength(2)
  expect(view().metrics).toBe(content.metrics)
  view().onSearchChange('Amara')
  expect(view().records).toHaveLength(0)
})
test('collapsed rail preserves accessible destinations while omitting headings/counts, and expands through host state', () => {
  const store = createAppShellContractsPreviewStore(),
    content = appShellContractsFixture(null)
  projectAppShellContractsPreview(store.getState(), content).onSidebarExpandedChange(false)
  const html = render(projectAppShellContractsPreview(store.getState(), content))
  expect(html).toContain('aria-label="Expand sidebar"')
  expect(html).toContain('aria-label="Renewals"')
  expect(html).not.toContain('Renewals</span><span')
  expect(html).not.toContain('<p>Organisation</p>')
  expect((html.match(/data-record-id=/g) ?? []).length).toBe(28)
})
test('records/navigation support empty, one, normal, boundary and one-over without slicing content', () => {
  const content = appShellContractsFixture(null)
  for (const count of [0, 1, 14, 100, 101]) {
    const html = render({
      ...content,
      records: Array.from({ length: count }, (_, i) => ({ ...content.records[0]!, id: `record-${i}` })),
    })
    expect((html.match(/data-record-id=/g) ?? []).length).toBe(count * 2)
    expect(html).toContain('data-lumen-list-strategy="pane-scroll"')
  }
  for (const count of [0, 1, 7, 50, 51]) {
    const html = render({
      ...content,
      sections: [
        {
          id: 'links',
          label: 'Links',
          links: Array.from({ length: count }, (_, i) => ({
            ...content.sections[0]!.links[0]!,
            id: `link-${i}`,
            href: '#link',
          })),
        },
      ],
    })
    expect((html.match(/href="#link"/g) ?? []).length).toBe(count)
  }
})
test('stale filters remain empty, duplicate records update in order, callbacks preserve original IDs', () => {
  const actions: string[] = [],
    content = appShellContractsFixture(null, (action, value) => actions.push(`${action}:${value ?? ''}`)),
    store = createAppShellContractsPreviewStore()
  const old = projectAppShellContractsPreview(store.getState(), content)
  old.onFilterChange('removed')
  expect(store.getState().filterId).toBe('all')
  store.getState().setFilter('removed')
  expect(projectAppShellContractsPreview(store.getState(), content).filterId).toBeNull()
  const html = render({
    ...content,
    records: [content.records[0]!, { ...content.records[0]!, title: 'Updated agreement' }],
    currentLinkId: 'removed',
  })
  expect((html.match(/data-record-id=/g) ?? []).length).toBe(2)
  expect(html).toContain('Updated agreement')
  expect(html).not.toContain('aria-current="page"')
  old.onRecord('agreement-0')
  old.onNavigate('renewals')
  old.onCreate()
  expect(actions).toEqual(['record:agreement-0', 'navigate:renewals', 'create:'])
})
test('localized fixtures and separate stores retain host copy, query and collapse independence', () => {
  const localized = render(appShellContractsFixture('localized'))
  expect(localized).toContain('Vertragsverwaltung')
  expect(localized).not.toContain('Upcoming renewals')
  const a = createAppShellContractsPreviewStore(),
    b = createAppShellContractsPreviewStore(),
    content = appShellContractsFixture(null)
  projectAppShellContractsPreview(a.getState(), content).onSearchChange('Kestrel')
  expect(projectAppShellContractsPreview(b.getState(), content).records).toHaveLength(14)
  expect(render(appShellContractsFixture('empty'))).toContain('No metrics available')
  expect(appShellContractsFixture('overflow').records).toHaveLength(101)
})
test('audit samples outcome branches, not every contract or header button', () => {
  const plan = auditSamplingPlan('hbar-app-ui-app-shell-3')!
  expect(plan.samples).toHaveLength(15)
  expect(plan.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
})
