import type { HbarAppUiIntegrationContent } from '../../packages/hbar-app-ui/src/index'
import { HBAR_APP_UI_INTEGRATIONS_FIXTURES } from './hbar-app-ui-integrations-fixtures'

type MarketplaceContent = NonNullable<HbarAppUiIntegrationContent['marketplace']>

export function createIntegrationMarketplaceReferenceFixture(locale: 'en' | 'de-long' = 'en'): MarketplaceContent {
  const marketplace = HBAR_APP_UI_INTEGRATIONS_FIXTURES.marketplace
  if (!marketplace) throw new Error('The base integrations marketplace fixture is unavailable.')

  if (locale === 'en') {
    return {
      ...marketplace,
      referenceLayout: { ownerId: 'integrations-marketplace' },
    }
  }

  const categoryLabels: Readonly<Record<string, string>> = {
    all: 'Alle',
    analytics: 'Analytik',
    developer: 'Entwicklung',
    messaging: 'Nachrichten',
    storage: 'Speicher',
    security: 'Sicherheit',
  }

  return {
    ...marketplace,
    labels: {
      ...marketplace.labels,
      pageTitle: 'Verfügbare Integrationen',
      pageDescription: '2 verbunden · 9 verfügbare Integrationen für Daten, Entwicklung und Sicherheit',
      categoriesLabel: 'Integrationskategorien',
      searchLabel: 'Integrationen durchsuchen',
      searchPlaceholder: 'Nach Anbieter, Kategorie oder Beschreibung suchen',
      connected: 'Verbunden',
      connect: 'Verbinden',
      empty: 'Für diese Kombination aus Suchbegriff und Kategorie wurde keine Integration gefunden.',
      connectAction: (name) => `Verbindung mit ${name} öffnen`,
    },
    categories: marketplace.categories.map((category) => ({
      ...category,
      label: categoryLabels[category.id] ?? category.label,
    })),
    items: marketplace.items.map((item) => ({
      ...item,
      categoryLabel: categoryLabels[item.categoryId] ?? item.categoryLabel,
      description:
        item.id === 'northwind'
          ? 'Produktaktivitäten an Northwind-Dashboards streamen.'
          : item.id === 'cedar'
            ? 'Ein Problem melden, wenn eine Bereitstellungsprüfung fehlschlägt.'
            : item.id === 'harbor'
              ? 'Warnungen und Freigaben in einen gemeinsamen Kanal senden.'
              : item.id === 'meridian'
                ? 'Exporte in einem von Ihnen kontrollierten Speicher archivieren.'
                : item.id === 'alder'
                  ? 'Warehouse-Synchronisierung für Nutzungs- und Abrechnungstabellen.'
                  : item.id === 'fernrock'
                    ? 'Einen Ablauf starten, wenn eine Umgebung veröffentlicht wird.'
                    : item.id === 'tidepool'
                      ? 'Vorfälle an den Bereitschaftsdienst weiterleiten.'
                      : item.id === 'quarry'
                        ? 'Auditprotokolle jede Nacht in den Langzeitspeicher spiegeln.'
                        : 'Auffällige Anmeldungen an Ihr SIEM senden.',
    })),
    referenceLayout: { ownerId: 'integrations-marketplace' },
  }
}
