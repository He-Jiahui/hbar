import type {
  SettingsForm4PreviewAssignableRoleId,
  SettingsForm4PreviewMember,
  SettingsForm4PreviewRoleOption,
  SettingsForm4PreviewStoreSeed,
  SettingsForm4PreviewStoreState,
} from './settingsForm4PreviewStore'

export type SettingsForm4PreviewLocale = 'en' | 'de'

export interface SettingsForm4PreviewLabels {
  readonly pageTitle: string
  readonly panelTitle: string
  readonly panelDescription: string
  readonly inviteTitle: string
  readonly inviteDescription: string
  readonly emailLabel: string
  readonly emailPlaceholder: string
  readonly inviteRoleLabel: string
  readonly sendInvite: string
  readonly active: string
  readonly invited: string
  readonly owner: string
  readonly emptyMembers: string
  readonly copyEmailAddress: string
  readonly removeFromTeam: string
  readonly invitationSent: string
  readonly emailCopied: string
  readonly copyFailed: string
  readonly inviteRoleOptions: readonly SettingsForm4PreviewRoleOption[]
  readonly actionsFor: (name: string) => string
  readonly roleFor: (name: string) => string
  readonly seats: (used: number, total: number) => string
}

export interface SettingsForm4PreviewMemberView extends SettingsForm4PreviewMember {
  readonly emailDetail: string
  readonly statusLabel: string
  readonly roleLabel: string
  readonly roleAccessibleName: string
  readonly actionsAccessibleName: string
  readonly roleOptions: readonly SettingsForm4PreviewRoleOption[]
  readonly owner: boolean
  readonly menuOpen: boolean
  readonly copyPending: boolean
  readonly canRequestRemoval: boolean
}

export interface SettingsForm4PreviewContent {
  readonly labels: SettingsForm4PreviewLabels
  readonly inviteEmail: string
  readonly inviteRoleId: SettingsForm4PreviewAssignableRoleId
  readonly inviteRoleOptions: readonly SettingsForm4PreviewRoleOption[]
  readonly members: readonly SettingsForm4PreviewMemberView[]
  readonly openMenuMemberId: string | null
  readonly copyPendingMemberId: string | null
  readonly seatSummary: string | undefined
  readonly seatProgress: number
  readonly footerMessage: string | undefined
  readonly listStrategy: {
    readonly kind: 'pane-scroll'
    readonly note: string
  }
}

export interface SettingsForm4PreviewFixture {
  readonly locale: SettingsForm4PreviewLocale
  readonly labels: SettingsForm4PreviewLabels
  readonly storeSeed: SettingsForm4PreviewStoreSeed
  readonly contentFor: (state: SettingsForm4PreviewStoreState) => SettingsForm4PreviewContent
}

const roleIds: readonly SettingsForm4PreviewAssignableRoleId[] = ['admin', 'member', 'billing', 'viewer']

const englishRoleLabels: Readonly<Record<SettingsForm4PreviewAssignableRoleId, string>> = {
  admin: 'Admin',
  member: 'Member',
  billing: 'Billing',
  viewer: 'Viewer',
}

const sourceMembers: readonly SettingsForm4PreviewMember[] = [
  {
    id: 'mara',
    initials: 'MW',
    name: 'Mara Whitfield',
    email: 'mara.whitfield@northwind.co',
    status: 'active',
    roleId: 'owner',
    emailPresentation: 'email',
  },
  {
    id: 'devan',
    initials: 'DR',
    name: 'Devan Rao',
    email: 'devan@northwind.co',
    status: 'active',
    roleId: 'admin',
    emailPresentation: 'email',
  },
  {
    id: 'priyanka',
    initials: 'PB',
    name: 'Priyanka Balasubramanian',
    email: 'priyanka.b@northwind.co',
    status: 'active',
    roleId: 'member',
    emailPresentation: 'email',
  },
  {
    id: 'tom',
    initials: 'TE',
    name: 'Tom Ek',
    email: 'tom@contractors.northwind.co',
    status: 'active',
    roleId: 'viewer',
    emailPresentation: 'email',
  },
  {
    id: 'jules',
    initials: 'JM',
    name: 'Jules Moreau',
    email: 'jules.moreau@northwind.co',
    status: 'invited',
    roleId: 'member',
    emailPresentation: 'email',
  },
  {
    id: 'sofia',
    initials: 'SC',
    name: 'Sofia Castellano',
    email: 'sofia@northwind.co',
    status: 'active',
    roleId: 'billing',
    emailPresentation: 'email',
  },
]

function labelsFor(locale: SettingsForm4PreviewLocale): SettingsForm4PreviewLabels {
  if (locale === 'de') {
    const inviteRoleOptions: readonly SettingsForm4PreviewRoleOption[] = [
      { id: 'admin', label: 'Administrator' },
      { id: 'member', label: 'Mitglied' },
      { id: 'billing', label: 'Abrechnung' },
      { id: 'viewer', label: 'Betrachter' },
    ]
    return {
      pageTitle: 'Mitglieder',
      panelTitle: 'Teamzugriff',
      panelDescription:
        'Lade Personen zur Zusammenarbeit ein und halte jede Rollenvergabe für dein Team jederzeit nachvollziehbar.',
      inviteTitle: 'Mitglied einladen',
      inviteDescription: 'Sende eine Einladung mit der passenden Rolle, bevor die Zusammenarbeit beginnt.',
      emailLabel: 'E-Mail-Adresse',
      emailPlaceholder: 'name@unternehmen.de',
      inviteRoleLabel: 'Rolle für Einladung',
      sendInvite: 'Einladung senden',
      active: 'Aktiv',
      invited: 'Eingeladen',
      owner: 'Inhaber',
      emptyMembers: 'Noch keine Teammitglieder.',
      copyEmailAddress: 'E-Mail-Adresse kopieren',
      removeFromTeam: 'Aus dem Team entfernen',
      invitationSent: 'Einladung gesendet',
      emailCopied: 'E-Mail-Adresse kopiert',
      copyFailed: 'E-Mail-Adresse konnte nicht kopiert werden.',
      inviteRoleOptions,
      actionsFor: (name) => `Aktionen für ${name}`,
      roleFor: (name) => `Rolle für ${name}`,
      seats: (used, total) => `${used} von ${total} Plätzen belegt`,
    }
  }

  const inviteRoleOptions: readonly SettingsForm4PreviewRoleOption[] = roleIds.map((id) => ({
    id,
    label: englishRoleLabels[id],
  }))
  return {
    pageTitle: 'Members',
    panelTitle: 'Team access',
    panelDescription: 'Invite people and keep role assignments aligned.',
    inviteTitle: 'Invite member',
    inviteDescription: 'Send an invitation with the right role from the start.',
    emailLabel: 'Email address',
    emailPlaceholder: 'name@company.com',
    inviteRoleLabel: 'Role for invite',
    sendInvite: 'Send invite',
    active: 'Active',
    invited: 'Invited',
    owner: 'Owner',
    emptyMembers: 'No members yet.',
    copyEmailAddress: 'Copy email address',
    removeFromTeam: 'Remove from team',
    invitationSent: 'Invitation sent',
    emailCopied: 'Email address copied',
    copyFailed: 'Could not copy the email address.',
    inviteRoleOptions,
    actionsFor: (name) => `Actions for ${name}`,
    roleFor: (name) => `Role for ${name}`,
    seats: (used, total) => `${used} of ${total} seats used`,
  }
}

function noticeText(state: SettingsForm4PreviewStoreState, labels: SettingsForm4PreviewLabels) {
  switch (state.notice?.kind) {
    case undefined:
      return undefined
    case 'invitation-sent':
      return labels.invitationSent
    case 'email-copied':
      return labels.emailCopied
    case 'copy-failed':
      return labels.copyFailed
    default:
      return undefined
  }
}

export function createSettingsForm4PreviewFixture(
  locale: SettingsForm4PreviewLocale = 'en',
): SettingsForm4PreviewFixture {
  const labels = labelsFor(locale)
  const storeSeed: SettingsForm4PreviewStoreSeed = {
    members: sourceMembers,
    roleOptions: labels.inviteRoleOptions,
    initialInviteRoleId: 'member',
    seatsUsed: 6,
    seatsTotal: 10,
  }
  return {
    locale,
    labels,
    storeSeed,
    contentFor: (state) => ({
      labels,
      inviteEmail: state.inviteEmail,
      inviteRoleId: state.inviteRoleId,
      inviteRoleOptions: state.roleOptions,
      members: state.members.map((member) => {
        const owner = member.roleId === 'owner'
        let roleLabel = labels.owner
        if (!owner) {
          const role = state.roleOptions.find((option) => option.id === member.roleId)
          if (!role) throw new Error(`Missing role label for member ${member.id}.`)
          roleLabel = role.label
        }
        return {
          ...member,
          emailDetail: member.emailPresentation === 'invitation-sent' ? labels.invitationSent : member.email,
          statusLabel: member.status === 'active' ? labels.active : labels.invited,
          roleLabel,
          roleAccessibleName: labels.roleFor(member.name),
          actionsAccessibleName: labels.actionsFor(member.name),
          roleOptions: owner ? [] : state.roleOptions,
          owner,
          menuOpen: state.openMenuMemberId === member.id,
          copyPending: state.copyPendingMemberId === member.id,
          canRequestRemoval: !owner,
        }
      }),
      openMenuMemberId: state.openMenuMemberId,
      copyPendingMemberId: state.copyPendingMemberId,
      seatSummary: state.notice ? undefined : labels.seats(state.seatsUsed, state.seatsTotal),
      seatProgress: state.seatsTotal > 0 ? Math.min(100, (state.seatsUsed / state.seatsTotal) * 100) : 0,
      footerMessage: noticeText(state, labels),
      listStrategy: {
        kind: 'pane-scroll',
        note: 'The source scrolls the content pane; render every supplied member without clipping the list.',
      },
    }),
  }
}
