import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAgentPlan04, type LumenAgentPlanActualContent } from '@lumen/app-ui'
import {
  HBAR_APP_UI_AGENT_PLAN_FIXTURES,
  createHbarAppUiAgentPlanLocalizedFixtures,
} from './fixtures/hbar-app-ui-agent-plan-fixtures'

function fixture(): LumenAgentPlanActualContent {
  const content = HBAR_APP_UI_AGENT_PLAN_FIXTURES.actual
  if (!content) throw new Error('Timing fixture required')
  return content
}
function render(content: LumenAgentPlanActualContent): string {
  return renderToStaticMarkup(createElement(LumenAgentPlan04, { content: { actual: content } }))
}

describe('passive plan versus actual presentation', () => {
  test('keeps banner, metric prose, named table and five native columns without invented controls', () => {
    const markup = render(fixture())
    expect(markup).toContain('role="banner"')
    expect(markup).toContain('<main')
    expect(markup).toContain('<caption>Planned versus actual duration for each step</caption>')
    expect(markup.match(/scope="col"/g)).toHaveLength(5)
    expect(markup.match(/scope="row"/g)).toHaveLength(5)
    expect(markup).not.toContain('<dl')
    expect(markup).not.toContain('<button')
    expect(markup).not.toContain('role="progressbar"')
    expect(markup).not.toContain('tabindex=')
    expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })

  test('planned marker and actual fill are independent, including no actual time for the unfinished step', () => {
    const content = fixture()
    expect(content.rows.map((row) => row.durationProgress)).toEqual([3 / 11, 2 / 11, 1, 5 / 11, 0])
    expect(content.rows.map((row) => row.plannedProgress)).toEqual([2 / 11, 3 / 11, 6 / 11, 5 / 11, 1 / 11])
    const markup = render(content)
    expect(markup).toContain('data-value="0" data-planned="0.09090909090909091"')
    expect(markup).toContain('width="0%"')
    expect(markup.match(/<line /g)).toHaveLength(5)
    const renewalRow = markup.match(/<tr[^>]*data-row-id="renewal-test"[^>]*>(.*?)<\/tr>/)?.[1] ?? ''
    const values = [...renewalRow.matchAll(/<td(?: [^>]*)?>(.*?)<\/td>/g)].map((match) =>
      match[1]?.replace(/<[^>]*>/g, ''),
    )
    expect(values).toEqual(['', '5m', '5m', ','])
  })

  test('clamps invalid, negative and over-range ratios without parsing localized duration strings', () => {
    const content = fixture(),
      original = content.rows[0]
    if (!original) throw new Error('Timing row required')
    const rows = [
      { ...original, id: 'high', durationProgress: 9, plannedProgress: 2 },
      { ...original, id: 'low', durationProgress: -1, plannedProgress: -2 },
      { ...original, id: 'invalid', durationProgress: Number.NaN, plannedProgress: Number.POSITIVE_INFINITY },
      {
        ...original,
        id: 'missing',
        durationProgress: undefined,
        plannedProgress: undefined,
        actual: 'Noch keine Messung',
      },
    ]
    const markup = render({ ...content, rows })
    expect(markup).toContain('data-value="1" data-planned="1"')
    expect(markup.match(/data-value="0" data-planned="0"/g)).toHaveLength(2)
    expect(markup.match(/<line /g)).toHaveLength(3)
    expect(markup).not.toContain('NaN')
    expect(markup).not.toContain('Infinity')
    expect(markup).toContain('Noch keine Messung')
  })

  test('retains empty, one, boundary and over-bound tables while duplicate IDs keep the first host value', () => {
    const content = fixture(),
      row = content.rows[0],
      metric = content.metrics[0]
    if (!row || !metric) throw new Error('Timing row and metric required')
    const empty = render({ ...content, rows: [], metrics: [] })
    expect(empty).toContain('colSpan="5">No timing rows')
    expect(empty).not.toContain('data-row-id=')
    for (const count of [1, content.listStrategy.expectedMaximum, content.listStrategy.expectedMaximum + 1]) {
      const rows = Array.from({ length: count }, (_, index) => ({ ...row, id: `row-${index}` }))
      expect(render({ ...content, rows }).match(/data-row-id=/g)).toHaveLength(count)
    }
    const duplicate = render({
      ...content,
      rows: [row, { ...row, title: 'Discarded duplicate' }],
      metrics: [metric, { ...metric, label: 'Discarded metric' }],
    })
    expect(duplicate.match(/data-row-id=/g)).toHaveLength(1)
    expect(duplicate.match(/data-metric-id=/g)).toHaveLength(1)
    expect(duplicate).not.toContain('Discarded')
  })

  test('host updates replace values by stable row identity and localization never changes numeric meaning', () => {
    const content = fixture(),
      localized = createHbarAppUiAgentPlanLocalizedFixtures().actual
    if (!localized) throw new Error('Localized timing fixture required')
    const markup = render(localized)
    for (const text of [
      'Geplante Gesamtdauer',
      'Tatsächliche Gesamtdauer',
      'Zeitliche Abweichung',
      'Arbeitsschritt',
      'Tatsächlich',
      'Abweichung',
    ])
      expect(markup).toContain(text)
    expect(markup).not.toContain('Planned')
    expect(localized.rows).toBe(content.rows)
    const changed = render({
      ...content,
      rows: [...content.rows]
        .reverse()
        .filter((row) => row.id !== 'contract-notes')
        .map((row) => (row.id === 'handoff' ? { ...row, actual: '2m', durationProgress: 2 / 11 } : row)),
    })
    expect(changed).not.toContain('Read the billing contract notes')
    expect(changed.indexOf('data-row-id="handoff"')).toBeLessThan(changed.indexOf('data-row-id="renewal-test"'))
    expect(changed).toContain('data-value="0.18181818181818182" data-planned="0.09090909090909091"')
  })
})
