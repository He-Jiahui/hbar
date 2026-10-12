import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { HbarAppUiIntegrationContent } from '../packages/hbar-app-ui/src/index'
import { ReferenceWebhooksIntegration } from '../packages/lumen-app-ui/src/integrations/ReferenceWebhooksIntegration'
import { createIntegrationWebhooksReferenceFixture } from './fixtures/hbar-app-ui-integrations-webhooks-reference-fixtures'

type WebhooksContent = NonNullable<HbarAppUiIntegrationContent['webhooks']>

function renderWebhooks(content: WebhooksContent): string {
  return renderToStaticMarkup(
    createElement(ReferenceWebhooksIntegration, {
      spec: { id: 'integrations-webhooks-preview', variant: 4, profile: {} },
      content,
      layout: content.referenceLayout ?? {
        ownerId: 'integrations:webhooks:test',
        endpointDetails: [],
        labels: { endpointEnabled: 'Endpoint enabled' },
      },
      onAction: () => undefined,
    }),
  )
}

function withWebhookFlow(
  content: WebhooksContent,
  options: {
    readonly endpointId?: string | null
    readonly expandedDeliveryIds?: readonly string[]
    readonly enabled?: readonly { readonly endpointId: string; readonly enabled: boolean }[]
  } = {},
): WebhooksContent {
  return {
    ...content,
    referenceFlow: {
      endpointId: options.endpointId ?? content.initialEndpointId,
      expandedDeliveryIds:
        options.expandedDeliveryIds ?? (content.initialOpenDeliveryId ? [content.initialOpenDeliveryId] : []),
      enabled:
        options.enabled ??
        content.endpoints.map((endpoint) => ({
          endpointId: endpoint.id,
          enabled: endpoint.enabled,
        })),
      onEndpointChange: () => undefined,
      onEndpointEnabledChange: () => undefined,
      onDeliveryToggle: () => undefined,
    },
  }
}

describe('integrations reference webhooks', () => {
  test('renders the endpoint selector, source HTTPS details, topics, and expandable delivery payload', () => {
    const content = withWebhookFlow(createIntegrationWebhooksReferenceFixture())
    const markup = renderWebhooks(content)

    expect(markup).toContain('https://hooks.northwind.dev/halcyon/usage')
    expect(markup).toContain('usage.rollup')
    expect(markup).toContain('usage.threshold')
    expect(markup).toContain('Send test')
    expect(markup).toContain('aria-label="Endpoint enabled"')
    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toContain(
      '{ &quot;workspace&quot;: &quot;wrk_2f81&quot;, &quot;units&quot;: 41822, &quot;window&quot;: 10000 }',
    )
    expect(markup).toContain('3 deliveries shown')
    expect(markup.match(/data-hbar-app-ui-item-id="northwind-usage"/g)).toHaveLength(1)
  })

  test('keeps alternate endpoint URL, topics, enabled state, and delivery disclosure target-bound', () => {
    const content = createIntegrationWebhooksReferenceFixture()
    const alternate = withWebhookFlow(content, {
      endpointId: 'cedar-events',
      expandedDeliveryIds: ['delivery-cedar'],
      enabled: [{ endpointId: 'cedar-events', enabled: false }],
    })
    const markup = renderWebhooks(alternate)

    expect(markup).toContain('https://api.cedarlabs.io/v2/events')
    expect(markup).toContain('deploy.completed')
    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toMatch(/<input aria-label="Endpoint enabled"[^>]*type="checkbox"/)
    expect(markup).not.toMatch(/<input aria-label="Endpoint enabled"[^>]* checked=/)
    expect(markup).not.toContain('usage.rollup')
    expect(markup).toContain('1 deliveries shown')
  })

  test('uses long localized copy and handles empty, one, stale, duplicate, and over-bound collections', () => {
    const base = createIntegrationWebhooksReferenceFixture()
    const localized = withWebhookFlow(createIntegrationWebhooksReferenceFixture('de-long'))
    expect(renderWebhooks(localized)).toContain('Test senden')
    expect(renderWebhooks(localized)).toContain('Zustellungen werden angezeigt')

    const empty = withWebhookFlow(
      { ...base, endpoints: [], deliveries: [] },
      {
        endpointId: 'stale-endpoint',
        expandedDeliveryIds: ['stale-delivery'],
      },
    )
    const emptyMarkup = renderWebhooks(empty)
    expect(emptyMarkup).toContain(base.labels.emptyEndpoints)
    expect(emptyMarkup).not.toContain('Send test')

    const oneEndpoint = withWebhookFlow({
      ...base,
      endpoints: base.endpoints.slice(0, 1),
      deliveries: [],
      endpointListStrategy: { kind: 'content-grown', expectedMaximum: 1 },
    })
    expect(renderWebhooks(oneEndpoint)).toContain(base.labels.emptyDeliveries)

    const duplicate = withWebhookFlow(
      {
        ...base,
        endpoints: [...base.endpoints, { ...base.endpoints[0]!, address: 'Duplicate endpoint' }],
        deliveries: [...base.deliveries, { ...base.deliveries[0]!, event: 'Duplicate delivery' }],
      },
      {
        endpointId: 'missing-endpoint',
        expandedDeliveryIds: ['missing-delivery', 'delivery-91a2'],
        enabled: [{ endpointId: 'stale-endpoint', enabled: false }],
      },
    )
    const duplicateMarkup = renderWebhooks(duplicate)
    expect(duplicateMarkup).not.toContain('Duplicate endpoint')
    expect(duplicateMarkup).not.toContain('Duplicate delivery')
    expect(duplicateMarkup).toContain('https://hooks.northwind.dev/halcyon/usage')

    const twoDeliveries = withWebhookFlow({
      ...base,
      deliveries: base.deliveries.slice(0, 2),
      deliveryListStrategy: { kind: 'pane-scroll', expectedMaximum: 2 },
    })
    const threeDeliveries = withWebhookFlow({
      ...base,
      deliveryListStrategy: { kind: 'pane-scroll', expectedMaximum: 2 },
    })
    expect(renderWebhooks(twoDeliveries).match(/data-hbar-app-ui-item-id="delivery-[^"]+"/g)).toHaveLength(2)
    expect(renderWebhooks(threeDeliveries)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(renderWebhooks(threeDeliveries).match(/data-hbar-app-ui-item-id="delivery-[^"]+"/g)).toHaveLength(3)
  })
})
