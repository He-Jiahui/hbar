import type { HbarAppUiIntegrationContent } from '../../packages/hbar-app-ui/src/index'
import { createIntegrationMarketplaceReferenceFixture } from './hbar-app-ui-integrations-marketplace-reference-fixtures'
import { createIntegrationConnectionReferenceFixture } from './hbar-app-ui-integrations-connection-reference-fixtures'
import { createIntegrationApiKeysReferenceFixture } from './hbar-app-ui-integrations-api-keys-reference-fixtures'
import { createIntegrationWebhooksReferenceFixture } from './hbar-app-ui-integrations-webhooks-reference-fixtures'
import { createIntegrationConsentReferenceFixture } from './hbar-app-ui-integrations-consent-reference-fixtures'
import { createIntegrationSyncReferenceFixture } from './hbar-app-ui-integrations-sync-reference-fixtures'
import { createHbarAppUiIntegrationsOverflowFixtures } from './hbar-app-ui-integrations-fixtures'

export function createIntegrationReferencePreviewFixtures(
  locale: 'en' | 'de-long' = 'en',
  overflow = false,
): HbarAppUiIntegrationContent {
  const source: HbarAppUiIntegrationContent = {
    marketplace: createIntegrationMarketplaceReferenceFixture(locale),
    connection: createIntegrationConnectionReferenceFixture(locale),
    apiKeys: createIntegrationApiKeysReferenceFixture(locale),
    webhooks: createIntegrationWebhooksReferenceFixture(locale),
    consent: createIntegrationConsentReferenceFixture(locale),
    sync: createIntegrationSyncReferenceFixture(locale),
  }
  if (!overflow) return source
  const pressure = createHbarAppUiIntegrationsOverflowFixtures()
  return {
    ...source,
    marketplace: source.marketplace
      ? { ...source.marketplace, items: pressure.marketplace?.items ?? source.marketplace.items }
      : undefined,
    apiKeys: source.apiKeys ? { ...source.apiKeys, keys: pressure.apiKeys?.keys ?? source.apiKeys.keys } : undefined,
    webhooks: source.webhooks
      ? {
          ...source.webhooks,
          endpoints: pressure.webhooks?.endpoints ?? source.webhooks.endpoints,
          deliveries: pressure.webhooks?.deliveries ?? source.webhooks.deliveries,
        }
      : undefined,
    sync: source.sync ? { ...source.sync, sources: pressure.sync?.sources ?? source.sync.sources } : undefined,
  }
}
