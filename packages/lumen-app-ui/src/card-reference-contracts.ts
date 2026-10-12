export interface LumenCardReferenceListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}
export interface LumenCardReferenceItem {
  readonly id: string
  readonly disabled?: boolean | undefined
}
export interface LumenCardReferenceCopy {
  readonly empty: string
}
export type LumenCardReferenceIcon =
  | 'branch'
  | 'chat'
  | 'calendar'
  | 'warehouse'
  | 'ticket'
  | 'cloud'
  | 'check'
  | 'bookmark'
  | 'file'
  | 'download'
  | 'arrow'
  | 'user'
  | 'location'
  | 'card'
  | 'repeat'
  | 'plus'
export interface LumenCardReferenceMember extends LumenCardReferenceItem {
  readonly initials: string
  readonly name: string
  readonly role: string
  readonly description: string
  readonly online: boolean
  readonly connected: boolean
}
export interface LumenCardReferenceMembersContent {
  readonly kind: 'members'
  readonly items: readonly LumenCardReferenceMember[]
  readonly listStrategy: LumenCardReferenceListStrategy
  readonly copy: LumenCardReferenceCopy & {
    readonly connect: string
    readonly connected: string
    readonly toggle: (name: string, connected: boolean) => string
  }
  readonly onToggle?: ((id: string, value: boolean) => void) | undefined
}
export interface LumenCardReferenceIntegration extends LumenCardReferenceItem {
  readonly name: string
  readonly description: string
  readonly premium?: string | undefined
  readonly icon: LumenCardReferenceIcon
  readonly connected: boolean
}
export interface LumenCardReferenceIntegrationsContent {
  readonly kind: 'integrations'
  readonly items: readonly LumenCardReferenceIntegration[]
  readonly listStrategy: LumenCardReferenceListStrategy
  readonly copy: LumenCardReferenceCopy & { readonly toggle: (name: string) => string }
  readonly onToggle?: ((id: string, value: boolean) => void) | undefined
}
export interface LumenCardReferenceStep extends LumenCardReferenceItem {
  readonly number: string
  readonly title: string
  readonly description: string
  readonly complete: boolean
}
export interface LumenCardReferenceOnboardingContent {
  readonly kind: 'onboarding'
  readonly items: readonly LumenCardReferenceStep[]
  readonly listStrategy: LumenCardReferenceListStrategy
  readonly copy: LumenCardReferenceCopy & {
    readonly progress: (complete: number, total: number) => string
    readonly reset: string
    readonly completed: string
    readonly start: string
    readonly toggle: (title: string, complete: boolean) => string
  }
  readonly onToggle?: ((id: string, value: boolean) => void) | undefined
  readonly onReset?: (() => void) | undefined
}
export interface LumenCardReferenceEvent extends LumenCardReferenceItem {
  readonly day: string
  readonly month: string
  readonly title: string
  readonly time: string
  readonly location: string
  readonly attendees: string
  readonly going: boolean
  readonly declined: boolean
}
export interface LumenCardReferenceAgendaContent {
  readonly kind: 'agenda'
  readonly items: readonly LumenCardReferenceEvent[]
  readonly listStrategy: LumenCardReferenceListStrategy
  readonly copy: LumenCardReferenceCopy & {
    readonly going: string
    readonly decline: string
    readonly respond: (title: string, going: boolean) => string
  }
  readonly onRespond?: ((id: string, response: 'going' | 'decline', selected: boolean) => void) | undefined
}
export interface LumenCardReferenceMetadata extends LumenCardReferenceItem {
  readonly label: string
  readonly value: string
}
export interface LumenCardReferencePlan extends LumenCardReferenceItem {
  readonly name: string
  readonly price: string
  readonly suffix: string
  readonly description: string
  readonly badge?: string | undefined
  readonly metadata: readonly LumenCardReferenceMetadata[]
  readonly features: readonly { readonly id: string; readonly label: string }[]
  readonly current: boolean
}
export interface LumenCardReferencePlansContent {
  readonly kind: 'plans'
  readonly items: readonly LumenCardReferencePlan[]
  readonly listStrategy: LumenCardReferenceListStrategy
  readonly copy: LumenCardReferenceCopy & {
    readonly choose: (name: string) => string
    readonly current: string
  }
}
export interface LumenCardReferenceMetric extends LumenCardReferenceItem {
  readonly label: string
  readonly value: string
  readonly change: string
  readonly comparison: string
  readonly positive: boolean
  readonly icon: LumenCardReferenceIcon
  readonly bars: readonly number[]
}
export interface LumenCardReferenceRange extends LumenCardReferenceItem {
  readonly label: string
  readonly metrics: readonly LumenCardReferenceMetric[]
  readonly summary: string
}
export interface LumenCardReferenceAccountsContent {
  readonly kind: 'accounts'
  readonly ranges: readonly LumenCardReferenceRange[]
  readonly selectedRangeId: string | undefined
  readonly listStrategy: LumenCardReferenceListStrategy
  readonly copy: LumenCardReferenceCopy & { readonly title: string; readonly ranges: string }
  readonly onRange?: ((id: string) => void) | undefined
}
export interface LumenCardReferenceUpdate extends LumenCardReferenceItem {
  readonly meta: string
  readonly title: string
  readonly body: string
  readonly href: string
  readonly initials: string
  readonly author: string
  readonly reading: string
  readonly bookmarked: boolean
}
export interface LumenCardReferenceUpdatesContent {
  readonly kind: 'updates'
  readonly items: readonly LumenCardReferenceUpdate[]
  readonly listStrategy: LumenCardReferenceListStrategy
  readonly copy: LumenCardReferenceCopy & {
    readonly bookmark: (title: string, value: boolean) => string
  }
  readonly onToggle?: ((id: string, value: boolean) => void) | undefined
}
export interface LumenCardReferenceFile extends LumenCardReferenceItem {
  readonly name: string
  readonly meta: string
  readonly edited: string
  readonly selected: boolean
}
export interface LumenCardReferenceFilesContent {
  readonly kind: 'files'
  readonly items: readonly LumenCardReferenceFile[]
  readonly listStrategy: LumenCardReferenceListStrategy
  readonly copy: LumenCardReferenceCopy & {
    readonly count: (selected: number, total: number) => string
    readonly clear: string
    readonly download: string
  }
  readonly onToggle?: ((id: string, value: boolean) => void) | undefined
  readonly onClear?: (() => void) | undefined
  readonly onDownload?: (() => void) | undefined
}
export interface LumenCardReferenceProfileContent {
  readonly kind: 'profile'
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly role: string
  readonly location: string
  readonly body: string
  readonly tags: readonly { readonly id: string; readonly label: string }[]
  readonly metrics: readonly LumenCardReferenceMetadata[]
  readonly following: boolean
  readonly messageHref: string
  readonly copy: {
    readonly follow: string
    readonly following: string
    readonly toggle: (name: string, following: boolean) => string
    readonly verified: string
    readonly message: string
    readonly tags: string
  }
  readonly onFollow?: ((value: boolean) => void) | undefined
}
export interface LumenCardReferenceTransaction extends LumenCardReferenceItem {
  readonly title: string
  readonly time: string
  readonly value: string
  readonly incoming: boolean
}
export interface LumenCardReferenceBalanceContent {
  readonly kind: 'balance'
  readonly id: string
  readonly value: string
  readonly change: string
  readonly detail: string
  readonly metadata: readonly LumenCardReferenceMetadata[]
  readonly transactions: readonly LumenCardReferenceTransaction[]
  readonly copy: { readonly balance: string; readonly add: string; readonly transfer: string }
}
export type LumenCardReferenceContent =
  | LumenCardReferenceMembersContent
  | LumenCardReferenceIntegrationsContent
  | LumenCardReferenceOnboardingContent
  | LumenCardReferenceAgendaContent
  | LumenCardReferencePlansContent
  | LumenCardReferenceAccountsContent
  | LumenCardReferenceUpdatesContent
  | LumenCardReferenceFilesContent
  | LumenCardReferenceProfileContent
  | LumenCardReferenceBalanceContent
