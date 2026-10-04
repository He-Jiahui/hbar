import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAgentPlan, uniqueLumenAgentPlanItems, type LumenAgentPlanContent } from '@lumen/app-ui'
import { createPlanPreviewCopy, projectPlanPreviewCopy } from '../apps/hbar-app-ui-preview/src/planPreviewCopy'
import { PlanPreviewHost } from '../apps/hbar-app-ui-preview/src/PlanPreviewHost'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import {
  HBAR_APP_UI_AGENT_PLAN_FIXTURES,
  createHbarAppUiAgentPlanLocalizedFixtures,
} from './fixtures/hbar-app-ui-agent-plan-fixtures'

function render(variant: number, content: LumenAgentPlanContent) {
  return renderToStaticMarkup(
    createElement(LumenAgentPlan, { variant, variantId: `hbar-app-ui-agent-plan-${variant}`, content }),
  )
}

describe('practical plan presentation and local preview boundary', () => {
  test('opts all six structures into content-grown presentation without changing legacy defaults', () => {
    const content = {
      ...HBAR_APP_UI_AGENT_PLAN_FIXTURES,
      presentation: { ownerId: 'plan-owner', notice: createPlanPreviewCopy(false).notice },
    }
    for (let variant = 1; variant <= 6; variant += 1) {
      const markup = render(variant, content)
      expect(markup).toContain('lumen-agent-plan-preview-root')
      expect(markup).toContain('role="status"')
      expect(markup).toContain(content.presentation.notice)
      expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
      expect(render(variant, HBAR_APP_UI_AGENT_PLAN_FIXTURES)).not.toContain('lumen-agent-plan-preview-root')
    }
  })

  test('localized running and retry feedback states local intent, preserving estimates and passive records', () => {
    const source = createHbarAppUiAgentPlanLocalizedFixtures()
    const content = projectPlanPreviewCopy(source, true)
    const copy = createPlanPreviewCopy(true)
    expect(content.actual).toBe(source.actual)
    expect(content.board).toBe(source.board)
    expect(content.summary?.metrics).toBe(source.summary?.metrics)
    expect(content.summary?.tools).toBe(source.summary?.tools)
    expect(content.summary?.breakdown).toBe(source.summary?.breakdown)
    expect(content.tree?.labels.running).toBe(copy.retryRequested)
    expect(content.checklist?.labels.pausedOn('Schritt')).toBe(copy.pausedOn('Schritt'))
    if (!content.summary?.interaction) throw new Error('Expected controlled summary fixture')
    const markup = render(6, {
      ...content,
      summary: { ...content.summary, interaction: { ...content.summary.interaction, running: true } },
    })
    expect(markup).toContain('keine Werkzeuge gestartet')
    expect(markup).toContain(copy.stop)
    expect(markup).toContain('$0.54')
    expect(render(4, content)).not.toContain('<button')
    expect(render(5, content)).not.toContain('<button')
  })

  test('Host ownership applies only to the selected category and variant', () => {
    const plan = getHbarAppUiVariant('agent-plan', 1).spec
    const markup = renderToStaticMarkup(
      createElement(PlanPreviewHost, {
        spec: plan,
        localized: false,
        content: HBAR_APP_UI_AGENT_PLAN_FIXTURES,
        children: createElement(LumenAgentPlan, { variant: 1, variantId: plan.id }),
      }),
    )
    expect(markup).toContain(createPlanPreviewCopy(false).pause)
    expect(markup).toContain('lumen-agent-plan-preview-root')
    expect(markup).not.toContain('role="status"')
    const other = getHbarAppUiVariant('agent-approval', 1).spec
    const untouched = renderToStaticMarkup(
      createElement(PlanPreviewHost, {
        spec: other,
        localized: true,
        content: HBAR_APP_UI_AGENT_PLAN_FIXTURES,
        children: createElement(LumenAgentPlan, { variant: 1, variantId: plan.id }),
      }),
    )
    expect(untouched).not.toContain('lumen-agent-plan-preview-root')
    expect(untouched).toContain('Stop')
    expect(untouched).not.toContain(createPlanPreviewCopy(false).pause)
  })

  test('blank and duplicate IDs cannot become list identities; nonblank IDs are not rewritten', () => {
    const rows = [
      { id: ' ', title: 'blank' },
      { id: 'exact ', title: 'first' },
      { id: 'exact ', title: 'duplicate' },
    ]
    expect(uniqueLumenAgentPlanItems(rows)).toEqual([{ id: 'exact ', title: 'first' }])
  })
})
