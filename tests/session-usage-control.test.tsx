import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SessionControlsState } from '@hbar/app-runtime'
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

test('usage never invents zero accounting or context occupancy when facts are unavailable', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).session.usage
    const view = sessionUsagePresentation(empty, labels)
    expect(view.trigger).toBe(labels.noBudget)
    expect(view.content.value).toBe(labels.unavailable)
    expect(view.content.detail).toBe(labels.unavailable)
    expect(view.content.metrics.every((metric) => metric.value === labels.unavailable)).toBe(true)
    expect(view.notice).toBeNull()
    const html = renderToStaticMarkup(
      <HbarSessionUsageControl controls={empty} labels={labels} onOpenMonitor={() => {}} />,
    )
    expect(html).not.toContain('popover="auto"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain(labels.noBudget)
    expect(view.content.progress).toBeNull()
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
    expect(view.trigger).toBe(labels.budgetPercent(Math.min(100, used)))
    expect(view.notice).toBe(used >= 100 ? labels.budgetExhausted : used > 80 ? labels.budgetWarning : null)
    expect(view.content.value).toBe(labels.unavailable)
  }
  const view = sessionUsagePresentation({ ...empty, budget: { ...budget(0), limit: 0 } }, labels)
  expect(view.trigger).toBe(labels.noBudget)
  expect(view.content.progress).toBeNull()
})

test('long host labels stay in typed presentation while closed server markup retains the actual trigger', () => {
  const labels = getShellCopy('zh-CN').session.usage
  const title = '当前会话累计结算与预算详情，不是模型上下文窗口占用率的百分比'
  const html = renderToStaticMarkup(
    <HbarSessionUsageControl
      controls={{ ...empty, errors: { model: null, usage: 'DISCONNECTED', budget: null } }}
      labels={{ ...labels, title, trigger: (value) => labels.trigger(value) + title }}
      onOpenMonitor={() => {}}
    />,
  )
  expect(html).toContain(title)
  const view = sessionUsagePresentation(empty, { ...labels, title })
  expect(view.content.title).toBe(title)
  expect(view.content.metrics.map((metric) => metric.label)).toContain(labels.input)
  expect(view.content.metrics.map((metric) => metric.label)).toContain(labels.output)
  expect(html).toContain('aria-hidden="true"')
  expect(html).toContain(labels.error('DISCONNECTED'))
  expect(html).toContain('role="alert"')
})
