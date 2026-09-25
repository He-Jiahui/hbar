import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppShell04 } from '@lumen/app-ui'
import { HBAR_APP_UI_APP_SHELL_FIXTURES } from './fixtures/hbar-app-ui-app-shell-fixtures'
import { appShellEditorialFixture } from './fixtures/hbar-app-ui-app-shell-editorial-fixtures'
import {
  createAppShellEditorialPreviewStore,
  projectAppShellEditorialPreview,
} from '../apps/hbar-app-ui-preview/src/app-shell-editorial-preview-model'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'
const setup = (mode: string | null = null) => {
  const fixture = appShellEditorialFixture(mode),
    store = createAppShellEditorialPreviewStore()
  return { fixture, store, view: () => projectAppShellEditorialPreview(store.getState(), fixture) }
}
const render = (content: ReturnType<typeof setup>['fixture']) =>
  renderToStaticMarkup(
    createElement(LumenAppShell04, { content: { ...HBAR_APP_UI_APP_SHELL_FIXTURES, editorial: content } }),
  )
test('editorial contracts preserve native table/card records, passive account and grouped navigation', () => {
  const { fixture, view } = setup(),
    html = render({ ...fixture, ...view() })
  expect(html).toContain('Stories waiting to be published</caption>')
  expect(html).toContain('aria-label="Breadcrumb"')
  expect(html).toContain('aria-current="page"')
  expect((html.match(/data-story-id=/g) ?? []).length).toBe(32)
  expect((html.match(/<th/g) ?? []).length).toBe(5)
  expect(html).not.toContain('role="button"')
})
test('filters affect stories only, and calendar selection projects future agenda rather than exact-day events', () => {
  const { view } = setup()
  view().onFilter('review')
  expect(view().stories).toHaveLength(4)
  expect(view().events).toHaveLength(9)
  view().onFilter('edits')
  expect(view().stories).toHaveLength(2)
  view().onDate('2026-08-13')
  expect(
    view()
      .weeks.flat()
      .filter((day) => day.isToday)
      .map((day) => day.id),
  ).toEqual(['2026-08-12'])
  expect(view().selectedDate).toBe('2026-08-13')
  expect(view().events).toHaveLength(8)
  expect(view().events[0]?.id).toBe('event-1')
  expect(view().stories).toHaveLength(2)
  view().onDate('2026-09-01')
  expect(view().events).toHaveLength(0)
  expect(view().labels.emptyScheduleDetail).toBe('The calendar is clear after Sep 1.')
  expect(view().month).toBe('August 2026')
  view().onToday()
  expect(view().events).toHaveLength(9)
  expect(view().filterId).toBe('edits')
})
test('month navigation retains selected date and agenda, always supplies six seven-day weeks and crosses years', () => {
  const { store, view } = setup()
  expect(view().weeks).toHaveLength(6)
  expect(view().weeks.every((week) => week.length === 7)).toBe(true)
  expect(view().weeks[0]?.[0]?.id).toBe('2026-07-26')
  view().onMonth(1)
  expect(view().month).toBe('September 2026')
  expect(view().selectedDate).toBe('2026-08-12')
  expect(view().events).toHaveLength(9)
  view().onDate('2026-09-01')
  view().onToday()
  expect(view().selectedDate).toBe('2026-08-12')
  expect(view().month).toBe('September 2026')
  store.getState().setMonth('2026-12-01')
  view().onMonth(1)
  expect(view().month).toBe('January 2027')
  view().onMonth(-1)
  expect(view().month).toBe('December 2026')
})
test('stale/invalid values stay explicit and callbacks retain the original target after state mutation', () => {
  const actions: string[] = [],
    fixture = appShellEditorialFixture(null, (id, value) => actions.push(`${id}:${value ?? ''}`)),
    store = createAppShellEditorialPreviewStore()
  const view = () => projectAppShellEditorialPreview(store.getState(), fixture),
    old = view()
  old.onDate('2026-02-30')
  expect(view().selectedDate).toBe('2026-08-12')
  old.onFilter('removed')
  expect(view().filterId).toBe('all')
  view().onMonth(1)
  old.onDate('2026-08-13')
  old.onEvent('event-1')
  old.onNavigate('assignments')
  expect(actions).toEqual(['month:1', 'date:2026-08-13', 'event:event-1', 'navigate:assignments'])
  store.getState().setFilter('removed')
  store.getState().setDate('not-a-date')
  store.getState().setMonth('not-a-date')
  expect(view().filterId).toBeNull()
  expect(view().stories).toHaveLength(0)
  expect(view().selectedDate).toBeNull()
  expect(view().events).toHaveLength(0)
  expect(view().weeks).toHaveLength(0)
})
test('empty, one, normal, boundary and one-over collections remain reachable without silently slicing', () => {
  const { fixture, store } = setup()
  for (const count of [0, 1, 16, 100, 101]) {
    const input = {
      ...fixture,
      inventory: Array.from({ length: count }, (_, i) => ({ ...fixture.inventory[0]!, id: `s-${i}` })),
      agenda: Array.from({ length: count }, (_, i) => ({ ...fixture.agenda[0]!, id: `e-${i}` })),
    }
    const output = projectAppShellEditorialPreview(store.getState(), input)
    expect(output.stories).toHaveLength(count)
    expect(output.events).toHaveLength(count)
    expect((render({ ...input, ...output }).match(/data-story-id=/g) ?? []).length).toBe(count * 2)
  }
  for (const count of [0, 1, 14, 50, 51]) {
    const html = render({
      ...fixture,
      sections: [
        {
          ...fixture.sections[0]!,
          links: Array.from({ length: count }, (_, i) => ({ ...fixture.sections[0]!.links[0]!, id: `n-${i}` })),
        },
      ],
    })
    expect((html.match(/href="#story-queue"/g) ?? []).length).toBe(count)
  }
  const duplicate = projectAppShellEditorialPreview(store.getState(), {
    ...fixture,
    inventory: [fixture.inventory[0]!, { ...fixture.inventory[0]!, title: 'Updated' }],
    agenda: [fixture.agenda[0]!, { ...fixture.agenda[0]!, title: 'Updated agenda' }],
  })
  expect(duplicate.stories).toHaveLength(1)
  expect(duplicate.stories[0]?.title).toBe('Updated')
  expect(duplicate.events).toHaveLength(1)
})
test('localized formatting and independent stores do not leak English headings or selection state', () => {
  const a = setup(),
    b = setup('localized')
  a.view().onFilter('review')
  expect(b.view().stories).toHaveLength(16)
  expect(b.view().calendarCaption).toContain('Veröffentlichungskalender')
  expect(b.view().weeks[0]?.[0]?.label).toContain('Sonntag')
  expect(render({ ...b.fixture, ...b.view() })).not.toContain('Story queue')
  expect(setup('empty').view().events).toHaveLength(0)
  expect(setup('overflow').view().events).toHaveLength(101)
})
test('fourteen representative states cover distinct mechanisms without clicking every calendar cell or story', () => {
  const plan = auditSamplingPlan('hbar-app-ui-app-shell-4')!
  expect(plan.samples).toHaveLength(14)
  expect(plan.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
})
