import type { HbarAppUiIntegrationContent } from '../../packages/hbar-app-ui/src/index'

type ApiKeysFixture = NonNullable<HbarAppUiIntegrationContent['apiKeys']>

export function createIntegrationApiKeysReferenceFixture(locale: 'en' | 'de-long' = 'en'): ApiKeysFixture {
  const isGerman = locale === 'de-long'
  return {
    referenceLayout: { ownerId: 'integrations:api-keys:cedar-labs' },
    labels: {
      pageTitle: isGerman ? 'API-Schlüssel' : 'API keys',
      pageDescription: isGerman
        ? 'API-Schlüssel übernehmen die Berechtigungen des Arbeitsbereichs, zu dem sie gehören, und sollten nur von ausdrücklich autorisierten Diensten verwendet werden.'
        : 'Keys inherit the permissions of the workspace they belong to.',
      createKey: isGerman ? 'API-Schlüssel erstellen' : 'Create key',
      nameColumn: isGerman ? 'Name' : 'Name',
      keyColumn: isGerman ? 'Schlüssel' : 'Key',
      scopeColumn: isGerman ? 'Berechtigung' : 'Scope',
      lastUsedColumn: isGerman ? 'Zuletzt verwendet' : 'Last used',
      reveal: () => (isGerman ? 'Schlüssel anzeigen' : 'Reveal key'),
      hide: () => (isGerman ? 'Schlüssel verbergen' : 'Hide key'),
      copy: () => (isGerman ? 'Schlüssel kopieren' : 'Copy key'),
      rotate: isGerman ? 'Erneuern' : 'Rotate',
      revoke: (name) => (isGerman ? `${name} widerrufen` : `Revoke ${name}`),
      footer: (count) =>
        isGerman
          ? `${count} Schlüssel · ein Widerruf wird sofort wirksam.`
          : `${count} keys · revoking takes effect immediately`,
      empty: isGerman ? 'Es sind keine API-Schlüssel eingerichtet.' : 'No API keys yet.',
    },
    keys: [
      {
        id: 'billing-worker',
        name: 'Billing worker',
        meta: isGerman ? 'Produktion · erstellt am 12. Jan. 2025' : 'Production · created Jan 12, 2025',
        maskedKey: 'rbk_live••••••••••••••••a5d3',
        revealedKey: 'preview-only-key-for-billing-worker',
        scope: isGerman ? 'Lesen und schreiben' : 'Read & write',
        lastUsed: isGerman ? 'vor 2 Minuten' : '2 minutes ago',
      },
      {
        id: 'warehouse-sync',
        name: 'Warehouse sync',
        meta: isGerman ? 'Produktion · erstellt am 30. Nov. 2024' : 'Production · created Nov 30, 2024',
        maskedKey: 'rbk_live••••••••••••••••c7f1',
        revealedKey: 'preview-only-key-for-warehouse-sync',
        scope: isGerman ? 'Lesen' : 'Read',
        lastUsed: isGerman ? 'vor 1 Stunde' : '1 hour ago',
      },
      {
        id: 'preview-environment',
        name: 'Preview environment',
        meta: isGerman ? 'Staging · erstellt am 4. Feb. 2025' : 'Staging · created Feb 04, 2025',
        maskedKey: 'rbk_test••••••••••••••••b2ee',
        revealedKey: 'preview-only-key-for-preview-environment',
        scope: isGerman ? 'Lesen und schreiben' : 'Read & write',
        lastUsed: isGerman ? 'vor 3 Tagen' : '3 days ago',
      },
      {
        id: 'laptop',
        name: "Ana's laptop",
        meta: isGerman ? 'Lokal · erstellt am 21. Feb. 2025' : 'Local · created Feb 21, 2025',
        maskedKey: 'rbk_test••••••••••••••••915a',
        revealedKey: 'preview-only-key-for-laptop',
        scope: isGerman ? 'Lesen' : 'Read',
        lastUsed: isGerman ? 'Nie' : 'Never',
      },
    ],
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 32 },
  }
}
