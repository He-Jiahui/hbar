import {
  LumenIntegrations,
  LumenIntegrationProvider as HbarAppUiIntegrationProvider,
  type LumenIntegrationContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiIntegrationsProps = HbarAppUiVariantProps & {
  readonly integrationContent?: LumenIntegrationContent | undefined
}

export { HbarAppUiIntegrationProvider }
export {
  selectLumenIntegrationItem as selectHbarAppUiIntegrationItem,
  uniqueLumenIntegrationItems as uniqueHbarAppUiIntegrationItems,
  useLumenIntegrationContent as useHbarAppUiIntegrationContent,
} from '@lumen/app-ui'
export type {
  LumenIntegrationActivity as HbarAppUiIntegrationActivity,
  LumenIntegrationApiKey as HbarAppUiIntegrationApiKey,
  LumenIntegrationApiKeysContent as HbarAppUiIntegrationApiKeysContent,
  LumenIntegrationCategory as HbarAppUiIntegrationCategory,
  LumenIntegrationConnectionContent as HbarAppUiIntegrationConnectionContent,
  LumenIntegrationConsentContent as HbarAppUiIntegrationConsentContent,
  LumenIntegrationConsentPermission as HbarAppUiIntegrationConsentPermission,
  LumenIntegrationContent as HbarAppUiIntegrationContent,
  LumenIntegrationDelivery as HbarAppUiIntegrationDelivery,
  LumenIntegrationEndpoint as HbarAppUiIntegrationEndpoint,
  LumenIntegrationListStrategy as HbarAppUiIntegrationListStrategy,
  LumenIntegrationMarketplaceContent as HbarAppUiIntegrationMarketplaceContent,
  LumenIntegrationMarketplaceItem as HbarAppUiIntegrationMarketplaceItem,
  LumenIntegrationProviderProps as HbarAppUiIntegrationProviderProps,
  LumenIntegrationScope as HbarAppUiIntegrationScope,
  LumenIntegrationSyncContent as HbarAppUiIntegrationSyncContent,
  LumenIntegrationSyncMetric as HbarAppUiIntegrationSyncMetric,
  LumenIntegrationSyncSource as HbarAppUiIntegrationSyncSource,
  LumenIntegrationTone as HbarAppUiIntegrationTone,
  LumenIntegrationWebhookContent as HbarAppUiIntegrationWebhookContent,
  LumenIntegrationWorkspace as HbarAppUiIntegrationWorkspace,
} from '@lumen/app-ui'

export function Integrations({ spec, onAction, integrationContent, className }: HbarAppUiIntegrationsProps) {
  return (
    <LumenIntegrations
      variant={spec.variant}
      variantId={spec.id}
      content={integrationContent}
      className={className}
      density={spec.density}
      surface={spec.profile.surface}
      state={spec.profile.initialState}
      visualMode={spec.profile.visualMode}
      onAction={
        onAction
          ? ({ actionId, value }) =>
              onAction(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
          : undefined
      }
    />
  )
}
