import type {
  SettingsForm5PreviewIntegration,
  SettingsForm5PreviewKey,
  SettingsForm5PreviewStoreSeed,
  SettingsForm5PreviewStoreState,
} from './settingsForm5PreviewStore'

export type SettingsForm5PreviewLocale = 'en' | 'de'

export interface SettingsForm5PreviewCopy {
  readonly pageTitle: string
  readonly createKey: string
  readonly secretKeysTitle: string
  readonly secretKeysDescription: string
  readonly integrationsTitle: string
  readonly integrationsDescription: string
  readonly connected: string
  readonly auditNote: string
  readonly revealSafePlaceholder: string
  readonly rotateKey: string
  readonly revokeKey: string
  readonly copyKeyFor: (name: string) => string
  readonly revealKeyFor: (name: string) => string
  readonly hideKeyFor: (name: string) => string
  readonly actionsFor: (name: string) => string
  readonly keyMetadata: (created: string, lastUsed: string) => string
}

export interface SettingsForm5PreviewKeyRow extends SettingsForm5PreviewKey {
  readonly metadata: string
  readonly maskedDisplay: string
  readonly displayValue: string
  readonly revealed: boolean
  readonly actionMenuOpen: boolean
  readonly actionsAccessibleName: string
  readonly revealAccessibleName: string
  readonly copyAccessibleName: string
}

export interface SettingsForm5PreviewIntegrationRow extends SettingsForm5PreviewIntegration {
  readonly connectedLabel: string | undefined
}

export interface SettingsForm5PreviewContent {
  readonly copy: SettingsForm5PreviewCopy
  readonly keys: readonly SettingsForm5PreviewKeyRow[]
  readonly integrations: readonly SettingsForm5PreviewIntegrationRow[]
  readonly listStrategy: {
    readonly kind: 'content-grown'
    readonly note: string
  }
}

export interface SettingsForm5PreviewFixture {
  readonly locale: SettingsForm5PreviewLocale
  readonly copy: SettingsForm5PreviewCopy
  readonly storeSeed: SettingsForm5PreviewStoreSeed
  readonly contentFor: (state: SettingsForm5PreviewStoreState) => SettingsForm5PreviewContent
}

const sourceKeys: readonly SettingsForm5PreviewKey[] = [
  {
    id: 'production',
    name: 'Production server',
    environment: 'live',
    createdLabel: 'Mar 2, 2026',
    lastUsedLabel: '3 minutes ago',
  },
  {
    id: 'staging',
    name: 'Staging',
    environment: 'test',
    createdLabel: 'Jan 18, 2026',
    lastUsedLabel: 'Yesterday',
  },
  {
    id: 'warehouse',
    name: 'Data warehouse sync',
    environment: 'live',
    createdLabel: 'Nov 9, 2025',
    lastUsedLabel: 'Never used',
  },
]

const sourceIntegrations: readonly SettingsForm5PreviewIntegration[] = [
  {
    id: 'slack',
    name: 'Slack',
    description: 'Post alerts to #ops-notifications.',
    enabled: true,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Link commits to deployments.',
    enabled: false,
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Create follow-up issues from incidents.',
    enabled: true,
  },
]

function copyFor(locale: SettingsForm5PreviewLocale): SettingsForm5PreviewCopy {
  if (locale === 'de') {
    return {
      pageTitle: 'API-Schlüssel',
      createKey: 'Schlüssel erstellen',
      secretKeysTitle: 'Geheime Schlüssel',
      secretKeysDescription: 'Zugangsdaten rotieren und Tokens für serverseitige Dienste kopieren.',
      integrationsTitle: 'Integrationen',
      integrationsDescription: 'Verbundenen Diensten den Zugriff auf dieses Konto erlauben.',
      connected: 'Verbunden',
      auditNote: 'Schlüsselrotationen und Integrationsänderungen werden protokolliert.',
      revealSafePlaceholder: 'Schlüsselwert wird in dieser sicheren Vorschau nicht angezeigt.',
      rotateKey: 'Schlüssel rotieren',
      revokeKey: 'Schlüssel widerrufen',
      copyKeyFor: (name) => `${name} kopieren`,
      revealKeyFor: (name) => `${name} anzeigen`,
      hideKeyFor: (name) => `${name} ausblenden`,
      actionsFor: (name) => `Aktionen für ${name}`,
      keyMetadata: (created, lastUsed) => `Erstellt am ${created}. Zuletzt genutzt: ${lastUsed}.`,
    }
  }

  return {
    pageTitle: 'API keys',
    createKey: 'Create key',
    secretKeysTitle: 'Secret keys',
    secretKeysDescription: 'Rotate credentials and copy tokens for server-side services.',
    integrationsTitle: 'Integrations',
    integrationsDescription: 'Allow connected services to act on this account.',
    connected: 'Connected',
    auditNote: 'Key rotations and integration changes are audit logged.',
    revealSafePlaceholder: 'Secret value is withheld in this safe preview.',
    rotateKey: 'Rotate key',
    revokeKey: 'Revoke key',
    copyKeyFor: (name) => `Copy ${name}`,
    revealKeyFor: (name) => `Reveal ${name}`,
    hideKeyFor: (name) => `Hide ${name}`,
    actionsFor: (name) => `Actions for ${name}`,
    keyMetadata: (created, lastUsed) => `Created ${created}. Last used ${lastUsed}.`,
  }
}

export function createSettingsForm5PreviewFixture(
  locale: SettingsForm5PreviewLocale = 'en',
): SettingsForm5PreviewFixture {
  const copy = copyFor(locale)
  const storeSeed: SettingsForm5PreviewStoreSeed = {
    keys: sourceKeys,
    integrations: sourceIntegrations,
  }

  return {
    locale,
    copy,
    storeSeed,
    contentFor: (state) => ({
      copy,
      keys: state.keys.map((key) => {
        const revealed = state.revealedKeyIds.includes(key.id)
        const maskedDisplay = key.environment === 'live' ? 'sk_live_••••••••••••' : 'sk_test_••••••••••••'
        return {
          ...key,
          metadata: copy.keyMetadata(key.createdLabel, key.lastUsedLabel),
          maskedDisplay,
          displayValue: revealed ? copy.revealSafePlaceholder : maskedDisplay,
          revealed,
          actionMenuOpen: state.openActionMenuKeyId === key.id,
          actionsAccessibleName: copy.actionsFor(key.name),
          revealAccessibleName: revealed ? copy.hideKeyFor(key.name) : copy.revealKeyFor(key.name),
          copyAccessibleName: copy.copyKeyFor(key.name),
        }
      }),
      integrations: state.integrations.map((integration) => ({
        ...integration,
        connectedLabel: integration.enabled ? copy.connected : undefined,
      })),
      listStrategy: {
        kind: 'content-grown',
        note: 'The short key and integration collections remain in normal document flow.',
      },
    }),
  }
}
