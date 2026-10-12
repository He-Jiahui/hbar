import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/catalog'
import { HbarAppUiSupportProvider, type HbarAppUiSupportContent } from '../packages/hbar-app-ui/src/index'
import type { LumenSupportRequestsReferenceFlow } from '@lumen/app-ui/catalog'
import { createSupportRequestsReferenceFixture } from './fixtures/hbar-app-ui-support-requests-reference-fixtures'

const { spec, component: Component } = getHbarAppUiVariant('support', 5)

type RequestsContent = NonNullable<HbarAppUiSupportContent['requests']>

function renderRequests(requests: RequestsContent, instances = 1): string {
  const content: HbarAppUiSupportContent = { requests }
  return renderToStaticMarkup(
    createElement(HbarAppUiSupportProvider, {
      content,
      children: createElement(
        'div',
        null,
        ...Array.from({ length: instances }, (_, index) => createElement(Component, { key: index, spec })),
      ),
    }),
  )
}

function withFlow(requests: RequestsContent, statusId: string | null, query: string): RequestsContent {
  const referenceFlow: LumenSupportRequestsReferenceFlow = {
    statusId,
    query,
    onStatusChange() {},
    onQueryChange() {},
  }
  return { ...requests, referenceFlow }
}

function requestTargetIds(markup: string): string[] {
  return [...markup.matchAll(/data-hbar-app-ui-action="open-request" data-hbar-app-ui-target-id="([^"]+)"/g)].flatMap(
    (match) => (match[1] ? [match[1]] : []),
  )
}

describe('support requests reference', () => {
  test('renders the source heading, pressed filters, search box, six native-list rows, and footer', () => {
    const requests = createSupportRequestsReferenceFixture()
    const markup = renderRequests(requests)

    expect(markup).toContain('Your requests')
    expect(markup).toContain('3 open · 1 waiting on your reply')
    expect(markup).toContain('data-hbar-app-ui-action="new-request"')
    expect(markup.match(/data-hbar-app-ui-action="filter-status"/g)).toHaveLength(3)
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('aria-pressed="false"')
    expect(markup).not.toContain('role="tablist"')
    expect(markup).not.toContain('role="tab"')
    expect(markup).toContain('type="search"')
    expect(markup).toContain('aria-label="Search your requests"')
    expect(markup).toContain('data-hbar-app-ui-field="query"')
    expect(markup).toContain('Ticket')
    expect(markup).toContain('Subject')
    expect(markup).toContain('Status')
    expect(markup).toContain('Updated')
    expect(markup).toContain('<ul class="lumen-support-requests-reference-rows"')
    expect(markup.match(/class="lumen-support-requests-reference-item"/g)).toHaveLength(6)
    expect(markup.match(/data-hbar-app-ui-action="open-request"/g)).toHaveLength(6)
    expect(markup).toContain('Resolved requests stay readable for 12 months. Replying to one reopens it.')
    expect(markup).not.toContain('data-hbar-app-ui-target-id="new-request"')
  })

  test('filters by the source Open choice, including waiting requests, without changing full-list summary', () => {
    const requests = createSupportRequestsReferenceFixture()
    const markup = renderRequests(withFlow(requests, 'open', ''))

    expect(requestTargetIds(markup)).toEqual(['#4192', '#4188', '#4171'])
    expect(markup).toContain(
      'aria-pressed="true" data-hbar-app-ui-action="filter-status" data-hbar-app-ui-target-id="open"',
    )
    expect(markup).toContain('Waiting on you')
    expect(markup).toContain('3 open · 1 waiting on your reply')
  })

  test('searches request IDs and titles within the controlled Resolved filter', () => {
    const requests = createSupportRequestsReferenceFixture()
    const markup = renderRequests(withFlow(requests, 'resolved', '#4110'))

    expect(requestTargetIds(markup)).toEqual(['#4110'])
    expect(markup).toContain('Dashboard filter resets between tabs')
    expect(markup).not.toContain('Webhook retries stop after one failure')
    expect(markup).toContain('3 open · 1 waiting on your reply')
  })

  test('shows the host empty state and preserves unique source rows beyond the estimate', () => {
    const source = createSupportRequestsReferenceFixture()
    const empty = renderRequests({ ...source, requests: [] })
    expect(empty).toContain('No requests match')
    expect(empty).toContain('0 open · 0 waiting on your reply')
    expect(requestTargetIds(empty)).toEqual([])
    const firstRequest = source.requests[0]
    if (!firstRequest) throw new Error('Expected the first source support request')

    const extended = renderRequests({
      ...source,
      listStrategy: { kind: 'pane-scroll', expectedMaximum: 6 },
      requests: [
        ...source.requests,
        { ...firstRequest, title: 'Duplicate id is discarded by stable ID' },
        {
          id: '#4000',
          title: 'An additional host-projected request',
          detail: 'Reports and exports · Sofia Alvarez · 1 reply',
          statusId: 'open',
          status: 'Open',
          tone: 'neutral',
          updated: 'Today',
        },
      ],
    })

    expect(requestTargetIds(extended)).toHaveLength(7)
    expect(requestTargetIds(extended)).toContain('#4000')
    expect(extended).toContain('An additional host-projected request')
    expect(extended).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })

  test('localizes long controls and keeps independent search IDs across instances', () => {
    const requests = createSupportRequestsReferenceFixture('de-long')
    const markup = renderRequests(requests, 2)

    expect(markup).toContain('Ihre Support-Anfragen')
    expect(markup).toContain('Support-Anfragen nach Status filtern')
    expect(markup).toContain('Ihre Anfragen nach Betreff oder Ticketnummer durchsuchen')
    expect(markup).toContain('Gelöste Anfragen bleiben zwölf Monate lang lesbar.')
    expect(markup).toContain('Sitzanzahl sank nach dem Entfernen eines Nutzers nicht')
    const ids = [...markup.matchAll(/id="([^"]+)"[^>]*data-hbar-app-ui-field="query"/g)].flatMap((match) =>
      match[1] ? [match[1]] : [],
    )
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })
})
