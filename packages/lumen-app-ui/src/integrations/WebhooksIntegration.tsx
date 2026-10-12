import { LumenToggleControl } from '../forms'
import { LumenButton } from '../primitives'
import { ChevronDown, Plus, RotateCcw, Webhook } from './glyphs'
import { useMemo, useState } from 'react'
import {
  type LumenIntegrationsCompositionProps,
  IntegrationButton,
  IntegrationEmpty,
  IntegrationFrame,
  IntegrationIcon,
  IntegrationIconButton,
  IntegrationStatus,
} from './primitives'
import { type LumenIntegrationWebhookContent, selectLumenIntegrationItem, uniqueLumenIntegrationItems } from './content'

export function WebhooksIntegration({
  spec,
  onAction,
  content,
}: LumenIntegrationsCompositionProps & {
  readonly content: LumenIntegrationWebhookContent
}) {
  const endpoints = useMemo(() => uniqueLumenIntegrationItems(content.endpoints), [content.endpoints])
  const initialEndpoint = selectLumenIntegrationItem(endpoints, content.initialEndpointId)
  const [endpointId, setEndpointId] = useState(initialEndpoint?.id ?? '')
  const [enabledValues, setEnabledValues] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(endpoints.map((endpoint) => [endpoint.id, endpoint.enabled])),
  )
  const [openDeliveryId, setOpenDeliveryId] = useState<string | undefined>(content.initialOpenDeliveryId)
  const endpoint = selectLumenIntegrationItem(endpoints, endpointId)
  const deliveries = useMemo(
    () => uniqueLumenIntegrationItems(content.deliveries).filter((delivery) => delivery.endpointId === endpoint?.id),
    [content.deliveries, endpoint?.id],
  )

  const selectEndpoint = (nextId: string) => {
    setEndpointId(nextId)
    setOpenDeliveryId(content.initialOpenDeliveryId)
    onAction?.({ variantId: spec.id, actionId: 'select-endpoint', value: nextId })
  }

  const toggleEnabled = (enabled: boolean) => {
    if (!endpoint) return
    setEnabledValues((current) => ({ ...current, [endpoint.id]: enabled }))
    onAction?.({
      variantId: spec.id,
      actionId: 'toggle-endpoint',
      value: `${endpoint.id}:${enabled}`,
    })
  }

  return (
    <IntegrationFrame spec={spec} onAction={onAction} className="hbar-app-ui-integration-webhooks-surface">
      <main className="hbar-app-ui-integration-webhooks-layout">
        <aside className="hbar-app-ui-integration-endpoints-pane">
          <header>
            <h1>{content.labels.endpointsTitle}</h1>
            <IntegrationIconButton
              type="button"
              label={content.labels.addEndpoint}
              onClick={() => onAction?.({ variantId: spec.id, actionId: 'add-endpoint' })}
            >
              <Plus />
            </IntegrationIconButton>
          </header>
          {endpoints.length ? (
            <div
              className="hbar-app-ui-integration-endpoint-list"
              role="list"
              data-hbar-app-ui-list-strategy={content.endpointListStrategy.kind}
            >
              {endpoints.map((item) => (
                <LumenButton
                  className="hbar-app-ui-integration-endpoint-button"
                  role="listitem"
                  type="button"
                  key={item.id}
                  aria-pressed={item.id === endpoint?.id}
                  aria-label={content.labels.endpointAction(item.address)}
                  onClick={() => selectEndpoint(item.id)}
                  data-hbar-app-ui-item-id={item.id}
                >
                  <span>
                    <strong>
                      <IntegrationIcon tier="sm">
                        <Webhook />
                      </IntegrationIcon>
                      {item.address}
                    </strong>
                    <i
                      className={`hbar-app-ui-integration-endpoint-dot ${(enabledValues[item.id] ?? item.enabled) ? 'is-enabled' : ''}`}
                      aria-hidden="true"
                    />
                  </span>
                  <small>{item.detail}</small>
                </LumenButton>
              ))}
            </div>
          ) : (
            <IntegrationEmpty message={content.labels.emptyEndpoints} />
          )}
        </aside>
        <section className="hbar-app-ui-integration-webhook-main">
          {endpoint ? (
            <>
              <header className="hbar-app-ui-integration-webhook-head">
                <div className="hbar-app-ui-integration-webhook-title">
                  <h1>{endpoint.address}</h1>
                  <div className="hbar-app-ui-integration-topic-list">
                    {(endpoint.topics ?? content.topics).map((topic) => (
                      <span key={topic}>{topic}</span>
                    ))}
                  </div>
                </div>
                <div className="hbar-app-ui-integration-webhook-controls">
                  <IntegrationButton
                    type="button"
                    onClick={() => onAction?.({ variantId: spec.id, actionId: 'send-test', value: endpoint.id })}
                  >
                    <IntegrationIcon tier="sm">
                      <RotateCcw />
                    </IntegrationIcon>
                    {content.labels.sendTest}
                  </IntegrationButton>
                  <LumenToggleControl
                    className="hbar-app-ui-integration-switch"
                    aria-label={content.labels.toggleEndpoint(endpoint.address)}
                    checked={enabledValues[endpoint.id] ?? endpoint.enabled}
                    onChange={(event) => toggleEnabled(event.target.checked)}
                  />
                  <IntegrationStatus
                    value={
                      (enabledValues[endpoint.id] ?? endpoint.enabled)
                        ? content.labels.enabled
                        : content.labels.disabled
                    }
                    tone={(enabledValues[endpoint.id] ?? endpoint.enabled) ? 'positive' : 'neutral'}
                  />
                </div>
              </header>
              <div
                className="hbar-app-ui-integration-delivery-list"
                role="list"
                data-hbar-app-ui-list-strategy={content.deliveryListStrategy.kind}
              >
                {deliveries.length ? (
                  deliveries.map((delivery) => (
                    <article
                      className={`hbar-app-ui-integration-delivery hbar-app-ui-integration-tone-${delivery.statusTone}`}
                      role="listitem"
                      key={delivery.id}
                      data-hbar-app-ui-item-id={delivery.id}
                    >
                      <LumenButton
                        className="hbar-app-ui-integration-delivery-trigger"
                        type="button"
                        aria-expanded={openDeliveryId === delivery.id}
                        aria-label={content.labels.openDelivery(delivery.event)}
                        onClick={() => {
                          setOpenDeliveryId((current) => (current === delivery.id ? undefined : delivery.id))
                          onAction?.({
                            variantId: spec.id,
                            actionId: 'toggle-delivery',
                            value: delivery.id,
                          })
                        }}
                      >
                        <IntegrationIcon tier="sm">
                          <ChevronDown />
                        </IntegrationIcon>
                        <strong>{delivery.status}</strong>
                        <span>{delivery.event}</span>
                        <small>{delivery.attempt}</small>
                        <small>{delivery.duration}</small>
                        <small>{delivery.timestamp}</small>
                      </LumenButton>
                      {openDeliveryId === delivery.id && delivery.payload && (
                        <pre className="hbar-app-ui-integration-delivery-payload">{delivery.payload}</pre>
                      )}
                    </article>
                  ))
                ) : (
                  <IntegrationEmpty message={content.labels.emptyDeliveries} />
                )}
              </div>
              <footer className="hbar-app-ui-integration-keys-footer">
                {content.labels.deliveryCount(deliveries.length)}
              </footer>
            </>
          ) : (
            <IntegrationEmpty message={content.labels.emptyEndpoints} />
          )}
        </section>
      </main>
    </IntegrationFrame>
  )
}
;('use client')
