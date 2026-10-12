import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppShell07, type LumenAppShellScopeContent } from '@lumen/app-ui/catalog'
import { HBAR_APP_UI_APP_SHELL_FIXTURES } from './fixtures/hbar-app-ui-app-shell-fixtures'
import { appShellScopeFixture } from './fixtures/hbar-app-ui-app-shell-scope-fixtures'
import {
  createAppShellScopePreviewStore,
  projectAppShellScopePreview,
} from '../apps/hbar-app-ui-preview/src/app-shell-scope-preview-model'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'
const render = (scope: LumenAppShellScopeContent) =>
  renderToStaticMarkup(createElement(LumenAppShell07, { content: { ...HBAR_APP_UI_APP_SHELL_FIXTURES, scope } }))
const setup = (mode: string | null = null) => {
  const store = createAppShellScopePreviewStore(),
    fixture = appShellScopeFixture(mode)
  return { store, fixture, view: () => projectAppShellScopePreview(store.getState(), fixture, mode) }
}
test('scope shell exposes native database table, navigation tree and compact cards, not generic selects', () => {
  const html = render(setup().view())
  expect(html).toContain('<table>')
  expect(html).toContain('<caption')
  expect(html.match(/<th /g)).toHaveLength(5)
  expect(html).toContain('aria-label="Scope"')
  expect(html).toContain('aria-current="page"')
  expect(html).not.toContain('<select')
  expect(html).toContain('payments-api-read-replica-analytics-frankfurt-standby')
})
test('organisation is independent; project changes names; environment changes dataset and health', () => {
  const { view } = setup(),
    initial = view().databases
  view().onScope('organisation', 'halden')
  expect(view().databases).toEqual(initial)
  view().onScope('project', 'ledger-core')
  expect(view().databases[0]?.name).toBe('ledger-core-primary')
  expect(view().databases[0]?.connections).toBe('184')
  view().onScope('environment', 'staging')
  expect(view().databases).toHaveLength(13)
  expect(view().status.degraded).toBe(false)
  expect(view().databases[0]?.connections).toBe('24')
  view().onScope('environment', 'preview')
  expect(view().databases).toHaveLength(13)
  expect(view().databases[1]?.name).toBe('ledger-core-pr-4821')
  expect(view().databases[0]?.connections).toBe('3')
  view().onScope('environment', 'production')
  expect(view().databases).toHaveLength(14)
  expect(view().status.regions).toHaveLength(5)
})
test('controlled search is retained across selections without inventing filtering', () => {
  const { view } = setup()
  view().onQuery('zzzaudit')
  view().onScope('project', 'ledger-core')
  expect(view().query).toBe('zzzaudit')
  expect(view().databases).toHaveLength(14)
  expect(render(view())).toContain('value="zzzaudit"')
})
test('collapsible data group keeps its stable children in the DOM while hiding them', () => {
  const html = render(setup().view())
  expect(html).toContain('<ul><li><a href="#databases" aria-current="page">')
  expect(html).toContain('aria-expanded="true"')
})
test('localization belongs to host; same IDs survive locale switch and long labels', () => {
  const { store } = setup()
  store.getState().select('project', 'ledger-core')
  const view = projectAppShellScopePreview(store.getState(), appShellScopeFixture('localized'), 'localized'),
    html = render(view)
  expect(html).toContain('Forschungsorganisation')
  expect(html).toContain('Datenbank erstellen')
  expect(html).toContain('Beeinträchtigt')
  expect(html).not.toContain('Create database')
  expect(view.pickers.project.selectedId).toBe('ledger-core')
})
test('empty, single, normal, 100 and one-over records use pane-owned data without truncating inventory', () => {
  for (const [mode, count] of [
    ['empty', 0],
    ['one', 1],
    [null, 14],
    ['boundary', 100],
    ['overflow', 101],
  ] as const) {
    const value = setup(mode).view(),
      html = render(value)
    expect(value.databases).toHaveLength(count)
    expect(html.match(/<tr>/g) ?? []).toHaveLength(count ? count + 1 : 0)
    if (!count) expect(html).toContain('No databases in this environment.')
  }
})
test('duplicate records de-duplicate by stable ID, stale scope is empty and unknown callbacks are rejected', () => {
  const { fixture, store } = setup(),
    first = fixture.databases[0]
  if (!first) throw new Error('Missing database fixture')
  const html = render({ ...fixture, databases: [first, { ...first, name: 'Updated record' }] })
  expect(html.match(/<tr>/g)).toHaveLength(2)
  expect(html).toContain('Updated record')
  const events: string[] = []
  const value = projectAppShellScopePreview(
    store.getState(),
    appShellScopeFixture(null, (action, id) => events.push(`${action}:${id}`)),
  )
  value.onScope('project', 'unknown')
  expect(events).toHaveLength(0)
  const original = () => value.onScope('project', 'ledger-core')
  value.onScope('organisation', 'halden')
  original()
  expect(events).toEqual(['scope:organisation:halden', 'scope:project:ledger-core'])
  store.getState().select('project', 'removed')
  const stale = projectAppShellScopePreview(store.getState(), fixture)
  expect(stale.pickers.project.selectedId).toBeNull()
  expect(stale.databases).toHaveLength(0)
  expect(render(stale)).toContain('No scope selected')
})
test('blank scope options and stale navigation/account IDs are ignored', () => {
  const actions: string[] = []
  const fixture = appShellScopeFixture(null, (action, id) => actions.push(`${action}:${id ?? ''}`))
  const store = createAppShellScopePreviewStore()
  const view = projectAppShellScopePreview(store.getState(), fixture)
  view.onScope('project', ' ')
  view.onAction('navigate', ' ')
  view.onAction('account', 'removed')
  expect(store.getState().selections.project).toBe('payments-api')
  expect(actions).toEqual([])
})
test('scope sampling covers distinct changes while explicitly inferring repeated buttons', () => {
  const plan = auditSamplingPlan('hbar-app-ui-app-shell-7')
  expect(plan?.samples).toHaveLength(16)
  expect(plan?.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
})
