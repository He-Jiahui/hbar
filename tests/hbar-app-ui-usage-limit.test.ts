import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarAppUiRateLimits } from '../packages/hbar-app-ui/src/ai-usage'
import {
  createUsageLimitPreviewStore,
  projectUsageLimitPreview,
} from '../apps/hbar-app-ui-preview/src/usage-limit-preview-model'
import {
  USAGE_LIMIT_COPY,
  USAGE_LIMIT_FIXTURE,
  USAGE_LIMIT_METRICS,
  USAGE_LIMIT_TIERS,
  usageLimitFixture,
} from './fixtures/hbar-app-ui-usage-limit-fixtures'

test('tier changes update ceilings, ratios, warning and highest-tier hint without changing usage', () => {
  const store = createUsageLimitPreviewStore(USAGE_LIMIT_TIERS, USAGE_LIMIT_METRICS)
  const project = () => projectUsageLimitPreview(store.getState(), USAGE_LIMIT_COPY, () => {})
  expect(project().description).toBe('1 limit near capacity')
  expect(project().panel!.meters[0]!.progress).toBeCloseTo(82.4)
  expect(
    project()
      .panel!.meters.slice(1)
      .map((m) => m.progress),
  ).toEqual([37, 45, 12])
  store.getState().select('tier-2')
  expect(project().description).toBe('All limits within range')
  expect(project().panel!.meters.map((m) => m.capacity)).toEqual([
    ' / 2,000 req',
    ' / 1,600,000 tok',
    ' / 160 req',
    ' / 100 jobs',
  ])
  expect(project().panel!.meters.map((m) => Math.round(m.progress))).toEqual([21, 9, 11, 3])
  store.getState().select('tier-3')
  expect(project().panel!.meters.map((m) => m.current)).toEqual(['412', '148,000', '18', '3'])
  expect(project().panel!.meters.map((m) => Math.round(m.progress))).toEqual([8, 4, 5, 1])
  expect(project().panel!.footer.description).toBe('Highest tier. Contact us for a bespoke ceiling.')
  expect(project().panel!.footer.icon).toBe('check')
  expect(renderToStaticMarkup(createElement(HbarAppUiRateLimits, project()))).toContain('lucide-check')
  store.getState().select('tier-1')
  expect(project().panel!.footer.icon).toBe('info')
  expect(project().panel!.nearCapacity).toBe(true)
  const previous = store.getState()
  store.getState().select('stale')
  expect(store.getState()).toBe(previous)
})

test('empty, one, normal, twelve and thirteen resource rows stay present with native progress semantics', () => {
  const first = USAGE_LIMIT_METRICS[0]!
  for (const count of [0, 1, 4, 12, 13]) {
    const store = createUsageLimitPreviewStore(
      USAGE_LIMIT_TIERS,
      Array.from({ length: count }, (_, i) => ({ ...first, id: `limit-${i}` })),
    )
    const html = renderToStaticMarkup(
      createElement(
        HbarAppUiRateLimits,
        projectUsageLimitPreview(store.getState(), USAGE_LIMIT_COPY, () => {}),
      ),
    )
    expect((html.match(/role="progressbar"/g) ?? []).length).toBe(count)
    expect(html.match(/role="tab"/g)).toHaveLength(3)
    if (count === 0) expect(html).toContain('No limits configured')
    else expect(html).toContain('aria-valuenow="82"')
  }
})

test('replacement reconciles missing and duplicate IDs while callbacks retain their original target', () => {
  const store = createUsageLimitPreviewStore(USAGE_LIMIT_TIERS, USAGE_LIMIT_METRICS)
  const targets: string[] = []
  const original = projectUsageLimitPreview(store.getState(), USAGE_LIMIT_COPY, (id) => targets.push(id))
  store.getState().select('tier-3')
  const tier = USAGE_LIMIT_TIERS[1]!,
    metric = USAGE_LIMIT_METRICS[0]!
  store.getState().replace([tier, { ...tier, label: 'Updated tier' }], [metric, { ...metric, current: 100 }])
  expect(store.getState().tierId).toBe('tier-2')
  expect(store.getState().tiers).toHaveLength(1)
  expect(store.getState().metrics).toHaveLength(1)
  original.panel!.footer.action!.onInvoke()
  expect(targets).toEqual(['tier-1'])
  expect(projectUsageLimitPreview(store.getState(), USAGE_LIMIT_COPY, () => {}).panel!.meters[0]!.current).toBe('100')
  store.getState().replace([], [])
  const empty = projectUsageLimitPreview(store.getState(), USAGE_LIMIT_COPY, () => {})
  expect(empty.panel!.tier).toBeUndefined()
  expect(empty.panel!.footer.action).toBeUndefined()
})

test('whitespace-only tier and metric IDs are omitted and selection falls back to a valid tier', () => {
  const validTier = { ...USAGE_LIMIT_TIERS[0]!, id: ' tier-1 ' }
  const blankTier = { ...validTier, id: ' \t ' }
  const validMetric = USAGE_LIMIT_METRICS[0]!
  const blankMetric = { ...validMetric, id: ' ' }
  const store = createUsageLimitPreviewStore([blankTier, validTier], [blankMetric, validMetric])
  expect(store.getState().tiers.map((tier) => tier.id)).toEqual([' tier-1 '])
  expect(store.getState().metrics.map((metric) => metric.id)).toEqual([validMetric.id])
  expect(store.getState().tierId).toBe(' tier-1 ')
  const previous = store.getState()
  previous.select(' ')
  expect(store.getState()).toBe(previous)
  store.getState().replace([blankTier], [blankMetric])
  expect(store.getState().tierId).toBeUndefined()
  expect(store.getState().metrics).toEqual([])
})

test('localized status and footer are host copy, and a request does not fabricate UI success', () => {
  const fixture = usageLimitFixture('localized'),
    store = createUsageLimitPreviewStore(fixture.tiers, fixture.metrics)
  let requests = 0
  const content = projectUsageLimitPreview(store.getState(), fixture.copy, () => {
    requests++
  })
  const before = renderToStaticMarkup(createElement(HbarAppUiRateLimits, content))
  content.panel!.footer.action!.onInvoke()
  expect(requests).toBe(1)
  expect(renderToStaticMarkup(createElement(HbarAppUiRateLimits, content))).toBe(before)
  expect(before).toContain('Nutzungsgrenzen')
  expect(before).toContain('Ausführliche Ressourcenbegrenzung')
  expect(before).toContain('148.000')
  expect(before).toContain('aria-label="Nutzungsstufe"')
})

test('invalid capacities and progress are finite, bounded, and legacy meter-only consumers remain supported', () => {
  const metric = USAGE_LIMIT_METRICS[0]!
  const store = createUsageLimitPreviewStore(USAGE_LIMIT_TIERS, [{ ...metric, current: NaN, baseLimit: -1 }])
  const projected = projectUsageLimitPreview(store.getState(), USAGE_LIMIT_COPY, () => {})
  expect(projected.panel!.meters[0]!.progress).toBe(0)
  const panel = USAGE_LIMIT_FIXTURE.panel!,
    first = panel.meters[0]!
  const html = renderToStaticMarkup(
    createElement(HbarAppUiRateLimits, {
      ...USAGE_LIMIT_FIXTURE,
      panel: { ...panel, meters: [first, { ...first, progress: NaN }, { ...first, id: 'over', progress: 300 }] },
    }),
  )
  expect(html.match(/role="progressbar"/g)).toHaveLength(2)
  expect(html).toContain('aria-valuenow="0"')
  expect(html).toContain('aria-valuenow="100"')
  expect(html).not.toContain('NaN')
  const legacy = renderToStaticMarkup(
    createElement(HbarAppUiRateLimits, {
      title: 'Legacy limits',
      description: 'Legacy',
      emptyLabel: 'Nothing configured',
      meters: [],
    }),
  )
  expect(legacy).toContain('Nothing configured')
  expect(legacy).not.toContain('lumen-usage-rate-panel')
})
