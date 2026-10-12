'use client'

import * as React from 'react'
import {
  type LumenIntegrationMarketplaceReferenceLayout,
  type LumenIntegrationMarketplaceReferenceFlow,
  type LumenIntegrationConnectionReferenceLayout,
  type LumenIntegrationConnectionReferenceFlow,
  type LumenIntegrationApiKeysReferenceLayout,
  type LumenIntegrationApiKeysReferenceFlow,
  type LumenIntegrationWebhookReferenceLayout,
  type LumenIntegrationWebhookReferenceFlow,
  type LumenIntegrationConsentReferenceLayout,
  type LumenIntegrationConsentReferenceFlow,
  type LumenIntegrationSyncReferenceLayout,
  type LumenIntegrationSyncReferenceFlow,
} from './reference-content'

/**
 * Integration collections are host-owned.  Marketplace cards can grow within
 * a bounded catalog page; service-backed logs and key collections must use a
 * pane scroll region or arrive through the host's paged/virtualized contract.
 */
export type LumenIntegrationListStrategy =
  | { readonly kind: 'content-grown'; readonly expectedMaximum: number }
  | { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }
  | { readonly kind: 'virtualized'; readonly expectedMaximum: number }

export type LumenIntegrationTone = 'neutral' | 'positive' | 'warning' | 'danger'

export interface LumenIntegrationCategory {
  readonly id: string
  readonly label: string
}

export interface LumenIntegrationMarketplaceItem {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly categoryId: string
  readonly categoryLabel: string
  readonly description: string
  readonly connected: boolean
}

export interface LumenIntegrationMarketplaceContent {
  readonly referenceLayout?: LumenIntegrationMarketplaceReferenceLayout | undefined
  readonly referenceFlow?: LumenIntegrationMarketplaceReferenceFlow | undefined
  readonly labels: {
    readonly pageTitle: string
    readonly pageDescription: string
    readonly categoriesLabel: string
    readonly searchLabel: string
    readonly searchPlaceholder: string
    readonly connected: string
    readonly connect: string
    readonly empty: string
    readonly connectAction: (name: string) => string
  }
  readonly categories: readonly LumenIntegrationCategory[]
  readonly allCategoryId: string
  readonly initialCategoryId: string
  readonly items: readonly LumenIntegrationMarketplaceItem[]
  readonly listStrategy: LumenIntegrationListStrategy
}

export interface LumenIntegrationScope {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly enabled: boolean
  readonly required?: boolean | undefined
}

export interface LumenIntegrationActivity {
  readonly id: string
  readonly title: string
  readonly date: string
  readonly tone?: LumenIntegrationTone | undefined
}

export interface LumenIntegrationConnectionContent {
  readonly referenceLayout?: LumenIntegrationConnectionReferenceLayout | undefined
  readonly referenceFlow?: LumenIntegrationConnectionReferenceFlow | undefined
  readonly labels: {
    readonly connected: string
    readonly disconnected: string
    readonly sync: string
    readonly disconnect: string
    readonly permissionsTitle: string
    readonly permissionsDescription: string
    readonly required: string
    readonly toggleScope: (label: string) => string
    readonly activityTitle: string
    readonly fullAuditLog: string
    readonly emptyScopes: string
    readonly emptyActivity: string
  }
  readonly initials: string
  readonly name: string
  readonly description: string
  readonly initiallyConnected: boolean
  readonly scopes: readonly LumenIntegrationScope[]
  readonly activities: readonly LumenIntegrationActivity[]
  readonly scopeListStrategy: LumenIntegrationListStrategy
  readonly activityListStrategy: LumenIntegrationListStrategy
}

export interface LumenIntegrationApiKey {
  readonly id: string
  readonly name: string
  readonly meta: string
  readonly maskedKey: string
  readonly revealedKey: string
  readonly scope: string
  readonly lastUsed: string
}

export interface LumenIntegrationApiKeysContent {
  readonly referenceLayout?: LumenIntegrationApiKeysReferenceLayout | undefined
  readonly referenceFlow?: LumenIntegrationApiKeysReferenceFlow | undefined
  readonly labels: {
    readonly pageTitle: string
    readonly pageDescription: string
    readonly createKey: string
    readonly nameColumn: string
    readonly keyColumn: string
    readonly scopeColumn: string
    readonly lastUsedColumn: string
    readonly reveal: (name: string) => string
    readonly hide: (name: string) => string
    readonly copy: (name: string) => string
    readonly rotate: string
    readonly revoke: (name: string) => string
    readonly footer: (count: number) => string
    readonly empty: string
  }
  readonly keys: readonly LumenIntegrationApiKey[]
  readonly listStrategy: LumenIntegrationListStrategy
}

export interface LumenIntegrationEndpoint {
  readonly id: string
  readonly address: string
  readonly detail: string
  readonly enabled: boolean
  readonly topics?: readonly string[] | undefined
}

export interface LumenIntegrationDelivery {
  readonly id: string
  readonly endpointId: string
  readonly status: string
  readonly statusTone: LumenIntegrationTone
  readonly event: string
  readonly attempt: string
  readonly duration: string
  readonly timestamp: string
  readonly payload?: string | undefined
}

export interface LumenIntegrationWebhookContent {
  readonly referenceLayout?: LumenIntegrationWebhookReferenceLayout | undefined
  readonly referenceFlow?: LumenIntegrationWebhookReferenceFlow | undefined
  readonly labels: {
    readonly endpointsTitle: string
    readonly addEndpoint: string
    readonly endpointAction: (address: string) => string
    readonly selectedEndpointLabel: string
    readonly sendTest: string
    readonly enabled: string
    readonly disabled: string
    readonly toggleEndpoint: (address: string) => string
    readonly emptyEndpoints: string
    readonly emptyDeliveries: string
    readonly deliveryCount: (count: number) => string
    readonly openDelivery: (event: string) => string
  }
  readonly endpoints: readonly LumenIntegrationEndpoint[]
  readonly initialEndpointId: string
  readonly initialOpenDeliveryId?: string | undefined
  readonly topics: readonly string[]
  readonly deliveries: readonly LumenIntegrationDelivery[]
  readonly endpointListStrategy: LumenIntegrationListStrategy
  readonly deliveryListStrategy: LumenIntegrationListStrategy
}

export interface LumenIntegrationWorkspace {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly role: string
  readonly label: string
}

export interface LumenIntegrationConsentPermission {
  readonly id: string
  readonly title: string
  readonly description: string
}

export interface LumenIntegrationConsentContent {
  readonly referenceLayout?: LumenIntegrationConsentReferenceLayout | undefined
  readonly referenceFlow?: LumenIntegrationConsentReferenceFlow | undefined
  readonly labels: {
    readonly workspaceLabel: string
    readonly cancel: string
    readonly authorize: string
    readonly authorized: string
    readonly redirectNotice: string
  }
  readonly requesterInitials: string
  readonly workspaceInitials: string
  readonly title: string
  readonly description: string
  readonly workspaces: readonly LumenIntegrationWorkspace[]
  readonly initialWorkspaceId: string
  readonly permissions: readonly LumenIntegrationConsentPermission[]
  readonly assurance: string
  readonly listStrategy: LumenIntegrationListStrategy
}

export interface LumenIntegrationSyncMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly tone?: LumenIntegrationTone | undefined
}

export interface LumenIntegrationSyncSource {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly destination: string
  readonly detail: string
  readonly status: string
  readonly statusTone: LumenIntegrationTone
  readonly progress: number
  readonly failure?: string | undefined
}

export interface LumenIntegrationSyncContent {
  readonly referenceLayout?: LumenIntegrationSyncReferenceLayout | undefined
  readonly referenceFlow?: LumenIntegrationSyncReferenceFlow | undefined
  readonly labels: {
    readonly pageTitle: string
    readonly pageDescription: string
    readonly syncAll: string
    readonly pause: (name: string) => string
    readonly resume: (name: string) => string
    readonly paused: string
    readonly retry: string
    readonly footer: string
    readonly failureSummary: (count: number) => string
    readonly empty: string
    readonly progress: (name: string) => string
  }
  readonly metrics: readonly LumenIntegrationSyncMetric[]
  readonly sources: readonly LumenIntegrationSyncSource[]
  readonly listStrategy: LumenIntegrationListStrategy
}

export interface LumenIntegrationContent {
  readonly marketplace?: LumenIntegrationMarketplaceContent | undefined
  readonly connection?: LumenIntegrationConnectionContent | undefined
  readonly apiKeys?: LumenIntegrationApiKeysContent | undefined
  readonly webhooks?: LumenIntegrationWebhookContent | undefined
  readonly consent?: LumenIntegrationConsentContent | undefined
  readonly sync?: LumenIntegrationSyncContent | undefined
}

export interface LumenIntegrationProviderProps {
  readonly content: LumenIntegrationContent
  readonly children: React.ReactNode
}

export function uniqueLumenIntegrationItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenIntegrationItem<T extends { readonly id: string }>(
  items: readonly T[],
  activeId: string | undefined,
): T | undefined {
  const unique = uniqueLumenIntegrationItems(items)
  return unique.find((item) => item.id === activeId) ?? unique[0]
}

const integrationContentContext = React.createContext<LumenIntegrationContent | undefined>(undefined)

export function LumenIntegrationProvider({ content, children }: LumenIntegrationProviderProps) {
  return <integrationContentContext.Provider value={content}>{children}</integrationContentContext.Provider>
}

export function useLumenIntegrationContent(): LumenIntegrationContent | undefined {
  return React.useContext(integrationContentContext)
}
