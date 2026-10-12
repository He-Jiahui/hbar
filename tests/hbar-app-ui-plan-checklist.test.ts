import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAgentPlan01 } from '@lumen/app-ui'
import { type LumenAgentPlanChecklistContent } from '@lumen/app-ui/catalog'
import {
  createChecklistPreviewStore,
  projectChecklistPreviewContent,
} from '../apps/hbar-app-ui-preview/src/checklist-preview-model'
import {
  HBAR_APP_UI_AGENT_PLAN_FIXTURES,
  createHbarAppUiAgentPlanLocalizedFixtures,
  createHbarAppUiAgentPlanOverflowFixtures,
} from './fixtures/hbar-app-ui-agent-plan-fixtures'

function fixture(): LumenAgentPlanChecklistContent {
  const content = HBAR_APP_UI_AGENT_PLAN_FIXTURES.checklist
  if (!content) throw new Error('Checklist fixture required')
  return content
}
function render(checklist: LumenAgentPlanChecklistContent | undefined) {
  return renderToStaticMarkup(createElement(LumenAgentPlan01, { content: { checklist } }))
}

describe('host-owned checklist run and independent disclosure', () => {
  test('uses native expanded buttons, passive progress and a running-step live announcement', () => {
    const markup = render(fixture())
    expect(markup.match(/aria-expanded=/g)).toHaveLength(7)
    expect(markup.match(/aria-expanded="true"/g)).toHaveLength(1)
    expect(markup).not.toContain('aria-pressed')
    expect(markup).not.toContain('role="progressbar"')
    expect(markup).not.toContain('role="status"')
    expect(markup).not.toContain('<main')
    expect(markup).toContain('aria-live="polite">Working on Patch the tier lookup.')
    expect(markup).toContain('2 of 7 done')
  })
  test('all seven rendered reference descriptions and metadata are host supplied', () => {
    const content = fixture()
    for (const step of content.steps) {
      expect(step.detail).toBeTruthy()
      expect(step.target).toBeTruthy()
      expect(step.estimate).toBeTruthy()
      const markup = render({ ...content, activeStepId: step.id })
      expect(markup).toContain(step.detail!)
      expect(markup).toContain(step.target!)
      expect(markup).toContain(step.estimate!)
      expect(markup).toContain('Working on Patch the tier lookup.')
      expect(markup.match(/aria-expanded="true"/g)).toHaveLength(1)
    }
  })
  test('pause and resume retain progress, steps and the separately expanded detail', () => {
    const content = { ...fixture(), activeStepId: 'contract-notes' }
    const store = createChecklistPreviewStore(content)
    store.getState().pause(content.runId, true)
    const projected = projectChecklistPreviewContent(store.getState())!
    const paused = render(projected)
    expect(projected.steps).toBe(content.steps)
    expect(paused).toContain('Paused on Patch the tier lookup.')
    expect(paused).toContain('Resume')
    expect(paused).toContain('2 of 7 done')
    expect(paused).toContain(content.steps[0]!.detail!)
    expect(paused).toContain('data-state="paused"')
    projected.onPausedChange!(content.runId, false)
    expect(render(projectChecklistPreviewContent(store.getState()))).toContain('Working on Patch the tier lookup.')
    expect(store.getState().paused).toBe(false)
  })
  test('rejects stale targets, busy runs and completed/empty plans', () => {
    const content = fixture()
    for (const next of [
      content,
      { ...content, busy: true },
      { ...content, steps: [] },
      { ...content, steps: content.steps.filter((step) => step.state !== 'running') },
    ]) {
      const store = createChecklistPreviewStore(next)
      store.getState().pause(next === content ? 'stale' : content.runId, true)
      expect(store.getState().paused).toBe(false)
    }
    expect(render({ ...content, steps: [] })).toContain('No plan steps')
    expect(render({ ...content, steps: [] })).toContain('disabled=""')
    expect(render({ ...content, busy: true })).toContain('disabled=""')
  })
  test('locale replacement preserves pause; new runs or changed host state take ownership', () => {
    const content = fixture()
    const store = createChecklistPreviewStore(content)
    store.getState().pause(content.runId, true)
    store.getState().replace(createHbarAppUiAgentPlanLocalizedFixtures().checklist)
    expect(store.getState().paused).toBe(true)
    expect(render(projectChecklistPreviewContent(store.getState()))).toContain('Ausführung fortsetzen')
    store.getState().replace({ ...content, runId: 'new-run' })
    expect(store.getState().paused).toBe(false)
    store.getState().pause(content.runId, true)
    expect(store.getState().paused).toBe(false)
    store.getState().replace({ ...content, runId: 'new-run', paused: true })
    expect(store.getState().paused).toBe(true)
    store.getState().replace(undefined)
    expect(projectChecklistPreviewContent(store.getState())).toBeUndefined()
    expect(createChecklistPreviewStore(content).getState().paused).toBe(false)
  })
  test('rejects blank run targets and host busy/progress refreshes replace local pause', () => {
    const content = fixture()
    const invalid = createChecklistPreviewStore({ ...content, runId: ' ' })
    invalid.getState().pause(' ', true)
    expect(invalid.getState().paused).toBe(false)

    const store = createChecklistPreviewStore(content)
    store.getState().pause(content.runId, true)
    store.getState().replace({ ...content, busy: true })
    expect(store.getState().paused).toBe(content.paused)
    store.getState().replace(content)
    expect(store.getState().paused).toBe(content.paused)

    store.getState().pause(content.runId, true)
    const running = content.steps.find((step) => step.state === 'running')
    const queued = content.steps.find((step) => step.state === 'queued')
    if (!running || !queued) throw new Error('Running and queued steps required')
    const steps = content.steps.map((step) =>
      step.id === running.id
        ? { ...step, state: 'done' as const }
        : step.id === queued.id
          ? { ...step, state: 'running' as const }
          : step,
    )
    store.getState().replace({ ...content, steps })
    expect(store.getState().paused).toBe(content.paused)
  })
  test('deduplicates stable IDs and retains over-capacity data with a declared scroll owner', () => {
    const content = fixture()
    expect(render({ ...content, steps: [...content.steps, content.steps[0]!] }).match(/<li\b/g)).toHaveLength(7)
    const overflow = render(createHbarAppUiAgentPlanOverflowFixtures().checklist)
    expect(overflow.match(/<li\b/g)).toHaveLength(25)
    expect(overflow).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(render({ ...content, activeStepId: 'removed' })).toContain(content.steps[0]!.detail!)
  })
})
