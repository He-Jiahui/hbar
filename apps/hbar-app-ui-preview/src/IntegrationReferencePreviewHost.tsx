import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  HbarAppUiIntegrationProvider,
  type HbarAppUiIntegrationContent,
  type HbarAppUiVariantProps,
} from 'hbar-app-ui/catalog'
import {
  createIntegrationReferencePreviewStore,
  type IntegrationReferencePreviewSeed,
} from './integrationReferencePreviewStore'

export interface IntegrationReferencePreviewHostProps extends Pick<HbarAppUiVariantProps, 'spec' | 'onAction'> {
  readonly content: HbarAppUiIntegrationContent
  readonly locale?: 'en' | 'de' | undefined
  readonly children: ReactNode
}

function previewSeed(content: HbarAppUiIntegrationContent, variant: number): IntegrationReferencePreviewSeed | null {
  const base = {
    targetIds: [],
    initialSelectionId: null,
    scopes: [],
    keyIds: [],
    endpoints: [],
    deliveries: [],
    initialExpandedIds: [],
    sources: [],
  }
  switch (variant) {
    case 1: {
      const input = content.marketplace
      return input?.referenceLayout
        ? {
            ...base,
            ownerId: input.referenceLayout.ownerId,
            kind: 'marketplace',
            targetIds: input.categories.map(({ id }) => id),
            initialSelectionId: input.initialCategoryId,
          }
        : null
    }
    case 2: {
      const input = content.connection
      return input?.referenceLayout
        ? {
            ...base,
            ownerId: input.referenceLayout.ownerId,
            kind: 'connection',
            scopes: input.scopes.map(({ id, enabled, required }) => ({ id, enabled, required: required ?? false })),
          }
        : null
    }
    case 3: {
      const input = content.apiKeys
      return input?.referenceLayout
        ? { ...base, ownerId: input.referenceLayout.ownerId, kind: 'api-keys', keyIds: input.keys.map(({ id }) => id) }
        : null
    }
    case 4: {
      const input = content.webhooks
      return input?.referenceLayout
        ? {
            ...base,
            ownerId: input.referenceLayout.ownerId,
            kind: 'webhooks',
            targetIds: input.endpoints.map(({ id }) => id),
            initialSelectionId: input.initialEndpointId,
            endpoints: input.endpoints.map(({ id, enabled }) => ({ endpointId: id, enabled })),
            deliveries: input.deliveries.map(({ id, endpointId }) => ({ id, endpointId })),
            initialExpandedIds: input.initialOpenDeliveryId ? [input.initialOpenDeliveryId] : [],
          }
        : null
    }
    case 5: {
      const input = content.consent
      return input?.referenceLayout
        ? {
            ...base,
            ownerId: input.referenceLayout.ownerId,
            kind: 'consent',
            targetIds: input.workspaces.map(({ id }) => id),
            initialSelectionId: input.initialWorkspaceId,
          }
        : null
    }
    case 6: {
      const input = content.sync
      if (!input?.referenceLayout) return null
      const phases = new Map(input.referenceLayout.states.map((item) => [item.sourceId, item.phase]))
      return {
        ...base,
        ownerId: input.referenceLayout.ownerId,
        kind: 'sync',
        sources: input.sources.map((source) => ({
          sourceId: source.id,
          phase:
            phases.get(source.id) ??
            (source.statusTone === 'danger' ? 'failed' : source.statusTone === 'positive' ? 'healthy' : 'syncing'),
        })),
      }
    }
    default:
      return null
  }
}

export function IntegrationReferencePreviewHost(props: IntegrationReferencePreviewHostProps) {
  if (props.spec.category !== 'integrations') return props.children
  const seed = previewSeed(props.content, props.spec.variant)
  if (!seed) return props.children
  return <IntegrationReferenceOwner key={JSON.stringify([props.spec.id, seed.ownerId])} {...props} />
}

function IntegrationReferenceOwner({
  content,
  spec,
  onAction,
  locale = 'en',
  children,
}: IntegrationReferencePreviewHostProps) {
  const seed = useMemo(() => previewSeed(content, spec.variant), [content, spec.variant])
  const [store] = useState(() => {
    if (!seed) throw new Error('The integration preview owner requires an observed reference contract')
    return createIntegrationReferencePreviewStore(seed)
  })
  const query = useStore(store, (state) => state.query)
  const selectionId = useStore(store, (state) => state.selectionId)
  const scopes = useStore(store, (state) => state.scopes)
  const revealedIds = useStore(store, (state) => state.revealedIds)
  const endpoints = useStore(store, (state) => state.endpoints)
  const expandedIds = useStore(store, (state) => state.expandedIds)
  const sources = useStore(store, (state) => state.sources)
  const active = useRef(false)
  const action = useRef(onAction)
  action.current = onAction
  useLayoutEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useLayoutEffect(() => {
    if (seed) store.getState().reconcile(seed)
  }, [seed, store])

  const intent = (
    actionId: string,
    targetId: string | null,
    outcome: 'intent-only' | 'local-preview-only' = 'intent-only',
  ) => {
    if (active.current)
      action.current?.({
        variantId: spec.id,
        actionId,
        value: JSON.stringify({ ownerId: store.getState().seed.ownerId, targetId, outcome }),
      })
  }
  let projected = content
  switch (spec.variant) {
    case 1:
      if (content.marketplace)
        projected = {
          ...content,
          marketplace: {
            ...content.marketplace,
            referenceFlow: {
              query,
              categoryId: selectionId,
              onQueryChange: (value) => {
                if (active.current) store.getState().setQuery(value)
              },
              onCategoryChange: (id) => {
                if (active.current) store.getState().select(id)
              },
            },
          },
        }
      break
    case 2:
      if (content.connection)
        projected = {
          ...content,
          connection: {
            ...content.connection,
            referenceFlow: {
              scopes,
              onScopeChange: (id, enabled) => {
                if (active.current && store.getState().setScope(id, enabled))
                  intent('scope-preview', id, 'local-preview-only')
              },
            },
          },
        }
      break
    case 3:
      if (content.apiKeys)
        projected = {
          ...content,
          apiKeys: {
            ...content.apiKeys,
            referenceFlow: {
              revealedIds,
              onToggleReveal: (id) => {
                if (active.current) store.getState().toggleReveal(id)
              },
            },
          },
        }
      break
    case 4:
      if (content.webhooks)
        projected = {
          ...content,
          webhooks: {
            ...content.webhooks,
            referenceFlow: {
              endpointId: selectionId,
              expandedDeliveryIds: expandedIds,
              enabled: endpoints,
              onEndpointChange: (id) => {
                if (active.current) store.getState().select(id)
              },
              onEndpointEnabledChange: (id, enabled) => {
                if (active.current && store.getState().setEndpoint(id, enabled))
                  intent('endpoint-preview', id, 'local-preview-only')
              },
              onDeliveryToggle: (endpointId, deliveryId) => {
                if (active.current) store.getState().toggleDelivery(endpointId, deliveryId)
              },
            },
          },
        }
      break
    case 5:
      if (content.consent)
        projected = {
          ...content,
          consent: {
            ...content.consent,
            referenceFlow: {
              workspaceId: selectionId,
              onWorkspaceChange: (id) => {
                if (active.current) store.getState().select(id)
              },
              onCancel: () => intent('cancel-integration-consent', store.getState().selectionId),
              onAuthorize: () => {
                const workspaceId = store.getState().selectionId
                if (workspaceId) intent('authorize-integration', workspaceId)
              },
            },
          },
        }
      break
    case 6:
      if (content.sync)
        projected = {
          ...content,
          sync: {
            ...content.sync,
            metrics: content.sync.metrics.map((metric) => {
              const knownPhase =
                metric.id === 'healthy' || metric.id === 'syncing' || metric.id === 'failed' || metric.id === 'paused'
              if (!knownPhase) return metric
              const count = sources.filter((source) => source.phase === metric.id).length
              return { ...metric, value: new Intl.NumberFormat(locale).format(count) }
            }),
            referenceFlow: {
              states: sources,
              onToggleSource: (id) => {
                if (active.current && store.getState().toggleSource(id))
                  intent('sync-source-preview', id, 'local-preview-only')
              },
              onSyncAll: () => intent('sync-all', store.getState().seed.ownerId),
            },
          },
        }
      break
    default:
      break
  }
  return <HbarAppUiIntegrationProvider content={projected}>{children}</HbarAppUiIntegrationProvider>
}
