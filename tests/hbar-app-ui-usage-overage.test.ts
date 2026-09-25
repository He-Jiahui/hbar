import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarAppUiUsageOverage } from '../packages/hbar-app-ui/src/ai-usage'
import {
  createUsageOveragePreviewStore,
  projectUsageOveragePreview,
} from '../apps/hbar-app-ui-preview/src/usage-overage-preview-model'
import {
  USAGE_OVERAGE_COPY,
  USAGE_OVERAGE_PLANS,
  usageOverageFixture,
} from './fixtures/hbar-app-ui-usage-overage-fixtures'
import { USAGE_FIXTURES } from './fixtures/hbar-app-ui-usage-fixtures'

test('plan changes update one controlled selection without changing allowance or fabricating upgrade success', () => {
  const store = createUsageOveragePreviewStore(USAGE_OVERAGE_PLANS)
  const events: unknown[] = []
  const project = () => projectUsageOveragePreview(store.getState(), USAGE_OVERAGE_COPY, (...args) => events.push(args))
  expect(project().panel!.selectedId).toBe('scale')
  const original = project()
  original.panel!.onSelect('enterprise')
  expect(project().panel!.selectedId).toBe('enterprise')
  expect(project().panel!.summary).toEqual(original.panel!.summary)
  project().panel!.upgrade.onInvoke()
  project().panel!.stay.onInvoke()
  expect(events).toEqual([
    ['upgrade', 'enterprise'],
    ['stay-on-overage', 'enterprise'],
  ])
  const html = renderToStaticMarkup(createElement(HbarAppUiUsageOverage, project()))
  expect((html.match(/aria-checked="true"/g) ?? []).length).toBe(1)
  expect(html).not.toContain('<select')
  expect(html).not.toContain('success')
  expect(html).toContain('128M')
  original.panel!.onSelect('scale')
  expect(project().panel!.selectedId).toBe('scale')
})

test('replacement deduplicates IDs and safely falls back; old callbacks retain their original target', () => {
  const store = createUsageOveragePreviewStore(USAGE_OVERAGE_PLANS, 'missing')
  const events: unknown[] = []
  const old = projectUsageOveragePreview(store.getState(), USAGE_OVERAGE_COPY, (...args) => events.push(args))
  store.getState().select('enterprise')
  old.panel!.upgrade.onInvoke()
  expect(events).toEqual([['upgrade', 'scale']])
  store
    .getState()
    .replace([USAGE_OVERAGE_PLANS[1]!, USAGE_OVERAGE_PLANS[0]!, { ...USAGE_OVERAGE_PLANS[1]!, label: 'Updated' }])
  expect(store.getState().plans.map((p) => p.label)).toEqual(['Updated', 'Scale'])
  old.panel!.onSelect('scale')
  expect(store.getState().selectedId).toBe('scale')
  store.getState().replace([{ ...USAGE_OVERAGE_PLANS[0]!, disabled: true }, USAGE_OVERAGE_PLANS[1]!])
  expect(store.getState().selectedId).toBe('enterprise')
  store.getState().select('scale')
  expect(store.getState().selectedId).toBe('enterprise')
  store.getState().replace([])
  const previous = store.getState()
  old.panel!.onSelect('scale')
  expect(store.getState()).toBe(previous)
  expect(store.getState().selectedId).toBeNull()
})

test('empty, one, normal, boundary and above-bound plan lists and benefits render without data loss', () => {
  for (const count of [0, 1, 2, 6, 7]) {
    const plans = Array.from({ length: count }, (_, i) => ({
      ...USAGE_OVERAGE_PLANS[0]!,
      id: `plan-${i}`,
      benefits: Array.from({ length: count }, (_, j) => ({ id: `benefit-${j}`, label: `Benefit ${j}` })),
    }))
    const view = projectUsageOveragePreview(
      createUsageOveragePreviewStore(plans).getState(),
      USAGE_OVERAGE_COPY,
      () => {},
    )
    const html = renderToStaticMarkup(createElement(HbarAppUiUsageOverage, view))
    expect((html.match(/role="radio"/g) ?? []).length).toBe(count)
    expect((html.match(/<li>/g) ?? []).length).toBe(count * count)
    if (!count) {
      expect(html).toContain('No available plans')
      expect(view.panel!.upgrade.disabled).toBe(true)
    }
  }
})

test('localized long content renders and direct stale selection/invalid ratios remain safe', () => {
  const fixture = usageOverageFixture('localized')
  const view = projectUsageOveragePreview(
    createUsageOveragePreviewStore(fixture.plans).getState(),
    fixture.copy,
    () => {},
  )
  const html = renderToStaticMarkup(createElement(HbarAppUiUsageOverage, view))
  expect(html).toContain('Tokenkontingent')
  expect(html).toContain('Unternehmen')
  expect(html).not.toContain('Upgrade')
  const stale = renderToStaticMarkup(
    createElement(HbarAppUiUsageOverage, {
      ...view,
      panel: { ...view.panel!, selectedId: 'missing', summary: { ...view.panel!.summary, includedPercent: NaN } },
    }),
  )
  expect(stale).not.toContain('NaN')
  expect(stale).not.toContain('aria-checked="true"')
  expect(stale).toContain('disabled=""')
})

test('legacy overage meters and choice API remain available', () => {
  const html = renderToStaticMarkup(createElement(HbarAppUiUsageOverage, USAGE_FIXTURES.overage))
  expect(html).toContain('<select')
  expect(html).toContain('role="progressbar"')
})
