import type { HbarAppUiIntegrationConsentContent } from '../../packages/hbar-app-ui/src/index'

export function createIntegrationConsentReferenceFixture(
  locale: 'en' | 'de-long' = 'en',
): HbarAppUiIntegrationConsentContent {
  const localized = locale === 'de-long'
  return {
    labels: {
      workspaceLabel: localized ? 'Arbeitsbereich' : 'Workspace',
      cancel: localized ? 'Abbrechen' : 'Cancel',
      authorize: localized ? 'Autorisieren und fortfahren' : 'Authorize',
      authorized: localized ? 'Autorisierung angefordert' : 'Authorization requested',
      redirectNotice: localized
        ? 'Nach der Autorisierung werden Sie zur sicheren Verwaltungsseite von northwind.dev weitergeleitet.'
        : 'Redirects to northwind.dev',
    },
    requesterInitials: 'NW',
    workspaceInitials: 'HL',
    title: localized
      ? 'Northwind möchte auf Ihren Halcyon-Arbeitsbereich zugreifen'
      : 'Northwind wants access to your Halcyon workspace',
    description: localized
      ? 'Prüfen Sie sorgfältig, welche Berechtigungen Northwind erhält, bevor Sie fortfahren.'
      : 'Review what Northwind will be able to do before you continue.',
    workspaces: [
      { id: 'halcyon', initials: 'HA', name: 'Halcyon', role: 'Owner', label: 'HA Halcyon · Owner' },
      {
        id: 'halcyon-labs',
        initials: 'HL',
        name: 'Halcyon Labs',
        role: localized ? 'Administrator' : 'Admin',
        label: localized ? 'HL Halcyon Labs · Administrator' : 'HL Halcyon Labs · Admin',
      },
      {
        id: 'personal',
        initials: 'P',
        name: localized ? 'Persönlicher Arbeitsbereich' : 'Personal',
        role: localized ? 'Inhaberin oder Inhaber' : 'Owner',
        label: localized ? 'P Persönlicher Arbeitsbereich · Inhaberin oder Inhaber' : 'P Personal · Owner',
      },
    ],
    initialWorkspaceId: 'halcyon',
    permissions: [
      {
        id: 'profile',
        title: localized ? 'Profil lesen' : 'Read your profile',
        description: localized ? 'Name, E-Mail-Adresse und Profilbild.' : 'Name, email address and avatar.',
      },
      {
        id: 'projects',
        title: localized ? 'Projekte lesen' : 'Read your projects',
        description: localized
          ? 'Namen, Einstellungen und Mitgliederlisten für sechs Projekte.'
          : 'Names, settings and member lists for 6 projects.',
      },
      {
        id: 'deploys',
        title: localized ? 'Bereitstellungen auslösen' : 'Trigger deploys',
        description: localized
          ? 'Eine Bereitstellung in Ihrem Namen starten und das Ergebnis lesen.'
          : 'Start a deploy on your behalf and read its result.',
      },
    ],
    assurance: localized
      ? 'Northwind erhält niemals Ihr Passwort und kann weder Abrechnungsdaten lesen noch Projekte löschen.'
      : 'Northwind never receives your password, and cannot read billing details or delete projects.',
    listStrategy: { kind: 'content-grown', expectedMaximum: 8 },
    referenceLayout: {
      ownerId: 'integration-consent-northwind',
      workspaceOptions: [
        { workspaceId: 'halcyon', detail: localized ? '24 Plätze' : '24 seats' },
        { workspaceId: 'halcyon-labs', detail: localized ? '6 Plätze' : '6 seats' },
        { workspaceId: 'personal', detail: localized ? '1 Platz' : '1 seat' },
      ],
      labels: {
        emptyWorkspaces: localized ? 'Keine Arbeitsbereiche verfügbar' : 'No workspaces available',
      },
    },
  }
}
