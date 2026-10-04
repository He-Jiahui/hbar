import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAgentPlan05, type LumenAgentPlanBoardContent } from '@lumen/app-ui'
import {
  HBAR_APP_UI_AGENT_PLAN_FIXTURES,
  createHbarAppUiAgentPlanLocalizedFixtures,
} from './fixtures/hbar-app-ui-agent-plan-fixtures'

function fixture(): LumenAgentPlanBoardContent {
  const board = HBAR_APP_UI_AGENT_PLAN_FIXTURES.board
  if (!board) throw new Error('Board fixture required')
  return board
}
function render(board: LumenAgentPlanBoardContent): string {
  return renderToStaticMarkup(createElement(LumenAgentPlan05, { content: { board } }))
}

describe('passive responsive plan board', () => {
  test('renders real section headings, ordered lists and all 21 host records without invented actions', () => {
    const markup = render(fixture())
    expect(markup).toContain('role="banner"')
    expect(markup).toContain('9 of 21 done')
    expect(markup).toContain('<h3><span>Investigate</span><span>7/7</span></h3>')
    expect(markup.match(/<ol/g)).toHaveLength(3)
    expect(markup.match(/data-step-id=/g)).toHaveLength(21)
    expect(markup.match(/data-state="done"/g)).toHaveLength(9)
    expect(markup.match(/data-state="running"/g)).toHaveLength(1)
    expect(markup.match(/data-state="queued"/g)).toHaveLength(11)
    for (const record of fixture().sections.flatMap((section) => section.items)) expect(markup).toContain(record.title)
    for (const invented of ['<button', 'role="button"', 'role="status"', 'tabindex=', 'draggable='])
      expect(markup).not.toContain(invented)
    expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })

  test('preserves empty, one, per-column boundary and over-bound data', () => {
    const content = fixture(),
      first = content.sections[0],
      row = first?.items[0]
    if (!first || !row) throw new Error('Board section and row required')
    expect(render({ ...content, sections: [] })).toContain('0 of 0 done')
    expect(render({ ...content, sections: [] })).toContain(content.labels.empty)
    const emptyColumn = render({ ...content, sections: [{ ...first, items: [] }] })
    expect(emptyColumn).toContain('<ol>')
    expect(emptyColumn).not.toContain('data-step-id=')
    for (const count of [1, content.listStrategy.expectedMaximum, content.listStrategy.expectedMaximum + 1]) {
      const items = Array.from({ length: count }, (_, index) => ({ ...row, id: `row-${index}` }))
      expect(render({ ...content, sections: [{ ...first, items }] }).match(/data-step-id=/g)).toHaveLength(count)
    }
  })

  test('keeps first section and item identity when the host supplies duplicates', () => {
    const content = fixture(),
      first = content.sections[0],
      row = first?.items[0]
    if (!first || !row) throw new Error('Board section and row required')
    const markup = render({
      ...content,
      sections: [
        { ...first, items: [...first.items, { ...row, title: 'Discarded duplicate item' }] },
        { ...first, title: 'Discarded duplicate section', done: 999, total: 999 },
        ...content.sections.slice(1),
      ],
    })
    expect(markup).not.toContain('Discarded')
    expect(markup).toContain('9 of 21 done')
    expect(markup.match(/data-step-id=/g)).toHaveLength(21)
    expect(markup.match(/data-section-id=/g)).toHaveLength(3)
  })

  test('host updates move/remove stable rows and replace status copy without local execution state', () => {
    const content = fixture(),
      implement = content.sections[1],
      verify = content.sections[2]
    const task = implement?.items.find((item) => item.id === 'renewal-test')
    if (!implement || !verify || !task) throw new Error('Running board task required')
    const markup = render({
      ...content,
      sections: [
        { ...verify, items: [{ ...task, state: 'failed', stateLabel: 'Failed' }, ...verify.items] },
        { ...implement, items: implement.items.filter((item) => item.id !== task.id) },
      ],
    })
    expect(markup).not.toContain('Read the billing contract notes')
    expect(markup).not.toContain('data-state="running"')
    expect(markup.match(/data-step-id="renewal-test"/g)).toHaveLength(1)
    expect(markup).toContain('data-state="failed"')
    expect(markup).toContain('Failed')
    expect(markup.indexOf('data-section-id="verify"')).toBeLessThan(markup.indexOf('data-section-id="implement"'))
  })

  test('renders long host translations for headings, progress and task states', () => {
    const localized = createHbarAppUiAgentPlanLocalizedFixtures().board
    if (!localized) throw new Error('Localized board required')
    const markup = render(localized)
    for (const label of [
      '9 von 21 abgeschlossen',
      'Untersuchung der vollständigen Abrechnungsvereinbarung',
      'Die Abrechnungsvereinbarung vollständig und nachvollziehbar untersuchen',
      'Abgeschlossen',
      'Wird ausgeführt',
      'In der Warteschlange',
    ])
      expect(markup).toContain(label)
    for (const untranslated of ['>Done<', '>Running<', '>Queued<']) expect(markup).not.toContain(untranslated)
    expect(localized.sections.flatMap((section) => section.items).map((item) => item.id)).toEqual(
      fixture()
        .sections.flatMap((section) => section.items)
        .map((item) => item.id),
    )
  })
})
