import type { HbarAppUiIntegrationContent } from '../../packages/hbar-app-ui/src/index'

export const HBAR_APP_UI_INTEGRATIONS_FIXTURES: HbarAppUiIntegrationContent = {
  marketplace: {
    labels: {
      pageTitle: 'Integrations',
      pageDescription: '2 connected · 9 available',
      categoriesLabel: 'Integration categories',
      searchLabel: 'Search integrations',
      searchPlaceholder: 'Search integrations',
      connected: 'Connected',
      connect: 'Connect',
      empty: 'No integrations match this filter.',
      connectAction: (name) => `Connect ${name}`,
    },
    categories: [
      { id: 'all', label: 'All' },
      { id: 'analytics', label: 'Analytics' },
      { id: 'developer', label: 'Developer' },
      { id: 'messaging', label: 'Messaging' },
      { id: 'storage', label: 'Storage' },
      { id: 'security', label: 'Security' },
    ],
    allCategoryId: 'all',
    initialCategoryId: 'all',
    items: [
      {
        id: 'northwind',
        initials: 'NW',
        name: 'Northwind',
        categoryId: 'analytics',
        categoryLabel: 'Analytics',
        description: 'Stream product events into Northwind dashboards.',
        connected: true,
      },
      {
        id: 'cedar',
        initials: 'CL',
        name: 'Cedar Labs',
        categoryId: 'developer',
        categoryLabel: 'Developer',
        description: 'Open an issue whenever a deploy check fails.',
        connected: true,
      },
      {
        id: 'harbor',
        initials: 'HB',
        name: 'Harbor',
        categoryId: 'messaging',
        categoryLabel: 'Messaging',
        description: 'Post alerts and approvals into a shared channel.',
        connected: false,
      },
      {
        id: 'meridian',
        initials: 'MD',
        name: 'Meridian',
        categoryId: 'storage',
        categoryLabel: 'Storage',
        description: 'Archive exports to a bucket you control.',
        connected: false,
      },
      {
        id: 'alder',
        initials: 'AL',
        name: 'Alder',
        categoryId: 'analytics',
        categoryLabel: 'Analytics',
        description: 'Warehouse sync for usage and billing tables.',
        connected: false,
      },
      {
        id: 'fernrock',
        initials: 'FR',
        name: 'Fernrock',
        categoryId: 'developer',
        categoryLabel: 'Developer',
        description: 'Run a workflow when an environment is promoted.',
        connected: false,
      },
      {
        id: 'tidepool',
        initials: 'TP',
        name: 'Tidepool',
        categoryId: 'messaging',
        categoryLabel: 'Messaging',
        description: 'Route incidents to the on-call rotation.',
        connected: false,
      },
      {
        id: 'quarry',
        initials: 'QR',
        name: 'Quarry',
        categoryId: 'storage',
        categoryLabel: 'Storage',
        description: 'Mirror audit logs to cold storage nightly.',
        connected: false,
      },
      {
        id: 'lantern',
        initials: 'LN',
        name: 'Lantern',
        categoryId: 'security',
        categoryLabel: 'Security',
        description: 'Send sign-in anomalies to your SIEM.',
        connected: false,
      },
    ],
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 24 },
  },
  connection: {
    labels: {
      connected: 'Connected',
      disconnected: 'Disconnected',
      sync: 'Sync now',
      disconnect: 'Disconnect',
      permissionsTitle: 'Permissions',
      permissionsDescription: 'Cedar Labs only uses the scopes you leave enabled.',
      required: 'Required',
      toggleScope: (label) => `Toggle ${label}`,
      activityTitle: 'Activity',
      fullAuditLog: 'Full audit log',
      emptyScopes: 'No scopes requested.',
      emptyActivity: 'No connection activity.',
    },
    initials: 'CL',
    name: 'Cedar Labs',
    description: 'Opens an issue whenever a deploy check fails, and reports build results back onto pull requests.',
    initiallyConnected: true,
    scopes: [
      {
        id: 'repositories',
        label: 'Read repositories',
        description: 'Metadata, branches and commit status for 12 repositories.',
        enabled: true,
        required: true,
      },
      {
        id: 'issues',
        label: 'Write issues',
        description: 'Create and comment on issues when a deploy check fails.',
        enabled: true,
      },
      {
        id: 'checks',
        label: 'Write checks',
        description: 'Report build and policy results back onto pull requests.',
        enabled: true,
      },
      {
        id: 'members',
        label: 'Read organization members',
        description: 'Match commit authors to workspace seats.',
        enabled: false,
      },
    ],
    activities: [
      { id: 'scope-update', title: 'Scopes updated by Ana Reyes', date: 'Today 09:41' },
      { id: 'token-refresh', title: 'Token refreshed automatically', date: 'Yesterday 18:02', tone: 'positive' },
      { id: 'rate-limit', title: 'Rate limit reached, retried after 40s', date: 'Mar 12', tone: 'warning' },
      { id: 'connected', title: 'Connected by Marco Silva', date: 'Mar 04' },
    ],
    scopeListStrategy: { kind: 'content-grown', expectedMaximum: 12 },
    activityListStrategy: { kind: 'content-grown', expectedMaximum: 20 },
  },
  apiKeys: {
    labels: {
      pageTitle: 'API keys',
      pageDescription: 'Keys inherit the permissions of the workspace they belong to.',
      createKey: 'Create key',
      nameColumn: 'Name',
      keyColumn: 'Key',
      scopeColumn: 'Scope',
      lastUsedColumn: 'Last used',
      reveal: (name) => `Reveal ${name}`,
      hide: (name) => `Hide ${name}`,
      copy: (name) => `Copy ${name}`,
      rotate: 'Rotate',
      revoke: (name) => `Revoke ${name}`,
      footer: (count) => `${count} keys · revoking takes effect immediately`,
      empty: 'No API keys yet.',
    },
    keys: [
      {
        id: 'billing-worker',
        name: 'Billing worker',
        meta: 'Production · created Jan 12, 2025',
        maskedKey: 'rbk_live••••••••••••••••a5d3',
        revealedKey: 'rbk_live_91a2b3c4d5e6f7a5d3',
        scope: 'Read & write',
        lastUsed: '2 minutes ago',
      },
      {
        id: 'warehouse-sync',
        name: 'Warehouse sync',
        meta: 'Production · created Nov 30, 2024',
        maskedKey: 'rbk_live••••••••••••••••c7f1',
        revealedKey: 'rbk_live_93b4c5d6e7f8c7f1',
        scope: 'Read',
        lastUsed: '1 hour ago',
      },
      {
        id: 'preview-environment',
        name: 'Preview environment',
        meta: 'Staging · created Feb 04, 2025',
        maskedKey: 'rbk_test••••••••••••••••b2ee',
        revealedKey: 'rbk_test_81a2b3c4d5e6b2ee',
        scope: 'Read & write',
        lastUsed: '3 days ago',
      },
      {
        id: 'laptop',
        name: "Ana's laptop",
        meta: 'Local · created Feb 21, 2025',
        maskedKey: 'rbk_test••••••••••••••••915a',
        revealedKey: 'rbk_test_11a2b3c4d5e6915a',
        scope: 'Read',
        lastUsed: 'Never',
      },
    ],
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 32 },
  },
  webhooks: {
    labels: {
      endpointsTitle: 'Endpoints',
      addEndpoint: 'Add endpoint',
      endpointAction: (address) => `Select ${address}`,
      selectedEndpointLabel: 'Selected endpoint',
      sendTest: 'Send test',
      enabled: 'Enabled',
      disabled: 'Disabled',
      toggleEndpoint: (address) => `Toggle ${address}`,
      emptyEndpoints: 'No endpoints configured.',
      emptyDeliveries: 'No deliveries for this endpoint.',
      deliveryCount: (count) => `${count} deliveries shown`,
      openDelivery: (event) => `Open ${event} delivery`,
    },
    endpoints: [
      {
        id: 'northwind-usage',
        address: 'hooks.northwind.dev/halcyon/usage',
        detail: '2 events · 99.8% delivered',
        enabled: true,
      },
      {
        id: 'cedar-events',
        address: 'api.cedarlabs.io/v2/events',
        detail: '3 events · 97.1% delivered',
        enabled: true,
      },
      {
        id: 'harbor-audit',
        address: 'harbor.internal/ingest/audit',
        detail: '3 events · 100% delivered',
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
        attempt: '1 attempt',
        duration: '128 ms',
        timestamp: '09:41:02',
        payload: '{\n  "workspace": "wrk_2f81",\n  "units": 41822,\n  "window": 10000\n}',
      },
      {
        id: 'delivery-91a3',
        endpointId: 'northwind-usage',
        status: '200',
        statusTone: 'positive',
        event: 'usage.threshold',
        attempt: '1 attempt',
        duration: '96 ms',
        timestamp: '09:40:11',
      },
      {
        id: 'delivery-91a4',
        endpointId: 'northwind-usage',
        status: '500',
        statusTone: 'danger',
        event: 'usage.rollup',
        attempt: '3 attempts',
        duration: '4021 ms',
        timestamp: '09:38:44',
      },
      {
        id: 'delivery-cedar',
        endpointId: 'cedar-events',
        status: '202',
        statusTone: 'positive',
        event: 'deploy.completed',
        attempt: '1 attempt',
        duration: '153 ms',
        timestamp: '09:34:12',
      },
    ],
    endpointListStrategy: { kind: 'content-grown', expectedMaximum: 12 },
    deliveryListStrategy: { kind: 'pane-scroll', expectedMaximum: 50 },
  },
  consent: {
    labels: {
      workspaceLabel: 'Workspace',
      cancel: 'Cancel',
      authorize: 'Authorize',
      authorized: 'Authorized',
      redirectNotice: 'Redirects to northwind.dev',
    },
    requesterInitials: 'NW',
    workspaceInitials: 'HL',
    title: 'Northwind wants access to your Halcyon workspace',
    description: 'Review what Northwind will be able to do before you continue.',
    workspaces: [
      { id: 'halcyon', initials: 'HA', name: 'Halcyon', role: 'Owner', label: 'HA Halcyon · Owner' },
      { id: 'atlas', initials: 'AT', name: 'Atlas', role: 'Admin', label: 'AT Atlas · Admin' },
    ],
    initialWorkspaceId: 'halcyon',
    permissions: [
      { id: 'profile', title: 'Read your profile', description: 'Name, email address and avatar.' },
      { id: 'projects', title: 'Read your projects', description: 'Names, settings and member lists for 6 projects.' },
      { id: 'deploys', title: 'Trigger deploys', description: 'Start a deploy on your behalf and read its result.' },
    ],
    assurance: 'Northwind never receives your password, and cannot read billing details or delete projects.',
    listStrategy: { kind: 'content-grown', expectedMaximum: 8 },
  },
  sync: {
    labels: {
      pageTitle: 'Sync status',
      pageDescription: 'Five connected sources writing into the warehouse.',
      syncAll: 'Sync all',
      pause: (name) => `Pause ${name}`,
      resume: (name) => `Resume ${name}`,
      paused: 'Paused',
      retry: 'Retry',
      footer: 'Warehouse reachable · checked 30 seconds ago',
      failureSummary: (count) => `${count} failing syncs`,
      empty: 'No connected sources.',
      progress: (name) => `${name} sync progress`,
    },
    metrics: [
      { id: 'healthy', label: 'Healthy', value: '2', tone: 'positive' },
      { id: 'syncing', label: 'Syncing', value: '1' },
      { id: 'failed', label: 'Failed', value: '1', tone: 'danger' },
      { id: 'paused', label: 'Paused', value: '1', tone: 'neutral' },
    ],
    sources: [
      {
        id: 'northwind',
        initials: 'NW',
        name: 'Northwind',
        destination: 'events.usage_rollups',
        detail: '41,822 rows · running now',
        status: 'Syncing',
        statusTone: 'neutral',
        progress: 62,
      },
      {
        id: 'alder',
        initials: 'AL',
        name: 'Alder',
        destination: 'billing.invoices',
        detail: '1,204 rows · 8 minutes ago',
        status: 'Healthy',
        statusTone: 'positive',
        progress: 100,
      },
      {
        id: 'cedar',
        initials: 'CL',
        name: 'Cedar Labs',
        destination: 'ci.check_results',
        detail: '9,640 rows · 22 minutes ago',
        status: 'Healthy',
        statusTone: 'positive',
        progress: 100,
      },
      {
        id: 'meridian',
        initials: 'MD',
        name: 'Meridian',
        destination: 'storage.exports',
        detail: '318 rows · 1 hour ago',
        status: 'Failed',
        statusTone: 'danger',
        progress: 41,
        failure: 'Bucket rejected the write: missing s3:PutObject on the export prefix.',
      },
      {
        id: 'quarry',
        initials: 'QR',
        name: 'Quarry',
        destination: 'audit.entries',
        detail: '76,210 rows · yesterday',
        status: 'Paused',
        statusTone: 'neutral',
        progress: 28,
      },
    ],
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 32 },
  },
}

export function createHbarAppUiIntegrationsOverflowFixtures(): HbarAppUiIntegrationContent {
  const base = HBAR_APP_UI_INTEGRATIONS_FIXTURES
  const marketplaceItems = [
    ...(base.marketplace?.items ?? []),
    ...Array.from({ length: 24 }, (_, index) => ({
      id: `overflow-market-${index}`,
      initials: 'OV',
      name: `Overflow integration ${index + 1}`,
      categoryId: 'developer',
      categoryLabel: 'Developer',
      description: 'A host-provided integration record for scroll verification.',
      connected: false,
    })),
  ]
  const apiKeys = [
    ...(base.apiKeys?.keys ?? []),
    ...Array.from({ length: 36 }, (_, index) => ({
      id: `overflow-key-${index}`,
      name: `Overflow key ${index + 1}`,
      meta: 'Staging · created today',
      maskedKey: `rbk_test••••${index}`,
      revealedKey: `rbk_test_overflow_${index}`,
      scope: 'Read',
      lastUsed: 'Never',
    })),
  ]
  const deliveries = [
    ...(base.webhooks?.deliveries ?? []),
    ...Array.from({ length: 48 }, (_, index) => ({
      id: `overflow-delivery-${index}`,
      endpointId: 'northwind-usage',
      status: '200',
      statusTone: 'positive' as const,
      event: 'usage.rollup',
      attempt: '1 attempt',
      duration: '120 ms',
      timestamp: `10:${index}`,
    })),
  ]
  const sources = [
    ...(base.sync?.sources ?? []),
    ...Array.from({ length: 32 }, (_, index) => ({
      id: `overflow-source-${index}`,
      initials: 'OV',
      name: `Overflow source ${index + 1}`,
      destination: 'warehouse.records',
      detail: '0 rows · queued',
      status: 'Syncing',
      statusTone: 'neutral' as const,
      progress: 12,
    })),
  ]
  return {
    ...base,
    marketplace: base.marketplace
      ? { ...base.marketplace, items: marketplaceItems, listStrategy: { kind: 'pane-scroll', expectedMaximum: 24 } }
      : undefined,
    apiKeys: base.apiKeys
      ? { ...base.apiKeys, keys: apiKeys, listStrategy: { kind: 'pane-scroll', expectedMaximum: 32 } }
      : undefined,
    webhooks: base.webhooks
      ? { ...base.webhooks, deliveries, deliveryListStrategy: { kind: 'pane-scroll', expectedMaximum: 48 } }
      : undefined,
    sync: base.sync ? { ...base.sync, sources, listStrategy: { kind: 'pane-scroll', expectedMaximum: 32 } } : undefined,
  }
}

export function createHbarAppUiIntegrationsLocalizedFixtures(): HbarAppUiIntegrationContent {
  const base = HBAR_APP_UI_INTEGRATIONS_FIXTURES
  return {
    ...base,
    marketplace: base.marketplace
      ? {
          ...base.marketplace,
          labels: {
            ...base.marketplace.labels,
            pageTitle: 'Integrationen',
            pageDescription: 'Sehr lange lokalisierte Beschreibung der verbundenen und verfügbaren Erweiterungen.',
            searchPlaceholder: 'Integrationen durchsuchen',
          },
        }
      : undefined,
    connection: base.connection
      ? {
          ...base.connection,
          labels: { ...base.connection.labels, permissionsTitle: 'Berechtigungen', disconnect: 'Verbindung trennen' },
        }
      : undefined,
    apiKeys: base.apiKeys
      ? {
          ...base.apiKeys,
          labels: { ...base.apiKeys.labels, pageTitle: 'API-Schlüssel', createKey: 'Schlüssel erstellen' },
        }
      : undefined,
    webhooks: base.webhooks
      ? { ...base.webhooks, labels: { ...base.webhooks.labels, endpointsTitle: 'Endpunkte', sendTest: 'Test senden' } }
      : undefined,
    consent: base.consent
      ? {
          ...base.consent,
          labels: {
            ...base.consent.labels,
            authorize: 'Autorisieren',
            redirectNotice: 'Leitet zu northwind.dev weiter',
          },
        }
      : undefined,
    sync: base.sync
      ? {
          ...base.sync,
          labels: { ...base.sync.labels, pageTitle: 'Synchronisierungsstatus', syncAll: 'Alle synchronisieren' },
        }
      : undefined,
  }
}

export function createHbarAppUiIntegrationsEmptyFixtures(): HbarAppUiIntegrationContent {
  const base = HBAR_APP_UI_INTEGRATIONS_FIXTURES
  return {
    ...base,
    marketplace: base.marketplace ? { ...base.marketplace, items: [] } : undefined,
    connection: base.connection ? { ...base.connection, scopes: [], activities: [] } : undefined,
    apiKeys: base.apiKeys ? { ...base.apiKeys, keys: [] } : undefined,
    webhooks: base.webhooks ? { ...base.webhooks, endpoints: [], deliveries: [] } : undefined,
    consent: base.consent ? { ...base.consent, permissions: [] } : undefined,
    sync: base.sync ? { ...base.sync, sources: [] } : undefined,
  }
}
