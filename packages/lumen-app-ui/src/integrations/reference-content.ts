export interface LumenIntegrationMarketplaceReferenceLayout {
  readonly ownerId: string
}
export interface LumenIntegrationMarketplaceReferenceFlow {
  readonly query: string
  readonly categoryId: string | null
  readonly onQueryChange: (query: string) => void
  readonly onCategoryChange: (categoryId: string) => void
}

export interface LumenIntegrationScopeReferenceState {
  readonly scopeId: string
  readonly enabled: boolean
}
export interface LumenIntegrationConnectionReferenceLayout {
  readonly ownerId: string
  readonly auditLogHref: string
}
export interface LumenIntegrationConnectionReferenceFlow {
  readonly scopes: readonly LumenIntegrationScopeReferenceState[]
  readonly onScopeChange: (scopeId: string, enabled: boolean) => void
}

export interface LumenIntegrationApiKeysReferenceLayout {
  readonly ownerId: string
}
export interface LumenIntegrationApiKeysReferenceFlow {
  readonly revealedIds: readonly string[]
  readonly onToggleReveal: (keyId: string) => void
}

export interface LumenIntegrationEndpointReferenceState {
  readonly endpointId: string
  readonly enabled: boolean
}
export interface LumenIntegrationWebhookReferenceLayout {
  readonly ownerId: string
  readonly endpointDetails: readonly {
    readonly endpointId: string
    readonly url: string
    readonly topics: readonly string[]
  }[]
  readonly labels: { readonly endpointEnabled: string }
}
export interface LumenIntegrationWebhookReferenceFlow {
  readonly endpointId: string | null
  readonly expandedDeliveryIds: readonly string[]
  readonly enabled: readonly LumenIntegrationEndpointReferenceState[]
  readonly onEndpointChange: (endpointId: string) => void
  readonly onEndpointEnabledChange: (endpointId: string, enabled: boolean) => void
  readonly onDeliveryToggle: (endpointId: string, deliveryId: string) => void
}

export interface LumenIntegrationConsentReferenceLayout {
  readonly ownerId: string
  readonly workspaceOptions: readonly { readonly workspaceId: string; readonly detail: string }[]
  readonly labels: { readonly emptyWorkspaces: string }
}
export interface LumenIntegrationConsentReferenceFlow {
  readonly workspaceId: string | null
  readonly onWorkspaceChange: (workspaceId: string) => void
  readonly onCancel: () => void
  readonly onAuthorize: () => void
}

export type LumenIntegrationSyncReferencePhase = 'healthy' | 'syncing' | 'failed' | 'paused'
export interface LumenIntegrationSyncReferenceState {
  readonly sourceId: string
  readonly phase: LumenIntegrationSyncReferencePhase
}
export interface LumenIntegrationSyncReferenceLayout {
  readonly ownerId: string
  readonly states: readonly LumenIntegrationSyncReferenceState[]
  readonly labels: {
    readonly healthy: string
    readonly syncing: string
    readonly failed: string
  }
}
export interface LumenIntegrationSyncReferenceFlow {
  readonly states: readonly LumenIntegrationSyncReferenceState[]
  readonly onToggleSource: (sourceId: string) => void
  readonly onSyncAll: () => void
}
