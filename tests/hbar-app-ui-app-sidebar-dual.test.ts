import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppSidebar04, type LumenAppSidebarDualContent } from '@lumen/app-ui'
import { HBAR_APP_UI_APP_SIDEBAR_FIXTURES } from './fixtures/hbar-app-ui-app-sidebar-fixtures'
import { appSidebarDualFixture } from './fixtures/hbar-app-ui-app-sidebar-dual-fixtures'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'

const render = (dualPreview: LumenAppSidebarDualContent) =>
  renderToStaticMarkup(
    createElement(LumenAppSidebar04, { content: { ...HBAR_APP_UI_APP_SIDEBAR_FIXTURES, dualPreview } }),
  )

test('dual sidebar has semantic rail, contextual panel, search and passive profile', () => {
  const html = render(appSidebarDualFixture())
  expect(html).toContain('<nav aria-label="Sections"')
  expect(html).toContain('<h2>Automations</h2>')
  expect(html).toContain('aria-label="New automation"')
  expect(html).toContain('aria-label="Search Automations"')
  expect(html).toContain('<nav aria-label="Automations pages"')
  expect(html.match(/<li>/g)).toHaveLength(10)
  expect(html).toContain('Ruben Cole')
  expect(html).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
})

test('all seven host section data sets have distinct 4/3/3 contextual groups', () => {
  const data = appSidebarDualFixture()
  expect(data.sections).toHaveLength(7)
  for (const section of data.sections) {
    expect(section.groups.map((group) => group.items.length)).toEqual([4, 3, 3])
    const html = render(appSidebarDualFixture(null, section.id))
    expect(html).toContain(`<h2>${section.label}</h2>`)
    expect(html).toContain(`aria-label="${section.navigation}"`)
  }
})

test('empty, one, normal, 64 and 65 pages preserve explicit pane-scroll capacity', () => {
  for (const [mode, count] of [
    ['empty', 0],
    ['one', 1],
    [null, 10],
    ['boundary', 64],
    ['overflow', 65],
  ] as const) {
    const html = render(appSidebarDualFixture(mode))
    expect(html.match(/<li>/g) ?? []).toHaveLength(count)
    if (!count) expect(html).toContain('No sections')
  }
})

test('stale section falls back to the first; duplicate stable IDs are not rendered twice', () => {
  const data = appSidebarDualFixture()
  const first = data.sections[0]!
  const item = first.groups[0]!.items[0]!
  const html = render({
    ...data,
    selectedSectionId: 'removed',
    sections: [
      { ...first, groups: [{ ...first.groups[0]!, items: [item, { ...item, label: 'Duplicate' }] }] },
      { ...first, label: 'Duplicate section' },
    ],
  })
  expect(html).toContain('<h2>Automations</h2>')
  expect(html.match(/<li>/g)).toHaveLength(1)
  expect(html).not.toContain('Duplicate')
})

test('long localized headings and controls remain host-owned', () => {
  const html = render(appSidebarDualFixture('localized'))
  expect(html).toContain('ausführliche Beschreibung')
  expect(html).toContain('Bereich durchsuchen')
  expect(html).toContain('Leitung für Automationen')
})

test('sampling distinguishes section replacement, page, search and no-op actions', () => {
  const plan = auditSamplingPlan('hbar-app-ui-app-sidebar-4')
  expect(plan?.samples).toHaveLength(5)
  expect(plan?.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
})
