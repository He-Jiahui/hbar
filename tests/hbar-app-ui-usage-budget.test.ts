import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarAppUiBudgetSettings } from '../packages/hbar-app-ui/src/ai-usage'
import { LumenRange, LumenToggleButton } from '@lumen/app-ui'
import {
  createUsageBudgetPreviewStore,
  projectUsageBudgetPreview,
} from '../apps/hbar-app-ui-preview/src/usage-budget-preview-model'
import {
  USAGE_BUDGET_FACTS,
  USAGE_BUDGET_COPY,
  USAGE_BUDGET_THRESHOLDS,
  USAGE_BUDGET_SETTINGS,
  USAGE_BUDGET_FIXTURE,
  usageBudgetFixture,
} from './fixtures/hbar-app-ui-usage-budget-fixtures'

test('budget cap changes ratio and forecast immediately without changing spend or requiring save', () => {
  const store = createUsageBudgetPreviewStore(USAGE_BUDGET_FACTS, USAGE_BUDGET_THRESHOLDS, USAGE_BUDGET_SETTINGS)
  const project = () => projectUsageBudgetPreview(store.getState(), USAGE_BUDGET_COPY)
  expect(project().panel!.summary.progress).toBeCloseTo(73.6)
  expect(project().panel!.summary.forecast).toBe('Projected $2,613 at current pace, over budget on the 26th.')
  store.getState().changeCap(10000)
  expect(project().panel!.summary.progress).toBeCloseTo(18.4)
  expect(project().panel!.summary.forecast).toBe('Projected $2,613 at current pace, within budget.')
  store.getState().changeCap(500)
  expect(project().panel!.summary.progress).toBe(368)
  expect(renderToStaticMarkup(createElement(HbarAppUiBudgetSettings, project()))).toContain('aria-valuenow="100"')
  store.getState().changeCap(2600)
  expect(project().panel!.cap.value).toBe(2500)
  expect(project().panel!.summary.spent).toBe('$1,840')
  expect(project().panel!.summary.overBudget).toBe(true)
  const html = renderToStaticMarkup(createElement(HbarAppUiBudgetSettings, project()))
  expect(html).not.toContain('<form')
  expect(html).not.toContain('Save budget')
  expect(html).not.toContain('Budget saved')
})

test('thresholds and switches change independently and stale callbacks keep their original target', () => {
  const store = createUsageBudgetPreviewStore(USAGE_BUDGET_FACTS, USAGE_BUDGET_THRESHOLDS, USAGE_BUDGET_SETTINGS)
  const original = projectUsageBudgetPreview(store.getState(), USAGE_BUDGET_COPY)
  original.panel!.thresholds[0]!.onChange(true)
  expect(store.getState().thresholds.every((row) => row.checked)).toBe(true)
  original.panel!.thresholds[1]!.onChange(false)
  expect(store.getState().thresholds.map((row) => row.checked)).toEqual([true, false, true])
  original.panel!.switches[0]!.onChange(false)
  original.panel!.switches[1]!.onChange(true)
  expect(store.getState().settings.map((row) => row.checked)).toEqual([false, true])
  const row = USAGE_BUDGET_THRESHOLDS[0]!
  store
    .getState()
    .replace(
      USAGE_BUDGET_FACTS,
      [USAGE_BUDGET_THRESHOLDS[2]!, row, { ...row, label: 'Updated 50%' }],
      [...USAGE_BUDGET_SETTINGS].reverse(),
    )
  original.panel!.switches[0]!.onChange(false)
  original.panel!.thresholds[0]!.onChange(true)
  expect(store.getState().settings.find((row) => row.id === 'pause')!.checked).toBe(false)
  expect(store.getState().thresholds.map((row) => row.id)).toEqual(['90', '50'])
  expect(store.getState().thresholds[1]!.label).toBe('Updated 50%')
  store.getState().replace(USAGE_BUDGET_FACTS, [], [])
  const previous = store.getState()
  original.panel!.switches[0]!.onChange(true)
  original.panel!.thresholds[0]!.onChange(true)
  expect(store.getState()).toBe(previous)
})

test('whitespace-only alert IDs are omitted while valid IDs remain exact targets', () => {
  const validThreshold = { ...USAGE_BUDGET_THRESHOLDS[0]!, id: ' threshold ' }
  const validSetting = { ...USAGE_BUDGET_SETTINGS[0]!, id: ' setting ' }
  const store = createUsageBudgetPreviewStore(
    USAGE_BUDGET_FACTS,
    [{ ...validThreshold, id: ' ' }, validThreshold],
    [{ ...validSetting, id: ' \t ' }, validSetting],
  )
  expect(store.getState().thresholds.map((item) => item.id)).toEqual([' threshold '])
  expect(store.getState().settings.map((item) => item.id)).toEqual([' setting '])
  const previous = store.getState()
  previous.setThreshold(' ', true)
  previous.setSetting(' \t ', true)
  expect(store.getState()).toBe(previous)
  previous.setThreshold(' threshold ', false)
  expect(store.getState().thresholds[0]?.checked).toBe(false)
})

test('empty, one, normal, boundary and above-bound choices grow without silently dropping content', () => {
  for (const [thresholdCount, settingCount] of [
    [0, 0],
    [1, 1],
    [3, 2],
    [6, 8],
    [7, 9],
  ]) {
    const thresholds = Array.from({ length: thresholdCount! }, (_, i) => ({
      ...USAGE_BUDGET_THRESHOLDS[0]!,
      id: `threshold-${i}`,
    }))
    const settings = Array.from({ length: settingCount! }, (_, i) => ({
      ...USAGE_BUDGET_SETTINGS[0]!,
      id: `setting-${i}`,
    }))
    const view = projectUsageBudgetPreview(
      createUsageBudgetPreviewStore(USAGE_BUDGET_FACTS, thresholds, settings).getState(),
      USAGE_BUDGET_COPY,
    )
    const html = renderToStaticMarkup(createElement(HbarAppUiBudgetSettings, view))
    expect((html.match(/aria-pressed=/g) ?? []).length).toBe(thresholdCount!)
    expect((html.match(/role="switch"/g) ?? []).length).toBe(settingCount!)
    if (thresholdCount === 0) {
      expect(html).toContain('No alert thresholds')
      expect(html).toContain('No delivery settings')
    }
  }
})

test('invalid bounds stay finite, callbacks clamp values, and direct progress input cannot overflow', () => {
  const store = createUsageBudgetPreviewStore(
    { ...USAGE_BUDGET_FACTS, spent: NaN, projected: Infinity, minimum: -1, maximum: NaN, cap: NaN, step: -4 },
    [],
    [],
  )
  expect(store.getState().facts).toEqual({ spent: 0, projected: 0, minimum: 0, maximum: 0, cap: 0, step: 1 })
  const previous = store.getState()
  store.getState().changeCap(NaN)
  expect(store.getState()).toBe(previous)
  store.getState().replace(USAGE_BUDGET_FACTS, [], [])
  store.getState().changeCap(-100)
  expect(store.getState().facts.cap).toBe(500)
  store.getState().changeCap(20000)
  expect(store.getState().facts.cap).toBe(10000)
  const html = renderToStaticMarkup(
    createElement(HbarAppUiBudgetSettings, {
      ...USAGE_BUDGET_FIXTURE,
      panel: { ...USAGE_BUDGET_FIXTURE.panel!, summary: { ...USAGE_BUDGET_FIXTURE.panel!.summary, progress: NaN } },
    }),
  )
  expect(html).not.toContain('NaN')
  expect(html).toContain('aria-valuenow="0"')
})

test('localized text and native control semantics remain host-owned; legacy form remains supported', () => {
  const fixture = usageBudgetFixture('localized')
  const view = projectUsageBudgetPreview(
    createUsageBudgetPreviewStore(fixture.facts, fixture.thresholds, fixture.settings).getState(),
    fixture.copy,
  )
  const html = renderToStaticMarkup(createElement(HbarAppUiBudgetSettings, view))
  expect(html).toContain('1.840 $')
  expect(html).toContain('Budget und Benachrichtigungen')
  expect(html).toContain('type="range"')
  expect(html).toContain('aria-pressed="true"')
  expect(html).toContain('role="switch"')
  expect(html).not.toContain('role="checkbox"')
  expect(html).not.toContain('Monthly cap')
  const legacy = renderToStaticMarkup(
    createElement(HbarAppUiBudgetSettings, { ...USAGE_BUDGET_FIXTURE, panel: undefined }),
  )
  expect(legacy).toContain('<form')
  expect(legacy).toContain('Save budget')
})

test('shared native range and button switch expose disabled and controlled semantics', () => {
  const range = renderToStaticMarkup(
    createElement(LumenRange, {
      'aria-label': 'Cap',
      value: 750,
      min: 500,
      max: 1000,
      step: 250,
      disabled: true,
      onChange: () => {},
    }),
  )
  expect(range).toContain('type="range"')
  expect(range).toContain('disabled=""')
  expect(range).toContain('value="750"')
  expect(range).not.toContain('data-boundary')
  const toggle = renderToStaticMarkup(
    createElement(LumenToggleButton, { label: 'Pause', checked: true, disabled: true, onCheckedChange: () => {} }),
  )
  expect(toggle).toContain('<button')
  expect(toggle).toContain('role="switch"')
  expect(toggle).toContain('aria-checked="true"')
  expect(toggle).toContain('disabled=""')
})
