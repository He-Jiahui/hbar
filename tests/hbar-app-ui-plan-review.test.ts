import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAgentPlan02, type LumenAgentPlanEditableContent } from '@lumen/app-ui'
import {
  createPlanReviewPreviewStore,
  projectPlanReviewPreviewContent,
} from '../apps/hbar-app-ui-preview/src/plan-review-preview-model'
import {
  HBAR_APP_UI_AGENT_PLAN_FIXTURES,
  createHbarAppUiAgentPlanLocalizedFixtures,
} from './fixtures/hbar-app-ui-agent-plan-fixtures'

function fixture(): LumenAgentPlanEditableContent {
  const editable = HBAR_APP_UI_AGENT_PLAN_FIXTURES.editable
  if (!editable) throw new Error('Review fixture required')
  return editable
}
function render(editable: LumenAgentPlanEditableContent | undefined) {
  return renderToStaticMarkup(createElement(LumenAgentPlan02, { content: { editable } }))
}
const view = (store: ReturnType<typeof createPlanReviewPreviewStore>) =>
  projectPlanReviewPreviewContent(store.getState())!
const titles = (store: ReturnType<typeof createPlanReviewPreviewStore>) =>
  store.getState().steps.map((step) => step.title)

describe('editable review plan host and presentation', () => {
  test('explicit field-editing consumers retain the shared editor and its pane wrapper', () => {
    const markup = render({
      ...fixture(),
      editing: {
        titleLabel: (index) => `Step ${index} title`,
        statusLabel: (index) => `Step ${index} status`,
        statuses: [
          { id: 'queued', label: 'Ready' },
          { id: 'skipped', label: 'Skipped' },
        ],
        onTitleChange() {},
        onStatusChange() {},
      },
    })
    expect(markup).toContain('hbar-app-ui-agent-plan-editable-content')
    expect(markup).toContain('lumen-plan-editor')
    expect(markup).toContain('aria-label="Step 1 title"')
    expect(markup.match(/<select\b/g)).toHaveLength(9)
  })
  test('preserves native header/list/input/footer, hidden skip hint and disabled boundaries', () => {
    const markup = render(fixture())
    expect(markup).toContain('role="banner"')
    expect(markup).toContain('role="contentinfo"')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain(': skipped')
    expect(markup.match(/<li\b/g)).toHaveLength(9)
    expect(markup.match(/<button\b/g)).toHaveLength(29)
    expect(markup.match(/disabled=""/g)).toHaveLength(3)
    expect(markup).not.toContain('<main')
    expect(markup).not.toContain('<strong')
    expect(markup).toContain('8 to run · 1 skipped')
  })
  test('stable targets move both ways, keep boundaries and announce positions', () => {
    const content = fixture()
    const store = createPlanReviewPreviewStore(content)
    const first = content.steps[0]!
    const next = content.steps[1]!
    view(store).onMove(first.id, -1)
    expect(store.getState().announcement).toBeUndefined()
    view(store).onMove(first.id, 1)
    expect(titles(store).slice(0, 2)).toEqual([next.title, first.title])
    expect(view(store).announcement).toBe(`${first.title} moved to position 2 of 9.`)
    view(store).onMove(first.id, -1)
    expect(titles(store)).toEqual(content.steps.map((step) => step.title))
    const before = store.getState().steps
    view(store).onMove(content.steps.at(-1)!.id, 1)
    view(store).onMove('missing', 1)
    expect(store.getState().steps).toBe(before)
    view(store).onMove(first.id, 1)
    view(store).onRemove(first.id)
    expect(store.getState().steps[1]?.state).toBe('skipped')
    expect(store.getState().steps[0]?.state).toBe('queued')
  })
  test('skip/restore update both counts, retain rows and recover from all skipped', () => {
    const store = createPlanReviewPreviewStore(fixture())
    view(store).onRemove('fixtures')
    expect(render(view(store))).toContain('9 to run')
    expect(render(view(store))).not.toContain('0 skipped')
    for (const step of store.getState().steps) if (step.state !== 'skipped') view(store).onRemove(step.id)
    expect(render(view(store))).toContain('0 to run · 9 skipped')
    view(store).onSubmit()
    expect(store.getState().running).toBe(false)
    const first = store.getState().steps[0]!
    view(store).onRemove(first.id)
    expect(render(view(store))).toContain('1 to run · 8 skipped')
    expect(store.getState().steps).toHaveLength(9)
    view(store).onSubmit()
    expect(store.getState().running).toBe(true)
  })
  test('trimmed Add clears draft once, preserves data and updates announcement', () => {
    const store = createPlanReviewPreviewStore(fixture(), () => 'added-id')
    view(store).onDraftChange('   ')
    view(store).onAdd()
    expect(store.getState().steps).toHaveLength(9)
    view(store).onDraftChange('  Confirm renewal  ')
    view(store).onAdd()
    expect(store.getState().steps.at(-1)).toEqual({
      id: 'added-id',
      title: 'Confirm renewal',
      state: 'queued',
      stateLabel: 'Ready',
    })
    expect(view(store).announcement).toBe('Confirm renewal added to the end of the plan.')
    expect(store.getState().draft).toBe('')
    view(store).onAdd()
    view(store).onDraftChange('Would duplicate the ID')
    view(store).onAdd()
    expect(store.getState().steps).toHaveLength(10)
    expect(render(view(store))).toContain('9 to run · 1 skipped')
  })
  test('Start/Stop preserve row data and reject edits until stopped', () => {
    const content = fixture()
    const store = createPlanReviewPreviewStore(content)
    view(store).onDraftChange('Keep the draft')
    view(store).onSubmit()
    const steps = store.getState().steps
    view(store).onDraftChange('Blocked')
    view(store).onAdd()
    view(store).onMove(steps[0]!.id, 1)
    view(store).onRemove(steps[0]!.id)
    expect(store.getState().steps).toBe(steps)
    expect(store.getState().draft).toBe('Keep the draft')
    expect(render(view(store))).toContain(content.labels.runningReview)
    expect(render(view(store)).match(/disabled=""/g)).toHaveLength(29)
    view(store).onStop()
    expect(store.getState().running).toBe(false)
    expect(render(view(store))).toContain('Start 8 steps')
    expect(store.getState().steps).toBe(steps)
  })
  test('busy/capability limits, stale plans and replaced row IDs cannot mutate new data', () => {
    const content = fixture()
    const store = createPlanReviewPreviewStore({ ...content, busy: true })
    const original = store.getState().steps
    view(store).onDraftChange('Blocked')
    view(store).onAdd()
    view(store).onMove(original[0]!.id, 1)
    view(store).onRemove(original[0]!.id)
    view(store).onSubmit()
    expect(store.getState().steps).toBe(original)
    expect(store.getState().draft).toBe('')
    expect(store.getState().running).toBe(false)
    store.getState().replace({ ...content, canAdd: false, canSubmit: false })
    view(store).onDraftChange('No capacity')
    view(store).onSubmit()
    expect(store.getState().draft).toBe('')
    expect(store.getState().running).toBe(false)
    const stale = view(store)
    store.getState().replace({ ...content, planId: 'replacement', steps: [content.steps[1]!] })
    stale.onRemove(content.steps[1]!.id)
    stale.onSubmit()
    stale.onDraftChange('Stale')
    view(store).onRemove(content.steps[0]!.id)
    expect(store.getState().steps).toEqual([content.steps[1]!])
    expect(store.getState().running).toBe(false)
    expect(store.getState().draft).toBe('')
  })
  test('localization preserves the draft/order/run but reprojects the announcement and labels', () => {
    const content = fixture()
    const store = createPlanReviewPreviewStore(content)
    view(store).onMove(content.steps[0]!.id, 1)
    view(store).onDraftChange('Persists')
    view(store).onSubmit()
    store.getState().replace(createHbarAppUiAgentPlanLocalizedFixtures().editable)
    expect(store.getState().draft).toBe('Persists')
    expect(store.getState().running).toBe(true)
    expect(view(store).announcement).toContain('auf Position 2 von 9 verschoben.')
    expect(render(view(store))).toContain('Ausführung stoppen')
    store.getState().replace({ ...content, running: true })
    view(store).onStop()
    store.getState().replace(content)
    expect(store.getState().running).toBe(false)
    expect(createPlanReviewPreviewStore(content).getState().steps[0]?.id).toBe(content.steps[0]!.id)
  })
  test('empty, one, capacity and over-capacity plans retain data with a pane scroll contract', () => {
    const content = fixture()
    for (const count of [0, 1, content.listStrategy.expectedMaximum, content.listStrategy.expectedMaximum + 1]) {
      const steps = Array.from({ length: count }, (_, index) => ({ ...content.steps[0]!, id: `step-${index}` }))
      const store = createPlanReviewPreviewStore({ ...content, steps })
      const markup = render(view(store))
      expect(markup.match(/<li\b/g) ?? []).toHaveLength(count)
      expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
      if (!count) {
        expect(markup).toContain(content.labels.empty)
        view(store).onSubmit()
        expect(store.getState().running).toBe(false)
      }
    }
    expect(
      createPlanReviewPreviewStore({ ...content, steps: [content.steps[0]!, content.steps[0]!] }).getState().steps,
    ).toHaveLength(1)
  })
  test('host error and recovery do not discard review changes or invent a backend result', () => {
    const content = fixture()
    const store = createPlanReviewPreviewStore(content)
    view(store).onDraftChange('Keep pending input')
    store.getState().replace({ ...content, error: 'Cannot start this plan', busy: true })
    expect(render(view(store))).toContain('role="alert">Cannot start this plan')
    expect(store.getState().draft).toBe('Keep pending input')
    store.getState().replace(content)
    expect(render(view(store))).not.toContain('role="alert"')
    expect(store.getState().draft).toBe('Keep pending input')
    store.getState().replace(undefined)
    expect(projectPlanReviewPreviewContent(store.getState())).toBeUndefined()
  })
  test('rejects blank plan/step/generated IDs and lets a busy refresh own run state', () => {
    const content = fixture()
    const blankStep = { ...content.steps[0]!, id: '   ' }
    const store = createPlanReviewPreviewStore({ ...content, steps: [blankStep, ...content.steps] }, () => '  ')
    expect(store.getState().steps).toHaveLength(content.steps.length)
    expect(store.getState().steps.some((step) => !step.id.trim())).toBe(false)

    view(store).onDraftChange('Recoverable draft')
    view(store).onAdd()
    expect(store.getState().steps).toHaveLength(content.steps.length)
    expect(store.getState().draft).toBe('Recoverable draft')

    const blankPlan = createPlanReviewPreviewStore({ ...content, planId: ' ' })
    const blankView = view(blankPlan)
    blankView.onDraftChange('Blocked')
    blankView.onAdd()
    blankView.onMove(content.steps[0]!.id, 1)
    blankView.onRemove(content.steps[0]!.id)
    blankView.onSubmit()
    expect(blankPlan.getState().steps).toEqual(content.steps)
    expect(blankPlan.getState().draft).toBe(content.draft)
    expect(blankPlan.getState().running).toBe(content.running)

    view(store).onSubmit()
    expect(store.getState().running).toBe(true)
    const currentSteps = store.getState().steps
    store.getState().replace({ ...content, steps: currentSteps, busy: true })
    expect(store.getState().running).toBe(content.running)
    store.getState().replace({ ...content, steps: currentSteps })
    expect(store.getState().running).toBe(content.running)
  })
})
