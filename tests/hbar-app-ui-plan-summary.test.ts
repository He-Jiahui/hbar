import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAgentPlan06, type LumenAgentPlanSummaryContent } from '@lumen/app-ui'
import {
  createPlanSummaryPreviewStore,
  projectPlanSummaryPreviewContent,
} from '../apps/hbar-app-ui-preview/src/plan-summary-preview-model'
import {
  HBAR_APP_UI_AGENT_PLAN_FIXTURES,
  createHbarAppUiAgentPlanLocalizedFixtures,
} from './fixtures/hbar-app-ui-agent-plan-fixtures'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'

function fixture(): LumenAgentPlanSummaryContent {
  const value = HBAR_APP_UI_AGENT_PLAN_FIXTURES.summary
  if (!value?.interaction) throw new Error('Summary fixture required')
  return value
}
const render = (summary: LumenAgentPlanSummaryContent | undefined) =>
  renderToStaticMarkup(createElement(LumenAgentPlan06, { content: { summary } }))
const view = (store: ReturnType<typeof createPlanSummaryPreviewStore>) =>
  projectPlanSummaryPreviewContent(store.getState())
const workflow = (store: ReturnType<typeof createPlanSummaryPreviewStore>) => {
  const interaction = view(store)?.interaction
  if (!interaction) throw new Error('Summary workflow required')
  return interaction
}
describe('plan summary controlled goal and run workflow', () => {
  test('renders semantic sections, metrics, tools and stable passive breakdown records', () => {
    const html = render(fixture())
    expect(html).toContain('role="banner"')
    expect(html).toContain('role="contentinfo"')
    expect(html.match(/<section/g)?.length).toBeGreaterThanOrEqual(3)
    expect(html.match(/<dt/g)).toHaveLength(3)
    expect(html.match(/data-step-id=/g)).toHaveLength(4)
    expect(html.match(/<button/g)).toHaveLength(2)
    expect(html).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(html).not.toContain('draggable=')
    expect(auditSamplingPlan('hbar-app-ui-agent-plan-6')?.samples).toHaveLength(9)
  })
  test('host draft is committed trimmed, cancelled unchanged, and whitespace save keeps the prior goal', () => {
    const store = createPlanSummaryPreviewStore(fixture())
    workflow(store).onEdit()
    expect(render(view(store))).toContain('aria-label="Plan goal"')
    expect(render(view(store))).toContain('data-lumen-variant="outlined"')
    expect(render(view(store)).match(/disabled=""/g)).toHaveLength(2)
    workflow(store).onDraftChange('  Revised goal  ')
    expect(view(store)?.goal).toBe(fixture().goal)
    workflow(store).onSave()
    expect(view(store)?.goal).toBe('Revised goal')
    expect(render(view(store))).not.toContain('<textarea')
    workflow(store).onEdit()
    workflow(store).onDraftChange('Cancelled goal')
    workflow(store).onCancel()
    expect(view(store)?.goal).toBe('Revised goal')
    workflow(store).onEdit()
    workflow(store).onDraftChange('   ')
    workflow(store).onSave()
    expect(view(store)?.goal).toBe('Revised goal')
    expect(workflow(store).editing).toBe(false)
  })
  test('run/stop changes only host presentation; editing and running are mutually exclusive', () => {
    const store = createPlanSummaryPreviewStore(fixture())
    workflow(store).onRun()
    expect(render(view(store))).toContain('Running step 1 of 10')
    expect(render(view(store))).not.toContain('>Edit plan<')
    workflow(store).onEdit()
    expect(workflow(store).editing).toBe(false)
    workflow(store).onStop()
    expect(render(view(store))).toContain('Review the plan before it runs.')
    workflow(store).onEdit()
    workflow(store).onRun()
    expect(workflow(store).running).toBe(false)
  })
  test('stale callbacks cannot write a replacement plan; removal, busy failure and recovery are host-owned', () => {
    const content = fixture(),
      interaction = content.interaction
    if (!interaction) throw new Error('Workflow required')
    const store = createPlanSummaryPreviewStore(content),
      stale = workflow(store)
    stale.onEdit()
    stale.onDraftChange('old draft')
    store
      .getState()
      .replace({ ...content, goal: 'New host goal', interaction: { ...interaction, planId: 'replacement' } })
    stale.onSave()
    stale.onRun()
    expect(view(store)?.goal).toBe('New host goal')
    expect(workflow(store).running).toBe(false)
    store.getState().replace({ ...content, interaction: { ...interaction, busy: true, error: 'Save failed; retry' } })
    workflow(store).onEdit()
    expect(workflow(store).editing).toBe(false)
    expect(render(view(store))).toContain('role="alert"')
    store.getState().replace(content)
    workflow(store).onEdit()
    expect(workflow(store).editing).toBe(true)
    store.getState().replace(undefined)
    stale.onSave()
    expect(view(store)).toBeUndefined()
  })
  test('busy refresh owns edit/run mode without discarding a local draft', () => {
    const content = fixture()
    const interaction = content.interaction
    if (!interaction) throw new Error('Workflow required')
    const store = createPlanSummaryPreviewStore(content)
    workflow(store).onEdit()
    workflow(store).onDraftChange('Keep this draft available for recovery')
    store.getState().replace({ ...content, interaction: { ...interaction, busy: true, error: 'Saving failed' } })
    expect(workflow(store).editing).toBe(false)
    expect(workflow(store).draft).toBe('Keep this draft available for recovery')
    store.getState().replace(content)
    expect(workflow(store).editing).toBe(false)
    expect(workflow(store).draft).toBe('Keep this draft available for recovery')

    workflow(store).onEdit()
    workflow(store).onCancel()
    workflow(store).onRun()
    expect(workflow(store).running).toBe(true)
    store.getState().replace({ ...content, interaction: { ...interaction, busy: true } })
    expect(workflow(store).running).toBe(false)
    store.getState().replace(content)
    expect(workflow(store).running).toBe(false)

    const blankPlan = createPlanSummaryPreviewStore({
      ...content,
      interaction: { ...interaction, planId: ' ' },
    })
    workflow(blankPlan).onEdit()
    workflow(blankPlan).onRun()
    expect(workflow(blankPlan).editing).toBe(interaction.editing)
    expect(workflow(blankPlan).running).toBe(interaction.running)
  })
  test('retains empty, one, boundary, over-bound and first duplicate records without clipping data', () => {
    const content = fixture(),
      row = content.breakdown[0],
      metric = content.metrics[0]
    if (!row || !metric) throw new Error('Records required')
    for (const count of [0, 1, 12, 13]) {
      const html = render({
        ...content,
        breakdown: Array.from({ length: count }, (_, i) => ({ ...row, id: `row-${i}` })),
      })
      expect(html.match(/data-step-id=/g)?.length ?? 0).toBe(count)
      if (!count) expect(html).toContain(content.labels.empty)
    }
    const html = render({
      ...content,
      breakdown: [row, { ...row, title: 'Discard duplicate' }],
      metrics: [metric, metric],
      tools: ['Read', 'Read'],
    })
    expect(html.match(/data-step-id=/g)).toHaveLength(1)
    expect(html.match(/<dt/g)).toHaveLength(1)
    expect(html.match(/>Read</g)).toHaveLength(1)
    expect(html).not.toContain('Discard duplicate')
  })
  test('localized host workflows retain draft and goal on a locale-only replacement', () => {
    const store = createPlanSummaryPreviewStore(fixture())
    workflow(store).onEdit()
    workflow(store).onDraftChange('Mein Ziel')
    const german = createHbarAppUiAgentPlanLocalizedFixtures().summary
    if (!german) throw new Error('German summary required')
    store.getState().replace({ ...german, goal: fixture().goal })
    expect(workflow(store).draft).toBe('Mein Ziel')
    expect(render(view(store))).toContain('Vollständiges Ziel des Ausführungsplans bearbeiten')
    expect(render(view(store))).toContain('Änderungen speichern')
    workflow(store).onSave()
    workflow(store).onRun()
    expect(render(view(store))).toContain('Schritt 1 von 10 wird ausgeführt')
  })
})
