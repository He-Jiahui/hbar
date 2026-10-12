'use client'

import * as React from 'react'
import { LumenToggleControl } from '../forms'
import { ChevronDown, Plus, RotateCcw, Webhook } from './glyphs'
import type { LumenIntegrationDelivery, LumenIntegrationEndpoint, LumenIntegrationWebhookContent } from './content'
import type { LumenIntegrationsCompositionProps } from './primitives'
import type { LumenIntegrationWebhookReferenceLayout } from './reference-content'
import {
  IntegrationButton,
  IntegrationEmpty,
  IntegrationFrame,
  IntegrationIcon,
  IntegrationIconButton,
} from './primitives'
import './reference-webhooks.css'

export interface ReferenceWebhooksIntegrationProps extends LumenIntegrationsCompositionProps {
  readonly content: LumenIntegrationWebhookContent
  readonly layout: LumenIntegrationWebhookReferenceLayout
}

function uniqueById<Item extends { readonly id: string }>(items: readonly Item[]): Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

function uniqueStrings(items: readonly string[]): string[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.trim() || seen.has(item)) {
      return false
    }
    seen.add(item)
    return true
  })
}

function currentEndpoint(
  endpoints: readonly LumenIntegrationEndpoint[],
  selectedId: string | null | undefined,
  initialId: string,
): LumenIntegrationEndpoint | undefined {
  if (selectedId) {
    const selected = endpoints.find((endpoint) => endpoint.id === selectedId)
    if (selected) {
      return selected
    }
  }
  return endpoints.find((endpoint) => endpoint.id === initialId) ?? endpoints[0]
}

export function ReferenceWebhooksIntegration({ spec, onAction, content, layout }: ReferenceWebhooksIntegrationProps) {
  const idPrefix = React.useId()
  const endpoints = uniqueById(content.endpoints)
  const endpointIds = new Set(endpoints.map((endpoint) => endpoint.id))
  const endpointDetailsById = new Map<string, (typeof layout.endpointDetails)[number]>()
  for (const details of layout.endpointDetails) {
    if (details.endpointId.trim() && !endpointDetailsById.has(details.endpointId)) {
      endpointDetailsById.set(details.endpointId, details)
    }
  }
  const selectedEndpoint = currentEndpoint(endpoints, content.referenceFlow?.endpointId, content.initialEndpointId)
  const activeDetails = selectedEndpoint ? endpointDetailsById.get(selectedEndpoint.id) : undefined
  const enabledValues = new Map<string, boolean>()
  for (const state of content.referenceFlow?.enabled ?? []) {
    if (endpointIds.has(state.endpointId) && !enabledValues.has(state.endpointId)) {
      enabledValues.set(state.endpointId, state.enabled)
    }
  }
  const deliveries = selectedEndpoint
    ? uniqueById(content.deliveries.filter((delivery) => delivery.endpointId === selectedEndpoint.id))
    : []
  const validDeliveryIds = new Set(deliveries.map((delivery) => delivery.id))
  const expandedDeliveryIds = new Set<string>()
  const sourceExpandedId = content.referenceFlow ? undefined : content.initialOpenDeliveryId
  for (const deliveryId of content.referenceFlow?.expandedDeliveryIds ?? [sourceExpandedId ?? '']) {
    if (validDeliveryIds.has(deliveryId)) {
      expandedDeliveryIds.add(deliveryId)
    }
  }

  return (
    <IntegrationFrame spec={spec} onAction={onAction} className="hbar-app-ui-integration-reference-webhooks-surface">
      <main className="hbar-app-ui-integration-reference-webhooks-layout" data-hbar-app-ui-owner-id={layout.ownerId}>
        <aside
          className="hbar-app-ui-integration-reference-webhooks-endpoints"
          aria-labelledby={`${idPrefix}-endpoints-heading`}
        >
          <header>
            <h2 id={`${idPrefix}-endpoints-heading`}>{content.labels.endpointsTitle}</h2>
            <IntegrationIconButton
              type="button"
              label={content.labels.addEndpoint}
              onClick={() => onAction?.({ variantId: spec.id, actionId: 'add-endpoint' })}
            >
              <IntegrationIcon tier="sm">
                <Plus />
              </IntegrationIcon>
            </IntegrationIconButton>
          </header>
          {endpoints.length ? (
            <ul
              className="hbar-app-ui-integration-reference-webhooks-endpoint-list"
              aria-label={content.labels.endpointsTitle}
              data-hbar-app-ui-list-strategy={content.endpointListStrategy.kind}
            >
              {endpoints.map((endpoint) => {
                const isSelected = endpoint.id === selectedEndpoint?.id
                const enabled = enabledValues.get(endpoint.id) ?? endpoint.enabled
                return (
                  <li key={endpoint.id} data-hbar-app-ui-item-id={endpoint.id}>
                    <IntegrationButton
                      className="hbar-app-ui-integration-reference-webhooks-endpoint-button"
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={content.labels.endpointAction(endpoint.address)}
                      disabled={!content.referenceFlow}
                      onClick={() => content.referenceFlow?.onEndpointChange(endpoint.id)}
                    >
                      <span className="hbar-app-ui-integration-reference-webhooks-endpoint-title">
                        <strong>
                          <IntegrationIcon tier="sm">
                            <Webhook />
                          </IntegrationIcon>
                          {endpoint.address}
                        </strong>
                        <i
                          className={`hbar-app-ui-integration-reference-webhooks-endpoint-dot ${enabled ? 'is-enabled' : ''}`}
                          aria-hidden="true"
                        />
                      </span>
                      <small>{endpoint.detail}</small>
                    </IntegrationButton>
                  </li>
                )
              })}
            </ul>
          ) : (
            <IntegrationEmpty message={content.labels.emptyEndpoints} />
          )}
        </aside>

        <section
          className="hbar-app-ui-integration-reference-webhooks-main"
          aria-label={content.labels.selectedEndpointLabel}
        >
          {selectedEndpoint ? (
            <React.Fragment>
              <header className="hbar-app-ui-integration-reference-webhooks-head">
                <div className="hbar-app-ui-integration-reference-webhooks-title">
                  <p className="hbar-app-ui-integration-reference-webhooks-url">
                    {activeDetails?.url ?? selectedEndpoint.address}
                  </p>
                  {uniqueStrings(activeDetails?.topics ?? []).length ? (
                    <ul className="hbar-app-ui-integration-reference-webhooks-topics">
                      {uniqueStrings(activeDetails?.topics ?? []).map((topic) => (
                        <li key={topic}>{topic}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="hbar-app-ui-integration-reference-webhooks-controls">
                  <IntegrationButton
                    type="button"
                    onClick={() =>
                      onAction?.({
                        variantId: spec.id,
                        actionId: 'send-test',
                        value: selectedEndpoint.id,
                      })
                    }
                  >
                    <IntegrationIcon tier="sm">
                      <RotateCcw />
                    </IntegrationIcon>
                    {content.labels.sendTest}
                  </IntegrationButton>
                  <LumenToggleControl
                    aria-label={layout.labels.endpointEnabled}
                    checked={enabledValues.get(selectedEndpoint.id) ?? selectedEndpoint.enabled}
                    disabled={!content.referenceFlow}
                    id={`${idPrefix}-enabled`}
                    onChange={(event) =>
                      content.referenceFlow?.onEndpointEnabledChange(selectedEndpoint.id, event.currentTarget.checked)
                    }
                  />
                </div>
              </header>

              <div
                className="hbar-app-ui-integration-reference-webhooks-delivery-list"
                role="list"
                data-hbar-app-ui-list-strategy={content.deliveryListStrategy.kind}
              >
                {deliveries.length ? (
                  deliveries.map((delivery: LumenIntegrationDelivery) => {
                    const isExpanded = expandedDeliveryIds.has(delivery.id)
                    return (
                      <article
                        className={`hbar-app-ui-integration-reference-webhooks-delivery hbar-app-ui-integration-tone-${delivery.statusTone}`}
                        role="listitem"
                        key={delivery.id}
                        data-hbar-app-ui-item-id={delivery.id}
                      >
                        <IntegrationButton
                          className="hbar-app-ui-integration-reference-webhooks-delivery-trigger"
                          type="button"
                          aria-expanded={isExpanded}
                          aria-label={content.labels.openDelivery(delivery.event)}
                          disabled={!content.referenceFlow}
                          onClick={() => content.referenceFlow?.onDeliveryToggle(selectedEndpoint.id, delivery.id)}
                        >
                          <IntegrationIcon tier="sm">
                            <ChevronDown />
                          </IntegrationIcon>
                          <strong>{delivery.status}</strong>
                          <span>{delivery.event}</span>
                          <small>{delivery.attempt}</small>
                          <small>{delivery.duration}</small>
                          <small>{delivery.timestamp}</small>
                        </IntegrationButton>
                        {isExpanded && delivery.payload ? (
                          <pre className="hbar-app-ui-integration-reference-webhooks-payload">{delivery.payload}</pre>
                        ) : null}
                      </article>
                    )
                  })
                ) : (
                  <IntegrationEmpty message={content.labels.emptyDeliveries} />
                )}
              </div>
              <footer className="hbar-app-ui-integration-reference-webhooks-footer">
                {content.labels.deliveryCount(deliveries.length)}
              </footer>
            </React.Fragment>
          ) : (
            <IntegrationEmpty message={content.labels.emptyEndpoints} />
          )}
        </section>
      </main>
    </IntegrationFrame>
  )
}
