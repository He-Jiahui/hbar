import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiAgentApprovalProvider,
  type HbarAppUiAgentApprovalContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createApprovalPreviewStore,
  projectApprovalPreviewContent,
} from '../apps/hbar-app-ui-preview/src/approval-preview-model'
import {
  HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
  createHbarAppUiAgentApprovalLocalizedFixtures,
} from './fixtures/hbar-app-ui-agent-approval-fixtures'

const base = HBAR_APP_UI_AGENT_APPROVAL_FIXTURES
const queue = base.queue
if (!queue) throw new Error('Queue fixture is required')

function render(content: HbarAppUiAgentApprovalContent): string {
  return renderToStaticMarkup(
    createElement(HbarAppUiAgentApprovalProvider, {
      content,
      children: createElement(getHbarAppUiVariant('agent-approval', 3).component),
    }),
  )
}

describe('host-controlled approval queue', () => {
  test('keeps ten original rows through all eight real decision paths', () => {
    for (let mask = 0; mask < 8; mask += 1) {
      const store = createApprovalPreviewStore(base)
      expect(render(projectApprovalPreviewContent(store.getState()))).toContain('3 waiting')
      for (const [index, id] of ['refund', 'renewal', 'campaigns'].entries()) {
        const decision = mask & (1 << index) ? 'approved' : 'rejected'
        store.getState().decide(id, decision)
        const current = projectApprovalPreviewContent(store.getState())
        const markup = render(current)
        expect(markup).toContain(`${2 - index} waiting`)
        expect(markup.match(/data-hbar-app-ui-item-id=/g)).toHaveLength(10)
        expect(current.queue?.pending[index]?.state).toBe(decision === 'approved' ? 'approved' : 'skipped')
        expect(markup).toContain(queue.outcomes[decision].announcement)
        if (index === 2) expect(markup).not.toContain('<button')
        else expect(markup).toContain('aria-expanded="false"')
      }
    }
  })

  test('ignores out-of-order, duplicate, busy and stale-ID decisions', () => {
    const store = createApprovalPreviewStore(base)
    store.getState().decide('campaigns', 'approved')
    expect(store.getState().decisions.size).toBe(0)
    store.getState().replace({ ...base, queue: { ...queue, busyId: 'refund' } })
    store.getState().decide('refund', 'approved')
    expect(store.getState().decisions.size).toBe(0)
    store.getState().replace(base)
    store.getState().decide('refund', 'approved')
    store.getState().decide('refund', 'rejected')
    expect(projectApprovalPreviewContent(store.getState()).queue?.pending[0]?.state).toBe('approved')
    const originalAction = store.getState().decide
    store.getState().replace({ ...base, queue: { ...queue, pending: queue.pending.slice(1) } })
    originalAction('refund', 'rejected')
    expect(store.getState().decisions.size).toBe(0)
    expect(render(projectApprovalPreviewContent(store.getState()))).toContain('2 waiting')
    originalAction('renewal', 'rejected')
    expect(projectApprovalPreviewContent(store.getState()).queue?.pending[0]?.state).toBe('skipped')
  })

  test('drops a removed request announcement even when an older decision remains', () => {
    const store = createApprovalPreviewStore(base)
    store.getState().decide('refund', 'approved')
    store.getState().decide('renewal', 'rejected')
    store
      .getState()
      .replace({ ...base, queue: { ...queue, pending: queue.pending.filter((item) => item.id !== 'renewal') } })
    expect(store.getState().decisions.size).toBe(1)
    expect(projectApprovalPreviewContent(store.getState()).queue?.announcement).toBeUndefined()
  })

  test('derives localized outcomes without storing translated state or affecting another host', () => {
    const first = createApprovalPreviewStore(base)
    const second = createApprovalPreviewStore(base)
    first.getState().decide('refund', 'approved')
    first.getState().replace(createHbarAppUiAgentApprovalLocalizedFixtures())
    const markup = render(projectApprovalPreviewContent(first.getState()))
    expect(markup).toContain('Genehmigt')
    expect(markup).toContain('2 Entscheidungen warten')
    expect(markup).not.toContain('Approved. Next request is ready.')
    expect(render(projectApprovalPreviewContent(second.getState()))).toContain('3 waiting')
    expect(second.getState().decisions.size).toBe(0)
  })

  test('renders empty, single, maximum and over-bound lists without dropping records', () => {
    for (const count of [0, 1, queue.listStrategy.expectedMaximum, queue.listStrategy.expectedMaximum + 1]) {
      const pending = Array.from({ length: count }, (_, index) => ({
        id: `host-${index}`,
        title: `Host request ${index}`,
        detail: '',
        state: 'queued' as const,
        stateLabel: 'Queued',
        when: '',
        expandable: false,
      }))
      const markup = render({ ...base, queue: { ...queue, pending, history: [] } })
      expect(markup.match(/data-hbar-app-ui-item-id=/g) ?? []).toHaveLength(count)
      expect(markup).toContain(`${count} waiting`)
      expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
      expect(markup).not.toContain('Show request')
      if (!count) expect(markup).not.toContain('<button')
    }
  })

  test('deduplicates IDs across pending and history while preserving the first row', () => {
    const first = queue.pending[0]
    if (!first) throw new Error('First request required')
    const markup = render({
      ...base,
      queue: {
        ...queue,
        pending: [first, { ...first, title: 'Duplicate pending' }],
        history: [{ ...first, title: 'Duplicate history' }],
      },
    })
    expect(markup.match(/data-hbar-app-ui-item-id=/g)).toHaveLength(1)
    expect(markup).toContain('1 waiting')
    expect(markup).not.toContain('Duplicate')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('<pre')
  })
})
