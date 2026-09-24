import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAgentApproval05, type LumenAgentApprovalCostContent } from '@lumen/app-ui'
import { createCostPreviewStore, projectCostPreviewContent } from '../apps/hbar-app-ui-preview/src/cost-preview-model'
import {
  HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
  createHbarAppUiAgentApprovalLocalizedFixtures,
} from './fixtures/hbar-app-ui-agent-approval-fixtures'

function fixture(): LumenAgentApprovalCostContent {
  const cost = HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.cost
  if (!cost) throw new Error('Cost fixture required')
  return cost
}
function render(cost: LumenAgentApprovalCostContent | undefined) {
  return renderToStaticMarkup(createElement(LumenAgentApproval05, { content: { cost } }))
}

describe('controlled cost approval', () => {
  test('preserves the estimate reading order without invented landmarks or controls', () => {
    const content = fixture()
    const markup = render(content)
    expect(markup).toContain(`aria-label="${content.labels.title}"`)
    expect(markup.match(/<dt>/g)).toHaveLength(3)
    expect(markup.match(/<dd>/g)).toHaveLength(6)
    expect(markup).toContain('inline-size:74%')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('<pre')
    expect(markup).not.toContain('<main')
    expect(markup).not.toContain('<header')
    expect(markup).not.toContain('role="progressbar"')
  })
  test('both confirmed decisions preserve estimates and expose distinct results', () => {
    const content = fixture()
    for (const decision of ['approved', 'rejected'] as const) {
      const store = createCostPreviewStore(content)
      store.getState().decide(content.requestId, decision)
      const projected = projectCostPreviewContent(store.getState())
      const markup = render(projected)
      expect(projected?.state).toBe(decision)
      expect(markup).toContain(content.outcomes[decision].summary)
      expect(markup).toContain(content.outcomes[decision].announcement)
      expect(markup).toContain(content.outcomes[decision].status)
      expect(markup.match(/<dt>/g)).toHaveLength(3)
      expect(markup).not.toContain('<button')
      expect(markup).not.toContain('<pre')
      const settled = store.getState()
      settled.decide(content.requestId, decision === 'approved' ? 'rejected' : 'approved')
      expect(store.getState()).toBe(settled)
    }
  })
  test('rejects stale, busy, duplicate and already resolved actions', () => {
    const content = fixture()
    const store = createCostPreviewStore(content)
    store.getState().decide('removed-request', 'approved')
    expect(store.getState().decision).toBeUndefined()
    store.getState().replace({ ...content, busy: true })
    store.getState().decide(content.requestId, 'approved')
    expect(store.getState().decision).toBeUndefined()
    expect(render(projectCostPreviewContent(store.getState())).match(/disabled=""/g)).toHaveLength(2)
    store.getState().replace({ ...content, state: 'rejected' })
    store.getState().decide(content.requestId, 'approved')
    expect(projectCostPreviewContent(store.getState())?.state).toBe('rejected')
    store.getState().replace({ ...content, requestId: 'next' })
    store.getState().decide(content.requestId, 'approved')
    expect(store.getState().decision).toBeUndefined()
    store.getState().decide('next', 'approved')
    expect(store.getState().decision).toBe('approved')
  })
  test('localization and reordered metrics preserve identity; another host stays untouched', () => {
    const content = fixture()
    const store = createCostPreviewStore(content)
    const other = createCostPreviewStore(content)
    store.getState().decide(content.requestId, 'approved')
    const localized = createHbarAppUiAgentApprovalLocalizedFixtures().cost
    if (!localized) throw new Error('Localized fixture required')
    store.getState().replace({ ...localized, metrics: [...localized.metrics].reverse() })
    const markup = render(projectCostPreviewContent(store.getState()))
    expect(markup).toContain(localized.outcomes.approved.summary)
    expect(markup).not.toContain('Running in the background')
    expect(other.getState().decision).toBeUndefined()
    store.getState().replace(undefined)
    expect(projectCostPreviewContent(store.getState())).toBeUndefined()
  })
  test('content-grown metrics retain zero, one, normal, over-bound and deduplicated host values', () => {
    const content = fixture()
    for (const count of [0, 1, 3, 4]) {
      const metrics = Array.from({ length: count }, (_, index) => ({
        id: `metric-${index}`,
        label: `Estimate ${index}`,
        value: '1',
        detail: 'Host detail',
      }))
      const markup = render({ ...content, metrics })
      expect(markup.match(/<dt>/g) ?? []).toHaveLength(count)
      expect(markup).toContain('data-hbar-app-ui-list-strategy="content-grown"')
    }
    const metric = content.metrics[0]
    if (!metric) throw new Error('Metric required')
    expect(render({ ...content, metrics: [metric, { ...metric, label: 'Duplicate must not render' }] })).not.toContain(
      'Duplicate must not render',
    )
    for (const [value, expected] of [
      [-1, 0],
      [150, 100],
      [Number.NaN, 0],
      [74, 74],
    ])
      expect(render({ ...content, progress: value ?? 0 })).toContain(`inline-size:${expected}%`)
  })
})
