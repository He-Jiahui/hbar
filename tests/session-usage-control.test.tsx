import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SessionControlsState } from '@hbar/app-runtime'
import type { SessionContextUsage } from '@hbar/contracts/commands/models'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { HbarSessionUsageControl, sessionUsagePresentation } from '../packages/app-react/src/session-usage-control'

const empty: SessionControlsState = {
  sessionId: 'session',
  status: 'ready',
  model: null,
  usage: null,
  budget: null,
  errors: { model: null, usage: null, budget: null },
}
const budget = (usedTokens: number, phase: 'active' | 'exhausted' = 'active') => ({
  sessionId: 'session',
  budgetId: 'budget',
  limit: 100,
  usedTokens,
  remainingTokens: Math.max(0, 100 - usedTokens),
  phase,
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
})
const context = (inputTokens: number, overrides: Partial<SessionContextUsage> = {}): SessionContextUsage => ({
  sessionId: 'session',
  modelId: 'fixture',
  status: 'available',
  estimated: true,
  inputTokens,
  contextWindow: 100_000,
  compactionPercent: 80,
  compactionTokens: 80_000,
  outputReserve: 10_000,
  remainingTokens: Math.max(0, 100_000 - inputTokens),
  observedAt: 1,
  ...overrides,
})

test('usage never invents zero accounting or context occupancy when facts are unavailable', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).session.usage
    const view = sessionUsagePresentation(empty, labels)
    expect(view.trigger).toBe(labels.unavailable)
    expect(view.content.value).toBe(labels.unavailable)
    expect(view.content.detail).toBe(labels.unavailable)
    expect(view.content.metrics.every((metric) => metric.value === labels.unavailable)).toBe(true)
    expect(view.notice).toBeNull()
    const html = renderToStaticMarkup(
      <HbarSessionUsageControl controls={empty} labels={labels} onOpenMonitor={() => {}} onRefresh={() => {}} />,
    )
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain(labels.title)
    expect(html).not.toContain('hbar-context-ring-used')
    expect(html).not.toContain('0 tokens')
  }
})

test('budget uses its own fact and preserves warnings at boundaries without infinity', () => {
  const labels = getShellCopy('zh-CN').session.usage
  for (const used of [0, 1, 79, 80, 81, 100, 101]) {
    const view = sessionUsagePresentation(
      { ...empty, budget: budget(used, used >= 100 ? 'exhausted' : 'active') },
      labels,
    )
    expect(view.trigger).toBe(labels.unavailable)
    expect(view.notice).toBe(used >= 100 ? labels.budgetExhausted : used > 80 ? labels.budgetWarning : null)
    expect(view.content.value).toBe(labels.unavailable)
  }
  const view = sessionUsagePresentation({ ...empty, budget: { ...budget(0), limit: 0 } }, labels)
  expect(view.trigger).toBe(labels.unavailable)
  expect(Number.isFinite(view.content.progress)).toBe(true)
})

test('context occupancy and the threshold glyph use current retained input, independent of the execution budget', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).session.usage
    const controls = { ...empty, context: context(78_000), budget: budget(100, 'exhausted') }
    const view = sessionUsagePresentation(controls, labels)
    expect(view.trigger).toBe(labels.usedPercent(78))
    expect(view.usedFraction).toBe(0.78)
    expect(view.thresholdFraction).toBe(0.8)
    expect(view.content.value).toBe(labels.windowUsage(78_000, 100_000))
    expect(view.content.detail).toBe(labels.untilCompaction(2_000))
    expect(view.notice).toBe(labels.budgetExhausted)
    const html = renderToStaticMarkup(
      <HbarSessionUsageControl controls={controls} labels={labels} onOpenMonitor={() => {}} onRefresh={() => {}} />,
    )
    expect(html).toContain('stroke-dasharray="78 100"')
    expect(html).toContain('rotate(288 12 12)')
    expect(html).toContain(labels.usedPercent(78))
    expect(html).toContain(labels.threshold(80, 80_000))
  }
})

test('threshold, capacity and over-capacity boundaries stay finite; output reserve can advance the trigger', () => {
  const labels = getShellCopy('zh-CN').session.usage
  for (const input of [0, 79_999, 80_000, 100_000, 120_000]) {
    const view = sessionUsagePresentation({ ...empty, context: context(input) }, labels)
    expect(view.content.progress).toBeLessThanOrEqual(1)
    expect(view.tone).toBe(input >= 100_000 ? 'danger' : input >= 80_000 ? 'warning' : 'accent')
    expect(view.content.detail).toBe(
      input >= 80_000 ? labels.compactionPending : labels.untilCompaction(80_000 - input),
    )
  }
  const view = sessionUsagePresentation(
    { ...empty, context: context(55_000, { outputReserve: 50_000, compactionTokens: 50_000 }) },
    labels,
  )
  expect(view.thresholdFraction).toBe(0.5)
  expect(view.content.metrics.find((metric) => metric.id === 'effective-threshold')?.value).toBe(
    labels.threshold(50, 50_000),
  )
  expect(view.content.metrics.find((metric) => metric.id === 'threshold')?.value).toBe(labels.threshold(80, 80_000))
})

test('loading, missing model and a foreign session snapshot cannot masquerade as zero occupancy', () => {
  const labels = getShellCopy('zh-CN').session.usage
  expect(sessionUsagePresentation({ ...empty, contextStatus: 'loading' }, labels).trigger).toBe(labels.loading)
  expect(sessionUsagePresentation({ ...empty, context: context(100, { sessionId: 'foreign' }) }, labels).trigger).toBe(
    labels.unavailable,
  )
  expect(
    sessionUsagePresentation(
      {
        ...empty,
        context: context(0, {
          status: 'no-model',
          modelId: null,
          inputTokens: null,
          contextWindow: null,
          compactionTokens: null,
        }),
      },
      labels,
    ).trigger,
  ).toBe(labels.noModel)
})
