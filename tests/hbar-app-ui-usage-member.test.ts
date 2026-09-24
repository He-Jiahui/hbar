import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarAppUiSeatUsage } from '../packages/hbar-app-ui/src/ai-usage'
import {
  createUsageMemberPreviewStore,
  projectUsageMemberPreview,
} from '../apps/hbar-app-ui-preview/src/usage-member-preview-model'
import {
  USAGE_MEMBER_COPY,
  USAGE_MEMBER_FIXTURE,
  USAGE_MEMBER_RECORDS,
  USAGE_MEMBER_TEAMS,
  usageMemberFixture,
} from './fixtures/hbar-app-ui-usage-member-fixtures'

test('team and name filters compose, update total/seats, and independently recover', () => {
  const store = createUsageMemberPreviewStore(USAGE_MEMBER_TEAMS, USAGE_MEMBER_RECORDS)
  const project = () => projectUsageMemberPreview(store.getState(), USAGE_MEMBER_COPY)
  expect(project().description).toBe('$1,217 across 7 seats this month.')
  store.getState().select('platform')
  expect(project().description).toBe('$614 across 3 seats this month.')
  expect(project().members!.rows.map((r) => r.id)).toEqual(['priya', 'sofia', 'jonas'])
  store.getState().search('SOFIA')
  expect(project().description).toBe('$203 across 1 seat this month.')
  store.getState().search('Support')
  expect(project().members!.rows).toHaveLength(0)
  expect(project().description).toBe('$0 across 0 seats this month.')
  store.getState().select('all')
  expect(project().members!.rows).toHaveLength(0) // Search is name-only, not team metadata.
  store.getState().search('')
  expect(project().members!.rows).toHaveLength(7)
  store.getState().select('support')
  expect(project().description).toBe('$364 across 2 seats this month.')
  store.getState().select('research')
  expect(project().description).toBe('$239 across 2 seats this month.')
  expect(project().members!.rows.map((r) => r.capacity)).toEqual(['90% of $200 cap', '30% of $200 cap'])
  const previous = store.getState()
  store.getState().select('stale')
  expect(store.getState()).toBe(previous)
})

test('empty, one, normal, capacity and over-capacity inventories are paged with no unreachable members', () => {
  for (const count of [0, 1, 7, 50, 51, 200]) {
    const records = Array.from({ length: count }, (_, i) => ({ ...USAGE_MEMBER_RECORDS[i % 7]!, id: `member-${i}` }))
    const store = createUsageMemberPreviewStore(USAGE_MEMBER_TEAMS, records)
    const seen: string[] = []
    for (let page = 0; page < Math.max(1, Math.ceil(count / 50)); page++) {
      const view = projectUsageMemberPreview(store.getState(), USAGE_MEMBER_COPY)
      seen.push(...view.members!.rows.map((r) => r.id))
      const html = renderToStaticMarkup(createElement(HbarAppUiSeatUsage, view))
      expect((html.match(/data-member-id=/g) ?? []).length).toBe(
        Math.min(50, count - seen.length + view.members!.rows.length),
      )
      expect(html).not.toContain('role="progressbar"')
      if (count === 0) {
        expect(html).toContain('No members match')
        expect(html).toContain('Try a different name')
      }
      if (!view.members!.pagination?.canNext) break
      store.getState().next()
    }
    expect(new Set(seen).size).toBe(count)
    store.getState().next()
    expect(store.getState().page).toBe(Math.max(0, Math.ceil(count / 50) - 1))
    store.getState().search('Sofia')
    expect(store.getState().page).toBe(0)
    store.getState().previous()
    expect(store.getState().page).toBe(0)
  }
})

test('replacement reconciles duplicate IDs, removed teams and pages without stale selection', () => {
  const fixture = usageMemberFixture('overflow'),
    store = createUsageMemberPreviewStore(fixture.teams, fixture.records)
  store.getState().next()
  store.getState().next()
  const row = USAGE_MEMBER_RECORDS[0]!,
    team = USAGE_MEMBER_TEAMS[1]!
  store.getState().replace([team, { ...team, label: 'Updated team' }], [row, { ...row, name: 'Updated member' }])
  const view = projectUsageMemberPreview(store.getState(), USAGE_MEMBER_COPY)
  expect(store.getState().page).toBe(0)
  expect(view.members!.rows).toHaveLength(1)
  expect(view.members!.rows[0]!.name).toBe('Updated member')
  expect(view.members!.team!.value).toBe('platform')
  expect(view.members!.team!.options).toHaveLength(1)
  expect(view.members!.team!.options[0]!.label).toBe('Updated team')
  store.getState().replace([], [])
  expect(projectUsageMemberPreview(store.getState(), USAGE_MEMBER_COPY).members!.team).toBeUndefined()
})

test('member renderer preserves source semantic order, native search, team tabs and passive rows', () => {
  const html = renderToStaticMarkup(createElement(HbarAppUiSeatUsage, USAGE_MEMBER_FIXTURE))
  expect(html).toContain('<h2>Usage by member</h2>')
  expect(html).toContain('type="search"')
  expect(html.match(/role="tab"/g)).toHaveLength(4)
  expect(html.match(/data-member-id=/g)).toHaveLength(7)
  expect(html).toContain('aria-hidden="true">PN</span>')
  expect(html).toContain('77% of $500 cap')
  expect(html).not.toContain('<article')
  expect(html).not.toContain('role="list"')
  expect(html.indexOf('lumen-usage-member-avatar')).toBeLessThan(html.indexOf('lumen-usage-member-identity'))
  expect(html.indexOf('lumen-usage-member-identity')).toBeLessThan(html.indexOf('lumen-usage-member-capacity'))
  expect(html.indexOf('lumen-usage-member-capacity')).toBeLessThan(html.indexOf('lumen-usage-member-spend'))
})

test('invalid capacity values are finite, ratios bounded, and duplicate renderer IDs are reconciled', () => {
  const row = USAGE_MEMBER_RECORDS[0]!,
    store = createUsageMemberPreviewStore(USAGE_MEMBER_TEAMS, [{ ...row, spend: NaN, cap: -1 }])
  const view = projectUsageMemberPreview(store.getState(), USAGE_MEMBER_COPY)
  expect(view.members!.rows[0]!.progress).toBe(0)
  const member = USAGE_MEMBER_FIXTURE.members!.rows[0]!
  const html = renderToStaticMarkup(
    createElement(HbarAppUiSeatUsage, {
      ...USAGE_MEMBER_FIXTURE,
      members: {
        ...USAGE_MEMBER_FIXTURE.members!,
        rows: [member, { ...member, progress: NaN }, { ...member, id: 'over', progress: 200 }],
      },
    }),
  )
  expect(html.match(/data-member-id=/g)).toHaveLength(2)
  expect(html).toContain('inline-size:0%')
  expect(html).toContain('inline-size:100%')
  expect(html).not.toContain('NaN')
})

test('all visible copy and formats are host-owned; old seat API remains usable', () => {
  const fixture = usageMemberFixture('localized')
  const html = renderToStaticMarkup(
    createElement(
      HbarAppUiSeatUsage,
      projectUsageMemberPreview(createUsageMemberPreviewStore(fixture.teams, fixture.records).getState(), fixture.copy),
    ),
  )
  expect(html).toContain('1.217 $')
  expect(html).toContain('Ausführlicher Mitgliedername')
  expect(html).toContain('aria-label="Mitglieder suchen"')
  expect(html).not.toContain('Search members')
  const legacy = renderToStaticMarkup(
    createElement(HbarAppUiSeatUsage, {
      ...USAGE_MEMBER_FIXTURE,
      members: undefined,
      rows: [],
      emptyLabel: 'Legacy empty',
    }),
  )
  expect(legacy).toContain('Legacy empty')
  expect(legacy).not.toContain('lumen-usage-member-list')
})
