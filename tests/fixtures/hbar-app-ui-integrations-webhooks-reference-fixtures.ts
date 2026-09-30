import type { HbarAppUiIntegrationContent } from '../../packages/hbar-app-ui/src/index'

type WebhooksFixture = NonNullable<HbarAppUiIntegrationContent['webhooks']>

export function createIntegrationWebhooksReferenceFixture(locale: 'en' | 'de-long' = 'en'): WebhooksFixture {
  const isGerman = locale === 'de-long'
  return {
    referenceLayout: {
      ownerId: 'integrations:webhooks:workspace',
      endpointDetails: [
        {
          endpointId: 'northwind-usage',
          url: 'https://hooks.northwind.dev/halcyon/usage',
          topics: ['usage.rollup', 'usage.threshold'],
        },
        // Alternate HTTPS details are host-fixture seeds; the cached source
        // captures only expose these endpoints in the selector list.
        {
          endpointId: 'cedar-events',
          url: 'https://api.cedarlabs.io/v2/events',
          topics: ['deploy.completed'],
        },
        {
          endpointId: 'harbor-audit',
          url: 'https://harbor.internal/ingest/audit',
          topics: [],
        },
      ],
      labels: { endpointEnabled: isGerman ? 'Endpunkt aktiviert' : 'Endpoint enabled' },
    },
    labels: {
      endpointsTitle: isGerman ? 'Endpunkte' : 'Endpoints',
      addEndpoint: isGerman ? 'Endpunkt hinzufügen' : 'Add endpoint',
      endpointAction: (address) => (isGerman ? `${address} auswählen` : `Select ${address}`),
      selectedEndpointLabel: isGerman ? 'Ausgewählter Endpunkt' : 'Selected endpoint',
      sendTest: isGerman ? 'Test senden' : 'Send test',
      enabled: isGerman ? 'Aktiviert' : 'Enabled',
      disabled: isGerman ? 'Deaktiviert' : 'Disabled',
      toggleEndpoint: (address) => (isGerman ? `${address} aktivieren oder deaktivieren` : `Toggle ${address}`),
      emptyEndpoints: isGerman ? 'Es sind keine Endpunkte eingerichtet.' : 'No endpoints configured.',
      emptyDeliveries: isGerman
        ? 'Für diesen Endpunkt sind keine Zustellungen vorhanden.'
        : 'No deliveries for this endpoint.',
      deliveryCount: (count) => (isGerman ? `${count} Zustellungen werden angezeigt` : `${count} deliveries shown`),
      openDelivery: (event) => (isGerman ? `Zustellung für ${event} ein- oder ausblenden` : `Open ${event} delivery`),
    },
    endpoints: [
      {
        id: 'northwind-usage',
        address: 'hooks.northwind.dev/halcyon/usage',
        detail: isGerman ? '2 Ereignisse · 99,8 % zugestellt' : '2 events · 99.8% delivered',
        enabled: true,
      },
      {
        id: 'cedar-events',
        address: 'api.cedarlabs.io/v2/events',
        detail: isGerman ? '3 Ereignisse · 97,1 % zugestellt' : '3 events · 97.1% delivered',
        enabled: true,
      },
      {
        id: 'harbor-audit',
        address: 'harbor.internal/ingest/audit',
        detail: isGerman ? '3 Ereignisse · 100 % zugestellt' : '3 events · 100% delivered',
        enabled: false,
      },
    ],
    initialEndpointId: 'northwind-usage',
    initialOpenDeliveryId: 'delivery-91a2',
    topics: ['usage.rollup', 'usage.threshold'],
    deliveries: [
      {
        id: 'delivery-91a2',
        endpointId: 'northwind-usage',
        status: '200',
        statusTone: 'positive',
        event: 'usage.rollup',
        attempt: isGerman ? '1 Versuch' : '1 attempt',
        duration: '128 ms',
        timestamp: '09:41:02',
        payload: '{ "workspace": "wrk_2f81", "units": 41822, "window": 10000 }',
      },
      {
        id: 'delivery-91a3',
        endpointId: 'northwind-usage',
        status: '200',
        statusTone: 'positive',
        event: 'usage.threshold',
        attempt: isGerman ? '1 Versuch' : '1 attempt',
        duration: '96 ms',
        timestamp: '09:40:11',
      },
      {
        id: 'delivery-91a4',
        endpointId: 'northwind-usage',
        status: '500',
        statusTone: 'danger',
        event: 'usage.rollup',
        attempt: isGerman ? '3 Versuche' : '3 attempts',
        duration: '4021 ms',
        timestamp: '09:38:44',
      },
      {
        id: 'delivery-cedar',
        endpointId: 'cedar-events',
        status: '202',
        statusTone: 'positive',
        event: 'deploy.completed',
        attempt: isGerman ? '1 Versuch' : '1 attempt',
        duration: '153 ms',
        timestamp: '09:34:12',
      },
    ],
    endpointListStrategy: { kind: 'content-grown', expectedMaximum: 12 },
    deliveryListStrategy: { kind: 'pane-scroll', expectedMaximum: 50 },
  }
}
