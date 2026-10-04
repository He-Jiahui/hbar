import type { HbarAppUiIntegrationContent } from '../../packages/hbar-app-ui/src/index'
import { HBAR_APP_UI_INTEGRATIONS_FIXTURES } from './hbar-app-ui-integrations-fixtures'

type ConnectionContent = NonNullable<HbarAppUiIntegrationContent['connection']>

export function createIntegrationConnectionReferenceFixture(locale: 'en' | 'de-long' = 'en'): ConnectionContent {
  const connection = HBAR_APP_UI_INTEGRATIONS_FIXTURES.connection
  if (!connection) throw new Error('The base integrations connection fixture is unavailable.')

  if (locale === 'en') {
    return {
      ...connection,
      referenceLayout: { ownerId: 'cedar', auditLogHref: '#' },
    }
  }

  return {
    ...connection,
    labels: {
      ...connection.labels,
      connected: 'Verbunden',
      disconnected: 'Getrennt',
      sync: 'Jetzt synchronisieren',
      disconnect: 'Verbindung trennen',
      permissionsTitle: 'Berechtigungen',
      permissionsDescription:
        'Cedar Labs verwendet ausschließlich die Berechtigungen, die Sie für diese Verbindung aktiviert lassen.',
      required: 'Erforderlich',
      toggleScope: (label) => `${label} aktivieren oder deaktivieren`,
      activityTitle: 'Aktivität',
      fullAuditLog: 'Vollständiges Prüfprotokoll öffnen',
      emptyScopes: 'Für diese Verbindung wurden keine Berechtigungen angefordert.',
      emptyActivity: 'Für diese Verbindung ist noch keine Aktivität vorhanden.',
    },
    description:
      'Öffnet ein Issue, wenn eine Bereitstellungsprüfung fehlschlägt, und meldet Build-Ergebnisse zu Pull Requests zurück.',
    scopes: connection.scopes.map((scope) => ({
      ...scope,
      label:
        scope.id === 'repositories'
          ? 'Repositorys lesen'
          : scope.id === 'issues'
            ? 'Issues verfassen'
            : scope.id === 'checks'
              ? 'Prüfergebnisse veröffentlichen'
              : 'Mitglieder der Organisation lesen',
      description:
        scope.id === 'repositories'
          ? 'Metadaten, Branches und Commit-Status für 12 Repositorys lesen.'
          : scope.id === 'issues'
            ? 'Issues erstellen und kommentieren, wenn eine Bereitstellungsprüfung fehlschlägt.'
            : scope.id === 'checks'
              ? 'Build- und Richtlinienergebnisse zu Pull Requests zurückmelden.'
              : 'Commit-Autoren den Teamkonten zuordnen.',
    })),
    activities: connection.activities.map((activity) => ({
      ...activity,
      title:
        activity.id === 'scope-update'
          ? 'Berechtigungen von Ana Reyes aktualisiert'
          : activity.id === 'token-refresh'
            ? 'Token automatisch erneuert'
            : activity.id === 'rate-limit'
              ? 'Ratenlimit erreicht; nach 40 s erneut versucht'
              : 'Von Marco Silva verbunden',
      date:
        activity.id === 'scope-update'
          ? 'Heute 09:41 Uhr'
          : activity.id === 'token-refresh'
            ? 'Gestern 18:02 Uhr'
            : activity.id === 'rate-limit'
              ? '12. März'
              : '04. März',
    })),
    referenceLayout: { ownerId: 'cedar', auditLogHref: '#' },
  }
}
