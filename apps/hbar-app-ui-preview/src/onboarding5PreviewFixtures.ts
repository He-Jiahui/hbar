import {
  ONBOARDING5_ROLE_IDS,
  type Onboarding5InvitationRow,
  type Onboarding5PreviewStoreSeed,
  type Onboarding5PreviewStoreState,
  type Onboarding5RoleId,
} from './onboarding5PreviewStore'

export type Onboarding5PreviewLocale = 'en' | 'de' | 'de-long'

export const ONBOARDING5_SOURCE_EVIDENCE = {
  officialUrl: 'https://pro.reactbits.dev/docs/app-ui/onboarding/onboarding-5',
  docsDescription: 'Invite-teammates rows with per-person role selects, a shareable link, and a copy action.',
  staticCache: {
    cacheId: 'full-static-v10',
    schemaVersion: 1,
    generatedAt: '2026-09-23T04:28:30.280Z',
    sourceHash: '51420cc1343bb3745a2a6b20caa68248033c860c0fcea1319823400de08abf8e',
    sourceDirectoryHash: '4dc4e06f386ae3de7e396ec305a6394fed8645b36d8af2d4d72b90ee4fa6bcb5',
    sourceStatus: 200,
    themes: ['light', 'dark'],
    viewports: ['desktop', 'tablet', 'mobile', 'stress'],
    viewportSizes: {
      desktop: { width: 1440, height: 900 },
      tablet: { width: 1024, height: 768 },
      mobile: { width: 390, height: 844 },
      stress: { width: 320, height: 720 },
    },
    rootSizes: {
      desktop: { width: 560, height: 445 },
      tablet: { width: 560, height: 445 },
      mobile: { width: 308, height: 465 },
      stress: { width: 238, height: 504 },
    },
    initialRowCount: 2,
    controlCount: 10,
    bodyTextLength: 221,
    truncatedTextCounts: { desktop: 0, tablet: 0, mobile: 1, stress: 4 },
    horizontalOverflow: false,
    stressScrollOwner: 'not-captured',
    maximumRowCount: 'not-observed',
  },
  sameHashInteractionCache: {
    cacheId: 'full-interactions-v4',
    schemaVersion: 1,
    sourceInventoryGeneratedAt: '2026-09-23T02:45:43.955Z',
    interactionReportGeneratedAt: '2026-09-23T03:53:20.579Z',
    sourceHash: '51420cc1343bb3745a2a6b20caa68248033c860c0fcea1319823400de08abf8e',
    sourceDirectoryHash: '541173c8626322c7e7f1ee394249d862197bd60648bad30e3f37d42a60ce809a',
    coverage: 'semantic-shape-representatives',
    themes: ['dark'],
    viewports: ['desktop', 'mobile'],
    verifiedSnapshots: {
      emailFill: {
        before: 'priya@northwind.co',
        after: 'audit sample',
        axValueChanged: true,
        comparatorSourceChanged: false,
        comparatorStatus: 'lumen-different',
      },
      firstRoleSelection: {
        before: 'admin',
        after: 'member',
        axSelectedOptionChanged: true,
        comparatorSourceChanged: false,
        comparatorStatus: 'lumen-different',
      },
      copyVisibleLabel: {
        before: 'Copy',
        afterClick: 'Copy',
        afterEnter: 'Copy',
        afterSpace: 'Copy',
        visibleChange: false,
      },
    },
    unverified: {
      clipboardWrite: 'not-captured',
      addInvitationResult: 'not-captured',
      removeInvitationResult: 'not-captured',
      skipResult: 'not-captured',
      sendInvitationResult: 'not-captured',
      scrollOwner: 'not-captured',
    },
    targetSourceHashMatchesStatic: true,
    sourceDirectoryHashMatchesStatic: false,
    localImplementationHash: 'not-recorded-in-interaction-report',
    explicitInteractionProtocol: 'not-recorded',
  },
} as const

export interface Onboarding5PreviewLabels {
  readonly title: string
  readonly detail: string
  readonly invitationLink: string
  readonly copyLink: string
  readonly emailColumn: string
  readonly emailPlaceholder: string
  readonly roleColumn: string
  readonly removeInvitation: string
  readonly addAnother: string
  readonly skip: string
  readonly sendInvitations: string
  readonly emptyRows: string
}

export interface Onboarding5PreviewRoleOption {
  readonly id: Onboarding5RoleId
  readonly label: string
}

export interface Onboarding5PreviewCollectionContract {
  readonly initialRowCount: number
  readonly sourceMaximumRowCount: 'not-observed'
  readonly rowStrategy: 'host-seeded-without-arbitrary-local-cap'
  readonly emptyRowsEvidence: 'host-fallback-not-source-captured'
  readonly sourceStressHorizontalOverflow: false
  readonly sourceStressTextTruncationCount: 4
  readonly sourceScrollOwner: 'not-captured'
}

export interface Onboarding5PreviewContent {
  readonly locale: Onboarding5PreviewLocale
  readonly labels: Onboarding5PreviewLabels
  readonly invitationRows: readonly Onboarding5InvitationRow[]
  readonly roleOptions: readonly Onboarding5PreviewRoleOption[]
  readonly shareLink: string
  readonly collectionContract: Onboarding5PreviewCollectionContract
}

export interface Onboarding5PreviewFixture {
  readonly seed: Onboarding5PreviewStoreSeed
  readonly contentFor: (state: Onboarding5PreviewStoreState) => Onboarding5PreviewContent
}

const LABELS: Readonly<Record<Onboarding5PreviewLocale, Onboarding5PreviewLabels>> = {
  en: {
    title: 'Invite your team',
    detail: 'Invitations stay open for 14 days. Anyone you add can be removed later.',
    invitationLink: 'Invite link',
    copyLink: 'Copy',
    emailColumn: 'Email address',
    emailPlaceholder: 'teammate@company.com',
    roleColumn: 'Role',
    removeInvitation: 'Remove invitation',
    addAnother: 'Add another',
    skip: 'Skip for now',
    sendInvitations: 'Send 1 invitation',
    emptyRows: 'No invitation rows are available.',
  },
  de: {
    title: 'Team einladen',
    detail: 'Einladungen bleiben 14 Tage gültig. Hinzugefügte Personen können später entfernt werden.',
    invitationLink: 'Einladungslink',
    copyLink: 'Kopieren',
    emailColumn: 'E-Mail-Adresse',
    emailPlaceholder: 'kollegin@unternehmen.de',
    roleColumn: 'Rolle',
    removeInvitation: 'Einladung entfernen',
    addAnother: 'Weitere hinzufügen',
    skip: 'Vorerst überspringen',
    sendInvitations: '1 Einladung senden',
    emptyRows: 'Keine Einladungszeilen verfügbar.',
  },
  'de-long': {
    title: 'Laden Sie alle Personen ein, die mit Ihnen gemeinsam in diesem Arbeitsbereich zusammenarbeiten sollen',
    detail:
      'Einladungen bleiben vierzehn Tage gültig und jede hinzugefügte Person kann später aus dem gemeinsamen Arbeitsbereich entfernt werden.',
    invitationLink: 'Einladungslink für die Zusammenarbeit im gemeinsamen Arbeitsbereich',
    copyLink: 'Einladungslink in die Zwischenablage kopieren',
    emailColumn: 'E-Mail-Adresse der eingeladenen Person',
    emailPlaceholder: 'kollegin@unternehmen-mit-einem-sehr-langen-namen.de',
    roleColumn: 'Zugewiesene Rolle im Team',
    removeInvitation: 'Diese Einladung aus der Liste entfernen',
    addAnother: 'Eine weitere Person zur Einladungsliste hinzufügen',
    skip: 'Diesen Schritt vorerst überspringen',
    sendInvitations: 'Die ausgewählten Einladungen jetzt versenden',
    emptyRows: 'Derzeit sind keine Einladungseinträge in der Liste verfügbar.',
  },
}

const ROLE_LABELS: Readonly<Record<Onboarding5PreviewLocale, Readonly<Record<Onboarding5RoleId, string>>>> = {
  en: { member: 'Member', admin: 'Admin', viewer: 'Viewer' },
  de: { member: 'Mitglied', admin: 'Admin', viewer: 'Betrachter' },
  'de-long': {
    member: 'Teammitglied mit regulären Arbeitsbereichsrechten',
    admin: 'Arbeitsbereichsadministratorin oder -administrator',
    viewer: 'Person mit ausschließlich lesendem Arbeitsbereichszugriff',
  },
}

export function createOnboarding5PreviewFixture(locale: Onboarding5PreviewLocale = 'en'): Onboarding5PreviewFixture {
  const seed: Onboarding5PreviewStoreSeed = {
    invitationRows: [
      { id: 'invite-priya', email: 'priya@northwind.co', roleId: 'admin' },
      { id: 'invite-empty', email: '', roleId: 'member' },
    ],
    roleIds: ONBOARDING5_ROLE_IDS,
    shareLink: 'northwind.app/join/9f2c-41ab',
  }

  return {
    seed,
    contentFor: (state) => ({
      locale,
      labels: LABELS[locale],
      invitationRows: state.invitationRows,
      roleOptions: state.roleIds.map((id) => ({ id, label: ROLE_LABELS[locale][id] })),
      shareLink: state.shareLink,
      collectionContract: {
        initialRowCount: 2,
        sourceMaximumRowCount: 'not-observed',
        rowStrategy: 'host-seeded-without-arbitrary-local-cap',
        emptyRowsEvidence: 'host-fallback-not-source-captured',
        sourceStressHorizontalOverflow: false,
        sourceStressTextTruncationCount: 4,
        sourceScrollOwner: 'not-captured',
      },
    }),
  }
}
