import type { SettingsForm6PreviewStoreSeed, SettingsForm6PreviewStoreState } from './settingsForm6PreviewStore'

export type SettingsForm6PreviewLocale = 'en' | 'de'

export interface SettingsForm6PreviewWorkspace {
  readonly id: string
  readonly name: string
  readonly memberCount: number
  readonly projectCount: number
  readonly subdomain: string
}

export interface SettingsForm6PreviewCopy {
  readonly pageTitle: string
  readonly panelTitle: string
  readonly panelDescription: string
  readonly transferTitle: string
  readonly transferDescription: string
  readonly transferAction: string
  readonly archiveTitle: string
  readonly archiveDescription: string
  readonly archiveAction: string
  readonly deleteTitle: string
  readonly deleteDescriptionFor: (workspaceName: string) => string
  readonly deleteImpactHeadingFor: (memberCount: number) => string
  readonly projectHistoryImpactFor: (projectCount: number) => string
  readonly integrationsImpact: string
  readonly subdomainImpactFor: (subdomain: string) => string
  readonly confirmationPromptFor: (workspaceName: string) => string
  readonly cancelAction: string
  readonly deleteAction: string
  readonly reviewAction: string
  readonly footerNote: string
}

export interface SettingsForm6PreviewContent {
  readonly copy: SettingsForm6PreviewCopy
  readonly workspace: SettingsForm6PreviewWorkspace
  readonly impacts: readonly string[]
  readonly confirmationValue: string
  readonly confirmationVisible: boolean
  readonly listStrategy: {
    readonly kind: 'content-grown'
    readonly note: string
    readonly sourceScrollOwner: 'unverified'
  }
}

export interface SettingsForm6PreviewFixture {
  readonly locale: SettingsForm6PreviewLocale
  readonly copy: SettingsForm6PreviewCopy
  readonly workspace: SettingsForm6PreviewWorkspace
  readonly impacts: readonly string[]
  readonly storeSeed: SettingsForm6PreviewStoreSeed
  readonly contentFor: (state: SettingsForm6PreviewStoreState) => SettingsForm6PreviewContent
}

export interface SettingsForm6PreviewFixtureOptions {
  readonly locale?: SettingsForm6PreviewLocale
  readonly workspace?: Partial<SettingsForm6PreviewWorkspace>
  readonly impacts?: readonly string[]
}

function copyFor(locale: SettingsForm6PreviewLocale): SettingsForm6PreviewCopy {
  if (locale === 'de') {
    return {
      pageTitle: 'Gefahrenbereich',
      panelTitle: 'Arbeitsbereichssteuerung',
      panelDescription: 'Diese Aktionen betreffen alle im Arbeitsbereich. Prüfe alles, bevor du fortfährst.',
      transferTitle: 'Inhaberschaft übertragen',
      transferDescription: 'Übergib den Arbeitsbereich an einen anderen Administrator. Dein Konto bleibt erhalten.',
      transferAction: 'Übertragen',
      archiveTitle: 'Exportieren und archivieren',
      archiveDescription: 'Lade alle Daten herunter und versetze den Arbeitsbereich in den schreibgeschützten Modus.',
      archiveAction: 'Arbeitsbereich archivieren',
      deleteTitle: 'Arbeitsbereich löschen',
      deleteDescriptionFor: (workspaceName) => `${workspaceName} und alle zugehörigen Daten dauerhaft entfernen.`,
      deleteImpactHeadingFor: (memberCount) => `Das Löschen entfernt Inhalte für alle ${memberCount} Mitglieder:`,
      projectHistoryImpactFor: (projectCount) => `${projectCount.toLocaleString('de-DE')} Projekte und deren Verlauf`,
      integrationsImpact: 'Alle API-Schlüssel und verbundenen Integrationen',
      subdomainImpactFor: (subdomain) => `Die Subdomain ${subdomain}, die danach wieder verfügbar ist`,
      confirmationPromptFor: (workspaceName) => `Gib ${workspaceName} zur Bestätigung ein`,
      cancelAction: 'Abbrechen',
      deleteAction: 'Diesen Arbeitsbereich löschen',
      reviewAction: 'Löschung prüfen',
      footerNote: 'Exportiere Daten vor unwiderruflichen Änderungen am Arbeitsbereich.',
    }
  }

  return {
    pageTitle: 'Danger zone',
    panelTitle: 'Workspace controls',
    panelDescription: 'These actions affect everyone in the workspace. Review before you confirm.',
    transferTitle: 'Transfer ownership',
    transferDescription: 'Hand the workspace to another admin. You keep your account.',
    transferAction: 'Transfer',
    archiveTitle: 'Export and archive',
    archiveDescription: 'Download all data, then make the workspace read-only.',
    archiveAction: 'Archive workspace',
    deleteTitle: 'Delete workspace',
    deleteDescriptionFor: (workspaceName) => `Permanently remove ${workspaceName} and everything in it.`,
    deleteImpactHeadingFor: (memberCount) => `Deleting removes, for all ${memberCount} members:`,
    projectHistoryImpactFor: (projectCount) => `${projectCount.toLocaleString('en-US')} projects and their history`,
    integrationsImpact: 'All API keys and connected integrations',
    subdomainImpactFor: (subdomain) => `The ${subdomain} subdomain, released for reuse`,
    confirmationPromptFor: (workspaceName) => `Type ${workspaceName} to confirm`,
    cancelAction: 'Cancel',
    deleteAction: 'Delete this workspace',
    reviewAction: 'Review deletion',
    footerNote: 'Export data before irreversible workspace changes.',
  }
}

const defaultWorkspace: SettingsForm6PreviewWorkspace = {
  id: 'northwind',
  name: 'northwind',
  memberCount: 24,
  projectCount: 1284,
  subdomain: 'northwind.app',
}

export function createSettingsForm6PreviewFixture(
  options: SettingsForm6PreviewFixtureOptions = {},
): SettingsForm6PreviewFixture {
  const locale = options.locale ?? 'en'
  const copy = copyFor(locale)
  const workspace = { ...defaultWorkspace, ...options.workspace }
  const impacts = options.impacts ?? [
    copy.projectHistoryImpactFor(workspace.projectCount),
    copy.integrationsImpact,
    copy.subdomainImpactFor(workspace.subdomain),
  ]
  const storeSeed = { workspaceId: workspace.id }

  return {
    locale,
    copy,
    workspace,
    impacts,
    storeSeed,
    contentFor: (state) => ({
      copy,
      workspace,
      impacts,
      confirmationValue: state.confirmationValue,
      confirmationVisible: state.confirmationVisible,
      listStrategy: {
        kind: 'content-grown',
        note: 'The consequence list follows normal document flow; no source-owned scroll container was verified.',
        sourceScrollOwner: 'unverified',
      },
    }),
  }
}
